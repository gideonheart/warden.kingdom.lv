---
phase: 24-session-recording-replay
plan: 01
subsystem: recording-backend
tags: [recording, asciicast, sqlite, rest-api, pty-tap]
dependency_graph:
  requires: []
  provides: [recording-capture-service, recording-rest-api, recordings-db-table]
  affects: [TerminalStreamService, DatabaseConnection]
tech_stack:
  added: []
  patterns: [asciicast-v2-format, pty-output-tap, in-memory-frame-buffer]
key_files:
  created:
    - src/server/services/RecordingCaptureService.ts
    - src/server/routes/recordingRoutes.ts
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/services/TerminalStreamService.ts
    - src/server/index.ts
decisions:
  - "RecordingCaptureService holds in-memory frame buffer per session (Map<string, ActiveRecording>) — no intermediate disk writes, writes full asciicast v2 on stop"
  - "PTY output tap placed inside TerminalStreamService.ptyProcess.onData after the broadcast loop — zero-latency impact, uses same setImmediate-friendly pattern as Phase 11"
  - "Auto-stop recording on ptyProcess.onExit with reason 'session_ended' — guarantees .cast file is always written even if operator never clicks stop"
  - "recordingCaptureService singleton exported from service module — enables clean import from both TerminalStreamService and recordingRoutes without circular deps"
  - "DELETE /api/recordings/:id is best-effort file deletion — returns success even if file was already missing from disk"
metrics:
  duration_mins: 4
  completed_date: "2026-03-04"
  tasks_completed: 2
  files_changed: 6
---

# Phase 24 Plan 01: Recording Capture Backend Summary

**One-liner:** PTY output tap feeding in-memory asciicast v2 frame buffer, with SQLite recordings table, RecordingCaptureService singleton, and eight REST endpoints for start/stop/list/delete/download/content.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add RecordingEntry shared type and recordings DB table + CRUD methods | e45fe9d | src/shared/types.ts, src/server/database/DatabaseConnection.ts |
| 2 | Create RecordingCaptureService and recording API routes, wire into server | d824029 | src/server/services/RecordingCaptureService.ts, src/server/routes/recordingRoutes.ts, src/server/services/TerminalStreamService.ts, src/server/index.ts |

## What Was Built

### RecordingEntry Type (src/shared/types.ts)
Exported `RecordingEntry` interface with all fields needed for the recordings table: `id`, `sessionName`, `agentId`, `agentName`, `projectPath`, `startedAt`, `stoppedAt`, `durationSecs`, `filePath`, `fileSizeBytes`, `stopReason`.

### Recordings DB Table (src/server/database/DatabaseConnection.ts)
New `recordings` table migration added to `runMigrations()`. Includes indexes on `agent_id` and `started_at`. Four CRUD methods added: `insertRecording`, `findRecordingById`, `finaliseRecording`, `listRecordings`, `deleteRecording`.

### RecordingCaptureService (src/server/services/RecordingCaptureService.ts)
- `startRecording()` — creates DB row, initialises in-memory `ActiveRecording` with frame buffer
- `captureOutput()` — called from TerminalStreamService PTY tap; appends `[relativeSeconds, text]` frames
- `stopRecording()` — removes from active map, writes asciicast v2 file, calls `database.finaliseRecording()`
- `isRecording()`, `getRecordingId()`, `getElapsedMs()` — helper accessors
- `writeAsciicastFile()` — private method writing JSON header + per-frame NDJSON lines

### TerminalStreamService PTY Tap
- Import of `recordingCaptureService` added
- `captureOutput()` called in `ptyProcess.onData` handler after broadcast loop
- `stopRecording('session_ended')` called at top of `ptyProcess.onExit` handler

### Recording REST API (src/server/routes/recordingRoutes.ts)
Eight endpoints registered:
1. `GET /api/recordings` — list all recordings ordered by `started_at DESC`
2. `GET /api/recordings/active` — sessions with no `stoppedAt` (currently recording)
3. `POST /api/recordings/session/:sessionName/start` — start recording, returns `{recordingId}` or 409
4. `POST /api/recordings/session/:sessionName/stop` — stop and finalise, returns `RecordingEntry`
5. `GET /api/recordings/:id/elapsed` — elapsed ms for active recording
6. `DELETE /api/recordings/:id` — delete DB row and .cast file from disk
7. `GET /api/recordings/:id/download` — serve .cast with `Content-Disposition: attachment`
8. `GET /api/recordings/:id/content` — serve raw .cast for in-browser replay

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
npm run typecheck   → clean (zero errors)
npm run build       → exit 0 (vite + tsc both succeeded)

curl GET /api/recordings              → []
POST /api/recordings/session/test-session/start  → {"recordingId":1}
POST /api/recordings/session/test-session/stop   → full RecordingEntry JSON with durationSecs, fileSizeBytes
ls data/recordings/*.cast             → file present
Second POST start on same session     → {"error":"Already recording this session"} (HTTP 409)
sqlite3 data/warden.db ".tables"      → recordings table present
DELETE /api/recordings/:id            → removes DB row and .cast file
```

## Self-Check

### Files Created
- [x] `src/server/services/RecordingCaptureService.ts` — exists
- [x] `src/server/routes/recordingRoutes.ts` — exists

### Files Modified
- [x] `src/shared/types.ts` — RecordingEntry interface appended
- [x] `src/server/database/DatabaseConnection.ts` — import updated, migration added, CRUD methods added
- [x] `src/server/services/TerminalStreamService.ts` — import + captureOutput tap + stopRecording on exit
- [x] `src/server/index.ts` — recordingRoutes imported and mounted

### Commits
- [x] e45fe9d — feat(24-01): add RecordingEntry type and recordings DB table with CRUD methods
- [x] d824029 — feat(24-01): add RecordingCaptureService, recording REST API, and wire into server

## Self-Check: PASSED
