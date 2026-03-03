---
phase: quick-2035
plan: 1
type: planning
subsystem: milestones
tags: [milestone-scoping, operator-awareness, terminal-power-tools, v3.0]
dependency_graph:
  requires: []
  provides: [v3.0-SCOPE.md, milestone-direction]
  affects: [STATE.md, .planning/milestones/]
tech_stack:
  added: []
  patterns: [milestone-scope-document]
key_files:
  created:
    - .planning/milestones/v3.0-SCOPE.md
  modified:
    - .planning/STATE.md
key_decisions:
  - "v3.0 combines Operator Awareness and Terminal Power Tools as one milestone (Phase 19-21)"
  - "Phase 19 P1 candidates: permission badge, context pressure badge, Ctrl+F search, keyboard shortcuts"
  - "Permission prompt detection reuses Phase 11 PTY tap mechanism (setImmediate pattern)"
  - "Context pressure surfaced via REST Option B (GET /api/instances/:id/status) to avoid coupling terminal view to GSD plugin"
  - "xterm-addon-search is the only new npm dependency for the milestone"
  - "Keyboard shortcuts implemented as raw document keydown listener (no new library)"
metrics:
  duration_minutes: 2
  completed_date: "2026-03-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Quick Task 2035: Draft v3.0 Milestone Scope Summary

**One-liner:** Combined v3.0 milestone scope document covering permission prompt alerts + context pressure badges (Operator Awareness) and xterm.js Ctrl+F search + keyboard shortcuts (Terminal Power Tools), organized into three phases with acceptance criteria.

## What Was Done

Drafted `.planning/milestones/v3.0-SCOPE.md` — a 267-line milestone scope document combining two feature areas into one cohesive milestone. Updated STATE.md to reflect the new milestone direction.

### Task 1: v3.0-SCOPE.md created

The scope document includes:
- **Motivation section** explaining why Operator Awareness (passive monitoring) and Terminal Power Tools (active investigation) combine naturally into a "complete operator workstation" milestone
- **Feature Area 1 (Operator Awareness):** Permission prompt detection with tab badge (P1), context pressure badge in terminal header (P1), agent state chip in terminal view (P2), browser notifications for prompts (P2), Telegram forwarding (P3)
- **Feature Area 2 (Terminal Power Tools):** xterm-addon-search Ctrl+F overlay (P1), keyboard navigation shortcuts Ctrl+1-9/Alt+Left-Right/Ctrl+B (P1), search match count display (P2), scrollbar gutter markers (P2), terminal bookmarks and regex search (P3)
- **Phase 19** (ship first): All P1 features with 8 acceptance criteria including Playwright E2E test coverage
- **Phase 20** (polish): All P2 features
- **Phase 21** (stretch): P3 features, conditional on Phase 19+20 delivery pace
- **Technical notes** covering xterm-addon-search API, PTY tap reuse from Phase 11, context pressure surfacing options (REST vs Socket.IO), keyboard shortcut focus guard pattern
- **Milestone acceptance criteria** (7 items) and explicit out-of-scope list

### Task 2: STATE.md updated

- Current focus: `Planning v3.0 — Operator Awareness & Terminal Power Tools`
- Phase: `— (scoping v3.0)`
- Status: `v3.0 milestone scoped — ready for /gsd:new-milestone`
- Last activity and next step updated
- Quick task 2035 added to quick tasks table

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1    | `6d0c2e5` | feat(quick-2035): create v3.0 Operator Awareness & Terminal Power Tools scope |
| 2    | `eb097be` | chore(quick-2035): update STATE.md to reflect v3.0 milestone direction |

## Deviations from Plan

None — plan executed exactly as written.

## Next Step

Run `/gsd:new-milestone` with `@.planning/milestones/v3.0-SCOPE.md` as input to generate the full Phase 19 research and plan cycle.

## Self-Check: PASSED

- `.planning/milestones/v3.0-SCOPE.md` exists: FOUND (267 lines, requirement was 80)
- Commit `6d0c2e5` exists: FOUND
- Commit `eb097be` exists: FOUND
- STATE.md v3.0 references: 6 (requirement was >= 2): FOUND
- Build passes: FOUND (no regressions)
