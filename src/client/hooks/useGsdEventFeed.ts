import { useState, useEffect, useCallback } from 'react';
import type { GsdRawEvent, GsdEventSource } from '@shared/gsdTypes.js';

const POLL_INTERVAL_MS = 5_000;

export function useGsdEventFeed(source?: string) {
  const [events, setEvents] = useState<GsdRawEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const url = source
        ? `/api/gsd/events?limit=100&source=${encodeURIComponent(source)}`
        : '/api/gsd/events?limit=100';
      const response = await fetch(url);
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
  }, [source]);

  useEffect(() => {
    setIsLoading(true);
    fetchEvents();
    const interval = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return { events, isLoading, error };
}

export function useGsdEventSources() {
  const [sources, setSources] = useState<GsdEventSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSources() {
      try {
        const response = await fetch('/api/gsd/events/sources');
        if (!response.ok) return;
        const data = (await response.json()) as { sources: GsdEventSource[] };
        if (!cancelled) setSources(data.sources);
      } catch {
        // Silently ignore — sources list is optional UI enhancement
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSources();
    return () => { cancelled = true; };
  }, []);

  return { sources, isLoading };
}
