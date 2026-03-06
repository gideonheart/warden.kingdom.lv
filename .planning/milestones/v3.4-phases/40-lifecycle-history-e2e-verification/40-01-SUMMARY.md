---
phase: 40-lifecycle-history-e2e-verification
plan: 01
subsystem: ui
tags: [react, typescript, lifecycle, history, sqlite, tailwind]

# Dependency graph
requires:
  - phase: 37-crash-detection-backend
    provides: session_lifecycle_events table and insertLifecycleEvent/getLifecycleEvents DB methods

provides:
  - LifecycleEventsView React component with agentId/eventType filters and pagination
  - Lifecycle tab in HistoryView (desktop + mobile)
  - NaN-guarded limit/offset in GET /api/lifecycle-events (TD-5 closed)
  - Force-kill lifecycle event logging in POST /api/instances/:id/force-kill (TD-4 closed)

affects: [phase-40-02, e2e-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fetch-on-filter pattern with useCallback + useEffect (same as SessionHistory)"
    - "Event type color badge via lookup table with fallback"
    - "NaN-guard pattern for parseInt query params: parse → isNaN check → fallback to undefined"

key-files:
  created:
    - src/client/components/LifecycleEventsView.tsx
  modified:
    - src/server/routes/instanceRoutes.ts
    - src/client/components/HistoryView.tsx
    - tests/e2e/dashboard.spec.ts

key-decisions:
  - "Lifecycle tab placed second in tabs array (after Sessions) for prominence"
  - "Replaced stale 'Activity' E2E assertion with 'Lifecycle' — 'Activity' tab never existed in codebase"
  - "Pagination always shown (even single page) for consistent UX — matches plan spec"
  - "Force-kill lifecycle event wrapped inside existing try/catch — logging failure doesn't break stop response"

patterns-established:
  - "NaN guard: rawVal !== undefined && !Number.isNaN(rawVal) ? rawVal : undefined — use for all parseInt query params"
  - "Event lifecycle insert after status update, before response.json() — ensures DB record before client ACK"

requirements-completed: [HIST-01, HIST-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 40 Plan 01: Lifecycle History UI Summary

**Lifecycle events history tab added to HistoryView with agentId/eventType filters, event type color badges, pagination, and two tech-debt fixes (NaN guard for parseInt query params, force-kill lifecycle event logging)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T04:19:43Z
- **Completed:** 2026-03-05T04:22:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Closed TD-5: NaN-guard added to `GET /api/lifecycle-events` so non-numeric `?limit=abc` falls back to DB default (50) instead of producing LIMIT 0
- Closed TD-4: Force-kill route now logs a `stopped/force-killed` lifecycle event to the database matching the regular stop endpoint pattern
- Created `LifecycleEventsView.tsx` (161 lines) with agentId text filter, eventType dropdown (all/crashed/auto-restarted/idle-timeout/stopped/started), color-coded event type badges, pagination (25/page), loading spinner, and empty state
- Wired `LifecycleEventsView` as the second tab ('Lifecycle') in `HistoryView` for both desktop tabs and mobile accordion layout
- Fixed stale E2E assertion (dashboard.spec.ts line 38 referenced non-existent 'Activity' button) — replaced with correct 'Lifecycle' check

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix tech-debt gaps in instanceRoutes.ts (TD-4 and TD-5)** - `881b9b4` (fix)
2. **Task 2: Create LifecycleEventsView component and add Lifecycle tab to HistoryView** - `8a7c14e` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/client/components/LifecycleEventsView.tsx` - New: lifecycle events table with filters, pagination, event type badges
- `src/client/components/HistoryView.tsx` - Added Lifecycle tab entry and LifecycleEventsView import/render
- `src/server/routes/instanceRoutes.ts` - TD-4: force-kill lifecycle event; TD-5: NaN guard for limit/offset
- `tests/e2e/dashboard.spec.ts` - Replaced stale 'Activity' assertion with 'Lifecycle' tab check

## Decisions Made
- Lifecycle tab placed second (after Sessions) for operator visibility — lifecycle events are the most actionable v3.4 history data
- Replaced stale 'Activity' E2E assertion — the 'Activity' button never existed in the current HistoryView; this was a leftover from an earlier design iteration
- Force-kill lifecycle insert placed inside the existing try/catch — logging failure silently skips the event log rather than returning a 500 to the client

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale E2E assertion referencing non-existent 'Activity' tab**
- **Found during:** Task 2 (HistoryView update)
- **Issue:** `dashboard.spec.ts` line 38 asserted `getByRole('button', { name: 'Activity' })` — this button was never rendered in HistoryView (the tab doesn't exist in the codebase). The test would fail when run.
- **Fix:** Replaced 'Activity' assertion with 'Lifecycle' assertion (matching the new tab being added in this task)
- **Files modified:** tests/e2e/dashboard.spec.ts
- **Verification:** Build succeeds; assertion now targets real DOM element
- **Committed in:** 8a7c14e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test)
**Impact on plan:** The plan specifically mentioned updating E2E tests for the Lifecycle tab; fixing the stale 'Activity' assertion was a necessary part of that work.

## Issues Encountered
None — TypeScript compiled with zero errors on first attempt; production build succeeded immediately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lifecycle history UI is complete and production-built; ready for Phase 40 Plan 02 E2E verification
- Both TD-4 and TD-5 are closed — lifecycle history is now complete (force-kill events visible in UI)
- HIST-01 and HIST-02 requirements satisfied

---
*Phase: 40-lifecycle-history-e2e-verification*
*Completed: 2026-03-05*

## Self-Check: PASSED

- FOUND: src/client/components/LifecycleEventsView.tsx
- FOUND: src/client/components/HistoryView.tsx
- FOUND: src/server/routes/instanceRoutes.ts
- FOUND: .planning/phases/40-lifecycle-history-e2e-verification/40-01-SUMMARY.md
- FOUND: 881b9b4 (fix(40-01): close TD-4 and TD-5 in instanceRoutes.ts)
- FOUND: 8a7c14e (feat(40-01): add LifecycleEventsView and Lifecycle tab to HistoryView)
