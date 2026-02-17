import { useState, useCallback, useEffect, useRef } from 'react';
import { InstanceTabBar } from './components/InstanceTabBar.js';
import { TerminalView } from './components/TerminalView.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AgentSidebar } from './components/AgentSidebar.js';
import { PromptPanel } from './components/PromptPanel.js';
import { HistoryView } from './components/HistoryView.js';
import { PluginRegistryView } from './components/PluginRegistryView.js';
import { PluginSlotRenderer } from './components/PluginSlotRenderer.js';
import { useActiveInstances } from './hooks/useActiveInstances.js';
import { useAgentConfig } from './hooks/useAgentConfig.js';
import { usePluginRegistry } from './hooks/usePluginRegistry.js';

type AppView = 'terminals' | 'history' | 'plugins';

function parseHash(): { view: AppView; session: string | null } {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const viewParam = params.get('view');
  const view: AppView = viewParam === 'history' ? 'history' : viewParam === 'plugins' ? 'plugins' : 'terminals';
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
  const { plugins, enabledState, enabledPlugins, togglePlugin } = usePluginRegistry();
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(
    () => parseHash().session
  );
  const [sidebarSelectedAgentId, setSidebarSelectedAgentId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on click outside
  useEffect(() => {
    if (!showMobileMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as EventListener);
    };
  }, [showMobileMenu]);

  // Track visual viewport height for iOS keyboard handling
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${viewport.height}px`
      );
    };

    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    viewport.addEventListener('scroll', updateHeight);
    return () => {
      viewport.removeEventListener('resize', updateHeight);
      viewport.removeEventListener('scroll', updateHeight);
    };
  }, []);

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
    <div className="flex flex-col app-height bg-warden-bg overflow-x-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-warden-panel border-b border-warden-border safe-horizontal">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-warden-text">
            <span className="text-warden-accent">Warden</span> <span className="hidden sm:inline">Dashboard</span>
          </h1>
          <span className="text-xs text-warden-text-dim px-2 py-0.5 bg-warden-border/50 rounded">
            {activeInstances.length} active
          </span>
        </div>

        {/* Desktop nav buttons */}
        <div className="hidden sm:flex items-center gap-2">
          {error && (
            <span className="text-xs text-warden-error">
              {error}
            </span>
          )}
          <button
            onClick={() => handleViewChange('terminals')}
            className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'terminals' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Terminals
          </button>
          <button
            onClick={() => handleViewChange('history')}
            className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'history' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            History
          </button>
          <button
            onClick={() => handleViewChange('plugins')}
            className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'plugins' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Plugins
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
            className="px-2 py-1 min-h-[44px] text-xs text-warden-text-dim hover:text-warden-text transition-colors flex items-center"
          >
            Refresh
          </button>
        </div>

        {/* Mobile: active view label + hamburger */}
        <div className="flex sm:hidden items-center gap-2" ref={mobileMenuRef}>
          <span className="text-xs text-warden-accent capitalize">{currentView}</span>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-warden-text-dim hover:text-warden-text transition-colors"
            aria-label="Toggle menu"
          >
            <span className="text-lg leading-none">&#9776;</span>
          </button>

          {/* Mobile dropdown menu */}
          {showMobileMenu && (
            <div className="absolute right-2 top-12 z-50 bg-warden-panel border border-warden-border rounded-lg shadow-lg min-w-[160px]">
              {error && (
                <div className="px-3 py-2 text-xs text-warden-error border-b border-warden-border">
                  {error}
                </div>
              )}
              <button
                onClick={() => { handleViewChange('terminals'); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'terminals' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                Terminals
              </button>
              <button
                onClick={() => { handleViewChange('history'); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'history' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                History
              </button>
              <button
                onClick={() => { handleViewChange('plugins'); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'plugins' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                Plugins
              </button>
              <div className="border-t border-warden-border" />
              <button
                onClick={() => { setShowSidebar(!showSidebar); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${showSidebar ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                Agents
              </button>
              <button
                onClick={() => { refetch(); setShowMobileMenu(false); }}
                className="w-full text-left px-4 py-3 min-h-[44px] text-sm text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30 transition-colors"
              >
                Refresh
              </button>
            </div>
          )}
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
            <div className="flex-1 min-h-0 relative">
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
              <div className="absolute inset-0 z-10 pointer-events-none">
                <PluginSlotRenderer slot="terminal-overlay" enabledPlugins={enabledPlugins} />
              </div>
            </div>
          ) : currentView === 'plugins' ? (
            <PluginRegistryView plugins={plugins} enabledState={enabledState} onToggle={togglePlugin} />
          ) : (
            <HistoryView />
          )}
          {currentView === 'terminals' && (
            <PluginSlotRenderer slot="bottom-panel" enabledPlugins={enabledPlugins} />
          )}
        </main>

        {/* Desktop: inline sidebar */}
        {showSidebar && agents.length > 0 && (
          <div className="hidden lg:flex lg:flex-col">
            {currentView === 'terminals' && (
              <PluginSlotRenderer slot="sidebar-top" enabledPlugins={enabledPlugins} />
            )}
            <AgentSidebar
              agents={agents}
              topicMappings={topicMappings}
              selectedAgentId={sidebarSelectedAgentId}
              onSelectAgent={handleSidebarSelectAgent}
              onClose={() => setShowSidebar(false)}
            />
            {currentView === 'terminals' && (
              <PromptPanel agents={agents} selectedAgentId={derivedAgentId} />
            )}
            {currentView === 'terminals' && (
              <PluginSlotRenderer slot="sidebar-bottom" enabledPlugins={enabledPlugins} />
            )}
          </div>
        )}

        {/* Mobile: overlay sidebar */}
        {showSidebar && agents.length > 0 && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 sidebar-backdrop"
              onClick={() => setShowSidebar(false)}
            />
            <div className="absolute right-0 top-0 h-full w-[85vw] max-w-sm flex flex-col">
              {currentView === 'terminals' && (
                <PluginSlotRenderer slot="sidebar-top" enabledPlugins={enabledPlugins} />
              )}
              <AgentSidebar
                agents={agents}
                topicMappings={topicMappings}
                selectedAgentId={sidebarSelectedAgentId}
                onSelectAgent={handleSidebarSelectAgent}
                onClose={() => setShowSidebar(false)}
              />
              {currentView === 'terminals' && (
                <PromptPanel agents={agents} selectedAgentId={derivedAgentId} />
              )}
              {currentView === 'terminals' && (
                <PluginSlotRenderer slot="sidebar-bottom" enabledPlugins={enabledPlugins} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
