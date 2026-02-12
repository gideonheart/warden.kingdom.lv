import { database } from '../database/DatabaseConnection.js';
import { tmuxSessionManager } from './TmuxSessionManager.js';
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

    for (const session of tmuxSessions) {
      database.upsertInstance({
        agentId: session.agentId,
        agentName: session.agentId.charAt(0).toUpperCase() + session.agentId.slice(1),
        tmuxSessionName: session.sessionName,
        projectPath: '',
        telegramTopicId: undefined,
      });
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
