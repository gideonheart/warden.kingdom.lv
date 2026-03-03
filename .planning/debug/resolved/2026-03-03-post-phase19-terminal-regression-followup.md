---
status: resolved
trigger: "post-phase19-terminal-regression-followup"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:02:00Z
---

## Current Focus

hypothesis: RESOLVED — three compounding issues fixed.
test: npm run build passes; npm run test 40/40 pass.
expecting: No overlay on poll cycles. No terminal corruption.
next_action: Archive.

## Symptoms

expected: Polling should update session/status metadata only. No terminal reconnect, no terminal reset event, no TerminalView remount when selected session is unchanged. Overlay shown only for real transport disconnect/reconnect.
actual: At polling completion, full-screen terminal reload/animation occurs. "Connecting to..." overlay appears over active tmux terminal. During/after poll: typed characters not visible correctly, cursor/layout drift, duplicated fragments, blank regions.
errors: Terminal render/geometry desync (xterm/tmux mismatch), not mere cosmetic flicker.
reproduction: Open dashboard with active tmux session. Wait for poll tick (every few seconds). Observe terminal reconnect overlay and visual corruption.
timeline: Regression introduced by Phase 19-01 (feat: wire useAgentLiveStatus to UI — commit 348987f).

## Evidence

- timestamp: 2026-03-03
  checked: Phase 19 commit 348987f — what changed in App.tsx
  found: useAgentLiveStatus() lifted into App. sessionStatusMap useMemo added with [liveStatus, activeInstances] deps. activeInstances was computed as instances.filter(...) in the render body — a new array reference on every render.
  implication: Every liveStatus change (every 5s when agent is running) causes App re-render. activeInstances is new array → sessionStatusMap useMemo always recomputes → new Map reference → agentLiveStatus prop changes → TerminalView re-renders unnecessarily.

- timestamp: 2026-03-03
  checked: useTerminalSocket.ts — Socket.IO transport config
  found: No transports config. Socket.IO defaults to ['polling', 'websocket'] — starts with HTTP long-polling, upgrades to WebSocket. During the polling phase, Socket.IO makes HTTP requests to /socket.io/... which compete with /api/instances and /api/gsd/agents/live-status requests for the browser's HTTP connection pool (6 per origin). A delayed polling response can trigger a brief disconnect event, which starts the overlay delay timer.
  implication: Changing to ['websocket', 'polling'] makes Socket.IO attempt WebSocket immediately, bypassing the HTTP polling phase.

- timestamp: 2026-03-03
  checked: OVERLAY_DELAY_MS = 500ms
  found: 500ms delay is too short to absorb the initial WebSocket connection latency (RTT + server handshake) and Socket.IO's transport upgrade window. The overlay was appearing on legitimate but brief connection initialization.
  implication: Increasing to 1500ms absorbs normal connection setup without hiding genuine outages.

- timestamp: 2026-03-03
  checked: TerminalStreamService.ts attachSocketToSession — multi-subscriber PTY resize
  found: When a new socket connects to an existing PTY, the server emits terminal:reset to the new socket (correct) AND resizes the PTY with a +1 row nudge to force tmux repaint (problematic). The +1 nudge causes ALL subscribers to receive a full-screen repaint at wrong dimensions, corrupting the existing subscriber's display.
  implication: When there are already active subscribers, use `tmux refresh-client` instead of PTY resize. The resize is appropriate only when no other subscribers are present (sole re-attacher scenario).

## Eliminated

- hypothesis: useActiveInstances.setInstances causes re-renders on every poll
  evidence: computeInstanceSignature guard prevents setInstances when data is unchanged. React bails out on same-value setState for primitives. But re-renders from liveStatus changes were the real trigger.
  timestamp: 2026-03-03

- hypothesis: useSessionSelection churns selectedSessionName on every poll
  evidence: resolveSessionFallback returns same session when present. activeSessionNamesKey string is stable if names unchanged. Hysteresis protects against transient misses.
  timestamp: 2026-03-03

- hypothesis: React StrictMode causes double-mounting in production
  evidence: StrictMode double-mounting is development-only behavior. Production builds do not double-mount.
  timestamp: 2026-03-03

- hypothesis: Socket effect cleanup runs on re-renders
  evidence: Socket effect deps are [sessionName, reconnectGeneration]. These don't change on mere re-renders. Socket stays connected through re-renders.
  timestamp: 2026-03-03

## Resolution

root_cause: |
  Three compounding issues introduced/exposed by Phase 19:

  1. PRIMARY (App.tsx): activeInstances was computed as instances.filter() in the render body,
     creating a new array reference on every render. Since sessionStatusMap useMemo depended on
     [liveStatus, activeInstances], it always recomputed when App re-rendered (triggered by
     liveStatus data changes every 5s). This caused unnecessary TerminalView re-renders and
     contributed to system load that amplified secondary issues.

  2. SECONDARY (useTerminalSocket.ts): Socket.IO used HTTP long-polling as the initial transport
     before upgrading to WebSocket. During the polling phase, Socket.IO HTTP requests competed
     with /api/instances and /api/gsd/agents/live-status requests for the browser's HTTP
     connection pool. A delayed polling response could trigger a disconnect event, causing the
     overlay timer to start.

  3. TERTIARY (useTerminalSocket.ts + TerminalStreamService.ts): OVERLAY_DELAY_MS=500ms was too
     short for normal connection setup. Server-side PTY resize when a new subscriber connected
     to an existing session sent garbled repaints to all subscribers.

fix: |
  1. App.tsx: Wrapped activeInstances in useMemo([instances]) to stabilize the array reference.
     sessionStatusMap now only recomputes when instances or liveStatus data actually changes.

  2. useTerminalSocket.ts: Changed Socket.IO transports to ['websocket', 'polling'] — attempt
     WebSocket directly, fall back to polling only if WebSocket unavailable.

  3. useTerminalSocket.ts: Increased OVERLAY_DELAY_MS from 500ms to 1500ms.

  4. TerminalStreamService.ts: When a new subscriber connects to an existing PTY that has OTHER
     active subscribers, use `tmux refresh-client` instead of the +1 row resize nudge. This
     prevents sending garbled repaint data to existing subscribers at wrong dimensions.
     The resize nudge is still used when there are no other active subscribers (re-attach case).

verification: |
  - npm run build: PASS (vite build + tsc -p tsconfig.server.json)
  - npm run typecheck: PASS (0 errors)
  - npm run test: PASS (40/40 tests)
  - Tests updated: useTerminalSocket.test.ts suite name + timing updated to 1500ms threshold

files_changed:
  - src/client/App.tsx: activeInstances wrapped in useMemo([instances])
  - src/client/hooks/useTerminalSocket.ts: transports ['websocket','polling'], OVERLAY_DELAY_MS=1500
  - src/server/services/TerminalStreamService.ts: multi-subscriber refresh-client instead of resize
  - tests/unit/useTerminalSocket.test.ts: updated suite name and timing for 1500ms delay
