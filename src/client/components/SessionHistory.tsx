import { useState, useEffect, useCallback } from 'react';
import type { AgentInstance } from '../../shared/types.js';

interface SessionSearchFilters {
  agentId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<AgentInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<SessionSearchFilters>({
    agentId: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  const pageSize = 25;

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.agentId) params.set('agentId', filters.agentId);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));

      const response = await fetch(`/api/history/sessions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.instances);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch session history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalPages = Math.ceil(total / pageSize);

  const statusColors: Record<string, string> = {
    active: 'text-warden-success',
    idle: 'text-warden-idle',
    stopped: 'text-warden-text-dim',
    error: 'text-warden-error',
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Agent ID"
          value={filters.agentId}
          onChange={(e) => { setFilters({ ...filters, agentId: e.target.value }); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 text-sm text-warden-text w-32"
        />
        <select
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="stopped">Stopped</option>
          <option value="error">Error</option>
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => { setFilters({ ...filters, dateFrom: e.target.value }); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => { setFilters({ ...filters, dateTo: e.target.value }); setPage(0); }}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
        />
        <span className="text-xs text-warden-text-dim self-center">{total} sessions</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-warden-text-dim text-sm">Loading...</span>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-warden-text-dim text-sm py-8 text-center">No sessions found</p>
      ) : (
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 px-3 py-2 bg-warden-border/20 rounded text-sm hover:bg-warden-border/30 transition-colors"
            >
              <span className={`font-medium w-24 ${statusColors[session.status] ?? 'text-warden-text-dim'}`}>
                {session.status}
              </span>
              <span className="text-warden-text font-mono flex-1 truncate">{session.tmuxSessionName}</span>
              <span className="text-warden-text-dim w-20">{session.agentId}</span>
              <span className="text-warden-text-dim/60 text-xs w-40 text-right font-mono">{session.createdAt}</span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-warden-text-dim">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
