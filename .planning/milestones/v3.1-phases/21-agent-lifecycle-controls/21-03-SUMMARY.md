---
phase: 21-agent-lifecycle-controls
plan: 03
subsystem: database
tags: [sqlite, better-sqlite3, sql, lifecycle]

# Dependency graph
requires:
  - phase: 21-agent-lifecycle-controls
    provides: lifecycle API endpoints (stop/start/restart), client-side lifecycle UI with restart buttons

provides:
  - listActiveInstances() includes recently-stopped and recently-errored sessions for 30 minutes, enabling operator restart access

affects:
  - GET /api/instances response (now includes recently-stopped/error sessions)
  - InstanceTabBar (stopped tabs persist for Restart button click)
  - TerminalView (stopped overlays persist for Restart button click)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "30-minute retention window pattern: stopped/error sessions kept in active query to allow operator action before aging out"

key-files:
  created: []
  modified:
    - src/server/database/DatabaseConnection.ts

key-decisions:
  - "30-minute retention window for stopped/error sessions: balances restart access vs tab bar clutter"
  - "OR clause added to existing WHERE instead of UNION: simpler, readable, single-pass query"
  - "No client-side changes needed: App.tsx already includes stopped/error in activeInstances filter per 21-02 decision"

patterns-established:
  - "Temporal retention window: use datetime('now', '-N minutes') for time-bounded visibility of terminal states"

requirements-completed: [ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 21 Plan 03: Stopped Session Visibility Gap Closure Summary

**Single SQL OR clause added to listActiveInstances() retains stopped/error sessions for 30 minutes, closing the gap that prevented operators from clicking Restart on stopped tabs**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-04T00:00:00Z
- **Completed:** 2026-03-04T00:05:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Extended `listActiveInstances()` SQL query to include `stopped` and `error` sessions whose `last_active_at` is within the last 30 minutes
- Stopped and errored session tabs now persist in the tab bar for 30 minutes, allowing operators to click Restart
- Sessions older than 30 minutes in terminal states are excluded, preventing indefinite tab bar clutter
- Build passes cleanly with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend listActiveInstances to include recently-stopped and recently-errored sessions** - `93b4f4a` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/server/database/DatabaseConnection.ts` — Added `OR (status IN ('stopped', 'error') AND last_active_at >= datetime('now', '-30 minutes'))` clause to `listActiveInstances()` query with explanatory comment

## Decisions Made

- Used an `OR` clause rather than a `UNION` query — simpler, more readable, same single-pass performance for small instance counts
- 30-minute window chosen to match the "recent enough to restart" intent without persistent clutter
- No client-side changes required because `App.tsx` `activeInstances` filter already includes `'stopped'` and `'error'` statuses (established in Phase 21 Plan 02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The full restart-from-stopped-tab flow is now end-to-end complete: stop a session → tab persists with gray badge → click Restart → session restarts
- Phase 21 (Agent Lifecycle Controls) is feature-complete across all three plans:
  - 21-01: Server-side lifecycle API (start/stop/restart endpoints)
  - 21-02: Client-side lifecycle UI (badges, buttons, overlays, confirmation dialogs)
  - 21-03: Gap closure — stopped session visibility for 30 minutes
- Ready to proceed to next phase (Phase 22+)

---
*Phase: 21-agent-lifecycle-controls*
*Completed: 2026-03-04*
