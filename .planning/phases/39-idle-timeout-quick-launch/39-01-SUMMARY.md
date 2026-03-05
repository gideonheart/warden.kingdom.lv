---
phase: 39-idle-timeout-quick-launch
plan: 01
subsystem: lifecycle
tags: [sqlite, idle-timeout, tmux, typescript, react, rest-api]

# Dependency graph
requires:
  - phase: 38-auto-restart-engine
    provides: "RestartPolicy type, session_lifecycle_policy table, RestartPolicyDropdown pattern, getRestartPolicy/setRestartPolicy/getAllRestartPolicies in DatabaseConnection"
  - phase: 36-telegram-notifications
    provides: "NotificationPoller pattern (capture-pane + detectAgentState + setInterval)"
  - phase: 37-crash-detection
    provides: "insertLifecycleEvent, LifecycleEventType, detectAgentState utility, InstanceTracker.listActiveInstances"
provides:
  - "IdleTimeoutService: polls tmux sessions every 60s, tracks idle onset, auto-stops sessions after configured timeout"
  - "idle_timeout_minutes column on session_lifecycle_policy table"
  - "idleTimeoutMinutes: number | null on RestartPolicy type"
  - "setIdleTimeout/getIdleTimeout methods on DatabaseConnection"
  - "PUT /api/idle-timeout/:agentId endpoint (validates min 60 or null)"
  - "IdleTimeoutDropdown component in AgentSidebar with Disabled/1h/2h/4h/8h options"
  - "updateIdleTimeout callback in useAgentConfig hook"
  - "idle-timeout lifecycle events logged with eventType idle-timeout and stopReason idle-timeout"
affects: [phase-40, lifecycle-history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IdleTimeoutService follows same setInterval+capture-pane+detectAgentState pattern as NotificationPoller"
    - "Idle tracking uses a Map<tmuxSessionName, timestamp> to record when a session first became idle"
    - "Column migration uses try/catch pattern for idempotent ALTER TABLE ADD COLUMN"
    - "IdleTimeoutDropdown follows RestartPolicyDropdown inline-component pattern (no separate file)"

key-files:
  created:
    - src/server/services/IdleTimeoutService.ts
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/routes/instanceRoutes.ts
    - src/server/index.ts
    - src/client/components/AgentSidebar.tsx
    - src/client/hooks/useAgentConfig.ts
    - src/client/App.tsx

key-decisions:
  - "Poll every 60s (matches minute-granularity of timeout configuration; no need for 10s notification polling speed)"
  - "idleSince Map tracks real-time timestamp of idle onset, not DB status field (avoids DB writes on every poll)"
  - "onChangeIdleTimeout is optional prop on AgentSidebar — sidebar renders without dropdown when not provided (same pattern as onChangeRestartPolicy)"
  - "Validation enforces minimum 60 minutes at both API and DB layer"
  - "idleTimeoutMinutes field added to RestartPolicy type (not a separate type) because it lives in the same DB table and is fetched alongside restart policies"

patterns-established:
  - "Service pattern for tmux polling: extends NotificationPoller convention with startPolling/stopPolling methods"

requirements-completed: [IDLE-01, IDLE-02, IDLE-03]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 39 Plan 01: Idle Timeout Configuration and Auto-Stop Summary

**Per-agent idle timeout with tmux pane polling, minute-granularity tracking, lifecycle event logging, and sidebar dropdown UI**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T03:58:43Z
- **Completed:** 2026-03-05T04:02:43Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Created `IdleTimeoutService` that polls active tmux sessions every 60s, detects idle state via `detectAgentState()`, tracks idle onset in a `Map<tmuxSessionName, number>`, and auto-stops sessions that exceed their configured timeout
- Added `idle_timeout_minutes` column to `session_lifecycle_policy` table with idempotent migration, updated `RestartPolicy` type and all DB queries to include the field, and added `setIdleTimeout`/`getIdleTimeout` convenience methods
- Implemented `PUT /api/idle-timeout/:agentId` endpoint with integer validation (minimum 60 or null), and `IdleTimeoutDropdown` inline component in `AgentSidebar` with options: Disabled, 1h, 2h, 4h, 8h
- Wired `updateIdleTimeout` through `useAgentConfig` hook and into both desktop and mobile `AgentSidebar` instances in `App.tsx`

## Task Commits

1. **Task 1: Types, database, API, and IdleTimeoutService** — `0d778b3` (feat)
2. **Task 2: AgentSidebar dropdown and useAgentConfig wiring** — `4ddd72d` (feat)

## Files Created/Modified

- `src/server/services/IdleTimeoutService.ts` — New service; polls tmux panes, tracks idle onset, auto-stops sessions, logs idle-timeout lifecycle events
- `src/shared/types.ts` — Added `idleTimeoutMinutes: number | null` to `RestartPolicy` interface
- `src/server/database/DatabaseConnection.ts` — Added idle_timeout_minutes migration, updated getRestartPolicy/getAllRestartPolicies, added setIdleTimeout/getIdleTimeout methods
- `src/server/routes/instanceRoutes.ts` — Added `PUT /api/idle-timeout/:agentId` endpoint
- `src/server/index.ts` — Imported and wired IdleTimeoutService startPolling/stopPolling into startup/shutdown sequence
- `src/client/components/AgentSidebar.tsx` — Added `onChangeIdleTimeout` prop and `IdleTimeoutDropdown` inline component
- `src/client/hooks/useAgentConfig.ts` — Added `updateIdleTimeout` callback and returned it from hook
- `src/client/App.tsx` — Destructured `updateIdleTimeout`, passed as `onChangeIdleTimeout` to both AgentSidebar instances

## Decisions Made

- Poll interval is 60s rather than 10s (notification polling rate) because timeout granularity is minutes — the faster rate would add CPU load with no benefit
- `idleSince` Map stores the first-detected idle timestamp in memory rather than in the DB — avoids constant DB writes on every poll cycle; memory tracking is sufficient since idle tracking resets on server restart
- `idleTimeoutMinutes` lives on the `RestartPolicy` type (same DB table, fetched together with restart policies) rather than a new type — reduces API round trips and keeps sidebar data consolidated in one fetch
- Minimum 60 minutes enforced at both API layer (request validation) and DB layer (`setIdleTimeout` throws) for defense-in-depth

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — the worktree was behind `main` (at Phase 27 commit) and required a fast-forward merge before execution. This is expected worktree initialization behavior, not a code issue.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 39 Plan 01 complete; idle timeout enforcement and UI are operational
- Sessions with `idleTimeoutMinutes = null` (default) are never auto-stopped
- Lifecycle history UI (Phase 40) will be able to query idle-timeout events via existing `getLifecycleEvents()` with `eventType: 'idle-timeout'` filter

## Self-Check: PASSED

- FOUND: `src/server/services/IdleTimeoutService.ts`
- FOUND: `39-01-SUMMARY.md`
- FOUND commit: `0d778b3` (feat: idle timeout column, types, API, and service)
- FOUND commit: `4ddd72d` (feat: sidebar dropdown and useAgentConfig)
- TypeScript check: PASSED
- Production build: PASSED

---
*Phase: 39-idle-timeout-quick-launch*
*Completed: 2026-03-05*
