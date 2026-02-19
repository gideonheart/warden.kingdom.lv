import { useState, useCallback, useEffect } from 'react';
import { BashHint } from './gsdShared.js';
import { SearchableSelect } from './SearchableSelect.js';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';

// ─────────────────────────────────────────────────────────────────────────────
// GSD slash commands for searchable dropdowns
// ─────────────────────────────────────────────────────────────────────────────

const GSD_COMMANDS: string[] = [
  '/gsd:quick',
  '/gsd:resume-work',
  '/gsd:progress',
  '/gsd:plan-phase',
  '/gsd:execute-phase',
  '/gsd:verify-work',
  '/gsd:debug',
  '/gsd:new-milestone',
  '/gsd:discuss-phase',
  '/gsd:help',
  '/gsd:settings',
  '/gsd:check-todos',
  '/gsd:pause-work',
  '/gsd:health',
  '/gsd:status',
  '/gsd:research-phase',
];

// ─────────────────────────────────────────────────────────────────────────────
// ControlsTab — spawn form + command dispatch form
// ─────────────────────────────────────────────────────────────────────────────

export function ControlsTab() {
  const { registry } = useGsdRegistry();
  const { instances } = useActiveInstances();

  const agents = registry?.agents ?? [];
  const activeInstances = instances.filter((i) => i.status === 'active' || i.status === 'idle');

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

  // Default target session to first active instance
  useEffect(() => {
    if (!targetSession && activeInstances.length > 0) {
      setTargetSession(activeInstances[0].tmuxSessionName);
    }
  }, [targetSession, activeInstances]);

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
        body: JSON.stringify({ action: 'type', args: commandText }),
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
  const dispatchBashCommand = `menu-driver.sh ${targetSession} type "${commandText}"`;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Spawn form */}
      <div>
        <p className="text-sm text-warden-text-dim mb-3 font-medium">Spawn Agent</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-warden-text-dim">Agent Name</label>
            <SearchableSelect
              value={agentName}
              onChange={setAgentName}
              options={agents.map((a) => a.agent_id)}
              placeholder="e.g. forge"
              className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-40"
              onSelect={(selectedAgentId) => {
                const agent = agents.find((a) => a.agent_id === selectedAgentId);
                if (agent?.working_directory) {
                  setWorkdir(agent.working_directory);
                }
              }}
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
            <SearchableSelect
              value={firstCommand}
              onChange={setFirstCommand}
              options={GSD_COMMANDS}
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
            <SearchableSelect
              value={targetSession}
              onChange={setTargetSession}
              options={activeInstances.map((instance) => instance.tmuxSessionName)}
              placeholder="Select session"
              className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-52"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-warden-text-dim">Command</label>
            <SearchableSelect
              value={commandText}
              onChange={setCommandText}
              options={GSD_COMMANDS}
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
  );
}
