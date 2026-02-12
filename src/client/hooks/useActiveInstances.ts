import { useState, useEffect, useCallback } from 'react';
import type { AgentInstance } from '../../shared/types.js';

const POLL_INTERVAL_MS = 5_000;

export function useActiveInstances() {
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const response = await fetch('/api/instances');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setInstances(data.instances);
      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch instances';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  return { instances, isLoading, error, refetch: fetchInstances };
}
