---
phase: 37-crash-detection-backend
plan: 01
subsystem: backend
tags: [crash-detection, lifecycle-events, sqlite, instance-tracker]
dependency_graph:
  requires: []
  provides: [session_lifecycle_events table, LifecycleEvent types, insertLifecycleEvent(), getLifecycleEvents(), onCrashDetected callback]
  affects: [DatabaseConnection, InstanceTracker, instanceRoutes]
tech_stack:
  added: []
  patterns: [missed-poll-grace-period, lifecycle-event-sourcing, startup-vs-runtime-detection]
key_files:
  created: []
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/services/InstanceTracker.ts
    - src/server/routes/instanceRoutes.ts
key_decisions:
  - "2-poll grace period (CRASH_GRACE_POLLS=2, ~20s) before declaring crash to prevent false alerts from transient glitches"
  - "initialSyncComplete flag suppresses 'started' events on server restart — pre-existing sessions are silently re-discovered"
  - "stopping status sessions skip crash detection path entirely; reconcileTransitionalStates handles them separately"
  - "onCrashDetected callback added to InstanceTracker as an extension point for Plan 02 Telegram notifications"
metrics:
  duration: "3m 10s"
  completed_date: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 37 Plan 01: Crash Detection Backend Summary

**One-liner:** Session crash detection with 2-poll grace period, lifecycle event sourcing to SQLite, and operator-stop disambiguation via missedPollCounts Map in InstanceTracker.

## What Was Built

Two tasks executed to completion:

**Task 1 — session_lifecycle_events table and LifecycleEvent types (commit 6e1d4bb)**

- Added `LifecycleEventType` union type and `LifecycleEvent` interface to `src/shared/types.ts`
- Added `session_lifecycle_events` SQLite table migration to `DatabaseConnection.runMigrations()` with columns: session_id, agent_id, session_name, event_type, timestamp, outcome, uptime_secs, project_slug, last_known_state, stop_reason
- Added 3 indexes: by agent_id, event_type, timestamp
- Implemented `insertLifecycleEvent()` method for persisting lifecycle transitions
- Implemented `getLifecycleEvents()` method with optional agentId/eventType filtering, limit/offset pagination, ordered by timestamp DESC

**Task 2 — Crash detection and lifecycle event logging (commit a58f3ec)**

- Rewrote `InstanceTracker` with `missedPollCounts: Map<string, number>` for consecutive miss tracking
- Added `CRASH_GRACE_POLLS = 2` constant — sessions must miss 2 consecutive polls (~20s) before crash is declared
- Added `initialSyncComplete: boolean` flag to distinguish server startup discovery from new session detection
- Added `detectCrashesAndMarkStopped()` private method that: skips 'stopping' sessions, increments miss counts for active/idle, fires 'crashed' lifecycle event and marks instance 'stopped' after grace period expires
- Active sessions clear their miss count on each poll pass
- On server restart (first sync): no 'started' or 'crashed' events fired — pre-existing sessions are re-discovered silently
- `reconcileTransitionalStates()` now logs lifecycle events for: graceful stop (outcome: 'graceful'), force-killed stop (outcome: 'force-killed'), start-failed (outcome: 'timeout', eventType: 'stopped', stopReason: 'start-failed')
- `instanceRoutes.ts` stop endpoint now logs 'stopped' lifecycle events for all three stop outcomes: already-gone, graceful, force-killed
- `onCrashDetected` public callback added to `InstanceTracker` for downstream wiring (Plan 02 Telegram notifications)

## Verification Results

All criteria pass:

1. `npx tsc --noEmit` — PASS (no type errors)
2. LifecycleEvent type exported from src/shared/types.ts — PASS
3. session_lifecycle_events migration in DatabaseConnection.runMigrations() — PASS
4. insertLifecycleEvent() and getLifecycleEvents() methods exist — PASS
5. missedPollCounts Map with 2-poll grace period — PASS
6. 'stopping' sessions skip crash detection path — PASS
7. initialSyncComplete prevents startup false alerts — PASS
8. onCrashDetected callback defined and called — PASS
9. `npm run build` — PASS

## Commits

| Hash | Message |
|------|---------|
| 6e1d4bb | feat(37-01): add session_lifecycle_events table and LifecycleEvent types |
| a58f3ec | feat(37-01): implement crash detection and lifecycle event logging in InstanceTracker |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All key files exist and both commits verified in git log.
