import { useState, useCallback, useMemo } from 'react';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useGsdHookFeed } from '../hooks/useGsdHookFeed.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus.js';
import { useAgentStateFiles } from '../hooks/useAgentStateFiles.js';
import type { AgentStateHint, PressureLevel } from '../hooks/useAgentLiveStatus.js';

// ─────────────────────────────────────────────────────────────────────────────
// Color maps
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
// Helper components
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
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'agents' | 'controls' | 'registry' | 'hooks';

const TABS: { id: TabId; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'controls', label: 'Controls' },
  { id: 'registry', label: 'Registry' },
  { id: 'hooks', label: 'Hooks' },
];

// ─────────────────────────────────────────────────────────────────────────────
// GsdView — full-page GSD control center with 4 tabs
// ─────────────────────────────────────────────────────────────────────────────

export function GsdView() {
  const [activeTab, setActiveTab] = useState<TabId>('agents');

  const {
    registry,
    isLoading: registryLoading,
    error: registryError,
    toggleEnabled,
    getEffectiveEnabled,
  } = useGsdRegistry();

  const { hookEvents } = useGsdHookFeed();
  const { instances } = useActiveInstances();
  const liveStatus = useAgentLiveStatus();

  const sessionNames = useMemo(
    () =>
      (registry?.agents ?? [])
        .filter((agent) => agent.tmux_session_name)
        .map((agent) => agent.tmux_session_name),
    [registry],
  );

  const stateFiles = useAgentStateFiles(sessionNames);
  const agents = registry?.agents ?? [];

  const activeInstances = instances.filter(
    (instance) => instance.status === 'active' || instance.status === 'idle',
  );

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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with title + tab bar */}
      <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-warden-text">GSD Control Center</h2>
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
        {/* Tab bar - horizontal underline style */}
        <div className="flex items-center gap-1 border-b border-warden-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-warden-accent text-warden-text'
                  : 'text-warden-text-dim hover:text-warden-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content - scrollable */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">

        {/* ── Tab: Agents (responsive card grid) ── */}
        {activeTab === 'agents' && (
          <div>
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
        )}

        {/* ── Tab: Controls (spawn + command dispatch) ── */}
        {activeTab === 'controls' && (
          <div className="max-w-3xl space-y-6">
            {/* Spawn form */}
            <div>
              <p className="text-sm text-warden-text-dim mb-3 font-medium">Spawn Agent</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-warden-text-dim">Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                    placeholder="e.g. forge"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-warden-text-dim">Working Directory</label>
                  <input
                    type="text"
                    value={workdir}
                    onChange={(event) => setWorkdir(event.target.value)}
                    placeholder="/home/forge/project"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-56"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-warden-text-dim">First Command</label>
                  <input
                    type="text"
                    value={firstCommand}
                    onChange={(event) => setFirstCommand(event.target.value)}
                    placeholder="Optional first command"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-56"
                  />
                </div>
                <button
                  onClick={handleSpawn}
                  disabled={isSpawning || !agentName || !workdir}
                  className="bg-warden-accent text-warden-bg px-4 py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSpawning ? 'Spawning...' : 'Spawn'}
                </button>
              </div>
              {spawnStatus && (
                <p className={`mt-2 text-sm ${spawnStatus.type === 'success' ? 'text-warden-success' : 'text-warden-error'}`}>
                  {spawnStatus.text}
                </p>
              )}
              <BashHint command={spawnBashCommand} />
            </div>

            <hr className="border-warden-border" />

            {/* Command dispatch form */}
            <div>
              <p className="text-sm text-warden-text-dim mb-3 font-medium">Dispatch Command</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-warden-text-dim">Target Session</label>
                  <select
                    value={targetSession}
                    onChange={(event) => setTargetSession(event.target.value)}
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-52"
                  >
                    <option value="">-- select session --</option>
                    {activeInstances.map((instance) => (
                      <option key={instance.tmuxSessionName} value={instance.tmuxSessionName}>
                        {instance.tmuxSessionName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-warden-text-dim">Command</label>
                  <input
                    type="text"
                    value={commandText}
                    onChange={(event) => setCommandText(event.target.value)}
                    placeholder="e.g. /gsd:status"
                    className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-72"
                  />
                </div>
                <button
                  onClick={handleDispatch}
                  disabled={isDispatching || !targetSession || !commandText}
                  className="bg-warden-accent text-warden-bg px-4 py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isDispatching ? 'Dispatching...' : 'Dispatch'}
                </button>
              </div>
              {dispatchStatus && (
                <p className={`mt-2 text-sm ${dispatchStatus.type === 'success' ? 'text-warden-success' : 'text-warden-error'}`}>
                  {dispatchStatus.text}
                </p>
              )}
              <BashHint command={dispatchBashCommand} />
            </div>
          </div>
        )}

        {/* ── Tab: Registry ── */}
        {activeTab === 'registry' && (
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
                        <td className="py-2 pr-4 font-mono text-warden-text-dim">{agent.tmux_session_name || '—'}</td>
                        <td className="py-2 pr-4 text-warden-text-dim">{agent.auto_wake ? 'Yes' : 'No'}</td>
                        <td className="py-2 font-mono text-warden-text-dim">{agent.claude_post_launch_mode || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab: Hooks feed ── */}
        {activeTab === 'hooks' && (
          <div>
            {hookEvents.length === 0 ? (
              <p className="text-sm text-warden-text-dim">No hook events yet. Events appear as agents trigger lifecycle hooks.</p>
            ) : (
              <table className="w-full text-sm border-collapse font-mono">
                <thead>
                  <tr className="text-warden-text-dim border-b border-warden-border">
                    <th className="text-left py-2 pr-4 font-normal">Time</th>
                    <th className="text-left py-2 pr-4 font-normal">Hook</th>
                    <th className="text-left py-2 pr-4 font-normal">Event</th>
                    <th className="text-left py-2 pr-4 font-normal">Agent</th>
                    <th className="text-left py-2 pr-4 font-normal">Session</th>
                    <th className="text-left py-2 font-normal">State</th>
                  </tr>
                </thead>
                <tbody>
                  {hookEvents.map((event, index) => {
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
                        <td className="py-1.5 pr-4 text-warden-text-dim">{displayTime}</td>
                        <td className="py-1.5 pr-4">{hookName}</td>
                        <td className="py-1.5 pr-4 text-warden-accent">{event.hookEventName || '—'}</td>
                        <td className="py-1.5 pr-4 text-warden-text-dim">{event.agentId ?? '—'}</td>
                        <td className="py-1.5 pr-4 text-warden-text-dim">{event.tmuxSession ?? '—'}</td>
                        <td className="py-1.5 text-warden-text-dim">{event.state ?? '—'}</td>
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
