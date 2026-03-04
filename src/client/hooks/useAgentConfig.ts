import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentDetails, TopicMapping } from '../../shared/openclawTypes.js';

const REFRESH_INTERVAL_MS = 30_000;

export function useAgentConfig() {
  const [agents, setAgents] = useState<AgentDetails[]>([]);
  const [topicMappings, setTopicMappings] = useState<TopicMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous serialized data to skip setState when poll data is unchanged.
  // Without this, setAgents/setTopicMappings create new array references every 30s,
  // triggering unnecessary App re-renders that cascade into TerminalView re-renders
  // and cause a visible blink on the xterm.js canvas.
  const previousAgentsRef = useRef<string>('');
  const previousTopicsRef = useRef<string>('');

  const fetchConfig = useCallback(async () => {
    try {
      const [agentsResponse, topicsResponse] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/agents/topics'),
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

      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch agent config';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(fetchConfig, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchConfig]);

  return { agents, topicMappings, isLoading, error, refetch: fetchConfig };
}
