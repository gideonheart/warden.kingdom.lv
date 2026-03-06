---
phase: 38-auto-restart-engine
plan: 02
subsystem: server-services, database, client-ui
tags: [auto-restart, crash-recovery, rate-limiting, telegram, toast-notification, sqlite]

# Dependency graph
requires:
  - phase: 38-01
    provides: session_lifecycle_policy table, getRestartPolicy(), CrashRestartMode type
  - phase: 37-02
    provides: onCrashDetected callback, insertLifecycleEvent(), LifecycleEventType
provides:
  - AutoRestartService class with attemptRestart(), isRateLimited(), handleStormDetected()
  - markStormDisabled() method in DatabaseConnection
  - Auto-restart wired into onCrashDetected callback in index.ts
  - Toast notification in App.tsx for operator awareness of auto-restarts
affects:
  - 38-03 (if any) — auto-restart produces new sessions visible in tab bar

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget restart via void keyword — async restart with delay does not block crash detection callback"
    - "Sliding window rate limiter using in-memory Map<agentId, number[]> — pruned on each check"
    - "Pre-register instance in DB with 'starting' status before spawning tmux session — UI tab appears immediately"
    - "Toast detection: previousInstanceIdsRef tracks known IDs across polls; new ID + stopped sibling = auto-restart signal"

key-files:
  created:
    - src/server/services/AutoRestartService.ts
  modified:
    - src/server/database/DatabaseConnection.ts
    - src/server/index.ts
    - src/client/App.tsx

key-decisions:
  - "38-02: Record restart timestamp after both success and failure — storm limiter counts attempts, not just successes"
  - "38-02: Pre-register instance as 'starting' before spawning so UI tab appears during the 7s delay period"
  - "38-02: handleStormDetected receives crashedSessionId as parameter — avoids additional DB lookup for lifecycle event"
  - "38-02: Toast detection uses previousInstanceIdsRef + stopped sibling check — no server-side event stream needed"

patterns-established:
  - "AutoRestartService: read policy → check rate limit → delay → spawn → log outcome → record timestamp"
  - "Storm detection: flip policy in DB + lifecycle event + Telegram alert, all wrapped in try/catch"

requirements-completed: [CRSH-04, CRSH-05]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 38 Plan 02: Auto-Restart Engine Summary

**AutoRestartService with 7s delay spawn, sliding-window storm limiter (3/hr per agent), lifecycle event logging, and operator toast notification**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-05T03:30:55Z
- **Completed:** 2026-03-05T03:33:18Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Created `AutoRestartService` with `attemptRestart()`, `isRateLimited()`, `recordRestart()`, `handleStormDetected()` — full restart execution engine
- Pre-registration pattern: instance inserted with 'starting' status before tmux spawn so UI tab appears during the 7s delay
- Sliding window rate limiter using in-memory `Map<string, number[]>` — per-agent timestamps pruned on each `isRateLimited()` call
- Storm detection: `database.markStormDisabled(agentId)` flips crash_restart_mode to 'none' + records storm_disabled_at; Telegram alert sent via existing `telegramBotService.sendToTopic`
- Lifecycle events logged for all outcomes: success, failed, storm-disabled
- Added `markStormDisabled()` to `DatabaseConnection` using upsert pattern for safe operation without pre-existing row
- Wired `autoRestartService.attemptRestart()` as `void` (fire-and-forget) in `onCrashDetected` callback — crash detection not blocked by 7s delay
- Added `ToastMessage` interface and auto-restart toast in `App.tsx`: detects new session + stopped sibling for same agent, auto-dismisses after 5s, positioned bottom-right with warden-* theme tokens

## Task Commits

1. **Task 1: Create AutoRestartService with rate limiter and wire into crash detection** - `8778dbe` (feat)
2. **Task 2: Add auto-restart toast notification and build verification** - `3849535` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/server/services/AutoRestartService.ts` — NEW: AutoRestartService class with restart execution, sliding window rate limiter, storm detection
- `src/server/database/DatabaseConnection.ts` — Added `markStormDisabled()` method
- `src/server/index.ts` — Imported autoRestartService, wired into onCrashDetected callback
- `src/client/App.tsx` — Added ToastMessage type, toast state, previousInstanceIdsRef detection logic, toast render

## Decisions Made

- Restart timestamps are recorded after both successful and failed spawn attempts — storm limiter counts all attempts, not just successes. This prevents repeated failed restarts from draining the storm budget silently.
- Instance is pre-registered in DB with 'starting' status before calling `createSessionWithClaude` — this makes the new tab appear in the UI during the 7s delay window, giving the operator visual feedback that a restart is in progress.
- `handleStormDetected` receives `crashedSessionId` directly as a parameter rather than querying the DB again — avoids an extra lookup and keeps the storm handler simple.
- Toast detection on client uses `previousInstanceIdsRef` + stopped sibling check — no server-side event stream or new endpoint needed for operator awareness.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 38 complete: all 2 plans done (restart policy config layer + auto-restart execution engine)
- Auto-restart is fully operational: crashed agents with 'once' or 'always' policy will automatically spawn new sessions
- Storm limiter protects against restart loops — after 3 restarts in 1 hour, policy flips to 'none' and operator receives Telegram alert
- Operator sees toast notification when auto-restart creates a new session alongside a crashed one

## Self-Check: PASSED

- `src/server/services/AutoRestartService.ts` confirmed on disk
- `markStormDisabled()` confirmed in DatabaseConnection.ts
- `autoRestartService.attemptRestart` confirmed in index.ts onCrashDetected callback
- Toast logic confirmed in App.tsx (ToastMessage type, useEffect, render block)
- Task 1 commit `8778dbe` confirmed in git log
- Task 2 commit `3849535` confirmed in git log
- `npx tsc --noEmit` passed with zero errors
- `npm run build` succeeded (Vite client + tsc server)

---
*Phase: 38-auto-restart-engine*
*Completed: 2026-03-05*
