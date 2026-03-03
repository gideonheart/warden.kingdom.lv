---
phase: 18-fix-token-usage-jsonl-session-reader-and-database-population
plan: 01
subsystem: database
tags: [sqlite, jsonl, token-usage, better-sqlite3, typescript]

# Dependency graph
requires: []
provides:
  - SessionUsageReader service that scans ~/.claude/projects/ JSONL files and populates token_usage table
  - TokenUsageRow shared interface for structured token upserts
  - upsertTokenUsage() DB method with INSERT ON CONFLICT UPDATE semantics
  - cache_creation_input_tokens and cache_read_input_tokens columns in token_usage table
  - getTokenUsage() and getTokenUsageSummary() updated to include cache token fields
affects:
  - historyRoutes.ts (consumes getTokenUsage / getTokenUsageSummary — now returns cache columns)
  - TokenUsageView client component (can now display cache token data when wired up)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Singleton service (sessionUsageReader) matching InstanceTracker/GsdEventLogService pattern
    - Idempotent migration via ALTER TABLE ... ADD COLUMN wrapped in try/catch
    - Per-model pricing map with fallback to sonnet-4-6 pricing for unknown models
    - INSERT ON CONFLICT DO UPDATE SET for upsert semantics (no duplicates on re-run)

key-files:
  created:
    - src/server/services/SessionUsageReader.ts
  modified:
    - src/server/database/DatabaseConnection.ts
    - src/shared/types.ts

key-decisions:
  - "COALESCE for cache columns in getTokenUsage — backward-compatible reads when column is NULL in old rows"
  - "Upsert replaces full daily totals (not accumulates) — scanner always computes correct aggregate from all files"
  - "agentId derived by stripping leading dash from Claude project dir name (e.g. -home-forge-warden-kingdom-lv → home-forge-warden-kingdom-lv)"
  - "Model pricing map with fallback to sonnet-4-6 for unknown models — safe default for new model variants"
  - "readFile(utf-8) for full file reads (not tail-read) — accuracy over performance; files typically <2MB"
  - "Per-file try/catch in processJsonlFile — one bad file cannot stop the entire project scan"

patterns-established:
  - "Idempotent migration pattern: ALTER TABLE ADD COLUMN wrapped in try/catch for SQLite duplicate-column error"
  - "Singleton service exported as const from service module file"

requirements-completed: [TOKN-01, TOKN-02, TOKN-03]

# Metrics
duration: 9min
completed: 2026-02-23
---

# Phase 18 Plan 01: SessionUsageReader + token_usage schema Summary

**JSONL session token usage scanner: reads ~/.claude/projects/ JSONL files, aggregates by date, upserts into SQLite with cache token columns and per-model pricing**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-02-23T15:11:40Z
- **Completed:** 2026-02-23T15:20:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `cache_creation_input_tokens` and `cache_read_input_tokens` columns to token_usage table via idempotent ALTER TABLE migration
- Added `TokenUsageRow` shared interface and `upsertTokenUsage()` method with INSERT ON CONFLICT UPDATE semantics
- Updated `getTokenUsage()` and `getTokenUsageSummary()` to include cache token fields
- Created `SessionUsageReader` service (260 LOC) that recursively scans all Claude Code project JSONL files (top-level and subagents/) and populates the token_usage table
- Build passes cleanly (`npm run build` and `npm run typecheck`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update token_usage schema and add upsert method** - `7004a99` (feat)
2. **Task 2: Create SessionUsageReader service** - `943a316` (feat)

**Plan metadata:** (docs commit — created next)

## Files Created/Modified

- `src/server/services/SessionUsageReader.ts` - New singleton service: scans JSONL files, extracts assistant message usage, aggregates by date, upserts to DB. 5-minute periodic scan interval.
- `src/server/database/DatabaseConnection.ts` - Added upsertTokenUsage(), updated getTokenUsage()/getTokenUsageSummary() return types + queries to include cache columns, added idempotent ALTER TABLE migration
- `src/shared/types.ts` - Added TokenUsageRow interface

## Decisions Made

- COALESCE for cache columns in read queries — backward compatible with existing rows that have NULL in cache columns before migration runs
- Upsert replaces full daily totals (not accumulates) — scanner always computes correct daily aggregate from all source files, so replacing is idempotent and correct
- agentId derived by stripping leading dash from Claude project directory name (`-home-forge-warden-kingdom-lv` → `home-forge-warden-kingdom-lv`)
- Model pricing map with fallback to sonnet-4-6 pricing for unknown model names — safe default for new model variants not yet in the map
- Full `readFile` for JSONL parsing (not tail-read) — accuracy over performance; session files are typically <2MB

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `sessionUsageReader` singleton needs to be wired into `src/server/index.ts` to start scanning (not included in this plan — that's Phase 18 Plan 02).

## Next Phase Readiness

- `SessionUsageReader` is ready to be imported and started in `src/server/index.ts`
- `sessionUsageReader.startPeriodicScan()` call needed in server startup
- `historyRoutes.ts` may need to call `sessionUsageReader.scanAllProjects()` on the `/api/token-usage/refresh` endpoint if one is desired
- TokenUsageView client component can optionally be updated to display cache token columns

## Self-Check: PASSED

- FOUND: src/server/services/SessionUsageReader.ts
- FOUND: src/server/database/DatabaseConnection.ts
- FOUND: src/shared/types.ts
- FOUND: 18-01-SUMMARY.md
- FOUND commit: 7004a99 (Task 1)
- FOUND commit: 943a316 (Task 2)

---
*Phase: 18-fix-token-usage-jsonl-session-reader-and-database-population*
*Completed: 2026-02-23*
