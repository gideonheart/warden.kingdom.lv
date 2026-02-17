import { database } from '../database/DatabaseConnection.js';
import { tmuxSessionManager } from './TmuxSessionManager.js';
import { activityEventService } from './ActivityEventService.js';
import type { AgentInstance, AgentInstanceStatus } from '../../shared/types.js';

const SYNC_INTERVAL_MS = 10_000;

export class InstanceTracker {
  private syncInterval: ReturnType<typeof setInterval> | null = null;

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

    // Snapshot currently active session names before upsert to detect new sessions
    const previouslyActiveNames = new Set(
      database.listActiveInstances().map(instance => instance.tmuxSessionName)
    );

    for (const session of tmuxSessions) {
      database.upsertInstance({
        agentId: session.agentId,
        agentName: session.agentId.charAt(0).toUpperCase() + session.agentId.slice(1),
        tmuxSessionName: session.sessionName,
        projectPath: '',
        telegramTopicId: undefined,
      });

      // Capture session_start event for newly discovered sessions
      if (!previouslyActiveNames.has(session.sessionName)) {
        const instance = database.findInstanceBySessionName(session.sessionName);
        activityEventService.captureSessionStart(
          session.sessionName,
          session.agentId,
          instance?.id ?? null
        );
      }
    }

    // Identify sessions that are about to be stopped and capture session_stop events
    const stoppingInstances = database.listActiveInstances().filter(
      instance => !activeSessionNames.includes(instance.tmuxSessionName)
    );
    for (const instance of stoppingInstances) {
      activityEventService.captureSessionStop(instance.tmuxSessionName, instance.agentId);
    }

    database.markMissingSessionsStopped(activeSessionNames);

    return database.listActiveInstances();
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
