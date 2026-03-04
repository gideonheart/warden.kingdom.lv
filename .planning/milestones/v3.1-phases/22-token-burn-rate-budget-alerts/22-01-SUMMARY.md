---
phase: 22-token-burn-rate-budget-alerts
plan: 01
subsystem: api
tags: [sqlite, better-sqlite3, express, typescript, burn-rate, budget-alerts]

# Dependency graph
requires:
  - phase: 18-token-usage-scanner
    provides: token_usage table with agent_id, date, cost_usd rows
provides:
  - BurnWindow, BurnRateEntry, BudgetConfig, BudgetAlertStatus TypeScript types
  - budget_config SQLite table with agent_id PRIMARY KEY
  - getBurnRate() database method for today/2day/7day windows
  - getAllBudgetConfigs() / upsertBudgetConfig() / getBudgetAlertStatus() database methods
  - GET /api/history/burn-rate endpoint
  - GET /api/history/budget-config endpoint
  - PUT /api/history/budget-config/:agentId endpoint
  - GET /api/history/budget-config/status endpoint
affects: [22-02, plan-02-burn-rate-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SQL constant interpolation for hour/day window values (not user input — injection-safe)
    - Delete-on-zero semantics for budget removal (upsertBudgetConfig with dailyBudgetUsd=0 deletes)
    - Route ordering: /budget-config/status before /budget-config/:agentId to prevent param shadowing

key-files:
  created: []
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/routes/historyRoutes.ts

key-decisions:
  - "SQL numeric constants interpolated directly (hours/days) — not user input so injection-safe, avoids parameterization overhead"
  - "upsertBudgetConfig(agentId, 0) deletes the row — clearing budget to $0 removes it entirely, consistent with CONTEXT.md Remove budget spec"
  - "/budget-config/status route registered before /:agentId to prevent Express treating 'status' as a dynamic param"
  - "Aggregate alertLevel in status endpoint computed in application layer (not SQL) for clarity"

patterns-established:
  - "Burn window calculation: map BurnWindow literal to hours constant, interpolate into SQL"
  - "Budget alert thresholds: >=100% exceeded, >=80% warning, else ok"

requirements-completed: [TOKN-10, TOKN-11, TOKN-13]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 22 Plan 01: Token Burn Rate & Budget Config — Server Layer Summary

**Per-agent burn rate calculation (cost/hr over today/2day/7day windows) and budget alert threshold storage via new budget_config SQLite table and four REST endpoints**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T07:03:53Z
- **Completed:** 2026-03-04T07:05:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added four TypeScript interfaces (BurnWindow, BurnRateEntry, BudgetConfig, BudgetAlertStatus) to shared/types.ts
- Added budget_config table migration and four database methods to DatabaseConnection
- Added four API endpoints in historyRoutes.ts with input validation and correct route ordering

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared types and database layer** - `f003498` (feat)
2. **Task 2: Add burn rate and budget config API endpoints** - `1aa36f5` (feat)

## Files Created/Modified

- `src/shared/types.ts` - Added BurnWindow, BurnRateEntry, BudgetConfig, BudgetAlertStatus types
- `src/server/database/DatabaseConnection.ts` - Added budget_config migration, getBurnRate(), getAllBudgetConfigs(), upsertBudgetConfig(), getBudgetAlertStatus()
- `src/server/routes/historyRoutes.ts` - Added four new endpoints: burn-rate, budget-config GET, budget-config PUT, budget-config/status

## Decisions Made

- SQL constant interpolation for hours/days (today=24h, 2day=48h, 7day=168h) — values are code constants, not user input, so no injection risk
- Delete-on-zero semantics: `upsertBudgetConfig(agentId, 0)` removes the row entirely rather than storing a zero, consistent with "no budget = no alert" requirement
- `/budget-config/status` route registered before `/:agentId` to prevent Express treating the literal string "status" as a dynamic parameter value
- Aggregate `alertLevel` in the status endpoint is computed in the application layer via a simple loop rather than in SQL for clarity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four API endpoints ready for consumption by Phase 22 Plan 02 (client-side burn rate UI)
- budget_config table auto-migrates on server start — no manual DB setup needed
- TypeScript compiles cleanly; production build succeeds

## Self-Check: PASSED

- src/shared/types.ts: FOUND
- src/server/database/DatabaseConnection.ts: FOUND
- src/server/routes/historyRoutes.ts: FOUND
- 22-01-SUMMARY.md: FOUND
- commit f003498: FOUND
- commit 1aa36f5: FOUND

---
*Phase: 22-token-burn-rate-budget-alerts*
*Completed: 2026-03-04*
