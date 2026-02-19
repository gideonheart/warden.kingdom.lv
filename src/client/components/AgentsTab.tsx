import { useMemo } from 'react';
import { STATUS_COLORS, StateBadge, PressureIndicator, PhaseProgress } from './gsdShared.js';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus.js';
import { useAgentStateFiles } from '../hooks/useAgentStateFiles.js';

// ─────────────────────────────────────────────────────────────────────────────
// AgentsTab — responsive card grid with state badges, pressure, phase progress
// ─────────────────────────────────────────────────────────────────────────────

export function AgentsTab() {
  const { registry, isLoading: registryLoading, error: registryError, getEffectiveEnabled, toggleEnabled } = useGsdRegistry();
  const { instances } = useActiveInstances();
  const liveStatus = useAgentLiveStatus();

  const sessionNames = useMemo(
    () => (registry?.agents ?? []).filter((a) => a.tmux_session_name).map((a) => a.tmux_session_name),
    [registry],
  );

  const stateFiles = useAgentStateFiles(sessionNames);
  const agents = registry?.agents ?? [];

  return (
    <div>
      {/* Header badge/spinner/error — moved from GsdView */}
      <div className="flex items-center gap-3 mb-4">
        {!registryLoading && !registryError && (
          <span className="text-xs text-warden-text-dim px-2 py-0.5 bg-warden-border/50 rounded">{agents.length} registered</span>
        )}
        {registryLoading && (
          <span className="text-xs text-warden-text-dim flex items-center gap-1.5">
            <span className="w-3 h-3 border border-warden-accent border-t-transparent rounded-full animate-spin inline-block" />
            Loading...
          </span>
        )}
        {registryError && <span className="text-xs text-warden-error">{registryError}</span>}
      </div>

      {!registryLoading && !registryError && agents.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <p className="text-warden-text-dim text-sm">No agents registered</p>
        </div>
      )}
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
                    {agent.tmux_session_name || '\u2014'}
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
