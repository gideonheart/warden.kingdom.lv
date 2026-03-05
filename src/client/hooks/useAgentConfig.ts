import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentDetails, TopicMapping } from '../../shared/openclawTypes.js';
import type { RestartPolicy, CrashRestartMode } from '../../shared/types.js';

const REFRESH_INTERVAL_MS = 30_000;

export function useAgentConfig() {
  const [agents, setAgents] = useState<AgentDetails[]>([]);
  const [topicMappings, setTopicMappings] = useState<TopicMapping[]>([]);
  const [restartPolicies, setRestartPolicies] = useState<RestartPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous serialized data to skip setState when poll data is unchanged.
  // Without this, setAgents/setTopicMappings create new array references every 30s,
  // triggering unnecessary App re-renders that cascade into TerminalView re-renders
  // and cause a visible blink on the xterm.js canvas.
  const previousAgentsRef = useRef<string>('');
  const previousTopicsRef = useRef<string>('');
  const previousPoliciesRef = useRef<string>('');

  const fetchConfig = useCallback(async () => {
    try {
      const [agentsResponse, topicsResponse, policiesResponse] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/agents/topics'),
        fetch('/api/restart-policies'),
      ]);

      if (agentsResponse.ok) {
        const agentsData = await agentsResponse.json();
        const serialized = JSON.stringify(agentsData.agents);
        if (serialized !== previousAgentsRef.current) {
          previousAgentsRef.current = serialized;
          setAgents(agentsData.agents);
        }
      }

      if (topicsResponse.ok) {
        const topicsData = await topicsResponse.json();
        const serialized = JSON.stringify(topicsData.mappings);
        if (serialized !== previousTopicsRef.current) {
          previousTopicsRef.current = serialized;
          setTopicMappings(topicsData.mappings);
        }
      }

      if (policiesResponse.ok) {
        const policiesData = await policiesResponse.json();
        const serialized = JSON.stringify(policiesData.policies);
        if (serialized !== previousPoliciesRef.current) {
          previousPoliciesRef.current = serialized;
          setRestartPolicies(policiesData.policies);
        }
      }

      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch agent config';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateRestartPolicy = useCallback(async (agentId: string, mode: CrashRestartMode) => {
    try {
      const response = await fetch(`/api/restart-policies/${encodeURIComponent(agentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crashRestartMode: mode }),
      });
      if (!response.ok) {
        console.error(`[useAgentConfig] Failed to update restart policy for ${agentId}: ${response.statusText}`);
        return;
      }
      await fetchConfig();
    } catch (updateError) {
      console.error(`[useAgentConfig] Error updating restart policy for ${agentId}:`, updateError);
    }
  }, [fetchConfig]);

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(fetchConfig, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchConfig]);

  return { agents, topicMappings, restartPolicies, isLoading, error, refetch: fetchConfig, updateRestartPolicy };
}
