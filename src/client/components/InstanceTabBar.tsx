import type { AgentInstance } from '../../shared/types.js';
import { STATUS_COLORS } from './gsdShared.js';

interface InstanceTabBarProps {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  onDismiss?: (instanceId: number) => void;
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

/**
 * Builds a display label for each instance.
 * When multiple instances share the same agentId, appends a sequential number
 * (e.g., "Casper-1", "Casper-2") so they can be told apart in the tab bar.
 * Single-agent sessions are shown without a number suffix.
 */
function buildDisplayLabels(instances: AgentInstance[]): Map<string, string> {
  // Count how many instances share each agentId
  const agentIdCounts = new Map<string, number>();
  for (const instance of instances) {
    agentIdCounts.set(instance.agentId, (agentIdCounts.get(instance.agentId) ?? 0) + 1);
  }

  // Assign sequential numbers to instances that share an agentId
  const agentIdSequences = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const instance of instances) {
    const baseName = instance.agentName || instance.agentId;
    const count = agentIdCounts.get(instance.agentId) ?? 1;
    if (count > 1) {
      const seq = (agentIdSequences.get(instance.agentId) ?? 0) + 1;
      agentIdSequences.set(instance.agentId, seq);
      labels.set(instance.tmuxSessionName, `${baseName}-${seq}`);
    } else {
      labels.set(instance.tmuxSessionName, baseName);
    }
  }

  return labels;
}

export function InstanceTabBar({
  instances,
  selectedSessionName,
  onSelectSession,
  onDismiss,
}: InstanceTabBarProps) {
  const visibleInstances = instances;

  if (visibleInstances.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 bg-warden-panel border-b border-warden-border">
        <span className="text-warden-text-dim text-sm">No active sessions</span>
      </div>
    );
  }

  const displayLabels = buildDisplayLabels(visibleInstances);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto touch-scroll">
      {visibleInstances.map((instance) => {
        const isSelected = instance.tmuxSessionName === selectedSessionName;
        const statusColor = STATUS_COLORS[instance.status] ?? 'bg-warden-idle';
        const displayName = displayLabels.get(instance.tmuxSessionName) ?? (instance.agentName || instance.agentId);

        return (
          <div
            key={instance.tmuxSessionName}
            className={`relative flex items-center gap-1 px-2.5 py-1 rounded-md text-sm whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                : 'text-warden-text-dim hover:bg-warden-border/50 hover:text-warden-text border border-transparent'
            }`}
          >
            <button
              onClick={() => onSelectSession(instance.tmuxSessionName)}
              className="flex items-center gap-2"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} title={statusLabel(instance.status)} />
              <span className="font-medium">{displayName}</span>
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

            {/* Dismiss button for stopped/error tabs */}
            {(instance.status === 'stopped' || instance.status === 'error') && onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(instance.id); }}
                className="px-1 py-0.5 text-xs text-warden-text-dim/50 hover:text-warden-text-dim rounded hover:bg-warden-border/30 transition-colors"
                title="Dismiss tab"
                aria-label="Dismiss stopped session tab"
              >
                x
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
