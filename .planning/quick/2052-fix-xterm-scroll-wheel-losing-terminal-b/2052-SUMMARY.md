---
phase: quick-2052
plan: 01
subsystem: client/terminal
tags: [xterm, mouse-tracking, scrollback, bug-fix]
dependency_graph:
  requires: []
  provides: [parser-level-mouse-tracking-suppression, native-xterm-scrollback]
  affects: [TerminalView]
tech_stack:
  added: []
  patterns: [xterm-parser-csi-handler]
key_files:
  created: []
  modified:
    - src/client/components/TerminalView.tsx
decisions:
  - Used registerCsiHandler with prefix+final instead of raw byte matching for robustness
  - Kept regex filter as belt-and-suspenders alongside parser handler
  - Kept sendScrollToTmux for mobile touch scroll only
metrics:
  duration: 80s
  completed: 2026-03-06
---

# Quick 2052: Fix xterm scroll wheel losing terminal buffer scrollback

Parser-level CSI handler suppresses mouse tracking modes (?1000h/?1002h/?1003h/?1006h) immune to chunk-splitting, combined with removal of desktop handleWheel listener to enable native xterm.js 5000-line scrollback buffer.

## Changes Made

### Task 1: Parser-level mouse tracking suppression + native scrollback

**Commit:** 0cf325b

Three changes to TerminalView.tsx:

1. **Added parser-level CSI handler** after `terminal.open()` that intercepts `CSI ? {mode} h` sequences where mode is 1000, 1002, 1003, or 1006. This uses xterm.js's internal parser state machine, so it correctly handles sequences split across WebSocket data chunks (unlike the regex approach which only works on complete sequences within a single `write()` call). Returns `true` to suppress the sequence, preventing xterm.js from entering mouse tracking mode.

2. **Removed desktop `handleWheel` event listener** that was intercepting all wheel events, calling `preventDefault()`, and forwarding them as SGR mouse sequences to tmux. Without this listener, xterm.js handles wheel events natively using its built-in 5000-line scrollback buffer (already configured via `scrollback: 5000`).

3. **Kept belt-and-suspenders**: The `MOUSE_TRACKING_ENABLE_PATTERN` regex filter in `handleTerminalOutput` remains as a first-pass filter. The parser handler catches anything the regex misses. Both layers are cheap and complementary.

**Preserved**: `sendScrollToTmux` helper function remains for mobile touch scroll handlers (`handleTouchMove`). All mobile touch scroll behavior is completely unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build passes with zero TypeScript errors
- No `handleWheel` function or wheel event listener remaining in TerminalView.tsx
- `registerCsiHandler` call present with `{ final: 'h', prefix: '?' }`
- `sendScrollToTmux` still present (used by mobile touch handlers)
- `MOUSE_TRACKING_ENABLE_PATTERN` regex still present (belt-and-suspenders)
- `disposeMouseHandler.dispose()` called in cleanup function

## Self-Check: PASSED

- [x] `src/client/components/TerminalView.tsx` modified with parser handler
- [x] Commit 0cf325b exists
- [x] Build succeeds
