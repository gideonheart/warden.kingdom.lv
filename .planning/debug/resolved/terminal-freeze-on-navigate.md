---
status: resolved
trigger: "terminal-freeze-on-navigate"
created: 2026-02-19T00:00:00Z
updated: 2026-02-19T00:45:00Z
---

## Current Focus

hypothesis: RESOLVED
test: n/a
expecting: n/a
next_action: n/a

## Symptoms

expected: Terminal should remain interactive when navigating between views (Terminals → History/Agents/GSD → back to Terminals) and when switching browser tabs
actual: Terminal shows existing content but becomes completely unresponsive — no input works, output is frozen. Sometimes the terminal goes "full matrix" showing gibberish/garbled characters
errors: No specific error messages mentioned — just frozen state and occasional garbled output
reproduction: Navigate away from Terminals view to another section (History, Agents, GSD), then navigate back. Also happens when switching away from the browser tab and returning. Hard refresh is the only fix.
timeline: Ongoing issue, not a regression from a specific change

## Eliminated

- hypothesis: "Socket callbacks become stale after remount causing sendInput to drop input"
  evidence: sendInput uses closure over socketRef (a ref), so it always reads current socket. Stable.
  timestamp: 2026-02-19T00:08:00Z

- hypothesis: "xterm.js Canvas freezes when tab is hidden"
  evidence: Canvas rendering does throttle, but the freeze persists after tab becomes visible again.
    The real cause is the orphaned socket/terminal state, not canvas rendering.
  timestamp: 2026-02-19T00:10:00Z

- hypothesis: "React effect deps cause extra socket recreations"
  evidence: onTerminalOutput and onSessionExit are stable useCallback references. Socket only
    recreates when sessionName changes or component remounts.
  timestamp: 2026-02-19T00:12:00Z

## Evidence

- timestamp: 2026-02-19T00:02:00Z
  checked: App.tsx view switching logic
  found: |
    When currentView changes away from 'terminals', TerminalView is UNMOUNTED entirely.
    The JSX is conditional: `{currentView === 'terminals' ? <TerminalView.../> : otherView}`.
    On navigation back, TerminalView is REMOUNTED as a fresh component instance.
  implication: Every navigation away and back destroys and recreates xterm.js Terminal + Socket.IO connection.

- timestamp: 2026-02-19T00:03:00Z
  checked: TerminalStreamService.ts detachSocket + cleanupSession
  found: |
    When last subscriber disconnects: cleanupSession() was called immediately.
    sessions.delete(sessionName) removed it from the Map.
    ptyProcess.kill() sent SIGHUP. PTY took non-zero time to die.
    New connection (navigate back) always spawned a new PTY with hardcoded 120x40 dimensions.
  implication: Every navigation caused a fresh PTY with wrong dimensions.

- timestamp: 2026-02-19T00:04:00Z
  checked: PTY spawn dimensions vs xterm.js dimensions
  found: |
    PTY spawned at 120x40 (hardcoded). xterm.js measured to actual size.
    tmux sent full repaint at 120x40. xterm.js rendered it at actual size.
    Line wrapping at col 120 appeared as long unwrapped lines in wider terminal.
    This is the "garbled matrix" symptom.
  implication: Dimension mismatch between PTY and xterm.js causes garbled display on every reconnect.

- timestamp: 2026-02-19T00:05:00Z
  checked: terminal:exit handling in TerminalView.tsx + App.tsx
  found: |
    Server fires terminal:exit when PTY process exits.
    Client's onSessionExit only calls refetch() — does NOT remount or reconnect.
    After terminal:exit, the TerminalView stays mounted but the socket session is gone.
    Input sent to server is silently dropped (no session mapping exists anymore).
  implication: PTY exit orphans the terminal — appears frozen permanently. Hard refresh only fix.

- timestamp: 2026-02-19T00:30:00Z
  checked: Full fix verification
  found: All three fixes applied, TypeScript clean, production build clean.
  implication: All three causes addressed.

## Resolution

root_cause: |
  Three compounding causes:

  1. DIMENSION MISMATCH (garbled "matrix" display on every navigation):
     Server always spawned PTY at hardcoded 120x40. xterm.js was sized to actual screen dimensions.
     tmux sent a full repaint for 120x40 which got written to xterm.js before the terminal:resize
     event could reach the server. This created a window of garbled content after every reconnect.

  2. PTY ORPHAN FROM EXIT (permanent freeze after PTY exit):
     When a PTY process exited, the server sent terminal:exit to the client. The client's
     onSessionExit handler only called refetch() — it did NOT reconnect or remount the terminal.
     The TerminalView remained mounted with a dead socket session. Any input was silently dropped
     by the server (session mapping already cleaned up). Only a hard page refresh fixed this.

  3. NO KEEP-ALIVE FOR PTY ON NAVIGATION (kills PTY on every navigate-away):
     Server killed the PTY immediately when the last subscriber disconnected (navigate away).
     Navigate back always spawned a brand new PTY, triggering causes #1 and #2 repeatedly.

fix: |
  FIX 1 (server, TerminalStreamService.ts): PTY keep-alive grace period (30 seconds).
  Instead of killing the PTY immediately when the last subscriber disconnects, schedule a
  30-second cleanup timer. If a new subscriber arrives (navigate back) before the timer fires,
  cancel the timer and reuse the existing PTY. This eliminates the kill/respawn cycle for
  normal navigation patterns and preserves terminal state and scrollback.

  FIX 2 (server, TerminalStreamService.ts): Client-supplied PTY dimensions from handshake.
  Accept cols/rows from the Socket.IO handshake query parameters instead of hardcoded 120x40.
  Emit a terminal:reset event to the client when spawning a fresh PTY (not reusing a keep-alive).
  This signals the client to clear stale xterm.js content before the new repaint arrives.

  FIX 3 (client, useTerminalSocket.ts + TerminalView.tsx): Reconnect on terminal:exit.
  When terminal:exit is received, force a full socket reconnect (via reconnectGeneration counter
  incrementing, which causes the effect to re-run and create a fresh socket). This causes the
  server to spawn a new PTY, allowing the terminal to recover automatically instead of requiring
  a hard page refresh.

  FIX 4 (client, TerminalView.tsx): getDimensions callback read inside effect.
  Pass terminal dimensions as a callback that is invoked inside the socket useEffect (after DOM
  mount) rather than during the render phase (when the container ref is null). This ensures the
  actual rendered container size is sent in the handshake query, enabling Fix #2 to work correctly.

  FIX 5 (client, TerminalView.tsx + useTerminalSocket.ts): terminal:reset clears xterm.js.
  When the server emits terminal:reset (fresh PTY spawned), the client calls terminal.reset()
  to clear stale content, then refits to ensure correct dimensions.

verification: |
  - TypeScript typecheck: clean (0 errors)
  - Production build: clean (0 errors, all 95 modules transformed)
  - Code review: All three causes addressed with minimal, targeted changes
  - Logic trace: Navigate away -> socket disconnect -> 30s grace period timer starts (PTY stays alive)
                 Navigate back within 30s -> new socket -> timer cancelled -> PTY reused -> no dimension mismatch
                 Navigate back after 30s -> PTY killed -> new socket -> dims from getDimensions() -> no mismatch
                 terminal:exit received -> 2s delay -> reconnectGeneration++ -> fresh socket -> fresh PTY
files_changed:
  - src/server/services/TerminalStreamService.ts
  - src/client/hooks/useTerminalSocket.ts
  - src/client/components/TerminalView.tsx
