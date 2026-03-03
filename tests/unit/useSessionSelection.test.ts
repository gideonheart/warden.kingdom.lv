import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { resolveSessionFallback, useSessionSelection } from '../../src/client/hooks/useSessionSelection.js';
import type { AgentInstance } from '../../src/shared/types.js';

// ---------------------------------------------------------------------------
// Factory helper — shared across renderHook describe blocks
// ---------------------------------------------------------------------------

function makeInstance(tmuxSessionName: string, overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 1,
    agentId: 'forge',
    agentName: 'Forge',
    tmuxSessionName,
    status: 'active' as const,
    projectPath: '/p',
    telegramTopicId: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastActiveAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Suite: renderHook integration — manual selection persistence
// ---------------------------------------------------------------------------

describe('useSessionSelection — manual selection persistence', () => {
  it('auto-selects first session on initial load completion', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      { initialProps: { activeInstances: [], isLoading: true, initialSessionName: null } },
    );

    expect(result.current.selectedSessionName).toBeNull();

    act(() => {
      rerender({ activeInstances: [makeInstance('session-a')], isLoading: false, initialSessionName: null });
    });

    expect(result.current.selectedSessionName).toBe('session-a');
  });

  it('selectSession() takes effect immediately and persists through the next poll', () => {
    const initialInstances = [makeInstance('session-a'), makeInstance('session-b', { id: 2 })];

    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      { initialProps: { activeInstances: initialInstances, isLoading: false, initialSessionName: 'session-a' } },
    );

    act(() => {
      result.current.selectSession('session-b');
    });

    expect(result.current.selectedSessionName).toBe('session-b');

    // Simulate next poll cycle with identical active instances
    act(() => {
      rerender({ activeInstances: initialInstances, isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-b');
  });

  it('selectSession() resets the miss counter so the session is not immediately evicted', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a'), makeInstance('session-b', { id: 2 })],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    act(() => {
      result.current.selectSession('session-b');
    });

    // First miss: session-b is absent — hysteresis should keep 'session-b'
    // The session list changes (session-a,session-b → session-a), triggering the effect.
    act(() => {
      rerender({ activeInstances: [makeInstance('session-a')], isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-b');

    // Second consecutive miss: the list changes again (a new session appears) but session-b
    // is still absent. The effect fires again because activeSessionNamesKey changed.
    // Two misses → fall back to the first available session.
    act(() => {
      rerender({
        activeInstances: [makeInstance('session-a'), makeInstance('session-c', { id: 3 })],
        isLoading: false,
        initialSessionName: 'session-a',
      });
    });

    expect(result.current.selectedSessionName).toBe('session-a');
  });

  it('clearSelection() sets selectedSessionName to null', () => {
    const { result } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a')],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedSessionName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: renderHook integration — polling interactions
// ---------------------------------------------------------------------------

describe('useSessionSelection — polling interactions', () => {
  it('tolerates one missed poll (hysteresis) before changing selection', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a')],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    // session-a disappears — first miss, should still hold
    act(() => {
      rerender({ activeInstances: [], isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-a');
  });

  it('falls back after two consecutive missed polls', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a'), makeInstance('session-b', { id: 2 })],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    // First miss: session-a absent but hysteresis keeps it.
    // The list changes (session-a,session-b → session-b), triggering the effect.
    act(() => {
      rerender({ activeInstances: [makeInstance('session-b', { id: 2 })], isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-a');

    // Second consecutive miss: a new session-c appears, so the list changes again
    // (session-b → session-b,session-c), triggering the effect a second time.
    // Session-a is still absent — two misses → fall back to first available (session-b).
    act(() => {
      rerender({
        activeInstances: [makeInstance('session-b', { id: 2 }), makeInstance('session-c', { id: 3 })],
        isLoading: false,
        initialSessionName: 'session-a',
      });
    });

    expect(result.current.selectedSessionName).toBe('session-b');
  });

  it('does not change selection while isLoading is true', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a')],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    // Active list becomes empty but isLoading is true — must not change selection
    act(() => {
      rerender({ activeInstances: [], isLoading: true, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-a');
  });

  it('miss counter resets when session reappears after one miss', () => {
    const { result, rerender } = renderHook(
      (props: { activeInstances: AgentInstance[]; isLoading: boolean; initialSessionName: string | null }) =>
        useSessionSelection(props),
      {
        initialProps: {
          activeInstances: [makeInstance('session-a')],
          isLoading: false,
          initialSessionName: 'session-a',
        },
      },
    );

    // First miss — hysteresis keeps session-a
    act(() => {
      rerender({ activeInstances: [], isLoading: false, initialSessionName: 'session-a' });
    });

    // Session returns — counter should reset
    act(() => {
      rerender({ activeInstances: [makeInstance('session-a')], isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-a');

    // New first miss after counter reset — should still tolerate (not fall back)
    act(() => {
      rerender({ activeInstances: [], isLoading: false, initialSessionName: 'session-a' });
    });

    expect(result.current.selectedSessionName).toBe('session-a');
  });
});
