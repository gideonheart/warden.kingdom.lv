import { useState } from 'react';
import type { AgentInstance } from '../../shared/types.js';
import { STATUS_COLORS } from './gsdShared.js';
import type { AgentLiveStatus } from '../hooks/useAgentLiveStatus.js';

interface InstanceTabBarProps {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  onSessionStopped?: (sessionName: string) => void;
  sessionStatusMap?: Map<string, AgentLiveStatus>;
  onRestart?: (instanceId: number) => void;
  onForceKill?: (instanceId: number) => void;
}

/** Returns human-readable label for a lifecycle status. */
function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'idle': return 'Idle';
    case 'starting': return 'Starting...';
    case 'stopping': return 'Stopping...';
    case 'stopped': return 'Stopped';
    case 'error': return 'Error';
    default: return status;
  }
}

export function InstanceTabBar({
  instances,
  selectedSessionName,
  onSelectSession,
  onSessionStopped,
  sessionStatusMap,
  onRestart,
  onForceKill,
}: InstanceTabBarProps) {
  // Track which session has a pending stop confirmation dialog
  const [confirmingStopSession, setConfirmingStopSession] = useState<string | null>(null);
  // Track which session has a pending restart confirmation dialog
  const [confirmingRestartSession, setConfirmingRestartSession] = useState<string | null>(null);
  // Track locally dismissed tabs (stopped/error sessions that operator dismissed)
  const [dismissedSessions, setDismissedSessions] = useState<Set<string>>(new Set());

  const handleStopRequest = (instance: AgentInstance) => {
    setConfirmingStopSession(instance.tmuxSessionName);
  };

  const handleStopConfirm = async (instance: AgentInstance) => {
    setConfirmingStopSession(null);
    try {
      const response = await fetch(`/api/instances/${instance.id}/stop`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to stop session: ${response.statusText}`);
      }
      onSessionStopped?.(instance.tmuxSessionName);
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  const handleRestartRequest = (instance: AgentInstance) => {
    setConfirmingRestartSession(instance.tmuxSessionName);
  };

  const handleRestartConfirm = async (instance: AgentInstance) => {
    setConfirmingRestartSession(null);
    onRestart?.(instance.id);
  };

  const handleDismiss = (sessionName: string) => {
    setDismissedSessions((prev) => new Set([...prev, sessionName]));
  };

  // Filter out locally dismissed sessions
  const visibleInstances = instances.filter(
    (instance) => !dismissedSessions.has(instance.tmuxSessionName),
  );

  if (visibleInstances.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 bg-warden-panel border-b border-warden-border">
        <span className="text-warden-text-dim text-sm">No active sessions</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto touch-scroll tab-snap">
      {visibleInstances.map((instance) => {
        const isSelected = instance.tmuxSessionName === selectedSessionName;
        const statusColor = STATUS_COLORS[instance.status] ?? 'bg-warden-idle';
        const agentStatus = sessionStatusMap?.get(instance.tmuxSessionName);
        const hasPermissionBadge = agentStatus?.state === 'permission_prompt';
        const isConfirmingStop = confirmingStopSession === instance.tmuxSessionName;
        const isConfirmingRestart = confirmingRestartSession === instance.tmuxSessionName;
        const displayName = instance.agentName || instance.agentId;

        return (
          <div
            key={instance.tmuxSessionName}
            className={`relative flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-md text-sm whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                : 'text-warden-text-dim hover:bg-warden-border/50 hover:text-warden-text border border-transparent'
            }`}
          >
            {/* Permission prompt badge */}
            {hasPermissionBadge && (
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warden-warning animate-pulse"
                aria-label="Waiting for permission"
                title="Waiting for permission input"
              />
            )}

            {/* Session select button */}
            <button
              onClick={() => onSelectSession(instance.tmuxSessionName)}
              className="flex items-center gap-2 flex-1"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} title={statusLabel(instance.status)} />
              <span className="font-medium">{displayName}</span>
              <span className="text-xs opacity-60 font-mono">{instance.tmuxSessionName.split('-').slice(1).join('-')}</span>
              {instance.projectPath && (
                <span className="text-xs opacity-40 font-mono hidden lg:inline" title={instance.projectPath}>
                  {instance.projectPath.split('/').pop()}
                </span>
              )}
              {/* Status label for non-active states */}
              {(instance.status === 'starting' || instance.status === 'stopping' || instance.status === 'stopped' || instance.status === 'error') && (
                <span className={`text-xs font-mono ${
                  instance.status === 'starting' ? 'text-warden-warning' :
                  instance.status === 'stopping' ? 'text-warden-error/70' :
                  instance.status === 'error' ? 'text-warden-error' :
                  'text-warden-text-dim/60'
                }`}>
                  {statusLabel(instance.status)}
                </span>
              )}
            </button>

            {/* Action buttons area */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Stop confirmation dialog */}
              {isConfirmingStop && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-warden-text-dim">Stop {displayName}?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleStopConfirm(instance); }}
                    className="px-1.5 py-0.5 text-xs bg-warden-error/20 text-warden-error rounded hover:bg-warden-error/30 transition-colors"
                  >
                    Stop
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingStopSession(null); }}
                    className="px-1.5 py-0.5 text-xs bg-warden-border/50 text-warden-text-dim rounded hover:bg-warden-border transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Restart confirmation dialog */}
              {isConfirmingRestart && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-warden-text-dim">Restart {displayName}?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleRestartConfirm(instance); }}
                    className="px-1.5 py-0.5 text-xs bg-warden-warning/20 text-warden-warning rounded hover:bg-warden-warning/30 transition-colors"
                  >
                    Restart
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingRestartSession(null); }}
                    className="px-1.5 py-0.5 text-xs bg-warden-border/50 text-warden-text-dim rounded hover:bg-warden-border transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Normal action buttons (not shown when confirmation dialogs are open) */}
              {!isConfirmingStop && !isConfirmingRestart && (
                <>
                  {/* Active/idle: show Stop button */}
                  {(instance.status === 'active' || instance.status === 'idle') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStopRequest(instance); }}
                      className="px-1.5 py-0.5 text-xs bg-warden-error/20 text-warden-error rounded hover:bg-warden-error/30 transition-colors"
                      title="Stop session"
                    >
                      Stop
                    </button>
                  )}

                  {/* Stopping: show Force Kill button */}
                  {instance.status === 'stopping' && onForceKill && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onForceKill(instance.id); }}
                      className="px-1.5 py-0.5 text-xs bg-warden-error/30 text-warden-error rounded hover:bg-warden-error/50 transition-colors font-medium"
                      title="Force kill immediately"
                    >
                      Force Kill
                    </button>
                  )}

                  {/* Stopped or error: show Restart button + dismiss x */}
                  {(instance.status === 'stopped' || instance.status === 'error') && onRestart && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestartRequest(instance); }}
                      className="px-1.5 py-0.5 text-xs bg-warden-warning/20 text-warden-warning rounded hover:bg-warden-warning/30 transition-colors"
                      title="Restart session"
                    >
                      Restart
                    </button>
                  )}

                  {/* Dismiss button for stopped/error tabs */}
                  {(instance.status === 'stopped' || instance.status === 'error') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(instance.tmuxSessionName); }}
                      className="px-1 py-0.5 text-xs text-warden-text-dim/50 hover:text-warden-text-dim rounded hover:bg-warden-border/30 transition-colors"
                      title="Dismiss tab"
                      aria-label="Dismiss stopped session tab"
                    >
                      x
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
