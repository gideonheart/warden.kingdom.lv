---
phase: 39-idle-timeout-quick-launch
plan: 02
subsystem: ui
tags: [react, modal, sqlite, express, quick-launch, agent-session]

# Dependency graph
requires:
  - phase: 38-auto-restart-engine
    provides: AutoRestartService and session lifecycle infrastructure
  - phase: 39-01
    provides: Idle timeout detection (same phase, plan 01)
provides:
  - Quick-launch modal UI for starting new agent sessions from dashboard header
  - GET /api/agents/last-projects endpoint returning last-used project path per agent
  - getLastProjectPaths() database method querying most recent non-empty project_path per agent
  - POST /api/instances/start extended with optional projectPath body override
affects: [phase-40, future-session-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Full-screen modal overlay with backdrop click to close and Escape key handling
    - useEffect to fetch modal-specific data on open (lazy fetch pattern)
    - Optional body override on existing start endpoint — backward compatible extension

key-files:
  created:
    - src/client/components/QuickLaunchModal.tsx
  modified:
    - src/server/database/DatabaseConnection.ts
    - src/server/routes/instanceRoutes.ts
    - src/client/App.tsx

key-decisions:
  - "getLastProjectPaths() uses ORDER BY last_active_at DESC with first-occurrence Map — one DB query returns all agents' most recent paths"
  - "projectPath override is backward compatible — when omitted, start endpoint behaves identically to before"
  - "QuickLaunchModal fetches /api/agents/last-projects lazily on isOpen=true, not at App mount — avoids unnecessary polls"
  - "agentName is always looked up from openclaw.json even when projectPath override is supplied — name is not overridable"
  - "Agent cards are disabled (not hidden) for active agents — operator can see which agents are running before choosing"

patterns-established:
  - "Modal pattern: fixed inset-0 backdrop + centered panel using warden-panel/border tokens"
  - "Lazy modal data fetch: useEffect on isOpen, reset state on close"

requirements-completed: [LNCH-01, LNCH-02, LNCH-03]

# Metrics
duration: 15min
completed: 2026-03-05
---

# Phase 39 Plan 02: Quick Launch Modal Summary

**Quick-launch modal with agent picker, last-used project path pre-fill, and operator path override via GET /api/agents/last-projects and extended POST /api/instances/start**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-05T03:46:00Z
- **Completed:** 2026-03-05T04:01:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `getLastProjectPaths()` to `DatabaseConnection` — queries all instances ordered by `last_active_at DESC`, returns `Record<string, string>` of agentId to most recent project path
- Added `GET /api/agents/last-projects` endpoint in `instanceRoutes.ts` returning `{ paths: Record<string, string> }`
- Extended `POST /api/instances/start` to accept optional `projectPath` body field — uses it when non-empty, falls back to openclaw.json workspace otherwise
- Created `QuickLaunchModal` component with agent picker grid, path input pre-filled from last-used path, launch button with loading state, Escape/backdrop dismiss
- Added "+ New Session" button to both desktop nav and mobile dropdown menu in `App.tsx`

## Task Commits

1. **Task 1: Add last-project-paths API and extend start endpoint** - `fb9f92b` (feat)
2. **Task 2: Create QuickLaunchModal and wire New Session button** - `d1f6563` (feat)

## Files Created/Modified

- `src/client/components/QuickLaunchModal.tsx` — New modal component with agent picker grid, project path input, launch action
- `src/server/database/DatabaseConnection.ts` — Added `getLastProjectPaths()` method
- `src/server/routes/instanceRoutes.ts` — Added `GET /api/agents/last-projects`, extended `POST /api/instances/start` with projectPath override
- `src/client/App.tsx` — Added `isQuickLaunchOpen` state, `handleQuickLaunch` callback, "+ New Session" button in header and mobile menu, `<QuickLaunchModal>` render

## Decisions Made

- `getLastProjectPaths()` uses a single SQL query ordered by `last_active_at DESC` with first-occurrence tracking in JS — avoids a subquery/GROUP BY and is clear to reason about
- `projectPath` override is fully backward compatible — callers that omit it get identical behavior to before (workspace from openclaw.json)
- Modal fetches last-project-paths lazily (on `isOpen` becoming true) rather than at App mount — avoids polling overhead when modal is never opened
- Agent cards are shown as disabled (not hidden) for agents with active sessions — operator can see the full agent list and which ones are already running

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Quick-launch feature is fully operational: operators can start new sessions from the dashboard header without navigating to agent sidebar
- Phase 39 is now complete (both plans 01 and 02 done)
- Ready for Phase 40

---
*Phase: 39-idle-timeout-quick-launch*
*Completed: 2026-03-05*

## Self-Check: PASSED

All files present. All commits verified.
