import { useState, useEffect, useCallback } from 'react';
import type { ActivityEvent } from '../../shared/types.js';
import { ActivityEventRow } from './ActivityEventRow.js';

interface ActivityViewProps {
  onNavigateToSession?: (sessionName: string) => void;
}

interface ActivityFilters {
  agentId: string;
  eventType: string;
  dateFrom: string;
  dateTo: string;
}

function exportToCSV(events: ActivityEvent[]): void {
  const headers = ['id', 'timestamp', 'agentId', 'sessionName', 'eventType', 'summary', 'success', 'detail'];
  const escape = (value: string | null | undefined): string => {
    const str = value == null ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows = events.map((event) => [
    event.id,
    event.timestamp,
    escape(event.agentId),
    escape(event.sessionName),
    escape(event.eventType),
    escape(event.summary),
    event.success === null ? '' : String(event.success),
    escape(event.detail),
  ].join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const filename = `warden-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(blob, filename);
}

function exportToJSON(events: ActivityEvent[]): void {
  const jsonContent = JSON.stringify(events, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const filename = `warden-activity-${new Date().toISOString().slice(0, 10)}.json`;
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ActivityView({ onNavigateToSession }: ActivityViewProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [filters, setFilters] = useState<ActivityFilters>({
    agentId: '',
    eventType: '',
    dateFrom: '',
    dateTo: '',
  });

  const pageSize = 50;

  const buildQueryParams = useCallback(
    (overrideLimit?: number, overrideOffset?: number): URLSearchParams => {
      const params = new URLSearchParams();
      if (filters.agentId) params.set('agentId', filters.agentId);
      if (filters.eventType) params.set('eventType', filters.eventType);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', String(overrideLimit ?? pageSize));
      params.set('offset', String(overrideOffset ?? page * pageSize));
      return params;
    },
    [filters, page]
  );

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = buildQueryParams();
      const response = await fetch(`/api/activity/events?${params}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch activity events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [buildQueryParams]);

  // Fetch event types once on mount
  useEffect(() => {
    fetch('/api/activity/event-types')
      .then((res) => (res.ok ? res.json() : { types: [] }))
      .then((data: { types: string[] }) => setEventTypes(data.types))
      .catch((err) => console.error('Failed to fetch event types:', err));
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleFilterChange = useCallback((field: keyof ActivityFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(0);
  }, []);

  const handleExportCSV = useCallback(async () => {
    if (events.length === 0) return;
    setIsExporting(true);
    try {
      const params = buildQueryParams(10000, 0);
      const response = await fetch(`/api/activity/events?${params}`);
      if (response.ok) {
        const data = await response.json();
        exportToCSV(data.events);
      }
    } catch (error) {
      console.error('Failed to export CSV:', error);
    } finally {
      setIsExporting(false);
    }
  }, [events.length, buildQueryParams]);

  const handleExportJSON = useCallback(async () => {
    if (events.length === 0) return;
    setIsExporting(true);
    try {
      const params = buildQueryParams(10000, 0);
      const response = await fetch(`/api/activity/events?${params}`);
      if (response.ok) {
        const data = await response.json();
        exportToJSON(data.events);
      }
    } catch (error) {
      console.error('Failed to export JSON:', error);
    } finally {
      setIsExporting(false);
    }
  }, [events.length, buildQueryParams]);

  const totalPages = Math.ceil(total / pageSize);

  const eventTypeLabels: Record<string, string> = {
    session_start: 'Session Start',
    session_stop: 'Session Stop',
    prompt_sent: 'Prompt Sent',
    operator_input: 'Operator Input',
    tool_call: 'Tool Call',
    file_edit: 'File Edit',
    bash_command: 'Bash Command',
    error: 'Error',
  };

  return (
    <div className="p-4 space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Agent ID"
          value={filters.agentId}
          onChange={(e) => handleFilterChange('agentId', e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text w-32"
        />
        <select
          value={filters.eventType}
          onChange={(e) => handleFilterChange('eventType', e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text"
        >
          <option value="">All types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {eventTypeLabels[type] ?? type}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text"
        />
        <span className="text-xs text-warden-text-dim self-center">{total} events</span>
        <button
          onClick={handleExportCSV}
          disabled={events.length === 0 || isExporting}
          className="px-2 py-1 min-h-[44px] text-xs bg-warden-border/50 text-warden-text-dim hover:text-warden-text rounded transition-colors disabled:opacity-30"
        >
          {isExporting ? 'Exporting...' : 'CSV'}
        </button>
        <button
          onClick={handleExportJSON}
          disabled={events.length === 0 || isExporting}
          className="px-2 py-1 min-h-[44px] text-xs bg-warden-border/50 text-warden-text-dim hover:text-warden-text rounded transition-colors disabled:opacity-30"
        >
          {isExporting ? 'Exporting...' : 'JSON'}
        </button>
      </div>

      {/* Event list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-warden-text-dim text-sm">Loading...</span>
        </div>
      ) : events.length === 0 ? (
        <p className="text-warden-text-dim text-sm py-8 text-center">No activity events found</p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => (
            <ActivityEventRow
              key={event.id}
              event={event}
              onNavigateToSession={onNavigateToSession}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
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
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-2 min-h-[44px] text-xs text-warden-text-dim hover:text-warden-text disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
