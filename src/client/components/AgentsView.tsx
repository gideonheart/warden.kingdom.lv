import { useMemo } from 'react';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus.js';
import { useAgentStateFiles } from '../hooks/useAgentStateFiles.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';
import type { AgentStateHint, PressureLevel } from '../hooks/useAgentLiveStatus.js';

// ─────────────────────────────────────────────────────────────────────────────
// Color maps (copied from gsd-manager-plugin — do not import from plugin)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};

const STATE_BADGE_COLORS: Record<AgentStateHint, string> = {
  working: 'bg-warden-accent text-white',
  idle: 'bg-warden-idle text-white',
  menu: 'bg-warden-warning text-warden-bg',
  permission_prompt: 'bg-warden-warning text-warden-bg',
  error: 'bg-warden-error text-white',
};

const STATE_LABELS: Record<AgentStateHint, string> = {
  working: 'working',
  idle: 'idle',
  menu: 'menu',
  permission_prompt: 'perm',
  error: 'error',
};

const PRESSURE_COLORS: Record<PressureLevel, string> = {
  ok: 'text-warden-success',
  warning: 'text-warden-warning',
  critical: 'text-warden-error',
};

// ─────────────────────────────────────────────────────────────────────────────
// Local helper components
// ─────────────────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: AgentStateHint | null }) {
  if (state === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  const colorClass = STATE_BADGE_COLORS[state];
  const label = STATE_LABELS[state];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${colorClass}`}>{label}</span>
  );
}

function PressureIndicator({
  percentage,
  level,
}: {
  percentage: number | null;
  level: PressureLevel | null;
}) {
  if (percentage === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  const colorClass = level ? PRESSURE_COLORS[level] : 'text-warden-text-dim';
  return <span className={`font-mono text-sm ${colorClass}`}>{percentage}%</span>;
}

function PhaseProgress({
  phase,
  progress,
}: {
  phase: string | null;
  progress: number | null;
}) {
  if (phase === null && progress === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  return (
    <span className="font-mono text-sm text-warden-text-dim">
      P{phase}{progress !== null ? ` ${progress}%` : ''}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentsView — full-page agent visibility grid
// ─────────────────────────────────────────────────────────────────────────────

export function AgentsView() {
  const {
    registry,
    isLoading: registryLoading,
    error: registryError,
    toggleEnabled,
    getEffectiveEnabled,
  } = useGsdRegistry();

  const liveStatus = useAgentLiveStatus();
  const { instances } = useActiveInstances();

  const sessionNames = useMemo(
    () =>
      (registry?.agents ?? [])
        .filter((agent) => agent.tmux_session_name)
        .map((agent) => agent.tmux_session_name),
    [registry],
  );

  const stateFiles = useAgentStateFiles(sessionNames);

  const agents = registry?.agents ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-lg font-semibold text-warden-text">Agents</h2>
        {!registryLoading && !registryError && (
          <span className="text-xs text-warden-text-dim px-2 py-0.5 bg-warden-border/50 rounded">
            {agents.length} registered
          </span>
        )}
        {registryLoading && (
          <span className="text-xs text-warden-text-dim flex items-center gap-1.5">
            <span className="w-3 h-3 border border-warden-accent border-t-transparent rounded-full animate-spin inline-block" />
            Loading...
          </span>
        )}
        {registryError && (
          <span className="text-xs text-warden-error">{registryError}</span>
        )}
      </div>

      {/* Empty state */}
      {!registryLoading && !registryError && agents.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <p className="text-warden-text-dim text-sm">No agents registered</p>
        </div>
      )}

      {/* Agent card grid */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => {
            const instance = instances.find(
              (inst) => inst.tmuxSessionName === agent.tmux_session_name,
            );
            const status = instance?.status ?? 'stopped';
            const statusColor = STATUS_COLORS[status] ?? 'bg-warden-error';
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
            const effectiveEnabled = getEffectiveEnabled(agent.agent_id, agent.enabled);
            const agentStatus = liveStatus.get(agent.agent_id);
            const stateInfo = agent.tmux_session_name
              ? stateFiles.get(agent.tmux_session_name)
              : undefined;

            return (
              <div
                key={agent.agent_id}
                className="bg-warden-panel border border-warden-border rounded-lg p-4 hover:border-warden-accent/30 transition-colors"
              >
                {/* Top row: agent ID + status dot + status label */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-semibold text-warden-text text-sm truncate mr-2">
                    {agent.agent_id}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                    <span className="text-xs text-warden-text-dim">{statusLabel}</span>
                  </div>
                </div>

                {/* Middle section: state, context, phase */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warden-text-dim">State</span>
                    <StateBadge state={agentStatus?.state ?? null} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warden-text-dim">Context</span>
                    <PressureIndicator
                      percentage={agentStatus?.contextPressure ?? null}
                      level={agentStatus?.contextPressureLevel ?? null}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warden-text-dim">Phase</span>
                    <PhaseProgress
                      phase={stateInfo?.phase ?? null}
                      progress={stateInfo?.progress ?? null}
                    />
                  </div>
                </div>

                {/* Bottom row: session name + enabled toggle */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-warden-border/50">
                  <span className="text-xs text-warden-text-dim font-mono truncate">
                    {agent.tmux_session_name || '—'}
                  </span>
                  <button
                    onClick={() => toggleEnabled(agent.agent_id, effectiveEnabled)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors flex-shrink-0 ${
                      effectiveEnabled
                        ? 'bg-warden-success/20 text-warden-success hover:bg-warden-success/30'
                        : 'bg-warden-error/20 text-warden-error hover:bg-warden-error/30'
                    }`}
                  >
                    {effectiveEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
