import type { GsdRegistry } from '@shared/gsdTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryTabProps {
  registry: GsdRegistry | null;
  registryLoading: boolean;
  registryError: string | null;
  getEffectiveEnabled: (agentId: string, serverEnabled: boolean) => boolean;
  toggleEnabled: (agentId: string, currentEnabled: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// RegistryTab — registry table with enabled toggles
// ─────────────────────────────────────────────────────────────────────────────

export function RegistryTab({
  registry,
  registryLoading,
  registryError,
  getEffectiveEnabled,
  toggleEnabled,
}: RegistryTabProps) {
  return (
    <div>
      {registryLoading && <p className="text-sm text-warden-text-dim">Loading registry...</p>}
      {registryError && <p className="text-sm text-warden-error">{registryError}</p>}
      {registry && registry.agents.length === 0 && (
        <p className="text-sm text-warden-text-dim">No agents in registry.</p>
      )}
      {registry && registry.agents.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-warden-text-dim border-b border-warden-border">
              <th className="text-left py-2 pr-4 font-normal">Agent ID</th>
              <th className="text-left py-2 pr-4 font-normal">Enabled</th>
              <th className="text-left py-2 pr-4 font-normal">Working Dir</th>
              <th className="text-left py-2 pr-4 font-normal">Session</th>
              <th className="text-left py-2 pr-4 font-normal">Auto Wake</th>
              <th className="text-left py-2 font-normal">Launch Mode</th>
            </tr>
          </thead>
          <tbody>
            {registry.agents.map((agent) => {
              const effectiveEnabled = getEffectiveEnabled(agent.agent_id, agent.enabled);
              const workingDir = agent.working_directory;
              const displayDir =
                workingDir.length > 40
                  ? '...' + workingDir.slice(-40)
                  : workingDir;

              return (
                <tr key={agent.agent_id} className="border-b border-warden-border/40 hover:bg-warden-panel/50">
                  <td className="py-2 pr-4 font-mono">{agent.agent_id}</td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => toggleEnabled(agent.agent_id, effectiveEnabled)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        effectiveEnabled
                          ? 'bg-warden-success/20 text-warden-success hover:bg-warden-success/30'
                          : 'bg-warden-error/20 text-warden-error hover:bg-warden-error/30'
                      }`}
                    >
                      {effectiveEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="py-2 pr-4 font-mono text-warden-text-dim" title={workingDir}>{displayDir}</td>
                  <td className="py-2 pr-4 font-mono text-warden-text-dim">{agent.tmux_session_name || '\u2014'}</td>
                  <td className="py-2 pr-4 text-warden-text-dim">{agent.auto_wake ? 'Yes' : 'No'}</td>
                  <td className="py-2 font-mono text-warden-text-dim">{agent.claude_post_launch_mode || '\u2014'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
