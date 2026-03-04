import type { AgentStateHint } from '../../shared/gsdTypes.js';

const PERMISSION_COOLDOWN_MS = 2 * 60 * 1000;

interface SessionRecord {
  previousState: AgentStateHint | null;
  lastNotifiedAt: number | null;
}

/**
 * Deduplicates permission_prompt notifications to prevent spam.
 *
 * Rules:
 * - Fires on the first transition INTO permission_prompt (PERM-04)
 * - Suppresses if already in permission_prompt (sustained state = no repeat)
 * - Suppresses if re-entering within PERMISSION_COOLDOWN_MS after last notification
 *   AND the session never fully exited the permission state (PERM-05)
 * - Resets cooldown when the session fully exits permission_prompt,
 *   allowing immediate re-notification on re-entry
 * - Tracks each session independently by session name
 */
export class NotificationDeduplicator {
  private records = new Map<string, SessionRecord>();

  /**
   * Record the current state for a session and check whether a notification
   * should be fired.
   *
   * @param sessionName - Unique tmux session identifier
   * @param state       - Current detected AgentStateHint
   * @returns true if a notification should be sent, false otherwise
   */
  recordAndCheck(sessionName: string, state: AgentStateHint): boolean {
    const record = this.records.get(sessionName) ?? { previousState: null, lastNotifiedAt: null };
    const now = Date.now();
    let shouldFire = false;

    if (state === 'permission_prompt') {
      const wasAlreadyInPermissionState = record.previousState === 'permission_prompt';
      const isWithinCooldown =
        record.lastNotifiedAt !== null && now - record.lastNotifiedAt < PERMISSION_COOLDOWN_MS;

      if (!wasAlreadyInPermissionState && !isWithinCooldown) {
        shouldFire = true;
        record.lastNotifiedAt = now;
      }
    } else {
      // Exiting permission state — reset cooldown so re-entry fires immediately
      if (record.previousState === 'permission_prompt') {
        record.lastNotifiedAt = null;
      }
    }

    record.previousState = state;
    this.records.set(sessionName, record);
    return shouldFire;
  }

  /**
   * Reset all tracked session state. Useful for testing and server restarts.
   */
  clear(): void {
    this.records.clear();
  }
}
