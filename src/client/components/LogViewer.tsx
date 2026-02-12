import { useState, useEffect, useCallback, useRef } from 'react';

export function LogViewer() {
  const [logLines, setLogLines] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set('agentId', agentFilter);
      params.set('lines', '100');

      const response = await fetch(`/api/history/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogLines(data.lines);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agentFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-warden-border">
        <input
          type="text"
          placeholder="Filter by agent ID"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 text-sm text-warden-text w-40"
        />
        <label className="flex items-center gap-1.5 text-xs text-warden-text-dim cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          Auto-refresh (5s)
        </label>
        <button
          onClick={fetchLogs}
          className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text transition-colors ml-auto"
        >
          Refresh
        </button>
      </div>

      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-warden-text-dim">Loading logs...</span>
          </div>
        ) : logLines.length === 0 ? (
          <p className="text-warden-text-dim text-center py-8">No log entries found</p>
        ) : (
          logLines.map((line, index) => (
            <div
              key={index}
              className="text-warden-text-dim hover:text-warden-text hover:bg-warden-border/20 px-1 transition-colors whitespace-pre-wrap break-all"
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
