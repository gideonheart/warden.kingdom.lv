---
phase: quick-14
plan: 01
subsystem: history-view, activity-infrastructure
tags: [dead-code-removal, refactor, cleanup]
dependency_graph:
  requires: []
  provides: [clean-history-view-3-tabs, no-activity-event-service]
  affects: [HistoryView, TerminalStreamService, InstanceTracker, agentRoutes, server-index, DatabaseConnection, shared-types]
tech_stack:
  added: []
  patterns: [dead-code-deletion, import-cleanup]
key_files:
  deleted:
    - src/client/components/ActivityView.tsx
    - src/client/components/ActivityEventRow.tsx
    - src/server/services/ActivityEventService.ts
    - src/server/routes/activityRoutes.ts
  modified:
    - src/client/components/HistoryView.tsx
    - src/server/services/TerminalStreamService.ts
    - src/server/services/InstanceTracker.ts
    - src/server/routes/agentRoutes.ts
    - src/server/index.ts
    - src/server/database/DatabaseConnection.ts
    - src/shared/types.ts
decisions:
  - "Kept activity_events CREATE TABLE IF NOT EXISTS migration — existing DBs have the table; idempotent, no DROP needed"
  - "Removed tmuxSessionManager import from TerminalStreamService — it was exclusively used for extractAgentIdFromSessionName in the now-deleted activity tap"
  - "Sessions tab set as default in HistoryView (was Activity) — most useful default for operators"
metrics:
  duration_seconds: 269
  completed_date: "2026-02-20"
  tasks_completed: 2
  files_deleted: 4
  files_modified: 7
---

# Quick Task 14: Remove Activity Tab and ActivityEventService Summary

**One-liner:** Deleted PTY regex-based Activity event pipeline (~800 LOC across 4 files) and 3-tab HistoryView replaces the previous 4-tab layout with Sessions as default.

## What Was Done

Removed the Activity tab infrastructure that used PTY output regex parsing to capture agent events. This approach produced lower-quality data than the Events tab's hook-based approach (introduced in Quick-10 through Quick-13). The removal eliminates ~800 LOC of dead code.

## Tasks Completed

### Task 1: Delete Activity client components and remove Activity tab from HistoryView

- Deleted `ActivityView.tsx` (275 LOC) — full-featured event browser with filters, pagination, CSV/JSON export
- Deleted `ActivityEventRow.tsx` (208 LOC) — expandable event row with success indicators, type badges, metadata display
- Updated `HistoryView.tsx`:
  - Removed `ActivityView` import
  - Changed `HistoryTab` type from `'sessions' | 'tokens' | 'logs' | 'activity'` to `'sessions' | 'tokens' | 'logs'`
  - Changed default tab from `'activity'` to `'sessions'`
  - Removed Activity tab from tabs array and desktop content panel
  - Removed Activity accordion from mobile layout; Sessions now opens by default

**Commit:** `ae8d2c5`

### Task 2: Remove ActivityEventService from server — delete service, routes, strip all references

- Deleted `ActivityEventService.ts` (~398 LOC) — PTY regex parser, operator input batcher, session buffer management, retention cleanup
- Deleted `activityRoutes.ts` — `/api/activity/events` and `/api/activity/event-types` endpoints
- `TerminalStreamService.ts`: removed `activityEventService` import, `setImmediate` side-channel tap in `onData`, `clearSessionBuffer` calls in `onExit` and `cleanupSession`, `captureOperatorInput` in `terminal:input` handler; also removed now-unused `tmuxSessionManager` import
- `InstanceTracker.ts`: removed `activityEventService` import, `captureSessionStart`/`captureSessionStop` calls; simplified `syncWithTmux` by removing previously-active snapshot logic
- `agentRoutes.ts`: removed `activityEventService` import, both `capturePromptSent` calls (success and catch paths)
- `index.ts`: removed `activityRoutes` import and `app.use(activityRoutes)`, removed `activityEventService` import, `startRetentionCleanup()` and `stopRetentionCleanup()` calls
- `DatabaseConnection.ts`: removed `ActivityEvent` type import, removed `insertActivityEvent`, `updateActivityEventSuccess`, `queryActivityEvents`, `getDistinctEventTypes`, `purgeOldActivityEvents` methods; kept `activity_events` CREATE TABLE IF NOT EXISTS migration for existing DB compatibility
- `shared/types.ts`: removed `ActivityEventType`, `ActivityEvent`, `ActivityEventsResponse` types

**Commit:** `cca98cf`

## Verification

All success criteria met:

- `npx tsc --noEmit` — zero TypeScript errors (both tasks)
- `npm run build` — production build succeeded (vite + tsc server)
- `grep -r "ActivityEvent|activityEvent|ActivityView|ActivityEventRow|activityRoutes" src/` — zero results
- `grep -r "activity_events" src/server/database/` — only CREATE TABLE IF NOT EXISTS migration (acceptable)
- HistoryView.tsx has exactly 3 tabs: sessions, tokens, logs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing cleanup] Removed unused tmuxSessionManager import from TerminalStreamService**
- **Found during:** Task 2
- **Issue:** After removing the `activityEventService.processTerminalChunk` call (which needed `tmuxSessionManager.extractAgentIdFromSessionName`), the `tmuxSessionManager` import became unused — a TypeScript compile error risk
- **Fix:** Removed the `import { tmuxSessionManager }` line from TerminalStreamService.ts
- **Files modified:** `src/server/services/TerminalStreamService.ts`
- **Commit:** `cca98cf`

## Self-Check: PASSED

Files deleted confirmed missing (as expected):
- `src/client/components/ActivityView.tsx` — DELETED
- `src/client/components/ActivityEventRow.tsx` — DELETED
- `src/server/services/ActivityEventService.ts` — DELETED
- `src/server/routes/activityRoutes.ts` — DELETED

Commits confirmed:
- `ae8d2c5` — Task 1
- `cca98cf` — Task 2
