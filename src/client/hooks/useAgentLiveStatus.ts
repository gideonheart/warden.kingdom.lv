import { useState, useEffect } from 'react';

const POLL_INTERVAL_MS = 5_000;

export type AgentStateHint = 'working' | 'idle' | 'menu' | 'permission_prompt' | 'error';
export type PressureLevel = 'ok' | 'warning' | 'critical';

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
