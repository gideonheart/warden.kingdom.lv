import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 10_000;

interface PauseStateEntry {
  paused: boolean;
  updatedAt: string;
}

/**
 * Polls GET /api/gsd/hooks-pause-state every 10s and returns a map of
 * session names to their paused boolean. Fail-open: on error, returns
 * previous state (pause is informational, not critical).
 */
export function useHooksPauseState(): { pauseMap: Record<string, boolean>; isLoading: boolean } {
  const [pauseMap, setPauseMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const previousMapRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const fetchPauseState = async () => {
      try {
        const response = await fetch('/api/gsd/hooks-pause-state');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as Record<string, PauseStateEntry>;
        if (cancelled) return;

        const nextMap: Record<string, boolean> = {};
        for (const [sessionName, entry] of Object.entries(data)) {
          nextMap[sessionName] = entry.paused === true;
        }
        setPauseMap(nextMap);
        previousMapRef.current = nextMap;
      } catch {
        // Fail-open: retain previous state on error
        if (!cancelled) {
          setPauseMap(previousMapRef.current);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchPauseState();
    const interval = setInterval(fetchPauseState, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { pauseMap, isLoading };
}
