import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentDetails } from '@shared/openclawTypes.js';

interface QuickLaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: AgentDetails[];
  activeAgentIds: Set<string>;
  onLaunch: (agentId: string, projectPath: string) => Promise<void>;
}

export function QuickLaunchModal({
  isOpen,
  onClose,
  agents,
  activeAgentIds,
  onLaunch,
}: QuickLaunchModalProps) {
  const [lastProjectPaths, setLastProjectPaths] = useState<Record<string, string>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Fetch last-used project paths when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setSelectedAgentId(null);
    setProjectPath('');
    setLaunchError(null);

    fetch('/api/agents/last-projects')
      .then((res) => res.json())
      .then((data: { paths: Record<string, string> }) => {
        setLastProjectPaths(data.paths ?? {});
      })
      .catch((error: unknown) => {
        console.error('[QuickLaunchModal] Failed to fetch last project paths:', error);
        setLastProjectPaths({});
      });
  }, [isOpen]);

  // Focus path input when an agent is selected
  useEffect(() => {
    if (selectedAgentId !== null) {
      setTimeout(() => {
        pathInputRef.current?.focus();
      }, 50);
    }
  }, [selectedAgentId]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAgentSelect = useCallback(
    (agentId: string) => {
      if (activeAgentIds.has(agentId)) return;
      setSelectedAgentId(agentId);
      setProjectPath(lastProjectPaths[agentId] ?? '');
      setLaunchError(null);
    },
    [activeAgentIds, lastProjectPaths],
  );

  const handleLaunch = useCallback(async () => {
    if (!selectedAgentId || !projectPath.trim()) return;

    setIsLaunching(true);
    setLaunchError(null);

    try {
      await onLaunch(selectedAgentId, projectPath.trim());
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Launch failed';
      setLaunchError(message);
    } finally {
      setIsLaunching(false);
    }
  }, [selectedAgentId, projectPath, onLaunch, onClose]);

  const handlePathKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && projectPath.trim() && !isLaunching) {
        void handleLaunch();
      }
    },
    [handleLaunch, projectPath, isLaunching],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="New Session"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-warden-panel border border-warden-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-warden-border">
          <h2 className="text-sm font-semibold text-warden-text">New Session</h2>
          <button
            onClick={onClose}
            className="text-warden-text-dim hover:text-warden-text transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center rounded"
            aria-label="Close"
          >
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        {/* Agent grid */}
        <div className="p-4">
          <p className="text-xs text-warden-text-dim mb-3">Select an agent to launch:</p>
          <div className="grid grid-cols-2 gap-2">
            {agents.map((agent) => {
              const isActive = activeAgentIds.has(agent.id);
              const isSelected = selectedAgentId === agent.id;

              return (
                <button
                  key={agent.id}
                  onClick={() => handleAgentSelect(agent.id)}
                  disabled={isActive}
                  className={[
                    'text-left px-3 py-2.5 rounded border transition-colors',
                    isActive
                      ? 'opacity-50 cursor-not-allowed border-warden-border bg-warden-border/20'
                      : isSelected
                        ? 'border-warden-accent bg-warden-accent/10 cursor-pointer'
                        : 'border-warden-border hover:border-warden-accent/50 hover:bg-warden-border/30 cursor-pointer',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-warden-success' : 'bg-warden-idle'}`}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-warden-text truncate">
                      {agent.name}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-[10px] text-warden-success font-medium flex-shrink-0">
                        Running
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-warden-text-dim pl-4 truncate">{agent.id}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Project path input — shown when an agent is selected */}
        {selectedAgentId !== null && (
          <div className="px-4 pb-4 border-t border-warden-border pt-4">
            <label
              htmlFor="quick-launch-path"
              className="block text-xs text-warden-text-dim mb-1.5"
            >
              Project path
            </label>
            <div className="flex gap-2">
              <input
                id="quick-launch-path"
                ref={pathInputRef}
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={handlePathKeyDown}
                placeholder="Enter project path (e.g., /home/forge/my-project)"
                className="flex-1 px-3 py-2 text-xs bg-warden-bg border border-warden-border rounded text-warden-text placeholder-warden-text-dim focus:outline-none focus:border-warden-accent transition-colors"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => void handleLaunch()}
                disabled={!projectPath.trim() || isLaunching}
                className={[
                  'px-4 py-2 text-xs rounded font-medium transition-colors flex-shrink-0',
                  !projectPath.trim() || isLaunching
                    ? 'bg-warden-accent/40 text-white/50 cursor-not-allowed'
                    : 'bg-warden-accent hover:bg-warden-accent-dim text-white cursor-pointer',
                ].join(' ')}
              >
                {isLaunching ? 'Launching...' : 'Launch'}
              </button>
            </div>
            {launchError && (
              <p className="mt-2 text-xs text-warden-error">{launchError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
