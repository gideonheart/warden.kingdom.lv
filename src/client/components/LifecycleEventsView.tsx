import { useState, useEffect, useCallback } from 'react';
import type { LifecycleEvent } from '@shared/types.js';

const PAGE_SIZE = 25;

const EVENT_TYPE_BADGE: Record<string, string> = {
  crashed: 'bg-red-900/40 text-red-300 border border-red-700',
  'auto-restarted': 'bg-blue-900/40 text-blue-300 border border-blue-700',
  'idle-timeout': 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
  stopped: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600',
  started: 'bg-green-900/40 text-green-300 border border-green-700',
};

function eventTypeBadgeClass(eventType: string): string {
  return EVENT_TYPE_BADGE[eventType] ?? 'bg-zinc-700/40 text-zinc-300 border border-zinc-600';
}

function formatUptime(uptimeSecs: number | null): string {
  if (uptimeSecs === null || uptimeSecs === undefined) return '—';
  return `${Math.round(uptimeSecs)}s`;
}

export function LifecycleEventsView() {
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAgentId, setFilterAgentId] = useState('');
  const [filterEventType, setFilterEventType] = useState('');

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAgentId) params.set('agentId', filterAgentId);
      if (filterEventType) params.set('eventType', filterEventType);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));

      const response = await fetch(`/api/lifecycle-events?${params}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (error) {
      console.error('Failed to fetch lifecycle events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filterAgentId, filterEventType, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="p-4 space-y-4">
      {/* Filter controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Filter by agent ID"
          value={filterAgentId}
          onChange={(e) => { setFilterAgentId(e.target.value); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text w-40"
        />
        <select
          value={filterEventType}
          onChange={(e) => { setFilterEventType(e.target.value); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text"
        >
          <option value="">All event types</option>
          <option value="crashed">Crashed</option>
          <option value="auto-restarted">Auto-restarted</option>
          <option value="idle-timeout">Idle-timeout</option>
          <option value="stopped">Stopped</option>
          <option value="started">Started</option>
        </select>
        <span className="text-xs text-warden-text-dim self-center">{total} event{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-warden-text-dim text-sm">Loading...</span>
        </div>
      ) : events.length === 0 ? (
        <p className="text-warden-text-dim text-sm py-8 text-center">No lifecycle events found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-warden-border text-left text-warden-text-dim text-xs">
                <th className="pb-2 pr-3 font-medium">Timestamp</th>
                <th className="pb-2 pr-3 font-medium">Agent</th>
                <th className="pb-2 pr-3 font-medium">Session</th>
                <th className="pb-2 pr-3 font-medium">Event Type</th>
                <th className="pb-2 pr-3 font-medium">Outcome</th>
                <th className="pb-2 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-warden-border/40 hover:bg-warden-border/20 transition-colors"
                >
                  <td className="py-2 pr-3 text-warden-text-dim font-mono text-xs whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-warden-text text-xs">
                    {event.agentId}
                  </td>
                  <td className="py-2 pr-3 text-warden-text-dim font-mono text-xs truncate max-w-[180px]">
                    {event.sessionName}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${eventTypeBadgeClass(event.eventType)}`}>
                      {event.eventType}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-warden-text-dim text-xs">
                    {event.outcome ?? '—'}
                  </td>
                  <td className="py-2 text-warden-text-dim text-xs font-mono">
                    {formatUptime(event.uptimeSecs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-2 min-h-[44px] text-xs text-warden-text-dim hover:text-warden-text disabled:opacity-30"
        >
          Previous
        </button>
        <span className="text-xs text-warden-text-dim">
          Page {page + 1} of {totalPages}
        </span>
        <button
          onClick={() => setPage((prev) => prev + 1)}
          disabled={(page + 1) * PAGE_SIZE >= total}
          className="px-3 py-2 min-h-[44px] text-xs text-warden-text-dim hover:text-warden-text disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}
