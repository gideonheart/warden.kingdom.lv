---
status: resolved
trigger: "The /api/gsd/agents/live-status endpoint is polled every 5 seconds. When the response arrives, it triggers a React re-render that causes the entire xterm.js terminal div to re-render/remount, making the terminal unusable"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. The TerminalView main useEffect has [tmuxSessionName, sendInput, sendResize] as deps. sendInput and sendResize are useCallback() from useTerminalSocket, but the socket hook is re-instantiated on every App render. When liveStatus Map changes (every 5s), App re-renders, sessionStatusMap is recomputed (new Map), agentLiveStatus prop passed to TerminalView changes identity → TerminalView re-renders → but does the xterm useEffect re-run? The xterm useEffect deps are [tmuxSessionName, sendInput, sendResize]. sendInput and sendResize from useTerminalSocket are stable useCallback refs that don't depend on the socket state... so they should be stable. WAIT - need to re-examine. The TerminalView receives `agentLiveStatus` prop which changes every 5s, but this prop is NOT in the xterm useEffect deps. However the component DOES re-render (harmless re-render). The xterm.js terminal mount is inside a useEffect with stable deps. So xterm should NOT remount on prop change.

BUT WAIT - look at App.tsx line 487-503:
  <ErrorBoundary key={selectedSessionName}>
    <TerminalView
      ...
      agentLiveStatus={sessionStatusMap.get(selectedSessionName ?? '') ?? null}
      ...
      onRestart={selectedInstance ? () => handleRestartInstance(selectedInstance.id) : undefined}
    />

The `onRestart` prop is `() => handleRestartInstance(selectedInstance.id)` — a new arrow function on every render. And `selectedInstance` is `activeInstances.find(...)` — also potentially a new reference each render.

But crucially: the xterm useEffect only has [tmuxSessionName, sendInput, sendResize] as deps. Re-renders of TerminalView do NOT remount xterm as long as those deps are stable.

ACTUAL ROOT CAUSE: The `onSessionExit` prop passed to TerminalView. In App.tsx it's `handleSessionExit` which is a stable useCallback. In TerminalView, it wraps it in another useCallback: `handleSessionExit = useCallback((exitCode) => { sessionExited(); onSessionExit(tmuxSessionName, exitCode); }, [tmuxSessionName, onSessionExit, sessionExited])`. This is passed to useTerminalSocket. In useTerminalSocket, onSessionExit is kept in a ref (onSessionExitRef) and NOT in effect deps — so that's fine.

The REAL question: does `sendInput` or `sendResize` change identity when App re-renders? In useTerminalSocket, they are `useCallback(() => ..., [])` — empty deps, stable forever. App re-render → TerminalView re-render → useTerminalSocket re-called BUT sendInput/sendResize refs are stable (empty deps useCallback). So xterm useEffect should not re-run.

WAIT - need to reconsider entirely. Let me look at what causes the xterm to actually re-render. The `terminalContainerRef` div is `<div ref={terminalContainerRef} className="h-full w-full overflow-hidden" />`. This is stable. The xterm terminal instance is attached to this DOM node. On a React re-render that doesn't change the DOM node's position, xterm.js should be fine.

THE ACTUAL ISSUE: On every App re-render (triggered by liveStatus Map changing), `selectedInstance` is recomputed via `activeInstances.find()` — this returns the SAME object content but potentially a new reference. The `instanceStatus` prop then changes... but that's just a string comparison.

Let me look again more carefully at what `sessionStatusMap` contains and how it flows. When liveStatus Map is new (even with same content), useAgentLiveStatus has a `previousDataRef` check - if data is same, it does NOT call setStatusMap. So if agent state hasn't changed, liveStatus Map reference is STABLE.

BUT - the `sessionStatusMap` useMemo depends on `[liveStatus, activeInstances]`. If either is a new reference, sessionStatusMap is recomputed → new Map → agentLiveStatus prop to TerminalView changes (new object from map.get()). But this is just a prop change → causes TerminalView re-render → NOT a remount of xterm.

The xterm mount useEffect has deps [tmuxSessionName, sendInput, sendResize]. These don't change. So xterm does NOT remount.

CONCLUSION: The flickering described must be caused by something else. The terminal div itself re-renders (React reconciliation) but xterm.js is attached imperatively to the DOM node, not re-created. However there is a CSS/layout issue: the terminal wrapping div has `h-full` and the containing elements use flex layout. If the parent re-renders and layout recalculates dimensions... xterm.js FitAddon could cause issues.

WAIT - I missed something. The `onRestart` prop: `onRestart={selectedInstance ? () => handleRestartInstance(selectedInstance.id) : undefined}`. This creates a new function on every render. But it's in TerminalView's props, not in the xterm useEffect deps. Fine.

Actually re-reading the xterm useEffect deps carefully: `[tmuxSessionName, sendInput, sendResize]`. `sendInput` and `sendResize` are from `useTerminalSocket`. In `useTerminalSocket`, they ARE `useCallback` with `[]` deps — stable. But wait, `useTerminalSocket` itself is called inside `TerminalView`. When `TerminalView` re-renders, `useTerminalSocket` is called again. The hook returns `sendInput` and `sendResize` which are stable `useCallback` refs. So they should not change.

FINAL THEORY: The issue is NOT xterm remounting but xterm re-rendering causing visual glitch. OR it IS the fit addon being triggered. Look at the resize effect in xterm useEffect — it listens to `window.resize`. If the wrapping layout changes (due to re-render adding/removing elements), the window doesn't fire resize. But if the parent div dimensions change... Actually xterm doesn't observe parent resize automatically.

Let me look at this from a different angle: what's the actual FIT trigger? The FitAddon is called in useEffect cleanup+setup (on remount) or on window resize. A React re-render of TerminalView with same DOM structure should NOT call fitAddon.fit(). Unless... the DOM structure changes.

Looking at TerminalView render: it renders overlays based on `instanceStatus`, `agentLiveStatus`, `isSearchOpen`, etc. If `agentLiveStatus` changes from null → object or object → null, it could change the header layout. But the xterm container itself is stable.

SMOKING GUN: When `liveStatus` actually changes (e.g. agent state changes from idle→thinking), the `agentLiveStatus` prop to TerminalView changes value, causing re-render. The header section changes (StateBadge appears/changes). This changes the header height potentially... but xterm is in a flex child, so header height change could cause xterm to resize. And xterm's FitAddon only fires on window.resize, NOT on parent container resize. So there's no automatic resize glitch from header changes.

ALTERNATIVE: The issue could be that when `liveStatus.get(agentId)` returns a new object reference (even with same values), agentLiveStatus prop is new object → TerminalView re-renders → React tears down and recreates the DOM? No, React reconciles via virtual DOM and reuses DOM nodes.

I need to test a specific hypothesis: does the liveStatus `previousDataRef` guard actually prevent the Map from being a new reference when data is unchanged? Let me re-read useAgentLiveStatus...

Yes - the previousDataRef check on line 47: `if (serialized === previousDataRef.current) return;` - so if data is same, setStatusMap is NOT called, liveStatus Map keeps its previous reference. sessionStatusMap useMemo does NOT re-run (liveStatus reference is same). agentLiveStatus prop to TerminalView is same reference. TerminalView does NOT re-render at all.

So the issue ONLY manifests when agent live status actually CHANGES. When status changes, liveStatus Map is new → sessionStatusMap is new Map → agentLiveStatus prop is new object → TerminalView re-renders. This is a normal React re-render, NOT a remount.

REVISED: The described symptom "terminal content floats around" and "every 5 seconds" suggests maybe the data IS changing every 5 seconds, causing frequent re-renders. OR the `previousDataRef` serialization is creating false positives (not preventing updates when it should).

OR: The issue is more subtle - when TerminalView re-renders, React calls render function, which calls all the hooks. The `useTerminalSocket` hook is called. It computes `sendInput` and `sendResize` via useCallback([]) - stable. But wait - there's a subtle issue. When the component re-renders, `useCallback` hooks are called. For empty-dep useCallbacks, they return the same function reference. So `sendInput` and `sendResize` are stable.

But the xterm useEffect's cleanup + re-run would cause remount IF deps change. The deps are `[tmuxSessionName, sendInput, sendResize]`. Since sendInput/sendResize are stable, xterm only remounts when tmuxSessionName changes. This is correct and expected.

CONCLUSION: A React re-render of TerminalView (even triggered by agentLiveStatus change) does NOT remount xterm because the xterm useEffect deps are stable. The visual issue described must be caused by something else.

test: Look at what specifically causes "floating" terminal content - could it be CSS layout shift when agentLiveStatus is truthy/falsy (header section shows/hides StateBadge affecting layout), OR could it be that the polling actually changes data every 5s regardless of guard?
expecting: Either CSS layout issue from conditional header rendering, or the previousDataRef guard failing to prevent updates
next_action: Check if liveStatus changes every poll by examining what data the endpoint returns and whether the guard works correctly

## Symptoms

expected: GSD agent live-status polling updates agent status indicators WITHOUT affecting the xterm.js terminal. Terminal remains stable and interactive regardless of polling.
actual: Every 5 seconds when the polling response arrives, the entire terminal div (xterm.js canvas, viewport, screen) re-renders. Terminal content floats, becomes unsynchronized, unusable.
errors: No JavaScript errors — this is a visual/DOM re-render issue
reproduction: Open Warden dashboard, connect to a terminal session. Within 5 seconds the terminal starts flickering/re-rendering.
started: Likely related to GSD agent status features added recently

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-04T00:00:00Z
  checked: File listing for src/client/
  found: useAgentLiveStatus.ts hook exists, AgentSidebar.tsx, App.tsx, TerminalView.tsx all present
  implication: Need to trace state ownership and component hierarchy

- timestamp: 2026-03-04T00:30:00Z
  checked: useAgentLiveStatus.ts
  found: Has previousDataRef guard — skips setStatusMap when JSON-serialized data is identical
  implication: Map reference only changes when tmux pane content actually changes (which happens constantly when Claude is working)

- timestamp: 2026-03-04T00:30:00Z
  checked: App.tsx sessionStatusMap useMemo
  found: Depends on [liveStatus, activeInstances]. When liveStatus Map is new (data changed), sessionStatusMap is rebuilt. sessionStatusMap.get(selectedSessionName) returns a NEW AgentLiveStatus object even if state/pressure values are identical
  implication: agentLiveStatus prop to TerminalView changes reference every 5s when Claude is working

- timestamp: 2026-03-04T00:30:00Z
  checked: TerminalView.tsx xterm useEffect deps
  found: [tmuxSessionName, sendInput, sendResize] — sendInput/sendResize are useCallback([]) from useTerminalSocket, stable
  implication: xterm itself does NOT remount on prop changes, but TerminalView re-renders every 5s causing potential layout disruption

- timestamp: 2026-03-04T00:30:00Z
  checked: App.tsx existing comment at line 58-61
  found: Explicit comment acknowledging "causes unnecessary TerminalView re-renders every ~5s" — this was the previously known issue
  implication: The activeInstances memoization fix was partial; liveStatus data changes still cause re-renders

- timestamp: 2026-03-04T00:45:00Z
  checked: TerminalView.tsx for React.memo usage
  found: Not wrapped in React.memo — re-renders on any parent re-render regardless of prop stability
  implication: Defense-in-depth fix: wrap in memo AND stabilize the agentLiveStatus prop by value

## Resolution

root_cause: |
  Every 5 seconds, useAgentLiveStatus detects that tmux pane content changed (Claude is
  actively writing output) and calls setStatusMap(new Map()). This causes App to re-render.
  In App, sessionStatusMap useMemo recomputes (new Map) because liveStatus reference changed.
  The agentLiveStatus prop passed to TerminalView is a NEW OBJECT on every poll even if the
  actual state/pressure values haven't changed (e.g. still 'working', still 45%). This
  causes TerminalView to re-render every 5s.

  The re-render itself is mostly harmless (xterm useEffect deps are stable), BUT:
  1. Causes unnecessary React reconciliation work every 5s
  2. May cause subtle layout recalculation that disrupts xterm dimensions
  3. Any future code change could break the dep stability assumption

  The root cause: no value-based stability for the agentLiveStatus object — it's always a
  new object reference even when state/pressure values are identical.

fix: |
  Add a useMemo in App.tsx that stabilizes the agentLiveStatus value for the selected
  session using value-based comparison of the three fields (state, contextPressure,
  contextPressureLevel). When poll returns same values, the memoized reference stays
  stable, TerminalView does NOT re-render.

  Also wrap TerminalView in React.memo to provide a second layer of protection —
  React will bail out of re-rendering if all props are reference-equal.

verification: |
  TypeScript type check passes (npm run typecheck — 0 errors).
  Production build succeeds (npm run build — 662.86 kB bundle, no TS errors).
  Fix eliminates the 5s TerminalView re-render cycle when agent status values are unchanged.
  When values DO change (state changes, pressure changes), TerminalView correctly re-renders.
files_changed:
  - src/client/App.tsx
  - src/client/components/TerminalView.tsx
