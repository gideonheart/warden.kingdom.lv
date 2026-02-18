import { useState, useCallback } from 'react';
import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useGsdHookFeed } from '../hooks/useGsdHookFeed.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';

const manifest = {
  id: 'gsd-manager',
  name: 'GSD Manager',
  version: '1.0.0',
  description: 'Control center for GSD agent sessions',
  slot: 'bottom-panel',
  capabilities: ['gsd-management', 'agent-control', 'session-monitoring'],
} as const satisfies PluginManifest;

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-0.5 rounded bg-warden-border/50 text-warden-text-dim hover:text-warden-text transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function BashHint({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <code className="text-xs text-warden-text-dim font-mono bg-warden-bg/50 px-2 py-1 rounded flex-1 overflow-x-auto whitespace-nowrap">
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status colours (mirrors InstanceTabBar.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'grid' | 'controls' | 'registry' | 'hooks';

const TABS: { id: TabId; label: string }[] = [
  { id: 'grid', label: 'Agents' },
  { id: 'controls', label: 'Controls' },
  { id: 'registry', label: 'Registry' },
  { id: 'hooks', label: 'Hooks' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Inner panel (only mounts hooks when expanded)
// ─────────────────────────────────────────────────────────────────────────────

function GsdManagerPanelExpanded() {
  const [activeTab, setActiveTab] = useState<TabId>('grid');
  const { registry, isLoading: registryLoading, error: registryError, toggleEnabled, getEffectiveEnabled } = useGsdRegistry();
  const { hookEvents } = useGsdHookFeed();
  const { instances } = useActiveInstances();

  // Spawn form state
  const [agentName, setAgentName] = useState('');
  const [workdir, setWorkdir] = useState('');
  const [firstCommand, setFirstCommand] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnStatus, setSpawnStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Command dispatch state
  const [targetSession, setTargetSession] = useState('');
  const [commandText, setCommandText] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeInstances = instances.filter(
    (instance) => instance.status === 'active' || instance.status === 'idle'
  );

  const handleSpawn = useCallback(async () => {
    if (!agentName || !workdir) return;
    setIsSpawning(true);
    setSpawnStatus(null);
    try {
      const response = await fetch('/api/gsd/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName, workdir, ...(firstCommand ? { firstCommand } : {}) }),
      });
      const data = (await response.json()) as { message?: string; agentName?: string; expectedSessionName?: string; error?: string };
      if (response.status === 202) {
        setSpawnStatus({ type: 'success', text: `Spawning ${data.agentName ?? agentName}... session: ${data.expectedSessionName ?? ''}` });
        setTimeout(() => setSpawnStatus(null), 5000);
      } else {
        setSpawnStatus({ type: 'error', text: data.error ?? 'Spawn failed' });
        setTimeout(() => setSpawnStatus(null), 5000);
      }
    } catch {
      setSpawnStatus({ type: 'error', text: 'Network error' });
      setTimeout(() => setSpawnStatus(null), 5000);
    } finally {
      setIsSpawning(false);
    }
  }, [agentName, workdir, firstCommand]);

  const handleDispatch = useCallback(async () => {
    if (!targetSession || !commandText) return;
    setIsDispatching(true);
    setDispatchStatus(null);
    try {
      const response = await fetch(`/api/gsd/sessions/${targetSession}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_then', args: commandText }),
      });
      const data = (await response.json()) as { dispatched?: boolean; output?: string; error?: string };
      if (response.ok) {
        setDispatchStatus({ type: 'success', text: 'Dispatched' });
        setTimeout(() => setDispatchStatus(null), 3000);
      } else {
        setDispatchStatus({ type: 'error', text: data.error ?? 'Dispatch failed' });
        setTimeout(() => setDispatchStatus(null), 5000);
      }
    } catch {
      setDispatchStatus({ type: 'error', text: 'Network error' });
      setTimeout(() => setDispatchStatus(null), 5000);
    } finally {
      setIsDispatching(false);
    }
  }, [targetSession, commandText]);

  const spawnBashCommand = `spawn.sh ${agentName} ${workdir}${firstCommand ? ` "${firstCommand}"` : ''}`;
  const dispatchBashCommand = `menu-driver.sh ${targetSession} clear_then "${commandText}"`;

  return (
    <div className="flex flex-col h-64">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 pt-1 bg-warden-panel border-b border-warden-border flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs px-3 py-1.5 rounded-t transition-colors ${
              activeTab === tab.id
                ? 'bg-warden-bg text-warden-text border border-b-0 border-warden-border'
                : 'bg-warden-panel text-warden-text-dim hover:text-warden-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-2 bg-warden-bg text-warden-text text-xs">

        {/* ── Tab 1: Agents grid ── */}
        {activeTab === 'grid' && (
          <div>
            {registryLoading && <p className="text-warden-text-dim">Loading registry...</p>}
            {registryError && <p className="text-warden-error">{registryError}</p>}
            {registry && registry.agents.length === 0 && (
              <p className="text-warden-text-dim">No agents in registry.</p>
            )}
            {registry && registry.agents.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-warden-text-dim border-b border-warden-border">
                    <th className="text-left py-1 pr-3 font-normal">Status</th>
                    <th className="text-left py-1 pr-3 font-normal">Agent ID</th>
                    <th className="text-left py-1 pr-3 font-normal">Session</th>
                    <th className="text-left py-1 pr-3 font-normal">Working Dir</th>
                    <th className="text-left py-1 font-normal">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.agents.map((agent) => {
                    const instance = instances.find(
                      (inst) => inst.tmuxSessionName === agent.tmux_session_name
                    );
                    const status = instance?.status ?? 'stopped';
                    const statusColor = STATUS_COLORS[status] ?? 'bg-warden-error';
                    const effectiveEnabled = getEffectiveEnabled(agent.agent_id, agent.enabled);
                    const workingDir = agent.working_directory;
                    const displayDir =
                      workingDir.length > 30
                        ? '...' + workingDir.slice(-30)
                        : workingDir;

                    return (
                      <tr key={agent.agent_id} className="border-b border-warden-border/40 hover:bg-warden-panel/50">
                        <td className="py-1 pr-3">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                            <span className="text-warden-text-dim capitalize">{status}</span>
                          </div>
                        </td>
                        <td className="py-1 pr-3 font-mono">{agent.agent_id}</td>
                        <td className="py-1 pr-3 font-mono text-warden-text-dim">{agent.tmux_session_name || '—'}</td>
                        <td className="py-1 pr-3 font-mono text-warden-text-dim" title={workingDir}>{displayDir}</td>
                        <td className="py-1">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab 2: Controls (spawn + command dispatch) ── */}
        {activeTab === 'controls' && (
          <div className="space-y-4">
            {/* Spawn form */}
            <div>
              <p className="text-warden-text-dim mb-2 font-medium">Spawn Agent</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-warden-text-dim">Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. forge"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-2 py-1 rounded w-32"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-warden-text-dim">Working Directory</label>
                  <input
                    type="text"
                    value={workdir}
                    onChange={(e) => setWorkdir(e.target.value)}
                    placeholder="/home/forge/project"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-2 py-1 rounded w-48"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-warden-text-dim">First Command</label>
                  <input
                    type="text"
                    value={firstCommand}
                    onChange={(e) => setFirstCommand(e.target.value)}
                    placeholder="Optional first command"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-2 py-1 rounded w-48"
                  />
                </div>
                <button
                  onClick={handleSpawn}
                  disabled={isSpawning || !agentName || !workdir}
                  className="bg-warden-accent text-warden-bg px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSpawning ? 'Spawning...' : 'Spawn'}
                </button>
              </div>
              {spawnStatus && (
                <p className={`mt-1 text-xs ${spawnStatus.type === 'success' ? 'text-warden-success' : 'text-warden-error'}`}>
                  {spawnStatus.text}
                </p>
              )}
              <BashHint command={spawnBashCommand} />
            </div>

            <hr className="border-warden-border" />

            {/* Command dispatch form */}
            <div>
              <p className="text-warden-text-dim mb-2 font-medium">Dispatch Command</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-warden-text-dim">Target Session</label>
                  <select
                    value={targetSession}
                    onChange={(e) => setTargetSession(e.target.value)}
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-2 py-1 rounded w-44"
                  >
                    <option value="">— select session —</option>
                    {activeInstances.map((instance) => (
                      <option key={instance.tmuxSessionName} value={instance.tmuxSessionName}>
                        {instance.tmuxSessionName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-warden-text-dim">Command</label>
                  <input
                    type="text"
                    value={commandText}
                    onChange={(e) => setCommandText(e.target.value)}
                    placeholder="e.g. /gsd:status"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-2 py-1 rounded w-64"
                  />
                </div>
                <button
                  onClick={handleDispatch}
                  disabled={isDispatching || !targetSession || !commandText}
                  className="bg-warden-accent text-warden-bg px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isDispatching ? 'Dispatching...' : 'Dispatch'}
                </button>
              </div>
              {dispatchStatus && (
                <p className={`mt-1 text-xs ${dispatchStatus.type === 'success' ? 'text-warden-success' : 'text-warden-error'}`}>
                  {dispatchStatus.text}
                </p>
              )}
              <BashHint command={dispatchBashCommand} />
            </div>
          </div>
        )}

        {/* ── Tab 3: Registry ── */}
        {activeTab === 'registry' && (
          <div>
            {registryLoading && <p className="text-warden-text-dim">Loading registry...</p>}
            {registryError && <p className="text-warden-error">{registryError}</p>}
            {registry && registry.agents.length === 0 && (
              <p className="text-warden-text-dim">No agents in registry.</p>
            )}
            {registry && registry.agents.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-warden-text-dim border-b border-warden-border">
                    <th className="text-left py-1 pr-3 font-normal">Agent ID</th>
                    <th className="text-left py-1 pr-3 font-normal">Enabled</th>
                    <th className="text-left py-1 pr-3 font-normal">Working Dir</th>
                    <th className="text-left py-1 pr-3 font-normal">Session</th>
                    <th className="text-left py-1 pr-3 font-normal">Auto Wake</th>
                    <th className="text-left py-1 font-normal">Launch Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.agents.map((agent) => {
                    const effectiveEnabled = getEffectiveEnabled(agent.agent_id, agent.enabled);
                    const workingDir = agent.working_directory;
                    const displayDir =
                      workingDir.length > 30
                        ? '...' + workingDir.slice(-30)
                        : workingDir;

                    return (
                      <tr key={agent.agent_id} className="border-b border-warden-border/40 hover:bg-warden-panel/50">
                        <td className="py-1 pr-3 font-mono">{agent.agent_id}</td>
                        <td className="py-1 pr-3">
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
                        <td className="py-1 pr-3 font-mono text-warden-text-dim" title={workingDir}>{displayDir}</td>
                        <td className="py-1 pr-3 font-mono text-warden-text-dim">{agent.tmux_session_name || '—'}</td>
                        <td className="py-1 pr-3 text-warden-text-dim">{agent.auto_wake ? 'Yes' : 'No'}</td>
                        <td className="py-1 font-mono text-warden-text-dim">{agent.claude_post_launch_mode || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab 4: Hooks feed ── */}
        {activeTab === 'hooks' && (
          <div>
            {hookEvents.length === 0 ? (
              <p className="text-warden-text-dim">No hook events yet. Events appear as agents trigger lifecycle hooks.</p>
            ) : (
              <table className="w-full text-xs border-collapse font-mono">
                <thead>
                  <tr className="text-warden-text-dim border-b border-warden-border">
                    <th className="text-left py-1 pr-3 font-normal">Time</th>
                    <th className="text-left py-1 pr-3 font-normal">Hook</th>
                    <th className="text-left py-1 pr-3 font-normal">Event</th>
                    <th className="text-left py-1 pr-3 font-normal">Agent</th>
                    <th className="text-left py-1 pr-3 font-normal">Session</th>
                    <th className="text-left py-1 font-normal">State</th>
                  </tr>
                </thead>
                <tbody>
                  {hookEvents.map((event, index) => {
                    // Format timestamp to HH:MM:SS
                    let displayTime = event.timestamp;
                    try {
                      const date = new Date(event.timestamp);
                      displayTime = date.toTimeString().slice(0, 8);
                    } catch {
                      // Keep raw timestamp if parse fails
                    }
                    const hookName = event.hookScript.replace(/\.sh$/, '');

                    return (
                      <tr key={index} className="border-b border-warden-border/30 hover:bg-warden-panel/50">
                        <td className="py-0.5 pr-3 text-warden-text-dim">{displayTime}</td>
                        <td className="py-0.5 pr-3">{hookName}</td>
                        <td className="py-0.5 pr-3 text-warden-accent">{event.hookEventName || '—'}</td>
                        <td className="py-0.5 pr-3 text-warden-text-dim">{event.agentId ?? '—'}</td>
                        <td className="py-0.5 pr-3 text-warden-text-dim">{event.tmuxSession ?? '—'}</td>
                        <td className="py-0.5 text-warden-text-dim">{event.state ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel component (receives zero props — PanelComponent contract)
// ─────────────────────────────────────────────────────────────────────────────

function GsdManagerPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-warden-panel border-t border-warden-border">
      {/* Collapsed / always-visible header */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 h-8 text-xs text-warden-text-dim hover:text-warden-text transition-colors"
        aria-expanded={isExpanded}
      >
        <span className="font-medium">GSD Control Center</span>
        <span className="text-warden-text-dim">{isExpanded ? '▾' : '▸'}</span>
      </button>

      {/* Expanded content — hooks mount only when expanded */}
      {isExpanded && <GsdManagerPanelExpanded />}
    </div>
  );
}

export default { manifest, PanelComponent: GsdManagerPanel } satisfies PluginModule;
