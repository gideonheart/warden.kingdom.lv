---
phase: quick-2038
plan: 1
subsystem: planning
tags: [milestone, scope, v3.1, orchestration, token-insights, recording]

# Dependency graph
requires:
  - phase: 20
    provides: "Shipped v3.0 — existing TmuxSessionManager, InstanceTracker, SessionUsageReader, TerminalStreamService infrastructure"
provides:
  - "v3.1 milestone scope document ready for /gsd:new-milestone consumption"
  - "15 requirement IDs across 3 feature areas (ORCH-01-05, TOKN-10-14, REC-01-05)"
  - "5 phases (21-25) with acceptance criteria, dependencies, and technical notes"
affects: [v3.1 planning, Phase 21, Phase 22, Phase 23, Phase 24, Phase 25]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/milestones/v3.1-SCOPE.md
  modified: []

key-decisions:
  - "Phase numbering continues from 21 (after Phase 20 completed v3.0)"
  - "Milestone name: v3.1 Agent Control & Deep Insights"
  - "Three feature areas: Agent Orchestration Controls, Enhanced Token Insights, Session Recording & Replay"
  - "TOKN requirement IDs start at TOKN-10 to avoid collision with v2.3 TOKN-01 through TOKN-06"
  - "asciicast v2 format chosen for recording (industry standard, JSON Lines, compatible with asciinema player)"
  - "Hourly aggregation recommended for burn rate (Option A over on-demand JSONL parsing)"
  - "Phase 25 is stretch goal (recording automation) — core recording ships in Phase 24"

patterns-established: []

requirements-completed: [SCOPE-01]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Quick Task 2038: Draft v3.1 Milestone Scope Summary

**v3.1 milestone scope with 3 feature areas (agent orchestration, token insights, session recording), 15 requirements, and 5 phases (21-25) — ready for /gsd:new-milestone**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T05:31:25Z
- **Completed:** 2026-03-04T05:35:00Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- Created comprehensive v3.1 milestone scope document (418 lines) following exact v3.0-SCOPE.md structure and tone
- Defined 15 requirements across 3 feature areas with priority tiers (P1/P2/P3) and existing infrastructure references
- Mapped 5 phases (21-25) with specific acceptance criteria, dependency chains, and technical implementation notes
- Documented 6 risks with mitigations and a clear out-of-scope boundary list (10 items)

## Task Commits

Each task was committed atomically:

1. **Task 1: Draft v3.1 Milestone Scope Document** - `6c31ce5` (feat)

## Files Created/Modified

- `.planning/milestones/v3.1-SCOPE.md` - Complete v3.1 milestone scope document with 3 feature areas, 15 requirements, 5 phases, technical notes, and acceptance criteria

## Decisions Made

- **TOKN ID numbering:** Started at TOKN-10 (not TOKN-06) to avoid collision with existing TOKN-01 through TOKN-06 from v2.3 Phase 18
- **Phase numbering:** Continued from Phase 21 (after Phase 20 completed v3.0), even though v3.0-SCOPE.md had Phase 21 as stretch goals — those stretch goals (Telegram alerts, bookmarks, regex search) were never pursued and are explicitly deferred in v3.1 out-of-scope
- **Burn rate approach:** Recommended hourly aggregation (Option A) over on-demand JSONL parsing — matches existing SessionUsageReader scan pattern and enables fast SQL queries
- **Recording format:** asciicast v2 (JSON Lines) — industry standard, human-readable, lightweight, compatible with asciinema player ecosystem
- **Phase 25 as stretch:** Recording automation is P3 and conditional — core recording (capture + replay) ships in Phase 24

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v3.1-SCOPE.md is ready to be used as MILESTONE-CONTEXT.md input for `/gsd:new-milestone`
- All 15 requirements have clear acceptance criteria that can be translated into GSD plans
- Technical notes provide implementation guidance for each feature area
- Dependencies between phases are explicitly documented (e.g., Phase 23 depends on Phase 22 burn rate infrastructure)

## Self-Check: PASSED

- FOUND: .planning/milestones/v3.1-SCOPE.md (418 lines)
- FOUND: 2038-SUMMARY.md
- FOUND: commit 6c31ce5

---
*Phase: quick-2038*
*Completed: 2026-03-04*
