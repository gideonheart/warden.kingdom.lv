import { useState, useEffect, useRef } from 'react';
import type { AgentStateHint, PressureLevel } from '@shared/gsdTypes.js';

export type { AgentStateHint, PressureLevel } from '@shared/gsdTypes.js';

const POLL_INTERVAL_MS = 5_000;

export interface AgentLiveStatus {
  state: AgentStateHint | null;
  contextPressure: number | null;
  contextPressureLevel: PressureLevel | null;
}

interface LiveStatusAgent {
  agentId: string;
  sessionName: string | null;
  state: AgentStateHint | null;
  contextPressure: number | null;
  contextPressureLevel: PressureLevel | null;
}

interface LiveStatusResponse {
  agents: LiveStatusAgent[];
}

export function useAgentLiveStatus(): Map<string, AgentLiveStatus> {
  const [statusMap, setStatusMap] = useState<Map<string, AgentLiveStatus>>(new Map());
  const previousDataRef = useRef<string>('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/gsd/agents/live-status');
        if (!response.ok) return;
        const data = (await response.json()) as LiveStatusResponse;
        const nextMap = new Map<string, AgentLiveStatus>();
        for (const agent of data.agents) {
          nextMap.set(agent.agentId, {
            state: agent.state,
            contextPressure: agent.contextPressure,
            contextPressureLevel: agent.contextPressureLevel,
          });
        }
        // Only update state if data actually changed — keeps Map reference stable
        // to prevent unnecessary re-renders in consuming components
        const serialized = JSON.stringify(Array.from(nextMap.entries()));
        if (serialized === previousDataRef.current) return;
        previousDataRef.current = serialized;
        setStatusMap(nextMap);
      } catch {
        // On fetch error, leave previous data in place
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return statusMap;
}
