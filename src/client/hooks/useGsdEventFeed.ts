import { useState, useEffect, useCallback } from 'react';
import type { GsdRawEvent } from '@shared/gsdTypes.js';

const POLL_INTERVAL_MS = 5_000;

export function useGsdEventFeed() {
  const [events, setEvents] = useState<GsdRawEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/gsd/events?limit=100');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { events: GsdRawEvent[] };
      setEvents(data.events);
      setError(null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Failed to fetch events';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return { events, isLoading, error };
}
