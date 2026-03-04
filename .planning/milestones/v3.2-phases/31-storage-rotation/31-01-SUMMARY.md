---
phase: 31-storage-rotation
plan: "01"
subsystem: database
tags: [sqlite, better-sqlite3, recording, storage-rotation, two-phase-deletion]

# Dependency graph
requires:
  - phase: 30-auto-record-per-agent
    provides: RecordingCaptureService, auto_record_config table, recordings table
provides:
  - rotation_config table with single-row CHECK(id=1) storage cap
  - deletion_pending column on recordings for two-phase deletion safety
  - 7 new DB methods: getRotationConfig, setRotationConfig, getStorageStats, getRotationCandidates, markDeletionPending, isRecordingPendingDeletion, getDeletionPendingRecordings
  - RecordingRotationService with 5-minute periodic scheduler and synchronous runRotation logic
  - 4 REST endpoints: GET/PUT /rotation-config, GET /storage-stats, POST /rotation/prune
  - deletion_pending guard on GET /api/recordings/:id/content
affects: [31-storage-rotation-ui, future-recording-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-row config table with CHECK(id=1) constraint (mirrors budget_config pattern)
    - Two-phase deletion: markDeletionPending before fs.unlinkSync, then deleteRecording
    - Orphan cleanup on service startup: query deletion_pending=1 rows, clean up any missed deletes from crashes
    - Literal-before-param route ordering: all /storage-stats, /rotation-config, /rotation/prune routes placed before /:id routes
    - Synchronous rotation using better-sqlite3 (no async needed)

key-files:
  created:
    - src/server/services/RecordingRotationService.ts
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/routes/recordingRoutes.ts
    - src/server/index.ts

key-decisions:
  - "getDeletionPendingRecordings added as separate DB method (not reusing getRotationCandidates) — pending rows have deletion_pending=1 while candidates have deletion_pending=0"
  - "runRotation is synchronous — better-sqlite3 and fs.unlinkSync are both sync, no async needed"
  - "Startup cleanup (orphan pending rows) runs inside runRotation, not separately — single entrypoint for all rotation logic"
  - "capBytes=0 means disabled — check after orphan cleanup so startup always cleans up regardless of cap setting"

patterns-established:
  - "Single-row config table: id INTEGER PRIMARY KEY CHECK (id = 1) with INSERT OR REPLACE upsert"
  - "Two-phase deletion: markDeletionPending -> fs.unlinkSync -> deleteRecording, with getDeletionPendingRecordings for crash recovery"

requirements-completed: [ROT-01, ROT-02]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 31 Plan 01: Storage Rotation Backend Summary

**SQLite rotation_config table + deletion_pending two-phase safety + RecordingRotationService with 5-minute periodic pruning and 4 REST endpoints**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T21:23:04Z
- **Completed:** 2026-03-04T21:25:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created)

## Accomplishments

- Storage cap persisted in rotation_config single-row SQLite table with CHECK(id=1) constraint
- Two-phase deletion: deletion_pending column guards against deleting files mid-playback; orphan cleanup runs on every startup
- RecordingRotationService runs on 5-minute interval, skips active recording sessions via isRecording() guard
- Four REST endpoints (all literal-path, before /:id routes): GET /storage-stats, GET/PUT /rotation-config, POST /rotation/prune
- Content endpoint returns 404 for deletion_pending recordings
- Build passes: vite client + tsc server both succeed with zero type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types + DB migration + DB methods** - `c6a2a26` (feat)
2. **Task 2: RecordingRotationService + REST endpoints + server wiring** - `9135a0b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/shared/types.ts` - Added RotationConfig and StorageStats interfaces
- `src/server/database/DatabaseConnection.ts` - Added rotation_config table migration, deletion_pending column migration, 7 new DB methods
- `src/server/services/RecordingRotationService.ts` - New service: periodic scheduler, runRotation with orphan cleanup + pruning logic
- `src/server/routes/recordingRoutes.ts` - Added 4 rotation endpoints + deletion_pending guard on content endpoint
- `src/server/index.ts` - Import + startPeriodicRotation on boot + stopPeriodicRotation on shutdown

## Decisions Made

- Used a separate `getDeletionPendingRecordings()` DB method instead of reusing `getRotationCandidates()` — the two queries are inverses (pending=1 vs pending=0) and serve different purposes
- `runRotation()` is synchronous throughout — better-sqlite3 and Node.js `fs.unlinkSync` are both synchronous, no async needed
- Orphan cleanup runs inside `runRotation()` (not in a separate method) so both startup cleanup and periodic pruning use the same code path
- `capBytes=0` check happens after orphan cleanup — ensures crash-recovery always runs regardless of whether a cap is configured

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added getDeletionPendingRecordings DB method**
- **Found during:** Task 2 (RecordingRotationService creation)
- **Issue:** Plan described querying `deletion_pending=1` rows in the service but provided no DB method for it; the private `getPendingDeletionRows` placeholder in initial draft was incorrect
- **Fix:** Added `getDeletionPendingRecordings(): Array<{id, filePath}>` to DatabaseConnection, used it directly in runRotation
- **Files modified:** src/server/database/DatabaseConnection.ts
- **Verification:** TypeScript compiles cleanly, logic correct
- **Committed in:** c6a2a26 (Task 1 commit) + 9135a0b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical DB method)
**Impact on plan:** Essential for correctness. No scope creep.

## Issues Encountered

None — plan executed cleanly after adding the missing DB method.

## User Setup Required

None - no external service configuration required. Storage cap defaults to 0 (disabled) until configured via PUT /api/recordings/rotation-config.

## Next Phase Readiness

- Backend rotation system is fully operational
- Phase 31 Plan 02 (UI for storage cap configuration) can now be built on top of these 4 REST endpoints
- GET /storage-stats provides totalBytes, recordingCount, capBytes for the UI
- PUT /rotation-config and POST /rotation/prune are ready to wire to UI controls

## Self-Check: PASSED

All files verified present on disk. Both task commits confirmed in git log.

---
*Phase: 31-storage-rotation*
*Completed: 2026-03-04*
