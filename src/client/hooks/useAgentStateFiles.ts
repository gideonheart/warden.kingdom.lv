import { useState, useEffect } from 'react';

const POLL_INTERVAL_MS = 30_000;

export interface GsdStateInfo {
  phase: string | null;
  progress: number | null;
}

interface StateResponse {
  sessionName: string;
  stateContent: string | null;
}

function parseStateFile(stateContent: string | null): GsdStateInfo {
  if (stateContent === null) {
    return { phase: null, progress: null };
  }

  const phaseMatch = /^Phase:\s+(\d+)/m.exec(stateContent);
  const progressMatch = /Progress:.*?(\d+)%/m.exec(stateContent);

  return {
    phase: phaseMatch ? phaseMatch[1] : null,
    progress: progressMatch ? parseInt(progressMatch[1], 10) : null,
  };
}

export function useAgentStateFiles(sessionNames: string[]): Map<string, GsdStateInfo> {
  const [stateMap, setStateMap] = useState<Map<string, GsdStateInfo>>(new Map());

  const stableKey = sessionNames.join(',');

  useEffect(() => {
    if (sessionNames.length === 0) return;

    const fetchAll = async () => {
      const results = await Promise.allSettled(
        sessionNames.map(async (session) => {
          const response = await fetch(`/api/gsd/sessions/${session}/state`);
          if (!response.ok) return { session, info: { phase: null, progress: null } };
          const data = (await response.json()) as StateResponse;
          return { session, info: parseStateFile(data.stateContent) };
        }),
      );

      const nextMap = new Map<string, GsdStateInfo>();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          nextMap.set(result.value.session, result.value.info);
        }
      }
      setStateMap(nextMap);
    };

    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey]);

  return stateMap;
}
