import { useState, useMemo } from 'react';
import { useGsdRegistry } from '../hooks/useGsdRegistry.js';
import { useGsdHookFeed } from '../hooks/useGsdHookFeed.js';
import { useActiveInstances } from '../hooks/useActiveInstances.js';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus.js';
import { useAgentStateFiles } from '../hooks/useAgentStateFiles.js';
import { AgentsTab } from './AgentsTab.js';
import { ControlsTab } from './ControlsTab.js';
import { RegistryTab } from './RegistryTab.js';
import { HooksTab } from './HooksTab.js';

type TabId = 'agents' | 'controls' | 'registry' | 'hooks';

const TABS: { id: TabId; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'controls', label: 'Controls' },
  { id: 'registry', label: 'Registry' },
  { id: 'hooks', label: 'Hooks' },
];

export function GsdView() {
  const [activeTab, setActiveTab] = useState<TabId>('agents');

  const { registry, isLoading: registryLoading, error: registryError, toggleEnabled, getEffectiveEnabled } = useGsdRegistry();
  const { hookEvents } = useGsdHookFeed();
  const { instances } = useActiveInstances();
  const liveStatus = useAgentLiveStatus();

  const sessionNames = useMemo(
    () => (registry?.agents ?? []).filter((a) => a.tmux_session_name).map((a) => a.tmux_session_name),
    [registry],
  );

  const stateFiles = useAgentStateFiles(sessionNames);
  const agents = registry?.agents ?? [];
  const activeInstances = instances.filter((i) => i.status === 'active' || i.status === 'idle');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-warden-text">GSD Control Center</h2>
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
        <div className="flex items-center gap-1 border-b border-warden-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id ? 'border-b-2 border-warden-accent text-warden-text' : 'text-warden-text-dim hover:text-warden-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {activeTab === 'agents' && <AgentsTab agents={agents} instances={instances} liveStatus={liveStatus} stateFiles={stateFiles} getEffectiveEnabled={getEffectiveEnabled} toggleEnabled={toggleEnabled} registryLoading={registryLoading} registryError={registryError} />}
        {activeTab === 'controls' && <ControlsTab agents={agents} activeInstances={activeInstances} />}
        {activeTab === 'registry' && <RegistryTab registry={registry} registryLoading={registryLoading} registryError={registryError} getEffectiveEnabled={getEffectiveEnabled} toggleEnabled={toggleEnabled} />}
        {activeTab === 'hooks' && <HooksTab hookEvents={hookEvents} />}
      </div>
    </div>
  );
}
