---
phase: 37-crash-detection-backend
plan: 02
subsystem: backend
tags: [crash-detection, telegram, lifecycle-events, notifications, rest-api]

dependency_graph:
  requires:
    - phase: 37-01
      provides: onCrashDetected callback on InstanceTracker, insertLifecycleEvent, getLifecycleEvents, session_lifecycle_events table
  provides:
    - Telegram crash notification pipeline via onCrashDetected callback in index.ts
    - GET /api/lifecycle-events endpoint with agentId, eventType, limit, offset filters
  affects: [Phase 40 lifecycle history UI, any future crash alerting features]

tech-stack:
  added: []
  patterns: [callback-wiring-at-startup, notification-failure-isolation, rest-filter-pagination]

key-files:
  created: []
  modified:
    - src/server/index.ts
    - src/server/routes/instanceRoutes.ts

key-decisions:
  - "onCrashDetected callback assigned after instanceTracker.startPeriodicSync() — ensures wiring is in place before first sync triggers any crash detection"
  - "Notification failure isolation via try/catch in callback — Telegram errors never propagate into crash detection flow"
  - "lifecycle-events endpoint placed in instanceRoutes (not a new route file) — logically grouped with instance management routes"

requirements-completed: [CRSH-06]

duration: 5min
completed: 2026-03-05
---

# Phase 37 Plan 02: Crash Detection Backend Summary

**Telegram crash notification pipeline wired via onCrashDetected callback sending formatted alert to agent's own Telegram topic, plus GET /api/lifecycle-events REST endpoint with filtering and pagination.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T02:54:00Z
- **Completed:** 2026-03-05T02:59:06Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Wired onCrashDetected callback in index.ts — looks up agent's topic mapping via openClawConfigReader, formats crash message with agent name, session name, project slug, uptime display, and UTC timestamp, sends via telegramBotService.sendToTopic
- Notification failures are fully isolated — try/catch in callback logs errors but never blocks crash detection or lifecycle event logging (which was already persisted in Plan 01's InstanceTracker before callback fires)
- Added GET /api/lifecycle-events endpoint supporting ?agentId, ?eventType, ?limit, ?offset query params returning { events: LifecycleEvent[], total: number } — ready for Phase 40 lifecycle history UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire crash notification to Telegram and add lifecycle-events API** - `54e1d7c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/server/index.ts` — Added openClawConfigReader import; added onCrashDetected callback wiring after instanceTracker.startPeriodicSync() with uptime formatting and Telegram send
- `src/server/routes/instanceRoutes.ts` — Added GET /api/lifecycle-events route with agentId/eventType/limit/offset query param filtering

## Decisions Made

- Callback assigned after `instanceTracker.startPeriodicSync()` so wiring is in place before any poll fires
- Uptime display formatted in human-readable form (e.g. "2m 35s", "1h 20m") matching operator UX expectations
- Route kept in instanceRoutes rather than a new file — lifecycle events are logically related to instance management

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Crash notifications use the same Telegram bot token and topic mappings already configured in openclaw.json.

## Next Phase Readiness

- Phase 37 is now complete (both plans 01 and 02 done)
- Phase 38 (or next phase in sequence) can consume GET /api/lifecycle-events immediately
- Phase 40 lifecycle history UI can query crashes, stops, starts with pagination

---
*Phase: 37-crash-detection-backend*
*Completed: 2026-03-05*

## Self-Check: PASSED

- `src/server/index.ts` exists and contains `onCrashDetected` callback — VERIFIED
- `src/server/routes/instanceRoutes.ts` exists and contains `lifecycle-events` route — VERIFIED
- Commit `54e1d7c` exists in git log — VERIFIED
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
