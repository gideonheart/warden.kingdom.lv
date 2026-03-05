import { execFile } from 'child_process';
import { promisify } from 'util';
import stripAnsi from 'strip-ansi';
import path from 'path';
import { database } from '../database/DatabaseConnection.js';
import { instanceTracker } from './InstanceTracker.js';
import { detectAgentState } from '../utils/agentStateDetection.js';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 60_000; // Check every 60 seconds (idle timeout is measured in minutes)
const PANE_LINES = 20;

export class IdleTimeoutService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private idleSince: Map<string, number> = new Map(); // key: tmuxSessionName, value: timestamp when first detected idle

  startPolling(): void {
    console.log('[IdleTimeoutService] Starting idle timeout polling (60s interval)');
    void this.pollAllSessions();
    this.pollInterval = setInterval(() => void this.pollAllSessions(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[IdleTimeoutService] Stopped idle timeout polling');
    }
  }

  private async pollAllSessions(): Promise<void> {
    const instances = instanceTracker.listActiveInstances();
    // Clean up idleSince entries for sessions that no longer exist
    const activeSessionNames = new Set(instances.map((i) => i.tmuxSessionName));
    for (const key of this.idleSince.keys()) {
      if (!activeSessionNames.has(key)) {
        this.idleSince.delete(key);
      }
    }
    await Promise.allSettled(instances.map((instance) => this.checkSession(instance)));
  }

  private async checkSession(instance: {
    id: number;
    agentId: string;
    tmuxSessionName: string;
    projectPath: string;
    createdAt: string;
  }): Promise<void> {
    try {
      // Read idle timeout config for this agent
      const timeoutMinutes = database.getIdleTimeout(instance.agentId);
      if (timeoutMinutes === null) {
        // Idle timeout disabled for this agent — clear tracking and skip
        this.idleSince.delete(instance.tmuxSessionName);
        return;
      }

      const { stdout } = await execFileAsync('tmux', [
        'capture-pane',
        '-pt',
        `${instance.tmuxSessionName}:0.0`,
        '-S',
        `-${PANE_LINES}`,
      ]);
      const cleanPane = stripAnsi(stdout);
      const state = detectAgentState(cleanPane);

      if (state === 'idle') {
        const now = Date.now();
        if (!this.idleSince.has(instance.tmuxSessionName)) {
          this.idleSince.set(instance.tmuxSessionName, now);
          console.log(`[IdleTimeoutService] Session ${instance.tmuxSessionName} entered idle state`);
        }

        const idleStartTime = this.idleSince.get(instance.tmuxSessionName)!;
        const idleMinutes = (now - idleStartTime) / 60_000;

        if (idleMinutes >= timeoutMinutes) {
          console.warn(
            `[IdleTimeoutService] Session ${instance.tmuxSessionName} idle for ${Math.round(idleMinutes)}m (timeout: ${timeoutMinutes}m) — auto-stopping`,
          );
          await this.stopIdleSession(instance);
          this.idleSince.delete(instance.tmuxSessionName);
        }
      } else {
        // Session is not idle — reset tracking
        if (this.idleSince.has(instance.tmuxSessionName)) {
          console.log(`[IdleTimeoutService] Session ${instance.tmuxSessionName} resumed activity, clearing idle timer`);
        }
        this.idleSince.delete(instance.tmuxSessionName);
      }
    } catch {
      // Dead sessions silently ignored — InstanceTracker handles cleanup
    }
  }

  private async stopIdleSession(instance: {
    id: number;
    agentId: string;
    tmuxSessionName: string;
    projectPath: string;
    createdAt: string;
  }): Promise<void> {
    const uptimeSecs = (Date.now() - new Date(instance.createdAt).getTime()) / 1000;
    const projectSlug = path.basename(instance.projectPath) || instance.agentId;

    // Mark as stopping, then kill the tmux session
    database.updateInstanceStatus(instance.id, 'stopping');
    try {
      const { tmuxSessionManager } = await import('./TmuxSessionManager.js');
      await tmuxSessionManager.destroySession(instance.tmuxSessionName);
    } catch {
      // Session may already be gone
    }
    database.updateInstanceStatus(instance.id, 'stopped');

    // Log lifecycle event
    database.insertLifecycleEvent({
      sessionId: instance.id,
      agentId: instance.agentId,
      sessionName: instance.tmuxSessionName,
      eventType: 'idle-timeout',
      outcome: 'auto-stopped',
      uptimeSecs,
      projectSlug,
      lastKnownState: 'idle',
      stopReason: 'idle-timeout',
    });
    console.log(`[IdleTimeoutService] Session ${instance.tmuxSessionName} stopped due to idle timeout`);
  }
}

export const idleTimeoutService = new IdleTimeoutService();
