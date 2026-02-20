---
phase: quick-11
plan: 01
subsystem: ui
tags: [react, events, jsonl, express, typescript]

# Dependency graph
requires:
  - phase: quick-10
    provides: EventsTab component and GsdEventLogService with JSONL reading
provides:
  - SPA fallback that explicitly skips /api/ and /socket.io/ paths
  - GsdEventSource type for log file metadata
  - listLogFiles() returning per-file metadata from LOGS_DIR
  - getRecentEvents(limit, source?) with optional single-file filtering
  - GET /api/gsd/events/sources endpoint
  - Source selector dropdown in EventsTab with All agents / per-file options
  - useGsdEventSources hook for fetching available log files
affects: [EventsTab, GsdEventLogService, gsdRoutes, useGsdEventFeed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Negative lookahead SPA regex /^\/(?!api\/|socket\.io\/).*/ to protect API routes
    - Optional source parameter with path-traversal validation in service layer
    - Separate useGsdEventSources hook (mount-only fetch, no polling) vs useGsdEventFeed (polled)
    - sourceSelector variable computed once, reused across all render paths (loading/error/empty/populated)

key-files:
  created: []
  modified:
    - src/server/index.ts
    - src/server/services/GsdEventLogService.ts
    - src/server/routes/gsdRoutes.ts
    - src/shared/gsdTypes.ts
    - src/client/hooks/useGsdEventFeed.ts
    - src/client/components/EventsTab.tsx

key-decisions:
  - "SPA fallback regex uses negative lookahead (?!api/|socket.io/) so Express never serves index.html for API routes even when dist/client exists"
  - "source filter validated server-side: must end with -raw-events.jsonl and contain no path separators or .. to prevent directory traversal"
  - "useGsdEventSources fetches once on mount (no polling) - file list is stable between sessions"
  - "sourceSelector computed once as JSX variable and reused in loading/error/empty/main render paths so dropdown persists during state transitions"

patterns-established:
  - "API fallback guard: SPA catch-all regex must use /^\/(?!api\/).*/ pattern to prevent API routes returning HTML"
  - "Source selector pattern: compute selector JSX once, include in all render branches to prevent layout shift"

requirements-completed: [EVENTS-FIX-01, EVENTS-FIX-02]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Quick-11: Fix Events Tab - Agent-Selectable JSONL Files Summary

**SPA fallback patched to never serve HTML to /api/* routes, plus agent source selector dropdown in EventsTab showing per-file JSONL log filtering with file sizes**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-20T09:47:38Z
- **Completed:** 2026-02-20T09:52:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed root cause of HTML-instead-of-JSON: SPA catch-all `/.*/` now uses `/^\/(?!api\/|socket\.io\/).*/` so API routes never get intercepted
- Added `GsdEventSource` interface and `listLogFiles()` to expose per-file metadata (filename, label, sizeBytes)
- Added `GET /api/gsd/events/sources` endpoint returning all available JSONL log files
- Added optional `?source=` query param to `GET /api/gsd/events` for single-file event filtering
- Added `useGsdEventSources` hook and source selector dropdown in EventsTab with human-readable labels and file sizes

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix SPA fallback and add agent source filtering to backend** - `9a73ac1` (feat)
2. **Task 2: Add agent source selector to EventsTab UI** - `1318417` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/server/index.ts` - SPA fallback regex now uses negative lookahead to skip /api/ and /socket.io/ paths
- `src/server/services/GsdEventLogService.ts` - Added listLogFiles(), source parameter to getRecentEvents(), path-traversal validation
- `src/server/routes/gsdRoutes.ts` - Added GET /api/gsd/events/sources endpoint, optional ?source= param on events endpoint
- `src/shared/gsdTypes.ts` - Added GsdEventSource interface (filename, label, sizeBytes)
- `src/client/hooks/useGsdEventFeed.ts` - Added source parameter to useGsdEventFeed, added useGsdEventSources hook
- `src/client/components/EventsTab.tsx` - Added source selector dropdown, formatBytes helper, sourceSelector variable pattern

## Decisions Made
- SPA regex uses negative lookahead rather than separate `app.use()` ordering — simpler and more explicit about intent
- Source filename validation in the service layer (not route layer) — keeps security logic close to file access
- `useGsdEventSources` is mount-only (no polling interval) since the file list only changes when new agent sessions start
- `sourceSelector` JSX computed once as a variable and included in all render branches — prevents the selector disappearing when filtered source has no events

## Deviations from Plan

None - plan executed exactly as written. One structural improvement made: the plan showed source selector only in the main return path, but I surfaced it in all render branches (loading/error/empty) so the selector persists during state transitions. This is strictly better UX and within the scope of the plan's intent.

## Issues Encountered

During verification, the running server was found to be an old production build (`dist/server/`) rather than the tsx dev server, so the SPA fallback fix wasn't reflected in initial curl tests. Killed the old server and started a fresh `npm run dev` instance to verify the fix. No code changes required.

## Next Phase Readiness

Events tab is now fully functional with reliable JSON responses and per-agent filtering. No pending work from this quick task.

---
*Phase: quick-11*
*Completed: 2026-02-20*
