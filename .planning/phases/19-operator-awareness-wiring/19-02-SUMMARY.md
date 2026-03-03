---
phase: 19-operator-awareness-wiring
plan: 02
subsystem: ui
tags: [react, typescript, xterm, keyboard-shortcuts, hotkeys]

# Dependency graph
requires:
  - phase: 19-01
    provides: terminalFocusRef established in TerminalView + App.tsx
provides:
  - Global keyboard shortcut hook (useGlobalHotkeys) with capture-phase registration and focus guard
  - Ctrl+1-9 tab switching, Ctrl+[/] cycle navigation with wrap-around, Ctrl+B sidebar toggle
  - Escape refocuses terminal when focus is elsewhere (does not interfere with TUI Escape)
  - Ctrl+F prevents browser find bar (Phase 20 stub)
  - attachCustomKeyEventHandler in TerminalView suppresses shortcut keys from PTY forwarding
affects:
  - 20-PLAN (terminal search overlay will use Ctrl+F stub established here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "capture-phase addEventListener prevents xterm.js from forwarding shortcut keys to PTY before global handler fires"
    - "attachCustomKeyEventHandler returning false for shortcut keys prevents PTY escape sequence injection"
    - "isInTextInput focus guard checks tagName INPUT/TEXTAREA + isContentEditable"
    - "handleToggleSidebar useCallback pattern — shared between header button and keyboard shortcut"

key-files:
  created:
    - src/client/hooks/useGlobalHotkeys.ts
  modified:
    - src/client/App.tsx
    - src/client/components/TerminalView.tsx

key-decisions:
  - "Capture phase (addEventListener with { capture: true }) fires before xterm.js bubble-phase listeners — without this, shortcut keys reach the PTY"
  - "attachCustomKeyEventHandler returning false for Ctrl+F/B/1-9/[/] blocks PTY escape sequence injection even when terminal has focus"
  - "Escape intentionally NOT suppressed in attachCustomKeyEventHandler — TUI apps (vim, etc.) require it to work normally"
  - "useGlobalHotkeys placed after handleSelectSession definition to avoid TDZ — hooks are called sequentially in render"
  - "handleToggleSidebar useCallback unified for both desktop button and Ctrl+B shortcut — DRY, single source of truth"
  - "Ctrl+B suppression: without return false, xterm sends ^B to PTY which activates tmux prefix in some tmux configs"

requirements-completed:
  - KB-01
  - KB-02
  - KB-03
  - KB-04
  - KB-05

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 19 Plan 02: Global Keyboard Shortcuts Summary

**useGlobalHotkeys hook with capture-phase registration and xterm PTY suppression — Ctrl+1-9 tab switch, Ctrl+[/] cycle, Ctrl+B sidebar toggle, Escape terminal refocus, Ctrl+F browser-find prevention**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-03T20:03:46Z
- **Completed:** 2026-03-03T20:06:02Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `src/client/hooks/useGlobalHotkeys.ts` — a focused ~110-line hook with capture-phase document event listener, `isInTextInput` focus guard, and all 6 shortcut categories (Ctrl+1-9, Ctrl+[/], Ctrl+B, Escape, Ctrl+F)
- Wired the hook into `App.tsx`: added `handleToggleSidebar` useCallback as a stable sidebar toggle function shared by both the header button and the keyboard shortcut; placed `useGlobalHotkeys` call after `handleSelectSession` definition to respect temporal dead zone
- Added `attachCustomKeyEventHandler` in `TerminalView.tsx` that returns `false` for Ctrl+F, Ctrl+B, Ctrl+1-9, and Ctrl+[/] — preventing xterm.js from emitting escape sequences to the PTY for these keys even when the terminal canvas has focus
- Escape is intentionally not suppressed so vim, less, and other TUI applications continue to work normally

## Task Commits

1. **Task 1: Create useGlobalHotkeys hook and wire in App.tsx** - `e394e86` (feat)
2. **Task 2: Add xterm attachCustomKeyEventHandler for PTY key suppression** - `497f453` (feat)

## Files Created/Modified

- `src/client/hooks/useGlobalHotkeys.ts` — New hook. Capture-phase keydown listener with focus guard, Escape/Ctrl+F/Ctrl+B/Ctrl+1-9/Ctrl+[/Ctrl+] handlers
- `src/client/App.tsx` — Added `useGlobalHotkeys` import + call; added `handleToggleSidebar` useCallback; updated sidebar toggle buttons to use the stable callback
- `src/client/components/TerminalView.tsx` — Added `attachCustomKeyEventHandler` block suppressing PTY forwarding for all shortcut keys (Escape excluded)

## Decisions Made

- **Capture phase is critical:** xterm.js registers its keydown listeners in the bubble phase. Using `{ capture: true }` on the document listener ensures the shortcut handler fires first. Without this, `event.stopPropagation()` in the bubble phase is too late — xterm already processed the key.
- **Dual defense required:** The global handler suppresses the browser default (e.g. Ctrl+F's find bar) via `preventDefault`. The `attachCustomKeyEventHandler` suppresses PTY injection via `return false`. Both layers are needed — the capture-phase listener handles the browser, but xterm.js processes its internal key events independently.
- **Escape not suppressed in attachCustomKeyEventHandler:** Escape is the most critical key in TUI applications. The global hook only calls `terminalFocusRef.current?.()` when the terminal does NOT already have focus, so it never intercepts Escape from inside the terminal.
- **handleToggleSidebar useCallback placement:** Added above `useSessionSelection` to satisfy React hook ordering rules. Used in both the header Sidebar button and `useGlobalHotkeys` — DRY without prop-drilling.
- **useGlobalHotkeys placed after handleSelectSession:** React's `const` declarations have TDZ semantics; referencing `handleSelectSession` before its line would throw at runtime. Positioned the hook call immediately after `handleSelectSession`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 20 (terminal search overlay) can implement the full Ctrl+F handler, replacing the current stub
- All KB-01 through KB-05 keyboard requirements satisfied
- Production build passes cleanly with no new errors

## Self-Check: PASSED

Files exist and commits verified.
