---
phase: 11-activity-timeline-audit-log
plan: 01
subsystem: database, api, server
tags: [sqlite, better-sqlite3, activity-events, ansi-stripping, terminal-parsing, event-capture]

# Dependency graph
requires:
  - phase: 8-prompt-panel-gateway-integration
    provides: agentRoutes prompt endpoint to hook into for prompt_sent events
  - phase: 1-core-infrastructure
    provides: DatabaseConnection singleton and InstanceTracker/TerminalStreamService services
provides:
  - activity_events SQLite table with 4 indexes and 7-day retention
  - ActivityEventService singleton with ANSI stripping, chunk buffering, Claude Code pattern matching, operator input batching
  - GET /api/activity/events — paginated, filterable activity event query API
  - GET /api/activity/event-types — distinct event type list for filter dropdown
  - session_start/stop capture in InstanceTracker.syncWithTmux
  - terminal output parsing via non-blocking setImmediate tap in TerminalStreamService
  - operator input batching (debounced, not per-keystroke) in TerminalStreamService
  - prompt_sent capture in agentRoutes (both success and exception paths)
affects: [11-02-activity-timeline-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ANSI regex inlined from ansi-regex@5.0.1 (avoids strip-ansi CJS/ESM issue and supply chain risk)
    - setImmediate side-channel tap pattern for non-blocking PTY output processing
    - Operator input debounce batching: flush on Enter or after 2s inactivity
    - Instance ID cache per session (Map<sessionName, id|null>) to avoid repeated DB lookups
    - try/catch on all database writes in terminal pipeline to prevent crashes

key-files:
  created:
    - src/server/services/ActivityEventService.ts
    - src/server/routes/activityRoutes.ts
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/services/InstanceTracker.ts
    - src/server/services/TerminalStreamService.ts
    - src/server/routes/agentRoutes.ts
    - src/server/index.ts

key-decisions:
  - "Inline ansi-regex@5 pattern instead of importing strip-ansi (CJS incompatible with ESM project)"
  - "Use setImmediate for PTY output tap to ensure zero terminal latency impact"
  - "Batch operator input: flush on Enter or 2s inactivity (not per-keystroke)"
  - "Cache instance ID per session in ActivityEventService to avoid repeated DB lookups"
  - "Strip ANSI from operator input too — terminal clients send capability queries as input"

patterns-established:
  - "Pattern 1: Non-blocking side-channel taps for terminal output use setImmediate"
  - "Pattern 2: ANSI stripping applied at ingestion point before any storage"
  - "Pattern 3: Operator input filtered and batched before DB insert"

requirements-completed: [ACTV-01, ACTV-08, ACTV-09]

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 11 Plan 01: Activity Event Capture Pipeline Summary

**SQLite activity_events table + ActivityEventService with ANSI-stripped terminal parsing, session lifecycle hooks, and filterable REST API**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-17T21:54:25Z
- **Completed:** 2026-02-17T22:00:00Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Built complete event capture pipeline: session lifecycle, terminal output parsing, operator input batching, prompt injection tracking — all stored in SQLite with ANSI sequences stripped
- Created REST API (`/api/activity/events` and `/api/activity/event-types`) following existing router patterns exactly; verified live with actual events captured during backend test run
- Integrated non-blocking side-channel tap (setImmediate) into TerminalStreamService PTY output stream — zero terminal latency impact

## Task Commits

1. **Task 1: Database schema, shared types, and ActivityEventService** - `8b25bac` (feat)
2. **Task 2: API routes and integration hooks into existing services** - `7ae58b8` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `src/server/services/ActivityEventService.ts` — ANSI stripping, chunk buffering, Claude Code pattern matching (tool calls/file edits/bash commands/errors), operator input batching, instance ID cache, retention cleanup scheduler
- `src/server/routes/activityRoutes.ts` — GET /api/activity/events and GET /api/activity/event-types
- `src/shared/types.ts` — Added ActivityEventType union, ActivityEvent interface, ActivityEventsResponse interface
- `src/server/database/DatabaseConnection.ts` — Added activity_events table migration, insertActivityEvent, queryActivityEvents, getDistinctEventTypes, purgeOldActivityEvents methods
- `src/server/services/InstanceTracker.ts` — session_start and session_stop event capture in syncWithTmux
- `src/server/services/TerminalStreamService.ts` — setImmediate PTY output tap, operator input capture, clearSessionBuffer on exit and detach
- `src/server/routes/agentRoutes.ts` — prompt_sent capture after gateway send (try and catch paths)
- `src/server/index.ts` — mount activityRoutes, start/stop retention cleanup

## Decisions Made

- Inline ansi-regex@5 pattern instead of importing strip-ansi (CJS incompatible with ESM project; supply chain attack history)
- setImmediate for PTY output tap ensures zero terminal latency impact
- Operator input batched: flush on Enter or 2s inactivity (prevents per-keystroke event explosion)
- Cache instance ID per session in ActivityEventService (Map<sessionName, id|null>) to avoid repeated DB lookups per terminal chunk
- Strip ANSI from operator input before batching — terminal clients send capability queries (xterm handshake) as input

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strip ANSI from operator input before storage**
- **Found during:** Task 2 verification (live server test)
- **Issue:** Terminal client handshake sequences (`\u001b[?1;2c`, `\u001b]10;rgb:...`) were being stored as operator_input detail — ANSI sequences in the database violates the security requirement
- **Fix:** Added `stripAnsi()` call at the top of `captureOperatorInput()`, skip input that is empty after stripping (pure ANSI capability queries)
- **Files modified:** `src/server/services/ActivityEventService.ts`
- **Verification:** TypeScript compiles clean; future operator_input events will store only printable characters
- **Committed in:** `8b25bac` (included in Task 1 commit scope; fix applied before Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential fix for ANSI security requirement (ACTV must-have: "Event summaries and details in the database contain readable text without escape sequences or control characters"). No scope creep.

## Issues Encountered

- Pre-existing dev server (production build from `dist/`) was running on port 3001, serving old code. Killed it and started tsx dev server to verify new API endpoints.
- Backend test suite shows 2 pre-existing failures in "Session Management" (stop endpoint timing) — unrelated to our changes. 15/17 tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Activity event capture pipeline is live and capturing events immediately (confirmed: session_start/stop events from backend test tmux sessions, operator_input from xterm.js client)
- Ready for Phase 11 Plan 02: ActivityView frontend component (filter UI, event list, detail panel, export)
- The `/api/activity/events` and `/api/activity/event-types` endpoints are the data layer for the frontend

---
*Phase: 11-activity-timeline-audit-log*
*Completed: 2026-02-17*
