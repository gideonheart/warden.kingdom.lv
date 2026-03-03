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

    setSelectedSessionName((currentSession) => {
      const { selectedSession, resetMissCount } = resolveSessionFallback(
        currentSession,
        activeSessionNames,
        consecutiveMissCountRef.current,
        isLoading,
      );

      // Update miss counter before returning
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

      return selectedSession;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionNamesKey, isLoading]);

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
