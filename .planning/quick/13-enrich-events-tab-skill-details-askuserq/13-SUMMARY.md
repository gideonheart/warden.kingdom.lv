---
phase: quick-13
plan: "01"
subsystem: client-events-tab
tags: [events-tab, tool-summaries, gsd-grouping, enrichment]
dependency_graph:
  requires: [quick-12]
  provides: [enriched-tool-summaries]
  affects: [gsdEventGrouping.ts, EventsTab rendering]
tech_stack:
  added: []
  patterns: [switch-case enrichment, toRelativePath reuse]
key_files:
  modified:
    - src/client/utils/gsdEventGrouping.ts
decisions:
  - "Reuse toRelativePath helper for Edit case — same pattern as Read/Write"
  - "TaskUpdate uses taskId (camelCase) field matching Claude Code tool_input payload"
  - "TaskOutput uses task_id (snake_case) field as emitted in Claude Code JSONL"
  - "Task detail includes model field for subagent spawn transparency"
  - "TaskCreate description truncated at 200 chars in detail (not summary)"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-20"
  tasks: 1
  files_modified: 1
---

# Quick Task 13: Enrich Events Tab — Skill, Task, Edit, TaskCreate, TaskUpdate, TaskOutput

**One-liner:** Added 6 enriched buildToolSummary/buildToolDetail cases so Skill/Task/Edit/TaskCreate/TaskUpdate/TaskOutput events show structured payload data instead of bare tool names.

## What Was Built

Extended `src/client/utils/gsdEventGrouping.ts` with 6 new switch cases in both `buildToolSummary()` and `buildToolDetail()`. Each case extracts meaningful fields from the tool's `tool_input` payload.

### buildToolSummary additions

| Tool | Summary format | Example |
|------|---------------|---------|
| Skill | `{skill} {args}` (truncated 80) | `gsd:discuss-phase 2` |
| Task | `{subagent_type} — {description}` (truncated 80) | `gsd-planner — Quick plan: Improve Events tab` |
| Edit | `toRelativePath(file_path)` (truncated 80) | `warden.kingdom.lv/.planning/STATE.md` |
| TaskCreate | `{subject}` (truncated 80) | `Validate plans and commit` |
| TaskUpdate | `#{taskId} -> {status}` | `#1 -> completed` |
| TaskOutput | `task: {task_id}` (truncated 60) | `task: abc123` |

### buildToolDetail additions

| Tool | Detail format |
|------|--------------|
| Skill | `skill: {skill}\nargs: {args}` (omits args if empty) |
| Task | `subagent: {type}\nmodel: {model}\ndescription: {desc}` (omits missing fields) |
| Edit | Full `file_path` string |
| TaskCreate | `subject: {subject}\ndescription: {desc}` (desc truncated 200, omits missing) |
| TaskUpdate | `taskId: {id}\nstatus: {status}` (omits missing fields) |
| TaskOutput | `task_id: {id}` or undefined if empty |

## Verification

- `npm run typecheck` passed with zero errors
- `npm run build` succeeded (102 modules, 612kB JS bundle)
- All 6 existing cases (Read, Write, Bash, Grep, Glob, AskUserQuestion) untouched
- Both switch statements now handle 12 named cases + default fallback

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Description |
|------|-------------|
| `ddade67` | feat(quick-13-01): enrich Events tab with Skill, Task, Edit, TaskCreate, TaskUpdate, TaskOutput summaries |

## Self-Check: PASSED

- [x] `src/client/utils/gsdEventGrouping.ts` modified and committed at `ddade67`
- [x] `npm run typecheck` — no errors
- [x] `npm run build` — succeeded
- [x] 6 new cases in buildToolSummary (lines 69-103)
- [x] 6 new cases in buildToolDetail (lines 138-178)
- [x] default fallback present as final case in both functions
- [x] All existing cases untouched
