import { useState } from 'react';
import { AgentsTab } from './AgentsTab.js';
import { ControlsTab } from './ControlsTab.js';
import { RegistryTab } from './RegistryTab.js';
import { EventsTab } from './EventsTab.js';

type TabId = 'agents' | 'controls' | 'registry' | 'events';

const TABS: { id: TabId; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'controls', label: 'Controls' },
  { id: 'registry', label: 'Registry' },
  { id: 'events', label: 'Events' },
];

export function GsdView() {
  const [activeTab, setActiveTab] = useState<TabId>('agents');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-warden-text">GSD Control Center</h2>
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
        {activeTab === 'agents' && <AgentsTab />}
        {activeTab === 'controls' && <ControlsTab />}
        {activeTab === 'registry' && <RegistryTab />}
        {activeTab === 'events' && <EventsTab />}
      </div>
    </div>
  );
}
