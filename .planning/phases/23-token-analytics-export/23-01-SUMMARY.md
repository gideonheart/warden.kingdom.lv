---
phase: 23-token-analytics-export
plan: 01
subsystem: database, api
tags: [sqlite, better-sqlite3, csv-export, token-analytics, model-comparison]

# Dependency graph
requires:
  - phase: 22-token-burn-rate-budget-alerts
    provides: token_usage table and upsertTokenUsage() pattern that per-model tracking extends

provides:
  - token_usage_by_model SQLite table with UNIQUE(agent_id, date, model) and index
  - upsertTokenUsageByModel(), getModelComparison(), getTokenUsageForExport() database methods
  - SessionUsageReader per-model accumulation alongside existing daily totals
  - GET /api/history/model-comparison endpoint with agentId/dateFrom/dateTo filters
  - GET /api/history/token-usage/export endpoint returning full dataset as CSV attachment

affects: [23-02-client-ui, plan-02, token-analytics-export-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-model accumulation inside same JSONL loop iteration as daily totals — same record processed twice (daily Map, model Map) in one pass to avoid divergence"
    - "Nested Map<date, Map<model, UsageAccumulator>> for per-model-per-day aggregation"
    - "CSV response with Content-Disposition attachment header — no new library, server-side string join"

key-files:
  created: []
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/services/SessionUsageReader.ts
    - src/server/routes/historyRoutes.ts

key-decisions:
  - "processJsonlFile() receives both dailyUsage and modelDailyUsage maps — ensures both accumulators see identical records in single pass"
  - "model || 'unknown' as fallback key — handles JSONL records missing model field without crashing"
  - "CSV export always exports full unfiltered dataset — filename includes export date per spec"
  - "New methods placed after runMigrations() inside DatabaseConnection class — consistent with existing class structure"

patterns-established:
  - "token_usage_by_model upsert: ON CONFLICT(agent_id, date, model) DO UPDATE SET — idempotent, same pattern as token_usage"
  - "getModelComparison/getTokenUsageForExport: filter with conditions[] + params[] arrays, whereClause join — same pattern as getTokenUsage()"

requirements-completed: [TOKN-12, TOKN-14]

# Metrics
duration: 6min
completed: 2026-03-04
---

# Phase 23 Plan 01: Token Analytics Export Summary

**Per-model SQLite tracking table, scanner accumulator extension, model cost comparison API, and CSV export endpoint — data layer for TOKN-12 and TOKN-14**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-04T07:45:23Z
- **Completed:** 2026-03-04T07:51:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- New `token_usage_by_model` table with UNIQUE(agent_id, date, model) constraint migrates on server start
- Scanner now accumulates per-model daily totals alongside existing daily totals in one pass through each JSONL line
- `GET /api/history/model-comparison` returns 16 rows of real data across 4 agent projects with per-model cost aggregates
- `GET /api/history/token-usage/export` returns valid CSV with 8 required headers and correct Content-Disposition attachment filename

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared types and database layer for per-model token usage** - `88d7341` (feat)
2. **Task 2: Add model comparison and CSV export API endpoints** - `b4fa6ea` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/shared/types.ts` - Added TokenUsageByModelRow, ModelComparisonRow, TokenUsageExportRow interfaces
- `src/server/database/DatabaseConnection.ts` - Added token_usage_by_model migration, upsertTokenUsageByModel(), getModelComparison(), getTokenUsageForExport()
- `src/server/services/SessionUsageReader.ts` - Extended processJsonlFile() with modelDailyUsage Map, second upsert loop in scanProject()
- `src/server/routes/historyRoutes.ts` - Added GET /api/history/model-comparison and GET /api/history/token-usage/export endpoints

## Decisions Made

- Both accumulators (dailyUsage and modelDailyUsage) processed in the same `processJsonlFile()` call to prevent divergence — critical per plan spec
- `model || 'unknown'` key fallback handles missing model field gracefully without skipping records
- CSV export always sends full unfiltered dataset with date-stamped filename — consistent with plan spec decision
- New DB methods added after `runMigrations()` inside the class body, maintaining existing organizational pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The production server was already running an old build on port 3001. After running `npm run build`, restarted the server with the new build to verify endpoints. All 5 verification criteria passed.

## Next Phase Readiness

- Data layer complete: `token_usage_by_model` table populated on every scanner cycle
- Plan 02 (client UI) can immediately consume:
  - `GET /api/history/model-comparison?agentId=&dateFrom=&dateTo=` — model cost breakdown charts
  - `GET /api/history/token-usage/export` — CSV download button
- No blockers for Plan 02 implementation

## Self-Check: PASSED

All files found: src/shared/types.ts, DatabaseConnection.ts, SessionUsageReader.ts, historyRoutes.ts, 23-01-SUMMARY.md
All commits found: 88d7341 (Task 1), b4fa6ea (Task 2)

---
*Phase: 23-token-analytics-export*
*Completed: 2026-03-04*
