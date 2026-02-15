import { useState, useCallback } from 'react';
import { SessionHistory } from './SessionHistory.js';
import { TokenUsageView } from './TokenUsageView.js';
import { LogViewer } from './LogViewer.js';

type HistoryTab = 'sessions' | 'tokens' | 'logs';

export function HistoryView() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('sessions');

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'tokens', label: 'Token Usage' },
    { id: 'logs', label: 'Gateway Logs' },
  ];

  const handleTabChange = useCallback((tab: HistoryTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-warden-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === tab.id
                ? 'bg-warden-accent/20 text-warden-accent'
                : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'sessions' && <SessionHistory />}
        {activeTab === 'tokens' && <TokenUsageView />}
        {activeTab === 'logs' && <LogViewer />}
      </div>
    </div>
  );
}
