import { database } from '../database/DatabaseConnection.js';
import { tmuxSessionManager } from './TmuxSessionManager.js';
import type { AgentInstance, AgentInstanceStatus } from '../../shared/types.js';

const SYNC_INTERVAL_MS = 10_000;
const STARTING_ACTIVE_THRESHOLD_MS = 15_000;
const STARTING_ERROR_THRESHOLD_MS = 30_000;
const STOPPING_FORCE_KILL_THRESHOLD_MS = 15_000;

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

    // Reconcile transitional states: 'starting' and 'stopping'
    await this.reconcileTransitionalStates(activeSessionNames);

    return database.listActiveInstances();
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
        }
      } else if (instance.status === 'stopping') {
        const ageMs = now - new Date(instance.lastActiveAt).getTime();
        const sessionIsUp = activeSessionNames.includes(instance.tmuxSessionName);

        if (!sessionIsUp) {
          // Session exited cleanly during grace period
          database.updateInstanceStatus(instance.id, 'stopped');
        } else if (ageMs > STOPPING_FORCE_KILL_THRESHOLD_MS) {
          // Grace period expired — force kill
          console.warn(`[InstanceTracker] Stopping session ${instance.tmuxSessionName} did not exit, force killing`);
          try {
            await tmuxSessionManager.destroySession(instance.tmuxSessionName);
          } catch {
            // Session may have exited between check and kill — that's fine
          }
          database.updateInstanceStatus(instance.id, 'stopped');
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
