---
phase: quick-2043
plan: 1
subsystem: planning
tags: [milestone-planning, options-analysis]
dependency_graph:
  requires: []
  provides: [MILESTONE-OPTIONS.md with three fresh v4.x proposals]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/2043-propose-3-concrete-next-milestone-direct/MILESTONE-OPTIONS.md
  modified: []
decisions:
  - "Three fresh milestones proposed: v4.1 Smart Agent Health Monitor, v4.2 Live Fleet Coordination View, v4.3 Operator Prompt Workbench"
  - "Recommended v4.1 (Health Monitor) as next milestone — highest-impact untracked failure mode, builds on existing NotificationPoller infrastructure"
  - "Sequencing: Health Monitor → Fleet Coordination → Prompt Workbench"
metrics:
  duration_minutes: 2
  completed_date: 2026-03-05
  tasks_completed: 1
  files_created: 1
---

# Phase quick-2043 Plan 1: Fresh Milestone Proposals Summary

**One-liner:** Three v4.x milestone proposals — Smart Agent Health Monitor, Live Fleet Coordination, Operator Prompt Workbench — with recommended pick and sequencing rationale.

## What Was Built

Created `MILESTONE-OPTIONS.md` (196 lines) with three concrete, distinct milestone proposals for Warden beyond the already-shipped v3.2/v3.3 and the previously-proposed Multi-Agent Audit (v4.0).

**Option A — v4.1: Smart Agent Health Monitor**
- Stall detection via sliding-window output velocity analysis on existing tmux capture-pane feed
- Health score (0-100) per session with configurable per-agent policy: watch-only, auto-ping, auto-restart
- `agent_health_events` SQLite table, Health dashboard panel, Telegram integration for health alerts
- 4 phases, High impact, High effort
- 6 requirement IDs: HLT-01 through HLT-06

**Option B — v4.2: Live Fleet Coordination View**
- Compact 2-3 column grid of all active agents with last terminal output and active file list
- File-activity parser extracting file paths from Claude Code tool output patterns
- Conflict detection when two agents touch the same file within TTL window
- Multi-agent prompt broadcast with per-agent status
- 4 phases, Medium-High impact, Medium effort
- 6 requirement IDs: FLT-01 through FLT-06

**Option C — v4.3: Operator Prompt Workbench**
- Saved prompt templates with `{{variable}}` substitution stored in SQLite
- Prompt history with FTS5 full-text search, per-agent filter
- Prompt queue that fires when agent returns to idle (InstanceTracker hook)
- Broadcast mode for sending same prompt to multiple agents
- 4 phases, Medium impact, Medium effort
- 6 requirement IDs: WRK-01 through WRK-06

**Recommendation:** Option A (v4.1 Health Monitor) — addresses highest-impact untracked failure mode, reuses existing NotificationPoller data stream, pays dividends forward to Fleet View and Audit milestone. Default policy is watch-only making it safe to ship incrementally.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `.planning/quick/2043-propose-3-concrete-next-milestone-direct/MILESTONE-OPTIONS.md` exists (196 lines, above 150-line minimum)
- [x] Three options present, none are Multi-Agent Audit or UX cleanup
- [x] Each option has 6 requirement IDs (HLT-01-06, FLT-01-06, WRK-01-06)
- [x] Recommendation section with pick + sequencing present
- [x] Commit 11b72ac verified in git log
