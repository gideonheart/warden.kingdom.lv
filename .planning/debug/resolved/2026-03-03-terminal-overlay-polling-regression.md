---
status: resolved
trigger: "terminal overlay polling regression — Connecting overlay appears during polls, TUI blinks, typing drifts, mobile layout unstable. Quick-21 did not resolve."
created: 2026-03-03T18:00:00Z
updated: 2026-03-03T18:30:00Z
---

## Current Focus

hypothesis: Three interlocking bugs remain after quick-21 fix
test: Code trace + static analysis complete, implementing fixes
expecting: After fix, socket never reconnects during polls, overlay only on real disconnect
next_action: Implement fixes in useTerminalSocket, TerminalView, useSessionSelection

## Symptoms

expected: Polling refreshes session/status metadata only. Terminal stays stable. No overlay during poll cycles.
actual: (1) TUI blinks/reloads after polls. (2) "Connecting to..." overlay appears. (3) Typed input drifts. (4) Mostly blank screen with spinner. Mobile exacerbated.
errors: "Connecting to agent_warden-kingdom_session_name..." overlay appearing during polling
reproduction: Observed on mobile. Multiple polling cycles. Keyboard-open state exacerbates layout.
timeline: quick-21 (commit 75d0d51) added useSessionSelection + poll dedup — did NOT resolve.

## Eliminated

- hypothesis: "instances array reference churn causes selectedSessionName change"
  evidence: computeInstanceSignature dedup prevents setInstances on unchanged data; activeSessionNamesKey string is stable; useSessionSelection effect doesn't re-run
  timestamp: 2026-03-03T18:20:00Z

- hypothesis: "setError(null) causing re-renders"
  evidence: React bails out on null===null, no re-render
  timestamp: 2026-03-03T18:20:00Z

- hypothesis: "isLoading causing mount/unmount cycles"
  evidence: isLoading only ever goes true→false once, never resets to true after first fetch
  timestamp: 2026-03-03T18:20:00Z

- hypothesis: "sendInput/sendResize refs unstable"
  evidence: Both are useCallback([]) with empty deps — stable within component instance
  timestamp: 2026-03-03T18:20:00Z

## Evidence

- timestamp: 2026-03-03T18:10:00Z
  checked: useTerminalSocket.ts effect deps at line 84
  found: Effect deps include onTerminalOutput, onTerminalReset, onSessionExit callbacks from TerminalView
  implication: ANY remount or identity change of these callbacks causes socket disconnect + reconnect + overlay

- timestamp: 2026-03-03T18:10:00Z
  checked: useTerminalSocket.ts cleanup function
  found: Cleanup sets setIsConnected(false) immediately — runs even during intentional reconnect cycle
  implication: During reconnect (reconnectGeneration++) the overlay shows while new socket connects. Same if any dep changes.

- timestamp: 2026-03-03T18:15:00Z
  checked: TerminalView.tsx xterm effect deps [tmuxSessionName, sendInput, sendResize]
  found: sendInput/sendResize are stable BUT the entire xterm terminal is rebuilt when these deps change
  implication: If sendInput/sendResize ever change (due to TerminalView remount from wrong key), xterm rebuilds, terminal disappears

- timestamp: 2026-03-03T18:20:00Z
  checked: useSessionSelection.ts effect body
  found: consecutiveMissCountRef.current mutation happens INSIDE setSelectedSessionName functional updater callback
  implication: React may call the functional updater multiple times in concurrent mode (StrictMode double-invoke). Ref mutation inside state updater is a React anti-pattern that can cause double-increments.

- timestamp: 2026-03-03T18:25:00Z
  checked: App.tsx visualViewport handler
  found: Sets --visual-viewport-height CSS variable. This changes computed layout. TerminalView's refitTerminal fires with potentially wrong dimensions during keyboard-open transition.
  implication: On mobile with keyboard, terminal may briefly fit to wrong (possibly zero) dimensions, then correct. This causes "layout unstable" symptom.

- timestamp: 2026-03-03T18:30:00Z
  checked: Socket.IO configuration in server/index.ts
  found: connectionStateRecovery enabled with 2min window. pingTimeout 60s, pingInterval 25s.
  implication: Server-side config is robust. Problem is client-side.

## Root Causes

**Root Cause 1 (PRIMARY): useTerminalSocket deps include volatile callback refs**

useTerminalSocket's effect has deps: [sessionName, onTerminalOutput, onTerminalReset, onSessionExit, reconnectGeneration]

The callbacks onTerminalOutput/onTerminalReset/onSessionExit are memoized in TerminalView with useCallback. These should be stable — but this is architecturally fragile. The effect re-runs (disconnecting/reconnecting socket) whenever ANY of these change identity. The correct design is: callbacks should be stored in refs and called via ref, so they are excluded from deps entirely. Only sessionName and reconnectGeneration need to be deps.

**Root Cause 2 (PRIMARY): isConnected=false shown immediately, creating overlay during benign transitions**

The cleanup function always runs setIsConnected(false). This means: whenever the reconnectGeneration counter increments (PTY exit), the overlay shows while the new socket connects. More critically — if any dep in the effect changes for any reason, the overlay flashes.

Fix: Use an "overlay delay" ref — don't show overlay until 500ms after isConnected becomes false. This makes transient reconnects invisible.

**Root Cause 3 (SECONDARY): ref mutation inside setState functional updater in useSessionSelection**

consecutiveMissCountRef.current is mutated inside setSelectedSessionName's callback function. React may invoke functional updaters multiple times in concurrent mode. This can cause double-increments of the miss counter, potentially triggering false session fallback after 1 real miss instead of 2.

Fix: Move ref mutation to after the setState call, not inside the updater.

**Root Cause 4 (SECONDARY - Mobile): Layout instability from keyboard open/close**

The --visual-viewport-height CSS approach doesn't perfectly guard against the terminal fitting to zero dimensions during layout transitions. When keyboard opens, the CSS var changes, container height changes, fitAddon.fit() may run at wrong moment.

Fix: Guard fitAddon.fit() against zero-dimension containers, add minimum viable size check.

## Resolution

root_cause: Socket reconnects triggered by callback identity fragility in useTerminalSocket deps (volatile callbacks as effect deps), compounded by immediate isConnected=false display creating visible overlay on every reconnect cycle. Secondary: React anti-pattern in useSessionSelection (ref mutation inside setState updater).
fix: (1) Use callback refs in useTerminalSocket — remove volatile callbacks from effect deps. (2) Debounce overlay display — 500ms delay before showing connecting overlay. (3) Move ref mutation out of setState updater in useSessionSelection. (4) Guard fitAddon.fit() against zero dimensions.
verification: 28 unit tests pass, npm run build clean, npm run typecheck clean
files_changed:
  - src/client/hooks/useTerminalSocket.ts
  - src/client/hooks/useSessionSelection.ts
  - src/client/components/TerminalView.tsx
  - tests/unit/useTerminalSocket.test.ts
  - tests/unit/useSessionSelection.test.ts
