---
phase: 18-fix-token-usage-jsonl-session-reader-and-database-population
plan: 02
subsystem: server-integration
tags: [server-lifecycle, token-usage, react, cache-tokens, api-endpoint]

# Dependency graph
requires:
  - 18-01 (SessionUsageReader service + token_usage schema with cache columns)
provides:
  - SessionUsageReader lifecycle wired into server: starts on boot, stops on shutdown
  - POST /api/history/token-usage/scan endpoint for manual on-demand refresh
  - Enhanced TokenUsageView with cache token columns, Scan Now button, and human-readable agent IDs
affects:
  - src/server/index.ts (sessionUsageReader lifecycle)
  - src/server/routes/historyRoutes.ts (POST scan endpoint)
  - src/client/components/TokenUsageView.tsx (cache columns + Scan Now button)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Service lifecycle wiring: startPeriodicScan/stopPeriodicScan alongside instanceTracker pattern
    - Manual trigger endpoint: POST route that awaits service method and returns structured JSON
    - Scan-then-refetch pattern in UI: button triggers POST scan then re-runs fetch
    - formatAgentId() helper strips home-forge prefix for human-readable display

key-files:
  created: []
  modified:
    - src/server/index.ts
    - src/server/routes/historyRoutes.ts
    - src/client/components/TokenUsageView.tsx

key-decisions:
  - "Scan Now button calls POST /api/history/token-usage/scan then immediately re-fetches data — ensures UI reflects scan results without manual reload"
  - "isScanning state separate from isLoading — spinner on button only, not full-page spinner, to minimize disruption"
  - "Cache token sub-lines in summary cards conditionally rendered only when cache tokens > 0 — clean display when no cache usage"
  - "formatAgentId() strips home-forge prefix: home-forge-warden-kingdom-lv → warden-kingdom-lv — readable without losing identity"
  - "Daily breakdown table uses gap-2 (not gap-3) to fit 7 columns without horizontal scroll on 1280px+ desktop"

requirements-completed: [TOKN-04, TOKN-05, TOKN-06]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 18 Plan 02: Server lifecycle wiring, scan endpoint, and enhanced TokenUsageView Summary

**Full token usage pipeline integration: scanner starts on boot, POST scan endpoint for manual refresh, TokenUsageView shows cache tokens and Scan Now button**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T15:16:35Z
- **Completed:** 2026-02-23T15:18:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Wired `sessionUsageReader.startPeriodicScan()` into server startup (after `instanceTracker.startPeriodicSync()`) and `stopPeriodicScan()` into `handleShutdown()` (before `instanceTracker.stopPeriodicSync()`)
- Added `POST /api/history/token-usage/scan` endpoint in `historyRoutes.ts` that calls `scanAllProjects()` and returns `{ status: 'ok', message: 'Scan complete' }`
- Enhanced `TokenUsageView` with:
  - `cacheCreationInputTokens` and `cacheReadInputTokens` fields in both interfaces
  - "Scan Now" button with spinner, posts to scan endpoint then re-fetches
  - Per-agent summary cards show cache write/read sub-lines when non-zero
  - Daily breakdown table adds Cache Write and Cache Read columns
  - `formatAgentId()` helper strips `home-forge-` prefix for clean display
- `npm run build` passes cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire SessionUsageReader lifecycle + add scan endpoint** - `d79f156` (feat)
2. **Task 2: Enhance TokenUsageView with cache tokens and Scan Now button** - `4ad39dd` (feat)

## Files Created/Modified

- `src/server/index.ts` - Added `sessionUsageReader` import, `startPeriodicScan()` call on boot, `stopPeriodicScan()` call in shutdown
- `src/server/routes/historyRoutes.ts` - Added `sessionUsageReader` import and `POST /api/history/token-usage/scan` endpoint
- `src/client/components/TokenUsageView.tsx` - Extended interfaces with cache token fields; added Scan Now button with spinner; updated per-agent summary to show cache token sub-lines; added Cache Write and Cache Read columns to daily breakdown; added `formatAgentId()` helper

## Decisions Made

- Scan Now calls POST then re-fetches — ensures UI reflects latest scan without manual page reload
- `isScanning` separate from `isLoading` — button-level spinner keeps full table visible during rescan
- Cache sub-lines in summary cards only rendered when cache tokens > 0 — avoids clutter for agents with no cache usage
- `formatAgentId()` strips `home-forge-` prefix, shows project slug portion (e.g. `warden-kingdom-lv`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Phase Completion

Phase 18 is now complete. The full token usage pipeline is integrated:
1. JSONL scanner reads `~/.claude/projects/` on startup and every 5 minutes (Plan 01)
2. Schema has cache token columns with idempotent migration (Plan 01)
3. Scanner wired into server lifecycle — auto-starts, auto-stops (Plan 02)
4. Manual scan trigger via POST endpoint (Plan 02)
5. UI displays cache tokens, costs, and refresh button (Plan 02)

## Self-Check: PASSED

- FOUND: src/server/index.ts (contains `sessionUsageReader.startPeriodicScan`)
- FOUND: src/server/routes/historyRoutes.ts (contains `scanAllProjects` and `POST /api/history/token-usage/scan`)
- FOUND: src/client/components/TokenUsageView.tsx (contains `cacheCreationInputTokens` and Scan Now button)
- FOUND commit: d79f156 (Task 1)
- FOUND commit: 4ad39dd (Task 2)

---
*Phase: 18-fix-token-usage-jsonl-session-reader-and-database-population*
*Completed: 2026-02-23*
