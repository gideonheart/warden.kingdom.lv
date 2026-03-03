import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentInstance } from '@shared/types.js';

const POLL_INTERVAL_MS = 5_000;

/**
 * Computes a stable logical signature for a list of instances.
 * Only tracks fields that affect rendering decisions: id, tmuxSessionName, status.
 * This allows the hook to skip setState when poll data is logically unchanged,
 * preventing downstream re-renders and terminal reconnections.
 */
export function computeInstanceSignature(instances: AgentInstance[]): string {
  const tuples = instances
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((instance) => `${instance.id}:${instance.tmuxSessionName}:${instance.status}`);
  return JSON.stringify(tuples);
}

export function useActiveInstances() {
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousSignatureRef = useRef<string>('');

  const fetchInstances = useCallback(async () => {
    try {
      const response = await fetch('/api/instances');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const newSignature = computeInstanceSignature(data.instances);
      // Skip setInstances when poll data is logically unchanged — prevents
      // unnecessary re-renders and downstream TerminalView remounts.
      if (newSignature !== previousSignatureRef.current) {
        previousSignatureRef.current = newSignature;
        setInstances(data.instances);
      }
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
