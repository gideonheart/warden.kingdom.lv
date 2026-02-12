import { useState, useEffect, useCallback } from 'react';
import type { AgentDetails, TopicMapping } from '../../shared/openclawTypes.js';

const REFRESH_INTERVAL_MS = 30_000;

export function useAgentConfig() {
  const [agents, setAgents] = useState<AgentDetails[]>([]);
  const [topicMappings, setTopicMappings] = useState<TopicMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const [agentsResponse, topicsResponse] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/agents/topics'),
      ]);

      if (agentsResponse.ok) {
        const agentsData = await agentsResponse.json();
        setAgents(agentsData.agents);
      }

      if (topicsResponse.ok) {
        const topicsData = await topicsResponse.json();
        setTopicMappings(topicsData.mappings);
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
