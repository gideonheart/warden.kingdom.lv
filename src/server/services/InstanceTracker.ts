import path from 'path';
import { database } from '../database/DatabaseConnection.js';
import { tmuxSessionManager } from './TmuxSessionManager.js';
import type { AgentInstance, AgentInstanceStatus } from '../../shared/types.js';

const SYNC_INTERVAL_MS = 10_000;
const STARTING_ACTIVE_THRESHOLD_MS = 15_000;
const STARTING_ERROR_THRESHOLD_MS = 30_000;
const STOPPING_FORCE_KILL_THRESHOLD_MS = 15_000;
const CRASH_GRACE_POLLS = 2; // Require 2 consecutive missed polls (~20s) before declaring crash

export class InstanceTracker {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private missedPollCounts: Map<string, number> = new Map(); // key: tmuxSessionName
  private initialSyncComplete: boolean = false;

  public onCrashDetected: ((event: { instance: AgentInstance; uptimeSecs: number; projectSlug: string }) => void) | null = null;

  startPeriodicSync(): void {
    this.syncWithTmux();
    this.syncInterval = setInterval(() => this.syncWithTmux(), SYNC_INTERVAL_MS);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncWithTmux(): Promise<AgentInstance[]> {
    const tmuxSessions = await tmuxSessionManager.listAgentSessions();
    const activeSessionNames = tmuxSessions.map(session => session.sessionName);

    // On the first sync, collect existing session names before upserting.
    // We avoid logging 'started' events for pre-existing sessions discovered on startup.
    const preExistingSessionNames = new Set<string>(
      database.listAllInstances()
        .filter(instance => instance.status !== 'stopped' && instance.status !== 'error')
        .map(instance => instance.tmuxSessionName)
    );

    for (const session of tmuxSessions) {
      const upserted = database.upsertInstance({
        agentId: session.agentId,
        agentName: session.agentId.charAt(0).toUpperCase() + session.agentId.slice(1),
        tmuxSessionName: session.sessionName,
        projectPath: '',
        telegramTopicId: undefined,
      });

      // Log 'started' event for genuinely new sessions (not on initial startup sync)
      if (this.initialSyncComplete && !preExistingSessionNames.has(session.sessionName)) {
        database.insertLifecycleEvent({
          sessionId: upserted.id,
          agentId: upserted.agentId,
          sessionName: upserted.tmuxSessionName,
          eventType: 'started',
          outcome: 'detected',
          projectSlug: path.basename(upserted.projectPath) || upserted.agentId,
        });
      }
    }

    // Clear missed poll counts for sessions that are currently alive
    for (const sessionName of activeSessionNames) {
      this.missedPollCounts.delete(sessionName);
    }

    // Crash detection and stop marking (replaces blind markMissingSessionsStopped call)
    if (this.initialSyncComplete) {
      await this.detectCrashesAndMarkStopped(activeSessionNames);
    }

    this.initialSyncComplete = true;

    // Reconcile transitional states: 'starting' and 'stopping'
    await this.reconcileTransitionalStates(activeSessionNames);

    return database.listActiveInstances();
  }

  private async detectCrashesAndMarkStopped(activeSessionNames: string[]): Promise<void> {
    // Find all instances in active/idle/stopping state that are no longer in tmux
    const allInstances = database.listAllInstances();
    const now = Date.now();

    for (const instance of allInstances) {
      // Only process active/idle/stopping sessions (others are handled elsewhere)
      if (
        instance.status !== 'active' &&
        instance.status !== 'idle' &&
        instance.status !== 'stopping'
      ) {
        continue;
      }

      // If session is still alive in tmux, nothing to do
      if (activeSessionNames.includes(instance.tmuxSessionName)) {
        continue;
      }

      const uptimeSecs = (now - new Date(instance.createdAt).getTime()) / 1000;
      const projectSlug = path.basename(instance.projectPath) || instance.agentId;

      if (instance.status === 'stopping') {
        // Operator-initiated stop — handled in reconcileTransitionalStates, skip here
        // to avoid double-processing. reconcileTransitionalStates will mark it stopped
        // and we log the lifecycle event from there.
        continue;
      }

      // Active or idle session disappeared without operator initiating stop — potential crash
      const previousCount = this.missedPollCounts.get(instance.tmuxSessionName) ?? 0;
      const newCount = previousCount + 1;
      this.missedPollCounts.set(instance.tmuxSessionName, newCount);

      if (newCount < CRASH_GRACE_POLLS) {
        // Grace period: session may have just restarted or had a transient hiccup
        console.log(`[InstanceTracker] Session ${instance.tmuxSessionName} missed poll ${newCount}/${CRASH_GRACE_POLLS}, waiting`);
        continue;
      }

      // Grace period exhausted — this is a crash
      console.warn(`[InstanceTracker] Session ${instance.tmuxSessionName} declared CRASHED after ${newCount} missed polls`);
      const lastKnownState = instance.status;
      database.updateInstanceStatus(instance.id, 'stopped');
      this.missedPollCounts.delete(instance.tmuxSessionName);

      database.insertLifecycleEvent({
        sessionId: instance.id,
        agentId: instance.agentId,
        sessionName: instance.tmuxSessionName,
        eventType: 'crashed',
        outcome: 'detected',
        uptimeSecs,
        projectSlug,
        lastKnownState,
        stopReason: 'crash',
      });

      if (this.onCrashDetected) {
        this.onCrashDetected({ instance, uptimeSecs, projectSlug });
      }
    }
  }

  private async reconcileTransitionalStates(activeSessionNames: string[]): Promise<void> {
    const allInstances = database.listAllInstances();
    const now = Date.now();

    for (const instance of allInstances) {
      if (instance.status === 'starting') {
        const ageMs = now - new Date(instance.lastActiveAt).getTime();
        const sessionIsUp = activeSessionNames.includes(instance.tmuxSessionName);

        if (sessionIsUp && ageMs > STARTING_ACTIVE_THRESHOLD_MS) {
          // Session appeared and has been running for a while — promote to active
          database.updateInstanceStatus(instance.id, 'active');
        } else if (!sessionIsUp && ageMs > STARTING_ERROR_THRESHOLD_MS) {
          // Session never appeared within timeout — spawn failed
          console.warn(`[InstanceTracker] Starting session ${instance.tmuxSessionName} never appeared, marking error`);
          database.updateInstanceStatus(instance.id, 'error');

          const uptimeSecs = ageMs / 1000;
          const projectSlug = path.basename(instance.projectPath) || instance.agentId;
          database.insertLifecycleEvent({
            sessionId: instance.id,
            agentId: instance.agentId,
            sessionName: instance.tmuxSessionName,
            eventType: 'stopped',
            outcome: 'timeout',
            uptimeSecs,
            projectSlug,
            lastKnownState: 'starting',
            stopReason: 'start-failed',
          });
        }
      } else if (instance.status === 'stopping') {
        const ageMs = now - new Date(instance.lastActiveAt).getTime();
        const sessionIsUp = activeSessionNames.includes(instance.tmuxSessionName);
        const uptimeSecs = (now - new Date(instance.createdAt).getTime()) / 1000;
        const projectSlug = path.basename(instance.projectPath) || instance.agentId;

        if (!sessionIsUp) {
          // Session exited cleanly during grace period
          database.updateInstanceStatus(instance.id, 'stopped');
          database.insertLifecycleEvent({
            sessionId: instance.id,
            agentId: instance.agentId,
            sessionName: instance.tmuxSessionName,
            eventType: 'stopped',
            outcome: 'graceful',
            uptimeSecs,
            projectSlug,
            lastKnownState: 'stopping',
            stopReason: 'operator-stop',
          });
        } else if (ageMs > STOPPING_FORCE_KILL_THRESHOLD_MS) {
          // Grace period expired — force kill
          console.warn(`[InstanceTracker] Stopping session ${instance.tmuxSessionName} did not exit, force killing`);
          try {
            await tmuxSessionManager.destroySession(instance.tmuxSessionName);
          } catch {
            // Session may have exited between check and kill — that's fine
          }
          database.updateInstanceStatus(instance.id, 'stopped');
          database.insertLifecycleEvent({
            sessionId: instance.id,
            agentId: instance.agentId,
            sessionName: instance.tmuxSessionName,
            eventType: 'stopped',
            outcome: 'force-killed',
            uptimeSecs,
            projectSlug,
            lastKnownState: 'stopping',
            stopReason: 'operator-stop',
          });
        }
      }
    }
  }

  findActiveByAgentId(agentId: string): AgentInstance | null {
    return database.findActiveInstanceByAgentId(agentId);
  }

  listActiveInstances(): AgentInstance[] {
    return database.listActiveInstances();
  }

  listAllInstances(): AgentInstance[] {
    return database.listAllInstances();
  }

  findInstanceById(id: number): AgentInstance | null {
    return database.findInstanceById(id);
  }

  updateStatus(id: number, status: AgentInstanceStatus): void {
    database.updateInstanceStatus(id, status);
  }
}

export const instanceTracker = new InstanceTracker();
