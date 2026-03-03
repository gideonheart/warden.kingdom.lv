---
phase: 17-polish
plan: 02
subsystem: server, ui
tags: [fd-safety, try-finally, regex, react-hooks, useRef, performance]

# Dependency graph
requires:
  - phase: 14-enhanced-visibility
    provides: "extractContextPressure, useAgentLiveStatus, GsdHookLogWatcher (later deleted in quick-10)"
provides:
  - "fd-safe openSync/closeSync pattern across all GSD server code"
  - "anchored extractContextPressure regex targeting Claude Code status bar format"
  - "stable useAgentLiveStatus Map reference preventing unnecessary re-renders"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "try/finally wrapping around openSync/closeSync for fd leak prevention"
    - "useRef + JSON.stringify shallow comparison gate before setState in polling hooks"
    - "anchored regex for terminal status bar extraction (Unicode block chars + keyword filter)"

key-files:
  created: []
  modified:
    - src/server/routes/gsdRoutes.ts
    - src/server/services/GsdHookLogWatcher.ts  # deleted in quick-10
    - src/client/hooks/useAgentLiveStatus.ts

key-decisions:
  - "Used try/finally (not try/catch) for fd cleanup - ensures cleanup on both success and error paths"
  - "Filtered status bar candidates to lines < 80 chars before regex matching - Claude Code status bars are short"
  - "Used JSON.stringify of Map entries for shallow comparison - negligible cost for 3-8 agent list"

patterns-established:
  - "fd safety pattern: openSync followed immediately by try/finally with closeSync in finally"
  - "polling hook stabilization: useRef + serialized comparison before setState"

requirements-completed: [FIX-01, FIX-03, FIX-04]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 17 Plan 02: Bug Fixes Summary

**try/finally fd safety on 3 openSync/closeSync pairs, anchored context pressure regex, and stable Map reference via useRef comparison gate**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T14:28:29Z
- **Completed:** 2026-02-19T14:32:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wrapped all 3 openSync/closeSync pairs in try/finally (1 in gsdRoutes.ts spawn handler, 2 in GsdHookLogWatcher readNewLines/readLastLines — GsdHookLogWatcher.ts later deleted in quick-10)
- Anchored extractContextPressure regex to Claude Code status bar format using Unicode block char range and "context" keyword, with line length filter (<80 chars) to eliminate false positives
- Stabilized useAgentLiveStatus Map reference using useRef + JSON.stringify comparison gate, preventing wasted re-renders when poll data is unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap openSync/closeSync in try/finally and anchor extractContextPressure regex** - `be449cf` (fix)
2. **Task 2: Stabilize useAgentLiveStatus Map reference with shallow comparison** - `e28f109` (fix)

## Files Created/Modified
- `src/server/routes/gsdRoutes.ts` - try/finally around spawn handler fd, anchored extractContextPressure regex
- `src/server/services/GsdHookLogWatcher.ts` - try/finally around readNewLines and readLastLines fd operations (file later deleted in quick-10 when Hooks tab was replaced by Events tab)
- `src/client/hooks/useAgentLiveStatus.ts` - useRef comparison gate before setStatusMap

## Decisions Made
- Used try/finally (not try/catch) for fd cleanup - ensures cleanup runs on both success and error paths without swallowing exceptions
- Filtered status bar candidates to lines under 80 characters before regex matching - Claude Code status bars are short, this eliminates most terminal output false positives
- Combined Unicode block char range (\u2580-\u259F) with "context" keyword as dual anchors - covers both visual bar rendering and text-based status indicators
- Used JSON.stringify of Map entries for shallow comparison - negligible cost for the small agent list (typically 3-8 agents)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in GsdView.tsx (4 errors from uncommitted WIP refactoring that removed prop-passing to tab components). These errors are not caused by this plan's changes and are documented in `.planning/phases/17-polish/deferred-items.md`. The `npm run build` command succeeds because Vite does not enforce full-project type checking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All FIX requirements from v2.2 Code Hygiene are now addressed
- Pre-existing GsdView.tsx type errors should be resolved before next milestone (documented in deferred-items.md)

## Self-Check: PASSED

- [x] src/server/routes/gsdRoutes.ts exists
- [x] src/server/services/GsdHookLogWatcher.ts existed at Phase 17 time (later deleted in quick-10)
- [x] src/client/hooks/useAgentLiveStatus.ts exists
- [x] Commit be449cf found
- [x] Commit e28f109 found

---
*Phase: 17-polish*
*Completed: 2026-02-19*
