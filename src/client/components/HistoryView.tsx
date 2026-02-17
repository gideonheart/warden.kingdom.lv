import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { SessionHistory } from './SessionHistory.js';
import { TokenUsageView } from './TokenUsageView.js';
import { LogViewer } from './LogViewer.js';
import { ActivityView } from './ActivityView.js';

type HistoryTab = 'sessions' | 'tokens' | 'logs' | 'activity';

function MobileAccordionSection({ title, defaultOpen, children }: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="border-b border-warden-border group" name="history-accordion">
      <summary className="flex items-center justify-between px-4 py-3 min-h-[44px] cursor-pointer text-sm font-medium text-warden-text bg-warden-panel select-none">
        {title}
        <span className="text-warden-text-dim text-xs group-open:rotate-180 transition-transform">&#9660;</span>
      </summary>
      <div className="max-h-[60vh] overflow-y-auto">
        {children}
      </div>
    </details>
  );
}

interface HistoryViewProps {
  onNavigateToSession?: (sessionName: string) => void;
}

export function HistoryView({ onNavigateToSession }: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>('activity');

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'tokens', label: 'Token Usage' },
    { id: 'logs', label: 'Gateway Logs' },
  ];

  const handleTabChange = useCallback((tab: HistoryTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Desktop: tab layout */}
      <div className="hidden sm:flex sm:flex-col h-full">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-warden-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 py-1 min-h-[44px] text-sm rounded transition-colors flex items-center ${
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
          {activeTab === 'activity' && <ActivityView onNavigateToSession={onNavigateToSession} />}
          {activeTab === 'sessions' && <SessionHistory />}
          {activeTab === 'tokens' && <TokenUsageView />}
          {activeTab === 'logs' && <LogViewer />}
        </div>
      </div>

      {/* Mobile: accordion layout */}
      <div className="sm:hidden flex flex-col h-full overflow-y-auto">
        <MobileAccordionSection title="Activity" defaultOpen>
          <ActivityView onNavigateToSession={onNavigateToSession} />
        </MobileAccordionSection>
        <MobileAccordionSection title="Sessions">
          <SessionHistory />
        </MobileAccordionSection>
        <MobileAccordionSection title="Token Usage">
          <TokenUsageView />
        </MobileAccordionSection>
        <MobileAccordionSection title="Gateway Logs">
          <LogViewer />
        </MobileAccordionSection>
      </div>
    </div>
  );
}
