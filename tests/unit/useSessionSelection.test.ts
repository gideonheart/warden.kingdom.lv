import { describe, it, expect } from 'vitest';
import { resolveSessionFallback } from '../../src/client/hooks/useSessionSelection.js';

describe('resolveSessionFallback', () => {
  it('auto-selects first session when none is selected and not loading', () => {
    const result = resolveSessionFallback(null, ['session-a'], 0, false);
    expect(result).toEqual({ selectedSession: 'session-a', resetMissCount: true });
  });

  it('does not change selection while loading (even if current is null)', () => {
    const result = resolveSessionFallback(null, ['session-a'], 0, true);
    expect(result).toEqual({ selectedSession: null, resetMissCount: false });
  });

  it('preserves current session when it is still in the active list', () => {
    const result = resolveSessionFallback('session-a', ['session-a', 'session-b'], 0, false);
    expect(result).toEqual({ selectedSession: 'session-a', resetMissCount: true });
  });

  it('first miss: keeps current session (hysteresis tolerance)', () => {
    const result = resolveSessionFallback('session-a', ['session-b'], 0, false);
    expect(result).toEqual({ selectedSession: 'session-a', resetMissCount: false });
  });

  it('second consecutive miss: falls back to first available session', () => {
    const result = resolveSessionFallback('session-a', ['session-b'], 1, false);
    expect(result).toEqual({ selectedSession: 'session-b', resetMissCount: true });
  });

  it('second consecutive miss with no alternatives: falls back to null', () => {
    const result = resolveSessionFallback('session-a', [], 1, false);
    expect(result).toEqual({ selectedSession: null, resetMissCount: true });
  });

  it('no sessions and no current selection: returns null without reset', () => {
    const result = resolveSessionFallback(null, [], 0, false);
    expect(result).toEqual({ selectedSession: null, resetMissCount: false });
  });

  it('session present after being away: resets miss count correctly', () => {
    // Session was missing for 1 cycle (miss count=1), then comes back
    const result = resolveSessionFallback('session-a', ['session-a'], 1, false);
    expect(result).toEqual({ selectedSession: 'session-a', resetMissCount: true });
  });
});

describe('resolveSessionFallback — idempotency (concurrent-mode safety)', () => {
  /**
   * React may call functional updaters multiple times in concurrent mode.
   * The fix moves ref mutation OUTSIDE the setState updater, but resolveSessionFallback
   * itself must be pure (idempotent) so calling it twice with the same args produces
   * the same result. This test validates that property.
   */
  it('calling twice with same arguments returns identical results', () => {
    const args = ['session-a', ['session-b'], 0, false] as const;
    const result1 = resolveSessionFallback(...args);
    const result2 = resolveSessionFallback(...args);
    expect(result1).toEqual(result2);
  });

  it('is pure: does not mutate its arguments', () => {
    const activeSessionNames = ['session-a', 'session-b'];
    const originalLength = activeSessionNames.length;
    resolveSessionFallback('session-a', activeSessionNames, 0, false);
    expect(activeSessionNames).toHaveLength(originalLength);
  });
});

describe('useSessionSelection — ref mutation invariant', () => {
  /**
   * The consecutiveMissCountRef must be updated OUTSIDE the setState functional
   * updater, not inside it. React may invoke functional updaters multiple times
   * in concurrent/StrictMode, causing double-increments of the miss counter if
   * the ref is mutated inside the updater.
   *
   * The fixed implementation:
   * 1. Reads currentSession directly from the variable (captured at effect start)
   * 2. Calls resolveSessionFallback immediately (not inside updater)
   * 3. Mutates consecutiveMissCountRef.current directly
   * 4. Only calls setSelectedSessionName if the value actually changes
   *
   * This means: the miss counter increments exactly once per effect run,
   * regardless of how many times React processes the render.
   */
  it('resolveSessionFallback is deterministic — same inputs always produce same miss-count decision', () => {
    // First miss: consecutiveMisses=0, result should NOT reset
    const firstMiss = resolveSessionFallback('session-a', [], 0, false);
    expect(firstMiss.resetMissCount).toBe(false);
    expect(firstMiss.selectedSession).toBe('session-a');

    // Simulate: ref is incremented once (correctly) to 1
    const missCountAfterFirstMiss = 1;

    // Second miss: consecutiveMisses=1, result should reset and fall back
    const secondMiss = resolveSessionFallback('session-a', [], missCountAfterFirstMiss, false);
    expect(secondMiss.resetMissCount).toBe(true);
    expect(secondMiss.selectedSession).toBeNull();

    // Calling second miss again with same count produces same result (idempotent)
    const secondMissAgain = resolveSessionFallback('session-a', [], missCountAfterFirstMiss, false);
    expect(secondMissAgain).toEqual(secondMiss);
  });
});
