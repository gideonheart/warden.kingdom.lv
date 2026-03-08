import path from 'path';
import { database } from '../database/DatabaseConnection.js';
import { tmuxSessionManager } from './TmuxSessionManager.js';
import { telegramBotService } from './TelegramBotService.js';
import { openClawConfigReader } from './OpenClawConfigReader.js';
import { gsdRegistryService } from './GsdRegistryService.js';
import type { AgentInstance } from '../../shared/types.js';

const RESTART_DELAY_MS = 7_000;       // 7 seconds before spawning — gives crash detection time to settle
const MAX_RESTARTS_PER_HOUR = 3;      // storm threshold: 3 restarts in 60 minutes
const STORM_WINDOW_MS = 60 * 60 * 1000; // 1-hour sliding window

export class AutoRestartService {
  /**
   * Per-agent in-memory sliding window of restart timestamps.
   * key: agentId  value: array of Date.now() values within the storm window
   */
  private restartTimestamps: Map<string, number[]> = new Map();

  /**
   * Attempt to restart a crashed agent session according to its restart policy.
   * Fire-and-forget — must not throw (all errors are caught internally).
   *
   * Steps:
   *   1. Read restart policy — bail early if 'none'
   *   2. Check rate limit — handle storm if exceeded
   *   3. Wait RESTART_DELAY_MS
   *   4. Spawn new tmux session via createSessionWithClaude
   *   5. Log lifecycle event (success or failure)
   *   6. Record timestamp for future rate-limit checks
   */
  async attemptRestart(
    crashedInstance: AgentInstance,
    uptimeSecs: number,
    projectSlug: string,
  ): Promise<void> {
    const { agentId } = crashedInstance;

    // Step 1: read policy
    const policy = database.getRestartPolicy(agentId);
    if (policy.crashRestartMode === 'none') {
      console.log(`[AutoRestart] Restart policy for ${agentId} is 'none' — skipping restart`);
      return;
    }

    // Step 2: check rate limit
    if (this.isRateLimited(agentId)) {
      await this.handleStormDetected(agentId, crashedInstance.id);
      return;
    }

    // Step 3: wait before spawning
    console.log(`[AutoRestart] Waiting ${RESTART_DELAY_MS}ms before restarting ${agentId}...`);
    await new Promise<void>((resolve) => setTimeout(resolve, RESTART_DELAY_MS));

    // Step 4: derive project info and build new session name.
    // If the crashed instance has no projectPath (e.g. it was discovered via tmux polling
    // before the InstanceTracker fix that resolves working directories), look it up from
    // the GSD agent-registry or openclaw.json as a defensive fallback.
    let projectPath = crashedInstance.projectPath;
    if (!projectPath) {
      projectPath = await this.resolveWorkingDirectory(agentId);
      if (projectPath) {
        console.log(`[AutoRestart] Resolved working directory for ${agentId}: ${projectPath}`);
      } else {
        console.warn(`[AutoRestart] No working directory found for ${agentId} — will use server cwd`);
      }
    }
    const derivedProjectSlug = path.basename(projectPath) || projectSlug || agentId;
    const newSessionName = tmuxSessionManager.buildSessionName(agentId, derivedProjectSlug);

    // Pre-register in DB as 'starting' so the UI can show the new tab immediately
    const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
    const newInstance = database.upsertInstance({
      agentId,
      agentName,
      tmuxSessionName: newSessionName,
      projectPath,
      telegramTopicId: crashedInstance.telegramTopicId ?? undefined,
    });

    // Force status to 'starting' (upsertInstance defaults to 'active' for new rows)
    database.updateInstanceStatus(newInstance.id, 'starting');

    try {
      await tmuxSessionManager.createSessionWithClaude(newSessionName, projectPath);

      // Spawn succeeded — promote to active and log lifecycle event
      database.updateInstanceStatus(newInstance.id, 'active');
      database.insertLifecycleEvent({
        sessionId: newInstance.id,
        agentId,
        sessionName: newSessionName,
        eventType: 'auto-restarted',
        outcome: 'success',
        uptimeSecs,
        projectSlug: derivedProjectSlug,
      });

      console.log(`[AutoRestart] Restarted ${agentId}: ${newSessionName}`);
    } catch (spawnError) {
      const errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);
      console.error(`[AutoRestart] Failed to restart ${agentId}:`, spawnError);

      // Spawn failed — mark error and log lifecycle event
      database.updateInstanceStatus(newInstance.id, 'error');
      database.insertLifecycleEvent({
        sessionId: newInstance.id,
        agentId,
        sessionName: newSessionName,
        eventType: 'auto-restarted',
        outcome: 'failed',
        uptimeSecs,
        projectSlug: derivedProjectSlug,
        stopReason: errorMessage,
      });
    }

    // Step 6: record timestamp for sliding window (counts regardless of success/failure)
    this.recordRestart(agentId);
  }

  /**
   * Check whether the agent has exceeded the restart storm threshold.
   * Prunes stale entries from the sliding window as a side effect.
   */
  private isRateLimited(agentId: string): boolean {
    const now = Date.now();
    const timestamps = this.restartTimestamps.get(agentId) ?? [];
    const withinWindow = timestamps.filter((timestamp) => now - timestamp < STORM_WINDOW_MS);
    // Update the stored array with pruned entries
    this.restartTimestamps.set(agentId, withinWindow);
    return withinWindow.length >= MAX_RESTARTS_PER_HOUR;
  }

  /**
   * Record a restart timestamp for the given agent.
   * Prunes entries older than the storm window to keep memory bounded.
   */
  private recordRestart(agentId: string): void {
    const now = Date.now();
    const timestamps = this.restartTimestamps.get(agentId) ?? [];
    timestamps.push(now);
    // Prune old entries
    const pruned = timestamps.filter((timestamp) => now - timestamp < STORM_WINDOW_MS);
    this.restartTimestamps.set(agentId, pruned);
  }

  /**
   * Resolve the working directory for an agent from config sources.
   * Prefers GSD agent-registry working_directory, falls back to openclaw.json workspace.
   * Returns empty string if no directory can be resolved.
   */
  private async resolveWorkingDirectory(agentId: string): Promise<string> {
    // Try GSD agent-registry first (has the actual project repo path)
    try {
      const registryAgent = await gsdRegistryService.getAgent(agentId);
      if (registryAgent?.working_directory) {
        return registryAgent.working_directory;
      }
    } catch {
      // Registry unavailable — fall through
    }

    // Fall back to openclaw.json workspace
    try {
      const agents = await openClawConfigReader.getAgents();
      const agentConfig = agents.find((a) => a.id === agentId);
      if (agentConfig?.workspace) {
        return path.isAbsolute(agentConfig.workspace)
          ? agentConfig.workspace
          : path.join(process.env.HOME ?? '/home/forge', '.openclaw', agentConfig.workspace);
      }
    } catch {
      // Config unavailable — fall through
    }

    return '';
  }

  /**
   * Handle restart storm detection:
   *   1. Flip crash_restart_mode to 'none' in DB
   *   2. Log a lifecycle event with outcome 'storm-disabled'
   *   3. Send Telegram alert to the agent's topic (failure silently swallowed)
   */
  private async handleStormDetected(agentId: string, crashedSessionId: number): Promise<void> {
    console.warn(`[AutoRestart] Storm detected for ${agentId} — disabling auto-restart`);

    // Flip policy to 'none' and record storm_disabled_at timestamp
    database.markStormDisabled(agentId);

    // Log lifecycle event for the crashed session
    database.insertLifecycleEvent({
      sessionId: crashedSessionId,
      agentId,
      sessionName: `${agentId}-storm-detected`,
      eventType: 'auto-restarted',
      outcome: 'storm-disabled',
      stopReason: 'restart-storm',
    });

    // Count how many restarts triggered the storm (number of timestamps in window)
    const timestamps = this.restartTimestamps.get(agentId) ?? [];
    const now = Date.now();
    const recentCount = timestamps.filter((timestamp) => now - timestamp < STORM_WINDOW_MS).length;
    const stormMessage = `Warning: ${agentId} restarted ${recentCount} times in 1h — auto-restart disabled. Check dashboard.`;

    // Send Telegram alert — failure must never block storm handling
    try {
      const mappings = await openClawConfigReader.getTopicMappings();
      const mapping = mappings.find((m) => m.agentId === agentId);

      if (mapping) {
        await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, stormMessage);
        console.log(`[AutoRestart] Sent storm alert for ${agentId} to topic ${mapping.topicId}`);
      } else {
        console.warn(`[AutoRestart] No Telegram topic mapping for ${agentId} — storm alert not sent`);
      }
    } catch (notifyError) {
      console.error(`[AutoRestart] Failed to send storm notification for ${agentId}:`, notifyError);
    }
  }
}

export const autoRestartService = new AutoRestartService();
