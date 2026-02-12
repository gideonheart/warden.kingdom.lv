import { useState, useCallback } from 'react';
import { InstanceTabBar } from './components/InstanceTabBar.js';
import { TerminalView } from './components/TerminalView.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AgentSidebar } from './components/AgentSidebar.js';
import { PromptPanel } from './components/PromptPanel.js';
import { HistoryView } from './components/HistoryView.js';
import { useActiveInstances } from './hooks/useActiveInstances.js';
import { useAgentConfig } from './hooks/useAgentConfig.js';

type AppView = 'terminals' | 'history';

export function App() {
  const { instances, isLoading, error, refetch } = useActiveInstances();
  const { agents, topicMappings } = useAgentConfig();
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>('terminals');

  const activeInstances = instances.filter(
    (instance) => instance.status === 'active' || instance.status === 'idle'
  );

  const handleSelectSession = useCallback((sessionName: string) => {
    setSelectedSessionName(sessionName);
    setCurrentView('terminals');
  }, []);

  const handleSessionExit = useCallback(
    (_sessionName: string, _exitCode: number) => {
      refetch();
    },
    [refetch]
  );

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  if (selectedSessionName && !activeInstances.some((i) => i.tmuxSessionName === selectedSessionName)) {
    if (activeInstances.length > 0) {
      setSelectedSessionName(activeInstances[0].tmuxSessionName);
    } else {
      setSelectedSessionName(null);
    }
  }

  if (!selectedSessionName && activeInstances.length > 0) {
    setSelectedSessionName(activeInstances[0].tmuxSessionName);
  }

  return (
    <div className="flex flex-col h-screen bg-warden-bg">
      <header className="flex items-center justify-between px-4 py-2 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-warden-text">
            <span className="text-warden-accent">Warden</span> Dashboard
          </h1>
          <span className="text-xs text-warden-text-dim px-2 py-0.5 bg-warden-border/50 rounded">
            {activeInstances.length} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-warden-error">
              {error}
            </span>
          )}
          <button
            onClick={() => setCurrentView('terminals')}
            className={`px-2 py-1 text-xs transition-colors ${currentView === 'terminals' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Terminals
          </button>
          <button
            onClick={() => setCurrentView('history')}
            className={`px-2 py-1 text-xs transition-colors ${currentView === 'history' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            History
          </button>
          <span className="w-px h-4 bg-warden-border" />
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`px-2 py-1 text-xs transition-colors ${showSidebar ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Agents
          </button>
          <button
            onClick={refetch}
            className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      {currentView === 'terminals' && (
        <InstanceTabBar
          instances={activeInstances}
          selectedSessionName={selectedSessionName}
          onSelectSession={handleSelectSession}
        />
      )}

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-h-0 flex flex-col">
          {currentView === 'terminals' ? (
            <>
              <div className="flex-1 min-h-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-warden-text-dim">Loading sessions...</span>
                    </div>
                  </div>
                ) : selectedSessionName ? (
                  <ErrorBoundary key={selectedSessionName}>
                    <TerminalView
                      tmuxSessionName={selectedSessionName}
                      onSessionExit={handleSessionExit}
                    />
                  </ErrorBoundary>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl mb-4 opacity-20">&#9678;</div>
                      <p className="text-warden-text-dim text-lg">No active agent sessions</p>
                      <p className="text-warden-text-dim/60 text-sm mt-1">
                        tmux sessions with agent prefixes (warden-*, scout-*, builder-*) will appear here
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {agents.length > 0 && (
                <PromptPanel agents={agents} selectedAgentId={selectedAgentId} />
              )}
            </>
          ) : (
            <HistoryView />
          )}
        </main>

        {showSidebar && agents.length > 0 && (
          <AgentSidebar
            agents={agents}
            topicMappings={topicMappings}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
          />
        )}
      </div>
    </div>
  );
}
