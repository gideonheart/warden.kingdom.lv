---
phase: 06-close-v1-audit-gaps
plan: 03
subsystem: terminal-interactivity
tags: [bug-fix, ux-improvement, refactoring]
dependencies:
  requires: []
  provides: [always-interactive-terminal, clear-prompt-destination]
  affects: [terminal-ui, terminal-streaming, prompt-panel]
tech_stack:
  added: []
  patterns: [unconditional-input-forwarding]
key_files:
  created: []
  modified:
    - src/server/services/TerminalStreamService.ts
    - src/shared/types.ts
    - src/client/hooks/useTerminalSocket.ts
    - src/client/components/TerminalView.tsx
    - src/client/components/PromptPanel.tsx
decisions:
  - "Removed take-over/release mode toggle entirely — terminal always interactive per user requirement"
  - "Fixed Bug 1 root cause: removed isReadOnly from useEffect deps to prevent terminal instance recreation"
  - "Fixed Bug 2: added 'via OpenClaw Gateway' labels to clarify prompt destination"
metrics:
  duration: 180
  completed_at: 2026-02-12
---

# Phase 06 Plan 03: Remove Terminal Mode Toggle & Clarify Prompt Destination Summary

Terminal is now always interactive from connection start, take-over/release toggle removed, and prompt panel clearly indicates it sends via OpenClaw Gateway.

## Objective

Remove take-over/release mode complexity and make terminal always interactive. Clarify prompt panel sends to OpenClaw Gateway.

**Rationale:** Fix Bug 1 (terminal buffer clearing on mode toggle) and Bug 2 (user confusion about prompt destination). User decision: terminal should always be interactive, no toggle needed.

## Completed Tasks

| # | Task | Commit | Files Modified |
|---|------|--------|----------------|
| 1 | Remove take-over/release mode from server | `967db1a` | TerminalStreamService.ts, types.ts |
| 2 | Remove take-over/release mode from client and clarify prompt panel | `f616914` | useTerminalSocket.ts, TerminalView.tsx, PromptPanel.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Key Changes

### Server-Side Simplifications

**TerminalStreamService.ts:**
- Removed `isReadOnly` field from `ActiveTerminalStream` interface
- Removed `terminal:take-over` and `terminal:release` event handlers
- Removed `enableInputForSocket()` and `disableInputForSocket()` methods
- Registered `terminal:input` listener immediately on connection (no longer deferred)
- Removed `options: { readOnly: boolean }` parameter from `attachSocketToSession`

**types.ts:**
- Removed `TerminalAttachOptions` interface entirely

### Client-Side Simplifications

**useTerminalSocket.ts:**
- Removed `isReadOnly` state and its reset in cleanup
- Removed `terminal:mode-changed` event listener
- Removed `requestTakeOver` and `releaseTakeOver` callbacks
- Removed `isReadOnly` from hook return object

**TerminalView.tsx:**
- Updated destructured hook return to only include `{ sendInput, sendResize, isConnected, isReconnecting }`
- Removed `isReadOnly` check from `terminal.onData` handler — now calls `sendInput(userInput)` unconditionally
- **CRITICAL FIX:** Removed `isReadOnly` from useEffect dependency array (this was the root cause of Bug 1)
- Removed Take Over / Release button block entirely
- Removed READ ONLY / INTERACTIVE badge entirely
- Kept connection status indicator in toolbar

**PromptPanel.tsx:**
- Changed label from `"Send prompt to"` to `"Send prompt via OpenClaw Gateway to"`
- Updated placeholder from `"Type a prompt... (Ctrl+Enter to send)"` to `"Type a prompt for the agent via OpenClaw Gateway... (Ctrl+Enter to send)"`
- Added help text: `"Sends to agent via Gateway API — not typed into the terminal"`

## Bug Fixes

### Bug 1: Terminal Buffer Clearing on Mode Toggle

**Root Cause:** `isReadOnly` was in the useEffect dependency array that creates the xterm.js Terminal instance. When mode changed, the entire terminal instance was recreated, clearing the buffer.

**Fix:** Removed `isReadOnly` from useEffect deps. Since terminal is now always interactive (no mode changes), the terminal instance is only created once on mount and destroyed on unmount.

### Bug 2: User Confusion About Prompt Destination

**Root Cause:** Prompt panel label said "Send prompt to [agent]" without clarifying it goes via Gateway API, not directly into the terminal.

**Fix:**
- Label now says "Send prompt via OpenClaw Gateway to [agent]"
- Placeholder references "via OpenClaw Gateway"
- Help text explicitly states: "Sends to agent via Gateway API — not typed into the terminal"

## Verification Results

1. `npx tsc --noEmit` — PASSED (zero errors)
2. `npm run build` — PASSED (Vite build succeeded in 5.47s)
3. Grep for removed keywords across all of `src/` — PASSED (zero matches):
   - `isReadOnly`
   - `take-over`
   - `takeOver`
   - `releaseTakeOver`
   - `requestTakeOver`
   - `mode-changed`
   - `enableInput`
   - `disableInput`
4. PromptPanel contains "via OpenClaw Gateway" — PASSED (2 occurrences)
5. Terminal toolbar has no Take Over / Release buttons — PASSED
6. Terminal toolbar has no READ ONLY / INTERACTIVE badge — PASSED

## Audit Items Resolved

**INTV-01:** "Terminals start in read-only mode — user must click Take Over" — RESOLVED (terminals now always interactive from connection start)

**INTV-02/03:** "Take-over/release toggle exists" — RESOLVED (toggle removed entirely)

**INTV-04:** "Direct terminal input gated behind mode" — RESOLVED (input always enabled, no mode gating)

**Bug 1:** "Terminal goes blank when clicking Take Over / Release" — RESOLVED (mode toggle removed, terminal instance never recreated)

**Bug 2:** "Users confused where prompt goes (terminal vs Gateway)" — RESOLVED (prompt panel clearly labeled with Gateway references)

## Success Criteria Met

- [x] Bug 1 fixed: Terminal never goes blank because xterm.js instance is never recreated on mode change (no mode changes exist)
- [x] Bug 2 fixed: Prompt panel clearly communicates it sends to OpenClaw Gateway API
- [x] INTV-01 removed: No longer "read-only by default" — always interactive per user decision
- [x] INTV-02/03 removed: No toggle needed — always interactive
- [x] INTV-04 simplified: Direct terminal input always available (no mode required)
- [x] Clean removal: No dead code, no unused imports, no orphaned socket events

## Self-Check: PASSED

**Created files:**
- None (this was a refactoring/removal task)

**Modified files:**
```bash
FOUND: src/server/services/TerminalStreamService.ts
FOUND: src/shared/types.ts
FOUND: src/client/hooks/useTerminalSocket.ts
FOUND: src/client/components/TerminalView.tsx
FOUND: src/client/components/PromptPanel.tsx
```

**Commits:**
```bash
FOUND: 967db1a
FOUND: f616914
```

All claimed files and commits verified to exist.
