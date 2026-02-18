import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 10_000;

export interface RegistryAgent {
  agent_id: string;
  enabled: boolean;
  working_directory: string;
  tmux_session_name: string;
  claude_launch_command: string;
  auto_wake: boolean;
  topic_id: number;
  openclaw_session_id: string;
  claude_resume_target: string;
  claude_post_launch_mode: string;
}

export interface GsdRegistry {
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: RegistryAgent[];
}

export function useGsdRegistry() {
  const [registry, setRegistry] = useState<GsdRegistry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<Record<string, boolean>>({});

  const fetchRegistry = useCallback(async () => {
    try {
      const response = await fetch('/api/gsd/registry');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as GsdRegistry;
      setRegistry(data);
      setError(null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Failed to fetch registry';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistry();
    const interval = setInterval(fetchRegistry, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRegistry]);

  const toggleEnabled = useCallback(
    async (agentId: string, currentEnabled: boolean) => {
      const newEnabled = !currentEnabled;
      setOptimisticEnabled((prev) => ({ ...prev, [agentId]: newEnabled }));
      try {
        const response = await fetch(`/api/gsd/registry/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newEnabled }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // Remove overlay — poll data will catch up
        setOptimisticEnabled((prev) => {
          const next = { ...prev };
          delete next[agentId];
          return next;
        });
      } catch {
        // Revert on error
        setOptimisticEnabled((prev) => ({ ...prev, [agentId]: currentEnabled }));
      }
    },
    []
  );

  const getEffectiveEnabled = useCallback(
    (agentId: string, serverEnabled: boolean): boolean => {
      return optimisticEnabled[agentId] ?? serverEnabled;
    },
    [optimisticEnabled]
  );

  return { registry, isLoading, error, refetch: fetchRegistry, toggleEnabled, getEffectiveEnabled };
}
