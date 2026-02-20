---
phase: quick-12
plan: "01"
subsystem: client-gsd-events
tags: [ui, events-tab, ux, srp, expandable-rows, session-filter]
dependency_graph:
  requires: [quick-11]
  provides: [improved-events-tab-ui]
  affects: [src/client/components/EventsTab.tsx, src/client/utils/gsdEventGrouping.ts, src/shared/gsdTypes.ts]
tech_stack:
  added: []
  patterns: [srp-utility-extraction, expandable-rows, client-side-filter]
key_files:
  created:
    - src/client/utils/gsdEventGrouping.ts
  modified:
    - src/client/components/EventsTab.tsx
    - src/shared/gsdTypes.ts
decisions:
  - "Extract grouping logic to dedicated utility to satisfy SRP — rendering and grouping were co-located in EventsTab.tsx (428 LOC)"
  - "toRelativePath strips /home/forge/ prefix for Read/Write summaries — shows warden.kingdom.lv/src/... instead of just filename"
  - "Bash buildToolSummary prefers description field over command text — Claude Code always sets description as human-readable intent"
  - "AskUserQuestion summary shows first question text truncated to 60 chars — more descriptive than static 'AskUserQuestion' label"
  - "PostToolUseFailure appends full error to detail field — summary line stays truncated (120 chars), expanded view shows full error"
  - "Session filter resets via useEffect when source changes — prevents stale filter after agent switch"
  - "Expandable row uses expandedId state (not per-row state) — single expanded row at a time, standard accordion pattern"
  - "Q&A (QuestionDisplay) and error details moved to expanded view only — removes always-visible expansion below each event"
metrics:
  duration_minutes: 2
  completed_date: "2026-02-20"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
---

# Quick Task 12: Improve Events Tab UI — Richer Details and Expandable Rows Summary

**One-liner:** Extracted grouping logic to utility module and enhanced EventsTab with expandable rows showing full tool details, session filter dropdown, and improved summaries (Bash description, relative paths, AskUserQuestion text).

## What Was Built

Enhanced the Events tab in the GSD Manager panel with:

1. **SRP extraction** — `groupRawEvents` and all helper functions moved from EventsTab.tsx to `src/client/utils/gsdEventGrouping.ts`. EventsTab is now a pure rendering component.

2. **Improved summary text:**
   - **Bash events** — Use `description` field as primary summary (human-readable intent like "Record plan start time") instead of raw command text.
   - **Read/Write events** — Show path relative to `/home/forge/` (e.g., `warden.kingdom.lv/src/client/...`) instead of just the basename.
   - **AskUserQuestion** — Show first question text truncated to 60 chars instead of static "AskUserQuestion".
   - **Grep** — Include `in ${path}` suffix if path is present.

3. **Expandable rows** — Click any event row to expand a detail panel showing:
   - Session, full timestamp, tool name
   - Full `detail` text (command, path, pattern, full prompt)
   - Full error message (for tool_failure events)
   - Q&A options with answers highlighted (for ask_question events, moved from always-visible)

4. **Session filter dropdown** — Appears next to the source selector, populated from unique session values in loaded events. Resets when source changes.

5. **GsdDisplayEvent.detail field** — Added optional `detail?: string` to the shared type. Populated by grouping logic per tool type.

## Files Modified

| File | Change |
|------|--------|
| `src/shared/gsdTypes.ts` | Added `detail?: string` to `GsdDisplayEvent` |
| `src/client/utils/gsdEventGrouping.ts` | New file — `groupRawEvents`, `buildToolSummary`, `buildToolDetail`, helpers |
| `src/client/components/EventsTab.tsx` | Removed grouping logic, added session filter + expandable rows (301 lines, was 428) |

## Commits

| Hash | Description |
|------|-------------|
| `8a9be67` | feat(quick-12-01): extract grouping logic to utility, add detail field to GsdDisplayEvent |
| `8a38889` | feat(quick-12-02): add expandable rows, session filter, update EventsTab rendering |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- FOUND: src/client/utils/gsdEventGrouping.ts
- FOUND: src/client/components/EventsTab.tsx
- FOUND: src/shared/gsdTypes.ts

Commits verified:
- FOUND: 8a9be67
- FOUND: 8a38889

Verification:
- tsc --noEmit: 0 errors
- groupRawEvents defined only in utility (0 definitions in EventsTab)
- EventsTab imports from ../utils/gsdEventGrouping.js
- GsdDisplayEvent has detail? field
- EventsTab reduced from 428 to 301 lines
