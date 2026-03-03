import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentInstance } from '@shared/types.js';

export interface UseSessionSelectionParams {
  activeInstances: AgentInstance[];
  isLoading: boolean;
  initialSessionName: string | null;
}

export interface UseSessionSelectionResult {
  selectedSessionName: string | null;
  selectSession: (sessionName: string) => void;
  clearSelection: () => void;
}

/**
 * Pure function — resolves the next selectedSession and whether the miss counter
 * should be reset. Exported for unit testing without React.
 *
 * Hysteresis logic: a session must be absent for 2 consecutive poll cycles before
 * the selection falls back to another session. A single transient miss (e.g. a slow
 * poll response) does NOT change the selection.
 */
export function resolveSessionFallback(
  currentSession: string | null,
  activeSessionNames: string[],
  consecutiveMisses: number,
  isLoading: boolean,
): { selectedSession: string | null; resetMissCount: boolean } {
  // While loading, never change selection
  if (isLoading) return { selectedSession: currentSession, resetMissCount: false };

  // No current selection — auto-select first available session
  if (!currentSession && activeSessionNames.length > 0) {
    return { selectedSession: activeSessionNames[0], resetMissCount: true };
  }

  // Current session still present — keep it, reset miss counter
  if (currentSession && activeSessionNames.includes(currentSession)) {
    return { selectedSession: currentSession, resetMissCount: true };
  }

  // Current session is missing from the active list
  if (currentSession && !activeSessionNames.includes(currentSession)) {
    if (consecutiveMisses < 1) {
      // First miss — tolerate it (transient poll hiccup), do not change selection
      return { selectedSession: currentSession, resetMissCount: false };
    }
    // Second consecutive miss — session truly gone, fall back
    return {
      selectedSession: activeSessionNames[0] ?? null,
      resetMissCount: true,
    };
  }

  // Fallthrough: no sessions, no selection
  return { selectedSession: currentSession, resetMissCount: false };
}

/**
 * Hook that encapsulates all session selection policy:
 * - Auto-select the first session when none is selected and loading finishes
 * - Preserve user-selected session across poll cycles
 * - Hysteresis: fall back to another session only after 2 consecutive missed polls
 * - Manual selection via selectSession() always takes effect immediately
 *
 * KEY INVARIANT: This hook NEVER calls setState during render.
 * All state mutations are inside useEffect or event handlers.
 *
 * KEY INVARIANT: Ref mutations happen OUTSIDE the setState functional updater.
 * React may invoke functional updaters multiple times in concurrent mode.
 * Mutating refs inside updaters can cause double-increments of the miss counter.
 * Instead, the updater computes the new value; ref mutation happens after in the
 * same effect body.
 */
export function useSessionSelection({
  activeInstances,
  isLoading,
  initialSessionName,
}: UseSessionSelectionParams): UseSessionSelectionResult {
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(initialSessionName);
  const consecutiveMissCountRef = useRef<number>(0);

  // Stable stringified key for active session names — avoids re-running the
  // effect when the instances array reference changes but the session list is identical.
  const activeSessionNamesKey = activeInstances.map((i) => i.tmuxSessionName).join(',');

  useEffect(() => {
    const activeSessionNames = activeSessionNamesKey ? activeSessionNamesKey.split(',') : [];

    // Compute resolution BEFORE calling setState so we can update the ref
    // after setState, safely outside the updater. This avoids the React
    // anti-pattern of mutating refs inside functional updater callbacks
    // (which React may call multiple times in concurrent/StrictMode).
    const currentSession = selectedSessionName;
    const { selectedSession, resetMissCount } = resolveSessionFallback(
      currentSession,
      activeSessionNames,
      consecutiveMissCountRef.current,
      isLoading,
    );

    // Update miss counter BEFORE setState to keep the ref in sync with the
    // decision we just made, regardless of whether the setState triggers a re-render.
    if (resetMissCount) {
      consecutiveMissCountRef.current = 0;
    } else if (
      currentSession !== null &&
      !activeSessionNames.includes(currentSession) &&
      !isLoading
    ) {
      // Session is missing and we didn't reset — increment miss count
      consecutiveMissCountRef.current += 1;
    }

    // Only call setState if the session actually changes — avoids unnecessary renders.
    if (selectedSession !== currentSession) {
      setSelectedSessionName(selectedSession);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionNamesKey, isLoading]);
  // selectedSessionName is intentionally excluded from deps: we capture its current
  // value at effect start from the variable above, and we only want this effect to
  // re-run when activeSessionNamesKey or isLoading changes (i.e., on poll cycle or
  // initial load completion), not on every selection change. Manual selection changes
  // go through selectSession() which sets the state directly and resets the miss count.
  //
  // RISK-3 (stale-closure safety): Effects run AFTER React commits state updates to the
  // DOM, not during the batched render phase. When selectSession('B') and a poll arrive
  // in the same React batch, React commits the selectSession state update first, then runs
  // effects. The closure captures the post-commit value ('B'), not the pre-selection value.
  // Adding selectedSessionName to deps would break hysteresis: every manual selection would
  // re-trigger the effect, potentially undoing the selection if the poll list hasn't updated.

  const selectSession = useCallback((sessionName: string) => {
    consecutiveMissCountRef.current = 0;
    setSelectedSessionName(sessionName);
  }, []);

  const clearSelection = useCallback(() => {
    consecutiveMissCountRef.current = 0;
    setSelectedSessionName(null);
  }, []);

  return { selectedSessionName, selectSession, clearSelection };
}
