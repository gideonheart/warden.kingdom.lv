---
phase: 28-mobile-toolbar-fixes
plan: 01
subsystem: ui
tags: [xterm.js, react, mobile, ios-safari, terminal, touch]

# Dependency graph
requires: []
provides:
  - Enter key as first button in mobile terminal toolbar (sends \r sequence)
  - Keyboard-persistence fix via terminal.textarea?.focus() in all toolbar onTouchStart handlers
  - refocusTerminal() helper passed to MobileKeyToolbar via terminalRef prop
affects: [future mobile UX phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "iOS soft keyboard persistence: call terminal.textarea?.focus() synchronously in onTouchStart before any other action"
    - "refocusTerminal helper pattern: extract focus-restoration to a local inline helper inside component"

key-files:
  created: []
  modified:
    - src/client/components/TerminalView.tsx

key-decisions:
  - "Use terminal.textarea?.focus() (DOM element), NOT terminal.focus() (xterm.js public method) — the DOM call is what iOS Safari recognises for keyboard retention"
  - "Call refocusTerminal() synchronously in onTouchStart — deferred calls (requestAnimationFrame, setTimeout) are silently ignored by iOS Safari"
  - "Enter placed at MOBILE_KEYS[0] so it is always visible without horizontal scrolling on narrow phones"

patterns-established:
  - "Mobile toolbar onTouchStart pattern: event.preventDefault() -> refocusTerminal() -> action"

requirements-completed: [MOB-01, MOB-02]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 28 Plan 01: Mobile Toolbar Fixes Summary

**Enter key added to mobile terminal toolbar and iOS soft keyboard persistence fixed via synchronous terminal.textarea?.focus() in all 5 toolbar onTouchStart handlers**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T20:08:53Z
- **Completed:** 2026-03-04T20:11:17Z
- **Tasks:** 2 (1 code change + 1 build verification)
- **Files modified:** 1

## Accomplishments

- Added `{ label: 'Enter', seq: '\r' }` as the first entry in `MOBILE_KEYS` — mobile operators can now submit commands without a physical keyboard (MOB-01)
- Wired `refocusTerminal()` helper calling `terminalRef.current?.textarea?.focus()` synchronously in all 5 `onTouchStart` handlers — iOS soft keyboard stays open after every toolbar button tap (MOB-02)
- Production build passes cleanly (Vite client + TypeScript server)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Enter key and wire keyboard-persistence focus fix** - `247ccc9` (feat)
2. **Task 2: Build production bundle and verify** - no separate commit (build-only verification, no additional file changes)

## Files Created/Modified

- `src/client/components/TerminalView.tsx` - Added Enter to MOBILE_KEYS[0], extended MobileKeyToolbarProps with terminalRef, added refocusTerminal() helper, wired all 5 onTouchStart handlers, passed terminalInstanceRef to MobileKeyToolbar

## Decisions Made

- Used `terminal.textarea?.focus()` (DOM element) instead of `terminal.focus()` (xterm.js public method) — confirmed in xterm.js type definitions and STATE.md prior research as the correct iOS keyboard retention mechanism
- refocusTerminal() is a plain inline function (not useCallback) because it reads from a stable ref — no memoization needed
- Did not modify `handleToggleCopyMode` — the existing `requestAnimationFrame` pattern there is desktop-correct and harmless; the new synchronous `refocusTerminal()` in Copy button's `onTouchStart` handles the mobile case before `onToggleCopyMode` runs

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all four changes applied cleanly, TypeScript compilation passed on first attempt, production build succeeded.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 28 complete. Both requirements MOB-01 and MOB-02 satisfied.
- Phase 29 (next in v3.2 milestone) can proceed independently — it is also a client-only change.
- Production bundle at `dist/client/` and `dist/server/` is ready to deploy.

---
*Phase: 28-mobile-toolbar-fixes*
*Completed: 2026-03-04*
