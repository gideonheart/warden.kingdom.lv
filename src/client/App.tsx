import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { InstanceTabBar } from './components/InstanceTabBar.js';
import { TerminalView } from './components/TerminalView.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AgentSidebar } from './components/AgentSidebar.js';
import { PromptPanel } from './components/PromptPanel.js';
import { HistoryView } from './components/HistoryView.js';
import { PluginRegistryView } from './components/PluginRegistryView.js';
import { PluginSlotRenderer } from './components/PluginSlotRenderer.js';
import { MobilePromptSheet } from './components/MobilePromptSheet.js';
import { GsdView } from './components/GsdView.js';
import { useActiveInstances } from './hooks/useActiveInstances.js';
import { useAgentConfig } from './hooks/useAgentConfig.js';
import { usePluginRegistry } from './hooks/usePluginRegistry.js';
import { useSessionSelection } from './hooks/useSessionSelection.js';
import { useAgentLiveStatus } from './hooks/useAgentLiveStatus.js';
import type { AgentLiveStatus } from './hooks/useAgentLiveStatus.js';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys.js';
import { useBrowserNotifications } from './hooks/useBrowserNotifications.js';
import { useBudgetAlerts } from './hooks/useBudgetAlerts.js';

type AppView = 'terminals' | 'history' | 'plugins' | 'agents';

function parseHash(): { view: AppView; session: string | null } {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const viewParam = params.get('view');
  const view: AppView = viewParam === 'history' ? 'history' : viewParam === 'plugins' ? 'plugins' : viewParam === 'agents' ? 'agents' : 'terminals';
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
  const [sidebarSelectedAgentId, setSidebarSelectedAgentId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [currentView, setCurrentView] = useState<AppView>(() => parseHash().view);

  // Memoize activeInstances so the array reference is stable when instances data is
  // unchanged. Without this, Array.filter() creates a new reference on every App render
  // (e.g., when liveStatus data changes), which invalidates the sessionStatusMap useMemo
  // and causes unnecessary TerminalView re-renders every ~5s.
  // Include all lifecycle states so transitional (starting/stopping) and stopped sessions
  // remain visible in the tab bar with appropriate visual treatment.
  const activeInstances = useMemo(
    () => instances.filter((instance) =>
      instance.status === 'active' ||
      instance.status === 'idle' ||
      instance.status === 'starting' ||
      instance.status === 'stopping' ||
      instance.status === 'stopped' ||
      instance.status === 'error',
    ),
    [instances],
  );

  // Derive set of agent IDs that already have an active/starting session.
  // Used by AgentSidebar to disable Start button for already-running agents.
  const activeAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const instance of instances) {
      if (
        instance.status === 'active' ||
        instance.status === 'idle' ||
        instance.status === 'starting'
      ) {
        ids.add(instance.agentId);
      }
    }
    return ids;
  }, [instances]);

  // Live status polling — runs once in App (not in AgentsTab) so TerminalView and
  // InstanceTabBar can consume the data without adding a second poll interval.
  const liveStatus = useAgentLiveStatus();

  // Bridge agentId → tmuxSessionName so live status can be looked up by session name.
  const sessionStatusMap = useMemo(() => {
    const map = new Map<string, AgentLiveStatus>();
    for (const instance of activeInstances) {
      const status = liveStatus.get(instance.agentId);
      if (status) {
        map.set(instance.tmuxSessionName, status);
      }
    }
    return map;
  }, [liveStatus, activeInstances]);

  // Focus callback ref — Plan 02 keyboard shortcuts will call this to return focus to terminal.
  const terminalFocusRef = useRef<(() => void) | null>(null);

  // Search open callback ref — registered by TerminalView; called by Ctrl+F handler.
  const searchOpenRef = useRef<(() => void) | null>(null);

  // Stable callback: routes Ctrl+F → whichever TerminalView is currently mounted.
  const handleOpenSearch = useCallback(() => {
    searchOpenRef.current?.();
  }, []);

  // Stable callback for sidebar toggle — used by both the header button and useGlobalHotkeys.
  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((prev) => !prev);
  }, []);

  // useSessionSelection manages all selection state: auto-select, fallback, hysteresis.
  // No setState calls for session selection are allowed in the render body.
  const { selectedSessionName, selectSession, clearSelection } = useSessionSelection({
    activeInstances,
    isLoading,
    initialSessionName: parseHash().session,
  });

  // Auto-select first agent in sidebar when agents load (useEffect guard — not render body)
  useEffect(() => {
    if (sidebarSelectedAgentId === null && agents.length > 0) {
      setSidebarSelectedAgentId(agents[0].id);
    }
  }, [agents, sidebarSelectedAgentId]);

  // Keep URL hash in sync with selectedSessionName and currentView
  useEffect(() => {
    updateHash(currentView, selectedSessionName);
  }, [currentView, selectedSessionName]);

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

  // Derive agent ID and lifecycle status from selected session for prompt panel sync
  // and terminal overlay rendering.
  const selectedInstance = activeInstances.find(
    (instance) => instance.tmuxSessionName === selectedSessionName
  );
  const derivedAgentId = selectedInstance?.agentId ?? null;

  const handleSelectSession = useCallback((sessionName: string) => {
    selectSession(sessionName);
    setCurrentView('terminals');
  }, [selectSession]);

  // Global keyboard shortcuts — capture phase registration prevents PTY forwarding.
  // Placed here so handleSelectSession is defined before the hook is called.
  useGlobalHotkeys({
    instances: activeInstances,
    selectedSessionName,
    onSelectSession: handleSelectSession,
    onToggleSidebar: handleToggleSidebar,
    terminalFocusRef,
    currentView,
    onOpenSearch: handleOpenSearch,
  });

  // Browser notification opt-in — fires when agent enters permission_prompt state
  // and the browser tab is unfocused. Requires sessionStatusMap and handleSelectSession
  // which are defined above.
  const { notificationsEnabled, toggleNotifications, notificationPermission } = useBrowserNotifications({
    sessionStatusMap,
    onSelectSession: handleSelectSession,
  });

  // Budget alert level — polls /api/history/budget-config/status every 30s.
  // Lifted to App so the History nav badge reflects worst-case alert level across all agents.
  const budgetAlertLevel = useBudgetAlerts();

  const handleViewChange = useCallback((view: AppView) => {
    setCurrentView(view);
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

  const handleStartAgent = useCallback(
    async (agentId: string) => {
      const response = await fetch('/api/instances/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (response.status === 409) {
        // Already running — the button should have been disabled; silently ignore
        return;
      }
      if (!response.ok) {
        throw new Error(`Start failed: ${response.statusText}`);
      }
      refetch();
    },
    [refetch],
  );

  const handleRestartInstance = useCallback(
    async (instanceId: number) => {
      try {
        const response = await fetch(`/api/instances/${instanceId}/restart`, { method: 'POST' });
        if (!response.ok) {
          console.error(`Restart failed: ${response.statusText}`);
        }
        refetch();
      } catch (error) {
        console.error('Error restarting instance:', error);
      }
    },
    [refetch],
  );

  const handleForceKillInstance = useCallback(
    async (instanceId: number) => {
      try {
        const response = await fetch(`/api/instances/${instanceId}/force-kill`, { method: 'POST' });
        if (!response.ok) {
          console.error(`Force kill failed: ${response.statusText}`);
        }
        refetch();
      } catch (error) {
        console.error('Error force killing instance:', error);
      }
    },
    [refetch],
  );

  // Listen for external hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const { view, session } = parseHash();
      setCurrentView(view);
      if (session) {
        selectSession(session);
      } else {
        clearSelection();
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectSession, clearSelection]);

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
            <span className="relative">
              History
              {budgetAlertLevel !== 'ok' && (
                <span className={`absolute -top-1 -right-2 w-2 h-2 rounded-full ${
                  budgetAlertLevel === 'exceeded' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                }`} />
              )}
            </span>
          </button>
          <button
            onClick={() => handleViewChange('agents')}
            className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'agents' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            GSD
          </button>
          <button
            onClick={() => handleViewChange('plugins')}
            className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'plugins' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Plugins
          </button>
          <span className="w-px h-4 bg-warden-border" />
          <button
            onClick={handleToggleSidebar}
            className={`px-2 py-1 text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${showSidebar ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
          >
            Sidebar
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
          <span className="text-xs text-warden-accent capitalize">{currentView === 'agents' ? 'GSD' : currentView}</span>
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
                <span className="relative inline-block">
                  History
                  {budgetAlertLevel !== 'ok' && (
                    <span className={`absolute -top-1 -right-2 w-2 h-2 rounded-full ${
                      budgetAlertLevel === 'exceeded' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                    }`} />
                  )}
                </span>
              </button>
              <button
                onClick={() => { handleViewChange('agents'); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'agents' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                GSD
              </button>
              <button
                onClick={() => { handleViewChange('plugins'); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'plugins' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                Plugins
              </button>
              <div className="border-t border-warden-border" />
              <button
                onClick={() => { handleToggleSidebar(); setShowMobileMenu(false); }}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${showSidebar ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
              >
                Sidebar
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
          sessionStatusMap={sessionStatusMap}
          onRestart={handleRestartInstance}
          onForceKill={handleForceKillInstance}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {currentView === 'terminals' ? (
            <div className="flex-1 min-h-0 relative pb-12 lg:pb-0">
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
                    agentLiveStatus={sessionStatusMap.get(selectedSessionName ?? '') ?? null}
                    terminalFocusRef={terminalFocusRef}
                    searchOpenRef={searchOpenRef}
                    notificationsEnabled={notificationsEnabled}
                    onToggleNotifications={toggleNotifications}
                    notificationPermission={notificationPermission}
                    instanceStatus={selectedInstance?.status}
                    agentName={selectedInstance?.agentName}
                    onRestart={selectedInstance ? () => handleRestartInstance(selectedInstance.id) : undefined}
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
          ) : currentView === 'agents' ? (
            <GsdView />
          ) : currentView === 'plugins' ? (
            <PluginRegistryView plugins={plugins} enabledState={enabledState} onToggle={togglePlugin} />
          ) : (
            <HistoryView onNavigateToSession={handleSelectSession} />
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
              onStartAgent={handleStartAgent}
              activeAgentIds={activeAgentIds}
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
                onStartAgent={handleStartAgent}
                activeAgentIds={activeAgentIds}
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

      {/* Mobile: bottom sheet prompt panel */}
      {currentView === 'terminals' && agents.length > 0 && (
        <MobilePromptSheet agents={agents} selectedAgentId={derivedAgentId} />
      )}
    </div>
  );
}
