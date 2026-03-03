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
});
