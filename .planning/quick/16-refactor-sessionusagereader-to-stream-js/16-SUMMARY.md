---
phase: quick-16
plan: 01
subsystem: server
tags: [readline, createReadStream, streaming, mutex, node-streams]

# Dependency graph
requires:
  - phase: 18
    provides: SessionUsageReader with readFile-based JSONL parsing
provides:
  - Streaming JSONL reader with constant memory usage
  - Scan overlap guard preventing concurrent scanAllProjects execution
affects: [token-usage, history-routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [readline-createInterface-over-createReadStream, boolean-mutex-scan-guard]

key-files:
  created: []
  modified:
    - src/server/services/SessionUsageReader.ts

key-decisions:
  - "readline createInterface with crlfDelay: Infinity for robust line splitting across OS line endings"
  - "Boolean flag mutex (not queue) for scan overlap: concurrent scans silently skip rather than queue"
  - "try/finally cleanup for both readline interface and read stream to prevent fd leaks"

patterns-established:
  - "Streaming JSONL: createReadStream + createInterface + for-await-of for memory-efficient line processing"
  - "Scan overlap guard: boolean flag checked at method entry, set before work, cleared in finally block"

requirements-completed: [STREAM-JSONL, SCAN-OVERLAP-GUARD]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Quick Task 16: Refactor SessionUsageReader to Stream JSONL Summary

**Streaming JSONL reader via readline+createReadStream with boolean mutex scan overlap guard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T09:24:12Z
- **Completed:** 2026-02-24T09:26:12Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced whole-file readFile with line-by-line createReadStream+createInterface streaming in processJsonlFile
- Added scanInProgress boolean guard to scanAllProjects preventing concurrent periodic and manual scans
- All existing token aggregation, cost computation, and upsert logic preserved unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace readFile with readline stream in processJsonlFile** - `7ae4e38` (refactor)
2. **Task 2: Add scan overlap guard to prevent concurrent scans** - `c767a5b` (feat)

## Files Created/Modified
- `src/server/services/SessionUsageReader.ts` - Streaming JSONL reader with scan overlap guard

## Decisions Made
- Used readline createInterface with crlfDelay: Infinity for robust line splitting across OS line endings
- Boolean flag mutex (not queue) for scan overlap: concurrent scans silently skip rather than queue, matching the existing POST endpoint behavior which returns a fast response
- try/finally cleanup for both readline interface and read stream to prevent file descriptor leaks on error paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SessionUsageReader now streams JSONL files with constant memory usage regardless of file size
- Scan overlap guard active for both periodic (5-minute interval) and manual (POST /api/history/token-usage/scan) scans
- Production build verified

## Self-Check: PASSED

- FOUND: src/server/services/SessionUsageReader.ts
- FOUND: commit 7ae4e38 (Task 1)
- FOUND: commit c767a5b (Task 2)

---
*Phase: quick-16*
*Completed: 2026-02-24*
