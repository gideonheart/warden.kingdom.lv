---
phase: quick-2055
plan: 01
subsystem: api, ui
tags: [express, react, tmux, spawn, parallel-sessions]

requires:
  - phase: none
    provides: existing instanceRoutes.ts start endpoint and TerminalView header
provides:
  - POST /api/instances/spawn endpoint for parallel session creation
  - "+ New" button in terminal header for spawning sessions
affects: [terminal-view, instance-management]

tech-stack:
  added: []
  patterns: [ref-based stable callback for spawn action]

key-files:
  created: []
  modified:
    - src/server/routes/instanceRoutes.ts
    - src/client/components/TerminalView.tsx
    - src/client/App.tsx

key-decisions:
  - "Spawn endpoint mirrors start endpoint but intentionally omits duplicate-session guard"
  - "Button uses same styling as other header buttons for visual consistency"

patterns-established:
  - "Spawn endpoint pattern: fire-and-forget tmux creation with pre-registered instance for immediate UI"

requirements-completed: [QUICK-2055]

duration: 2min
completed: 2026-03-07
---

# Quick 2055: Add New Session Button Summary

**POST /api/instances/spawn endpoint + "+ New" button in terminal header for spawning parallel agent sessions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T17:16:16Z
- **Completed:** 2026-03-07T17:18:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added POST /api/instances/spawn backend endpoint that creates parallel tmux sessions without duplicate-agent blocking
- Added "+ New" button to terminal header, visible for active/idle sessions, positioned before Stop button
- Wired handleSpawnSession callback in App.tsx using ref-based pattern for stable prop references

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /api/instances/spawn backend endpoint** - `8731c68` (feat)
2. **Task 2: Add New Session button to terminal header and wire through App.tsx** - `c5f46d8` (feat)

## Files Created/Modified
- `src/server/routes/instanceRoutes.ts` - New POST /api/instances/spawn endpoint (88 lines added)
- `src/client/components/TerminalView.tsx` - onSpawnSession prop + "+ New" button in header
- `src/client/App.tsx` - handleSpawnSession callback + prop wiring to TerminalView

## Decisions Made
- Spawn endpoint mirrors the existing start endpoint's project path resolution logic (body override > agent-registry > openclaw.json) for consistency
- Button placed before Stop in the header's right-side button group for logical flow (spawn, then stop)
- Used ref-based callback pattern (selectedInstanceRef.current) matching handleStopSelectedInstance and handleForceKillSelectedInstance to avoid unnecessary TerminalView re-renders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Spawn functionality is complete and auto-discovered by InstanceTracker
- New sessions appear in tab bar within 10s polling interval
- No blockers

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: quick-2055*
*Completed: 2026-03-07*
