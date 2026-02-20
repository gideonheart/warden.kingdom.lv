---
phase: quick-10
plan: 01
subsystem: gsd-manager
tags: [events, jsonl, hooks-removal, polling, ask-user-question]
dependency_graph:
  requires: []
  provides: [events-tab, gsd-event-log-service, gsd-events-api]
  affects: [GsdView, gsdRoutes, index.ts, gsdTypes]
tech_stack:
  added: []
  patterns: [polling-hook, jsonl-tail-read, pre-post-merge-grouping]
key_files:
  created:
    - src/server/services/GsdEventLogService.ts
    - src/client/hooks/useGsdEventFeed.ts
    - src/client/components/EventsTab.tsx
  modified:
    - src/shared/gsdTypes.ts
    - src/server/routes/gsdRoutes.ts
    - src/server/index.ts
    - src/client/components/GsdView.tsx
  deleted:
    - src/server/services/GsdHookLogWatcher.ts
    - src/client/hooks/useGsdHookFeed.ts
    - src/client/components/HooksTab.tsx
decisions:
  - key: jsonl-tail-64kb
    summary: Read last 64KB per JSONL file using open+read+close at computed offset — prevents loading entire multi-MB files while covering hundreds of recent events
  - key: pre-post-merge-by-tool-use-id
    summary: Group PreToolUse+PostToolUse pairs by tool_use_id into single GsdDisplayEvent — operator sees one row per tool call, not two
  - key: ask-question-merged-answers
    summary: PostToolUse tool_response.answers map merged back into Pre event's question list for inline answer display without separate state
  - key: server-side-noise-filter
    summary: Filter Notification+PermissionRequest server-side in getRecentEvents (plus client-side safety check) — reduces wire payload and rendering noise
metrics:
  duration_seconds: 234
  completed_date: 2026-02-20
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 4
  files_deleted: 3
  commits: 2
---

# Quick Task 10: Replace Hooks Tab with Events Tab Summary

**One-liner:** JSONL event log reader with Pre+Post tool-use merging, AskUserQuestion Q&A chip rendering, and full hooks infrastructure deletion.

## What Was Built

### Task 1: Server infrastructure and hooks removal

**GsdEventLogService** (`src/server/services/GsdEventLogService.ts`) — Reads `*-raw-events.jsonl` files from `/home/forge/.openclaw/workspace/skills/gsd-code-skill/logs/`. For each file, reads the last 64KB using `open+read+close` at a computed byte offset (same pattern as the deleted GsdHookLogWatcher). Merges events from all files, filters noise events (Notification, PermissionRequest) server-side, sorts by timestamp descending, and returns the requested limit.

**REST endpoint** — `GET /api/gsd/events?limit=N` added to `gsdRoutes.ts`. Default limit 100, max 500. Returns `{ events: GsdRawEvent[] }`.

**Hooks deletion:**
- Deleted `GsdHookLogWatcher.ts` (Socket.IO /gsd-hooks namespace + fs.watchFile watcher)
- Deleted `useGsdHookFeed.ts` (Socket.IO client hook with text-format parser)
- Deleted `HooksTab.tsx` (table rendering hook events)
- Removed `gsdHookLogWatcher` import, `setupSocketNamespace`, `startWatching`, `stopWatching` from `index.ts`
- Removed `GET /api/gsd/hooks/log` route and `gsdHookLogWatcher` import from `gsdRoutes.ts`

### Task 2: Client EventsTab

**useGsdEventFeed** (`src/client/hooks/useGsdEventFeed.ts`) — Polls `/api/gsd/events?limit=100` every 5 seconds. Returns `{ events, isLoading, error }`. Follows exact `useGsdRegistry` pattern with `useCallback` + `useEffect` + `setInterval`.

**EventsTab** (`src/client/components/EventsTab.tsx`) — Grouping logic processes raw events in ascending timestamp order. PreToolUse events seed a Map keyed by `tool_use_id`. PostToolUse merges answer data into AskUserQuestion entries. PostToolUseFailure upgrades the entry to `tool_failure` eventType. Standalone events (no tool_use_id) become lifecycle/prompt entries. Final list sorted descending.

Tool summaries:
- Read/Write: basename of `file_path`
- Grep/Glob: pattern truncated to 60 chars
- Bash: command truncated to 80 chars
- AskUserQuestion: question + option chips with selected answer highlighted

AskUserQuestion rendering shows question text, option chips (selected = purple accent, unselected = dim), optional header, optional notes below options.

**GsdView** updated: HooksTab import/render replaced with EventsTab, TabId union updated, tab label changed from "Hooks" to "Events".

## Verification Results

- `npm run typecheck`: zero errors
- `npm run build`: production build succeeds (Vite + tsc)
- Deleted files confirmed gone via `test ! -f`
- Zero remaining references to `GsdHookLogWatcher`, `useGsdHookFeed`, `HooksTab`, `/gsd-hooks` in `src/`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `da87821` | feat(quick-10-01): add JSONL event log service, REST endpoint, delete hooks infrastructure |
| 2 | `432e3c3` | feat(quick-10-02): add EventsTab with grouped event display, replace Hooks tab in GsdView |

## Self-Check: PASSED

Files created:
- `src/server/services/GsdEventLogService.ts` — exists
- `src/client/hooks/useGsdEventFeed.ts` — exists
- `src/client/components/EventsTab.tsx` — exists

Files deleted:
- `src/server/services/GsdHookLogWatcher.ts` — gone
- `src/client/hooks/useGsdHookFeed.ts` — gone
- `src/client/components/HooksTab.tsx` — gone

Commits verified:
- `da87821` — exists
- `432e3c3` — exists
