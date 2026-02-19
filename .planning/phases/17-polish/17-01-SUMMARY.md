---
phase: 17-polish
plan: 01
subsystem: ui
tags: [react, hooks, lazy-mount, setTimeout-cleanup, performance]

# Dependency graph
requires:
  - phase: 16-dry-srp
    provides: "Standalone tab components (AgentsTab, ControlsTab, RegistryTab, HooksTab) and gsdShared.tsx module"
provides:
  - "Hook-free GsdView tab router with lazy-mount polling"
  - "Self-contained tab components with own data hooks"
  - "All setTimeout calls ref-tracked with unmount cleanup"
affects: [17-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["lazy-mount: tabs fetch own data, unmount stops polling", "useRef + useEffect cleanup for setTimeout timers"]

key-files:
  created: []
  modified:
    - src/client/components/GsdView.tsx
    - src/client/components/AgentsTab.tsx
    - src/client/components/ControlsTab.tsx
    - src/client/components/RegistryTab.tsx
    - src/client/components/HooksTab.tsx
    - src/client/components/gsdShared.tsx

key-decisions:
  - "Header badge/spinner/error moved from GsdView into AgentsTab since only Agents tab needs registry status display"
  - "Each tab calls its own hooks independently (no shared state lifting) for clean unmount lifecycle"

patterns-established:
  - "Lazy-mount tab pattern: conditional render unmounts tab, stopping all hooks/polling/subscriptions"
  - "Timer cleanup pattern: useRef<ReturnType<typeof setTimeout>> + useEffect cleanup on unmount"

requirements-completed: [PERF-01, PERF-02, FIX-02]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 17 Plan 01: Lazy-Mount GSD Tabs Summary

**Lazy-mount tab routing eliminates ~18 HTTP req/min and ~60 tmux subprocess/min of wasted polling, plus ref-tracked setTimeout cleanup prevents unmounted component state updates**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T14:28:29Z
- **Completed:** 2026-02-19T14:32:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- GsdView.tsx reduced from 76-line data-passing router to 47-line hook-free tab shell
- Each GSD tab (Agents, Controls, Registry, Hooks) self-contains its data hooks -- switching away unmounts the tab and stops all associated polling intervals and Socket.IO subscriptions
- All 7 unguarded setTimeout calls (6 in ControlsTab, 1 in CopyButton) now tracked via useRef with useEffect cleanup on unmount

## Task Commits

Each task was committed atomically:

1. **Task 1: Move data hooks into tab components and slim GsdView to hook-free router** - `51b5d5c` (refactor)
2. **Task 2: Fix unguarded setTimeout calls in ControlsTab and CopyButton** - `673cf5a` (fix)

## Files Created/Modified
- `src/client/components/GsdView.tsx` - Stripped all data hooks, now pure 47-line tab router shell
- `src/client/components/AgentsTab.tsx` - Added useGsdRegistry, useActiveInstances, useAgentLiveStatus, useAgentStateFiles hooks; moved header badge/spinner from GsdView
- `src/client/components/ControlsTab.tsx` - Added useGsdRegistry, useActiveInstances hooks; added spawnTimerRef/dispatchTimerRef with cleanup useEffect
- `src/client/components/RegistryTab.tsx` - Added useGsdRegistry hook; removed all props
- `src/client/components/HooksTab.tsx` - Added useGsdHookFeed hook; removed hookEvents prop
- `src/client/components/gsdShared.tsx` - CopyButton: added timerRef with cleanup useEffect

## Decisions Made
- Header badge/spinner/error display moved from GsdView into AgentsTab since it depends on registry data that is now internal to the Agents tab
- Each tab calls its own hooks independently (no shared state lifting) for clean unmount lifecycle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lazy-mount and timer cleanup complete for GSD tabs
- Ready for 17-02 (remaining bug fixes)

## Self-Check: PASSED

- All 6 modified files verified present on disk
- Commit `51b5d5c` (Task 1) verified in git log
- Commit `673cf5a` (Task 2) verified in git log
- typecheck: zero errors
- build: success

---
*Phase: 17-polish*
*Completed: 2026-02-19*
