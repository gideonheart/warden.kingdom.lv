---
phase: quick-2050
plan: 01
subsystem: ui, api
tags: [react-hooks, refactor, confirmation-ux, dry]

# Dependency graph
requires:
  - phase: quick-2048
    provides: rotate session button and backend endpoint
provides:
  - useRotateSession custom hook with confirmation UX
  - centralized externalPaths.ts config for GSD script paths
affects: [TerminalView, gsdRoutes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "click-to-confirm UX pattern for destructive actions"
    - "centralized external paths config under src/server/config/"

key-files:
  created:
    - src/client/hooks/useRotateSession.ts
    - src/server/config/externalPaths.ts
  modified:
    - src/client/components/TerminalView.tsx
    - src/server/routes/gsdRoutes.ts

key-decisions:
  - "useRef for isRotating guard avoids unnecessary callback identity changes"
  - "3-second auto-reset timer for confirmation UX — short enough to feel responsive, long enough to confirm intent"
  - "GSD_SKILL_ROOT constant in externalPaths.ts for single-source path prefix"

patterns-established:
  - "Click-to-confirm pattern: first click sets confirmPending, second click executes"
  - "External script paths centralized in src/server/config/externalPaths.ts"

requirements-completed: [REFACTOR-HOOK, REFACTOR-PATHS, UX-CONFIRM]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Quick Task 2050: Refactor Rotate Session — Extract Hook and Fix Summary

**useRotateSession hook extracted from TerminalView with click-to-confirm UX and centralized external script paths in externalPaths.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T12:11:46Z
- **Completed:** 2026-03-05T12:14:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extracted rotate session logic from TerminalView into useRotateSession custom hook (removes 2 state vars, 1 useCallback, 1 useEffect)
- Added click-to-confirm UX pattern: first click shows "Confirm?", second click within 3 seconds executes rotation
- Centralized SPAWN_SH_PATH, MENU_DRIVER_PATH, ROTATE_SESSION_PATH into src/server/config/externalPaths.ts
- TerminalView reduced from 946 to 921 lines

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract useRotateSession hook and add confirmation UX** - `38c9389` (refactor)
2. **Task 2: Centralize external script paths and build** - `a62011d` (refactor)

## Files Created/Modified
- `src/client/hooks/useRotateSession.ts` - Custom hook: rotate state, confirmation UX, API call, auto-clear
- `src/server/config/externalPaths.ts` - Centralized GSD external script paths
- `src/client/components/TerminalView.tsx` - Uses useRotateSession hook, confirmPending state in button JSX
- `src/server/routes/gsdRoutes.ts` - Imports paths from externalPaths.ts instead of hardcoded constants

## Decisions Made
- Used useRef for isRotating guard to prevent callback identity thrashing per analysis concern 4.4
- 3-second auto-reset for confirmation pending state — balances between too quick and too slow
- GSD_SKILL_ROOT as intermediate constant for composing all three paths from a single base

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Rotate session feature is now cleanly separated into its own hook
- The click-to-confirm pattern can be reused for other destructive actions
- externalPaths.ts provides a single place to update if GSD skill directory moves

---
*Phase: quick-2050*
*Completed: 2026-03-05*
