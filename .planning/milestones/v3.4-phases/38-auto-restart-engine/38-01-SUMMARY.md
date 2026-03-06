---
phase: 38-auto-restart-engine
plan: 01
subsystem: database, api, ui
tags: [sqlite, rest-api, react, crash-detection, restart-policy]

# Dependency graph
requires:
  - phase: 37-crash-detection-backend
    provides: session_lifecycle_events table, LifecycleEventType union, onCrashDetected callback
provides:
  - CrashRestartMode type and RestartPolicy interface in shared/types.ts
  - session_lifecycle_policy SQLite table with getRestartPolicy/setRestartPolicy/getAllRestartPolicies methods
  - GET /api/restart-policies and PUT /api/restart-policies/:agentId REST endpoints
  - RestartPolicyDropdown UI component in AgentSidebar with storm-limiter warning indicator
  - restartPolicies state and updateRestartPolicy callback in useAgentConfig hook
affects:
  - 38-02 (auto-restart engine reads crashRestartMode to decide whether to restart)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Policy stored as TEXT in SQLite with DEFAULT 'none' — operator opt-in required"
    - "Operator-initiated mode change clears storm_disabled_at to re-arm auto-restart"
    - "JSON diff refs in useAgentConfig prevent re-renders when polled data is unchanged"

key-files:
  created: []
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/routes/instanceRoutes.ts
    - src/client/components/AgentSidebar.tsx
    - src/client/hooks/useAgentConfig.ts
    - src/client/App.tsx

key-decisions:
  - "38-01: storm_disabled_at cleared on every operator mode change — manual change signals operator awareness, re-arming auto-restart"
  - "38-01: Default crashRestartMode is 'none' via DB DEFAULT; getRestartPolicy() returns none for unknown agents without a DB row"
  - "38-01: RestartPolicyDropdown lives inside AgentSidebar file (small component, no separate file per plan spec)"
  - "38-01: onChangeRestartPolicy is optional prop — sidebar renders without dropdown when not provided"

patterns-established:
  - "Restart policy: none/once/always with storm-limiter disable mechanism via stormDisabledAt timestamp"

requirements-completed: [CRSH-03]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 38 Plan 01: Restart Policy Configuration Layer Summary

**Per-agent crash restart policy (none/once/always) persisted to SQLite via REST API and configurable from AgentSidebar dropdown with storm-limiter warning indicator**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T03:25:23Z
- **Completed:** 2026-03-05T03:28:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `CrashRestartMode` and `RestartPolicy` types plus `'auto-restarted'` to `LifecycleEventType` in shared/types.ts
- Created `session_lifecycle_policy` SQLite table with `getRestartPolicy()`, `setRestartPolicy()`, `getAllRestartPolicies()` methods
- Added `GET /api/restart-policies` and `PUT /api/restart-policies/:agentId` REST endpoints with input validation
- Built `RestartPolicyDropdown` component in AgentSidebar showing none/once/always select with amber storm-limiter warning dot
- Extended `useAgentConfig` hook to poll restart policies alongside agents/topics, exposing `updateRestartPolicy` callback
- Wired new props into both desktop and mobile AgentSidebar instances in App.tsx

## Task Commits

1. **Task 1: Add restart policy types, DB table, and API endpoints** - `1defb42` (feat)
2. **Task 2: Add restart policy dropdown to AgentSidebar** - `60982a0` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/shared/types.ts` - Added CrashRestartMode, RestartPolicy, and 'auto-restarted' LifecycleEventType
- `src/server/database/DatabaseConnection.ts` - Added session_lifecycle_policy migration and 3 policy methods
- `src/server/routes/instanceRoutes.ts` - Added GET/PUT /api/restart-policies endpoints
- `src/client/components/AgentSidebar.tsx` - Added RestartPolicyDropdown component and extended props
- `src/client/hooks/useAgentConfig.ts` - Added restartPolicies state and updateRestartPolicy callback
- `src/client/App.tsx` - Wired restartPolicies and updateRestartPolicy into AgentSidebar usages

## Decisions Made

- `storm_disabled_at` is cleared on every operator mode change — a manual policy selection signals the operator is aware, re-arming the auto-restart mechanism
- `getRestartPolicy()` returns `{ crashRestartMode: 'none', stormDisabledAt: null }` for agents without a DB row — no row needed for default behavior
- `RestartPolicyDropdown` is defined inside `AgentSidebar.tsx` (not a separate file) per plan spec — it is small enough to colocate
- `onChangeRestartPolicy` is an optional prop so AgentSidebar can be used without the dropdown (for contexts that do not need it)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01 complete: restart policy data layer is fully operational
- Plan 02 (auto-restart engine) can now call `database.getRestartPolicy(agentId)` to decide whether to restart a crashed agent
- `stormDisabledAt` field is wired through to the UI; Plan 02 will write to it when the storm limiter triggers

## Self-Check: PASSED

- All 6 modified source files present on disk
- SUMMARY.md created at `.planning/phases/38-auto-restart-engine/38-01-SUMMARY.md`
- Task 1 commit `1defb42` confirmed in git log
- Task 2 commit `60982a0` confirmed in git log
- `npx tsc --noEmit` passed with zero errors
- `npm run build` succeeded

---
*Phase: 38-auto-restart-engine*
*Completed: 2026-03-05*
