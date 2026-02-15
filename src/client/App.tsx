import { useState, useCallback, useEffect } from 'react';
import { InstanceTabBar } from './components/InstanceTabBar.js';
import { TerminalView } from './components/TerminalView.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AgentSidebar } from './components/AgentSidebar.js';
import { PromptPanel } from './components/PromptPanel.js';
import { HistoryView } from './components/HistoryView.js';
import { useActiveInstances } from './hooks/useActiveInstances.js';
import { useAgentConfig } from './hooks/useAgentConfig.js';

type AppView = 'terminals' | 'history';

function parseHash(): { view: AppView; session: string | null } {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const viewParam = params.get('view');
  const view: AppView = viewParam === 'history' ? 'history' : 'terminals';
  const session = params.get('session') || null;
  return { view, session };
}

function updateHash(view: AppView, session: string | null): void {
  const parts: string[] = [`view=${view}`];
  if (session) {
    parts.push(`session=${session}`);
  }
  history.replaceState(null, '', `#${parts.join('&')}`);
}

export function App() {
  const { instances, isLoading, error, refetch } = useActiveInstances();
  const { agents, topicMappings } = useAgentConfig();
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(
    () => parseHash().session
  );
  const [sidebarSelectedAgentId, setSidebarSelectedAgentId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);

  // Auto-select first agent in sidebar when agents load
  if (sidebarSelectedAgentId === null && agents.length > 0) {
    setSidebarSelectedAgentId(agents[0].id);
  }
  const [currentView, setCurrentView] = useState<AppView>(() => parseHash().view);

  const activeInstances = instances.filter(
    (instance) => instance.status === 'active' || instance.status === 'idle'
  );

  // Derive agent ID from selected session for prompt panel sync
  const selectedInstance = activeInstances.find(
    (instance) => instance.tmuxSessionName === selectedSessionName
  );
  const derivedAgentId = selectedInstance?.agentId ?? null;

  const handleSelectSession = useCallback((sessionName: string) => {
    setSelectedSessionName(sessionName);
    setCurrentView('terminals');
    updateHash('terminals', sessionName);
  }, []);

  const handleViewChange = useCallback((view: AppView) => {
    setCurrentView(view);
    setSelectedSessionName((current) => {
      updateHash(view, current);
      return current;
    });
  }, []);

  const handleSessionExit = useCallback(
    (_sessionName: string, _exitCode: number) => {
      refetch();
    },
    [refetch]
  );

  const handleSidebarSelectAgent = useCallback((agentId: string) => {
    setSidebarSelectedAgentId(agentId);
  }, []);

  const handleSessionStopped = useCallback(
    (_sessionName: string) => {
      refetch();
    },
    [refetch]
  );

  // Listen for external hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const { view, session } = parseHash();
      setCurrentView(view);
      if (session) {
        setSelectedSessionName(session);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle selected session disappearing (only after instances have loaded)
  if (!isLoading && selectedSessionName && !activeInstances.some((i) => i.tmuxSessionName === selectedSessionName)) {
    if (activeInstances.length > 0) {
      const fallback = activeInstances[0].tmuxSessionName;
      setSelectedSessionName(fallback);
      updateHash(currentView, fallback);
    } else {
      setSelectedSessionName(null);
      updateHash(currentView, null);
    }
  }

  // Auto-select first session if none selected (only after loading)
  if (!isLoading && !selectedSessionName && activeInstances.length > 0) {
    const first = activeInstances[0].tmuxSessionName;
    setSelectedSessionName(first);
    updateHash(currentView, first);
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
            onClick={() => handleViewChange('terminals')}
            className={`px-2 py-1 text-xs transition-colors ${currentView === 'terminals' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Terminals
          </button>
          <button
            onClick={() => handleViewChange('history')}
            className={`px-2 py-1 text-xs transition-colors ${currentView === 'history' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            History
          </button>
          <span className="w-px h-4 bg-warden-border" />
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`px-2 py-1 text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${showSidebar ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
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
          onSessionStopped={handleSessionStopped}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
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
                <PromptPanel agents={agents} selectedAgentId={derivedAgentId} />
              )}
            </>
          ) : (
            <HistoryView />
          )}
        </main>

        {/* Desktop: inline sidebar */}
        {showSidebar && agents.length > 0 && (
          <div className="hidden lg:block">
            <AgentSidebar
              agents={agents}
              topicMappings={topicMappings}
              selectedAgentId={sidebarSelectedAgentId}
              onSelectAgent={handleSidebarSelectAgent}
              onClose={() => setShowSidebar(false)}
            />
          </div>
        )}

        {/* Mobile: overlay sidebar */}
        {showSidebar && agents.length > 0 && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 sidebar-backdrop"
              onClick={() => setShowSidebar(false)}
            />
            <div className="absolute right-0 top-0 h-full w-[85vw] max-w-sm">
              <AgentSidebar
                agents={agents}
                topicMappings={topicMappings}
                selectedAgentId={sidebarSelectedAgentId}
                onSelectAgent={handleSidebarSelectAgent}
                onClose={() => setShowSidebar(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
