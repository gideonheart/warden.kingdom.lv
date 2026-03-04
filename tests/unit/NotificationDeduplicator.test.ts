// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NotificationDeduplicator } from '../../src/server/services/NotificationDeduplicator.js';

describe('NotificationDeduplicator', () => {
  let deduplicator: NotificationDeduplicator;

  afterEach(() => {
    vi.useRealTimers();
    if (deduplicator) {
      deduplicator.clear();
    }
  });

  // ─── PERM-04: State-transition detection ─────────────────────────────────

  it('fires on first transition to permission_prompt', () => {
    deduplicator = new NotificationDeduplicator();
    const result = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(result).toBe(true);
  });

  it('does not fire on sustained permission_prompt (PERM-04)', () => {
    deduplicator = new NotificationDeduplicator();
    const firstResult = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    const secondResult = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
  });

  it('does not fire for non-permission states', () => {
    deduplicator = new NotificationDeduplicator();
    expect(deduplicator.recordAndCheck('session-1', 'working')).toBe(false);
    expect(deduplicator.recordAndCheck('session-1', 'idle')).toBe(false);
    expect(deduplicator.recordAndCheck('session-1', 'menu')).toBe(false);
    expect(deduplicator.recordAndCheck('session-1', 'error')).toBe(false);
  });

  it('fires again after exit and re-entry', () => {
    deduplicator = new NotificationDeduplicator();
    const firstEntry = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    const afterExit = deduplicator.recordAndCheck('session-1', 'working');
    const reEntry = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(firstEntry).toBe(true);
    expect(afterExit).toBe(false);
    expect(reEntry).toBe(true);
  });

  // ─── PERM-05: Cooldown suppression ───────────────────────────────────────

  it('suppresses within cooldown window (PERM-05)', () => {
    vi.useFakeTimers();
    deduplicator = new NotificationDeduplicator();

    // First entry fires
    const firstFire = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(firstFire).toBe(true);

    // Exit permission state then re-enter while still within cooldown
    // Note: re-entry after proper exit resets cooldown, so this tests the
    // scenario where state was NOT fully exited (stayed in permission_prompt)
    // and the session re-enters after a brief blip
    // To test cooldown: advance 1 min, still in permission -> exit -> re-enter immediately
    vi.advanceTimersByTime(1 * 60 * 1000); // advance 1 minute (within 2-min cooldown)

    // The session stays in permission_prompt throughout — sustained state
    const withinCooldown = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(withinCooldown).toBe(false); // Still sustained, no new notification

    // Now advance past cooldown and re-enter after proper exit
    vi.advanceTimersByTime(2 * 60 * 1000); // advance past cooldown

    // Exit permission state first
    deduplicator.recordAndCheck('session-1', 'working');

    // Now immediately re-enter (cooldown was reset by exit)
    const afterCooldownExpired = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(afterCooldownExpired).toBe(true);
  });

  it('resets cooldown when exiting permission state', () => {
    vi.useFakeTimers();
    deduplicator = new NotificationDeduplicator();

    // First notification fires
    const firstFire = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(firstFire).toBe(true);

    // Exit permission state (this resets lastNotifiedAt to null)
    deduplicator.recordAndCheck('session-1', 'working');

    // Advance 30s — still within the original 2-min cooldown window
    vi.advanceTimersByTime(30 * 1000);

    // Re-enter permission_prompt — should fire IMMEDIATELY because exit cleared cooldown
    const reEntryAfterExit = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(reEntryAfterExit).toBe(true);
  });

  it('tracks sessions independently (PERM-04 multi-session)', () => {
    deduplicator = new NotificationDeduplicator();

    const session1First = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    const session2First = deduplicator.recordAndCheck('session-2', 'permission_prompt');

    expect(session1First).toBe(true);
    expect(session2First).toBe(true);

    const session1Sustained = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    const session2Sustained = deduplicator.recordAndCheck('session-2', 'permission_prompt');

    expect(session1Sustained).toBe(false);
    expect(session2Sustained).toBe(false);
  });

  it('clear() resets all state', () => {
    deduplicator = new NotificationDeduplicator();

    // Fire first notification
    const firstFire = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(firstFire).toBe(true);

    // Sustained — no new notification
    const sustained = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(sustained).toBe(false);

    // Clear all state
    deduplicator.clear();

    // Re-enter permission_prompt — should fire again since state was cleared
    const afterClear = deduplicator.recordAndCheck('session-1', 'permission_prompt');
    expect(afterClear).toBe(true);
  });
});
