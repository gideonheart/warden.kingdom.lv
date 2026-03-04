---
phase: 29-session-navigation
plan: 01
subsystem: ui
tags: [react, session-navigation, recording-player, history-view, tailwind]

# Dependency graph
requires:
  - phase: 28-mobile-toolbar-fixes
    provides: stable TerminalView with iOS keyboard retention
provides:
  - Clickable session rows in SessionHistory with three-way navigation logic
  - onPlayRecording callback wired from App.tsx through HistoryView to SessionHistory
  - Inline no-recording feedback message (3-second auto-dismiss)
  - Recordings fetched from /api/recordings on SessionHistory mount
affects: [30-auto-record, 31-recording-storage-cap]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-way navigation dispatch in row click handler: navigate-to-live | open-recording | show-inline-message"
    - "One-time fetch on mount for stable reference data (recordings) separate from polling data (sessions)"

key-files:
  created: []
  modified:
    - src/client/App.tsx
    - src/client/components/HistoryView.tsx
    - src/client/components/SessionHistory.tsx

key-decisions:
  - "NAVIGABLE_STATUSES checks session.status field directly (not presence in active instances list) — status field is the authoritative signal"
  - "recordings.find() requires r.stoppedAt !== null — only completed recordings are playable; in-progress recordings would fail in RecordingPlayer"
  - "Recordings fetched once on mount (not polled) — recordings are stable reference data"
  - "noRecordingMessage auto-dismisses after 3 seconds via setTimeout"
  - "onClick on outer row div — both desktop and mobile sub-layouts inherit click via event bubbling"

patterns-established:
  - "Row-click dispatch pattern: check live status first, then recording lookup, then fallback inline message"
  - "Transient inline feedback with setTimeout cleanup for user-facing error states"

requirements-completed: [NAV-01, NAV-02, NAV-03]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 29 Plan 01: Session Navigation Summary

**Session history rows are now fully actionable: active sessions navigate to live terminal (NAV-01), stopped sessions with recordings open the player (NAV-02), stopped sessions without recordings show a 3-second inline message (NAV-03)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T20:31:08Z
- **Completed:** 2026-03-04T20:33:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wired `onPlayRecording` callback from `App.tsx` through `HistoryView` to `SessionHistory` — both desktop tab and mobile accordion instances receive both navigation callbacks
- Implemented three-way `handleRowClick` dispatch in `SessionHistory`: active sessions navigate to Terminals view, stopped sessions with completed recordings open the RecordingPlayer, stopped sessions without recordings display a transient inline message
- Added one-time recordings fetch from `/api/recordings` on mount to power recording lookup
- Every row tap now produces visible feedback — no silent no-ops remain

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire onPlayRecording callback through App.tsx and HistoryView.tsx** - `44fc981` (feat)
2. **Task 2: Implement clickable session rows with three-way navigation in SessionHistory** - `75adab9` (feat)

## Files Created/Modified
- `src/client/App.tsx` - Added `onPlayRecording` prop to `<HistoryView>` render, calling `handlePlayRecording` and `setCurrentView('recordings')`
- `src/client/components/HistoryView.tsx` - Added `RecordingEntry` import, extended `HistoryViewProps`, removed `_` prefix from `onNavigateToSession`, forwarded both callbacks to both `<SessionHistory>` instances
- `src/client/components/SessionHistory.tsx` - Added `SessionHistoryProps` interface, recordings state + fetch, `NAVIGABLE_STATUSES` set, `handleRowClick` with three-way logic, `cursor-pointer` + `onClick` on row div, `noRecordingMessage` inline display

## Decisions Made
- `NAVIGABLE_STATUSES` checks `session.status` field directly (not active instances list) — the status field is the authoritative signal for live vs stopped sessions
- `recordings.find()` requires `r.stoppedAt !== null` — only completed recordings are playable; an in-progress recording would fail in RecordingPlayer
- Recordings fetched once on mount (not polled) — recordings are stable reference data that doesn't change per render cycle
- `noRecordingMessage` auto-dismisses after 3000ms via `setTimeout`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- TypeScript correctly flagged that Task 1 changes produced type errors until Task 2 added the `SessionHistoryProps` interface to `SessionHistory.tsx`. This was the expected sequencing — both tasks had to be applied before `tsc --noEmit` passed clean. Both tasks committed separately after full compilation confirmed clean.

## User Setup Required
None — no external service configuration required. Client-only changes, no new dependencies.

## Next Phase Readiness
- Session navigation fully wired — any session row click now has a meaningful, visible effect
- Ready for Phase 30 (auto-record hook) and Phase 31 (recording storage cap)
- The `onPlayRecording` callback chain is complete: `App.tsx` → `HistoryView` → `SessionHistory` → `RecordingPlayer` (via `setCurrentView('recordings')`)

---
*Phase: 29-session-navigation*
*Completed: 2026-03-04*
