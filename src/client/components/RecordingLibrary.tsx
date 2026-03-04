import { useState, useEffect, useCallback } from 'react';
import type { RecordingEntry } from '@shared/types.js';

type SortColumn = 'startedAt' | 'agentName' | 'projectPath' | 'durationSecs' | 'fileSizeBytes';
type SortDir = 'asc' | 'desc';

function formatDuration(secs: number | null): string {
  if (secs === null) return '—';
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface RecordingLibraryProps {
  onPlayRecording: (recording: RecordingEntry) => void;
  refreshKey?: number;
}

export function RecordingLibrary({ onPlayRecording, refreshKey }: RecordingLibraryProps) {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>('startedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [autoRecordAgentIds, setAutoRecordAgentIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [showAutoRecordSettings, setShowAutoRecordSettings] = useState(false);

  const fetchRecordings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/recordings');
      if (response.ok) {
        const data = await response.json() as RecordingEntry[];
        setRecordings(data);
      }
    } catch (error) {
      console.error('Failed to fetch recordings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecordings();
  }, [fetchRecordings, refreshKey]);

  useEffect(() => {
    void Promise.all([
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/recordings/auto-record-config').then(r => r.json()),
    ]).then(([agentsData, configData]) => {
      const agentList = (agentsData as { agents?: Array<{ id: string; name: string }> }).agents ?? [];
      setAgents(agentList);
      const enabled = new Set<string>(
        ((configData as { configs?: Array<{ agentId: string }> }).configs ?? []).map(c => c.agentId)
      );
      setAutoRecordAgentIds(enabled);
    }).catch(err => console.error('Failed to load auto-record config:', err));
  }, []);

  const handleToggleAutoRecord = useCallback(async (agentId: string) => {
    const enabled = !autoRecordAgentIds.has(agentId);
    try {
      await fetch(`/api/recordings/auto-record-config/${encodeURIComponent(agentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setAutoRecordAgentIds(prev => {
        const next = new Set(prev);
        enabled ? next.add(agentId) : next.delete(agentId);
        return next;
      });
    } catch (error) {
      console.error('Failed to toggle auto-record:', error);
    }
  }, [autoRecordAgentIds]);

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        return col;
      }
      setSortDir('desc');
      return col;
    });
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    void fetchRecordings();
  }, [fetchRecordings]);

  const handleDownload = useCallback((recording: RecordingEntry) => {
    window.open(`/api/recordings/${recording.id}/download`, '_blank');
  }, []);

  const sorted = [...recordings].sort((a, b) => {
    const valA = a[sortColumn] ?? '';
    const valB = b[sortColumn] ?? '';
    const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalSizeBytes = recordings.reduce((sum, r) => sum + (r.fileSizeBytes ?? 0), 0);

  const SortHeader = ({ col, label }: { col: SortColumn; label: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-warden-text-dim cursor-pointer hover:text-warden-text select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {label}
      {sortColumn === col && (
        <span className="ml-1 text-warden-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Library header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-warden-border bg-warden-panel">
        <span className="text-sm text-warden-text-dim">
          {recordings.length} recording{recordings.length !== 1 ? 's' : ''}, {formatFileSize(totalSizeBytes)} total
        </span>
        <button
          onClick={() => void fetchRecordings()}
          className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text bg-warden-border/30 rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Auto-record settings — collapsible */}
      <div className="border-b border-warden-border">
        <button
          onClick={() => setShowAutoRecordSettings(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-warden-text-dim hover:text-warden-text transition-colors"
        >
          <span>Auto-record settings</span>
          <span className="text-[10px]">{showAutoRecordSettings ? '▲' : '▼'}</span>
        </button>
        {showAutoRecordSettings && (
          <div className="px-4 pb-3">
            {agents.length === 0 ? (
              <p className="text-xs text-warden-text-dim/60">No agents configured</p>
            ) : (
              <div className="space-y-1">
                {agents.map(agent => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 py-1 cursor-pointer group"
                  >
                    <button
                      onClick={() => void handleToggleAutoRecord(agent.id)}
                      className={`w-8 h-4 rounded-full relative transition-colors ${
                        autoRecordAgentIds.has(agent.id)
                          ? 'bg-red-500/70'
                          : 'bg-warden-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          autoRecordAgentIds.has(agent.id)
                            ? 'translate-x-4'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-warden-text group-hover:text-warden-accent transition-colors">
                      {agent.name || agent.id}
                    </span>
                    {autoRecordAgentIds.has(agent.id) && (
                      <span className="text-[10px] text-red-400/70 ml-auto">REC</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-warden-text-dim/50 mt-2">
              Auto-recorded sessions start capturing from the first frame.
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-warden-text-dim text-sm">Loading recordings...</span>
            </div>
          </div>
        ) : recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3 opacity-20">●</div>
            <p className="text-warden-text-dim">No recordings yet</p>
            <p className="text-warden-text-dim/60 text-xs mt-1">Click REC in any terminal session to start recording</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-warden-panel border-b border-warden-border">
              <tr>
                <SortHeader col="agentName" label="Agent" />
                <SortHeader col="projectPath" label="Project" />
                <SortHeader col="startedAt" label="Date" />
                <SortHeader col="durationSecs" label="Duration" />
                <SortHeader col="fileSizeBytes" label="Size" />
                <th className="px-3 py-2 text-left text-xs font-medium text-warden-text-dim">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((recording) => (
                <tr key={recording.id} className="border-b border-warden-border/50 hover:bg-warden-panel/50 transition-colors">
                  <td className="px-3 py-2 text-warden-text font-medium">{recording.agentName || recording.agentId}</td>
                  <td className="px-3 py-2 text-warden-text-dim text-xs font-mono max-w-[200px] truncate" title={recording.projectPath}>
                    {recording.projectPath.split('/').pop() || recording.projectPath}
                  </td>
                  <td className="px-3 py-2 text-warden-text-dim text-xs">{formatDate(recording.startedAt)}</td>
                  <td className="px-3 py-2 text-warden-text-dim font-mono text-xs">{formatDuration(recording.durationSecs)}</td>
                  <td className="px-3 py-2 text-warden-text-dim text-xs">{formatFileSize(recording.fileSizeBytes)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {recording.stoppedAt && (
                        <button
                          onClick={() => onPlayRecording(recording)}
                          className="px-2 py-0.5 text-xs bg-warden-accent/20 text-warden-accent rounded hover:bg-warden-accent/30 transition-colors"
                        >
                          Play
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(recording)}
                        className="px-2 py-0.5 text-xs bg-warden-border/50 text-warden-text-dim rounded hover:text-warden-text hover:bg-warden-border transition-colors"
                      >
                        Download
                      </button>
                      {deleteConfirm === recording.id ? (
                        <>
                          <button
                            onClick={() => void handleDelete(recording.id)}
                            className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-0.5 text-xs text-warden-text-dim rounded hover:text-warden-text transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(recording.id)}
                          className="px-2 py-0.5 text-xs text-warden-text-dim/50 rounded hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
