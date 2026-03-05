---
phase: quick-2048
plan: 01
subsystem: ui, api
tags: [rotate-session, openclaw, terminal-header, gsd-routes]

requires:
  - phase: existing
    provides: gsdRoutes.ts route module, TerminalView.tsx terminal header

provides:
  - POST /api/gsd/agents/:agentId/rotate-session endpoint
  - Rotate Session button in TerminalView terminal header

affects: [gsd-manager, terminal-view]

tech-stack:
  added: []
  patterns: [synchronous API call with loading/result states, auto-clearing feedback]

key-files:
  created: []
  modified:
    - src/server/routes/gsdRoutes.ts
    - src/client/components/TerminalView.tsx

key-decisions:
  - "Synchronous 200 response (not fire-and-forget 202) since 5-15s is acceptable for button click with loading state"
  - "Rotate button placed after working directory span in left header group for visibility without crowding"

patterns-established:
  - "Auto-clearing result feedback: 4-second setTimeout with cleanup in useEffect"

requirements-completed: [ROTATE-SESSION]

duration: 2min
completed: 2026-03-05
---

# Quick Task 2048: Add Rotate Session Button Summary

**POST /api/gsd/agents/:agentId/rotate-session endpoint + Rotate button in terminal header with loading/success/error states**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T11:02:25Z
- **Completed:** 2026-03-05T11:04:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Backend endpoint validates agentId and optional label, executes rotate-session.mjs with 30s timeout, returns parsed old/new session IDs
- Rotate button in terminal header shows three states: default ("Rotate"), loading (spinner + "Rotating..."), result ("Rotated"/"Failed")
- Result feedback auto-clears after 4 seconds
- Build passes cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /api/gsd/agents/:agentId/rotate-session backend endpoint** - `e467299` (feat)
2. **Task 2: Add Rotate Session button to TerminalView terminal header** - `14b7943` (feat)

## Files Created/Modified
- `src/server/routes/gsdRoutes.ts` - Added ROTATE_SESSION_PATH constant and POST /api/gsd/agents/:agentId/rotate-session route
- `src/client/components/TerminalView.tsx` - Added isRotating/rotateResult state, handleRotateSession callback, auto-clear effect, Rotate button JSX

## Decisions Made
- Used synchronous 200 response instead of fire-and-forget 202 since the 5-15s rotation time is acceptable with a loading state
- Placed Rotate button after working directory span in the left header group to keep it visible but not crowding

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

---
*Quick Task: 2048*
*Completed: 2026-03-05*
