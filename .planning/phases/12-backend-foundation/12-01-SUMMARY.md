---
phase: 12-backend-foundation
plan: 01
subsystem: api
tags: [socket.io, fs.watchFile, atomic-write, ttl-cache, singleton, node-fs]

# Dependency graph
requires: []
provides:
  - GsdRegistryService singleton with 30s TTL cache and atomic JSON writes via rename
  - GsdHookLogWatcher singleton with fs.watchFile tailing and /gsd-hooks Socket.IO namespace fan-out
affects:
  - 12-02 (gsdRoutes uses gsdRegistryService)
  - 12-03 (index.ts wires gsdHookLogWatcher.setupSocketNamespace + startWatching)
  - 13 (client plugin connects to /gsd-hooks namespace)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TTL cache with stale-on-ENOENT fallback (mirrors OpenClawConfigReader)
    - Atomic JSON write: writeFile to .tmp then rename (POSIX-atomic same-filesystem)
    - fs.watchFile singleton fan-out (safer than fs.watch for non-existent files)
    - Socket.IO namespace with per-connection backfill + namespace-wide live emit

key-files:
  created:
    - src/server/services/GsdRegistryService.ts
    - src/server/services/GsdHookLogWatcher.ts
  modified: []

key-decisions:
  - "Used fs.watchFile (not fs.watch) for /tmp/gsd-hooks.log — watchFile polls and works when file does not yet exist (Pitfall 2: file missing at server start)"
  - "Backfill reads last 200 lines (not 20) to safely cover 20+ events at ~5.7 lines/event average"
  - "stat.size <= currentOffset guard in readNewLines prevents duplicate line emission on Linux inotify dedup events (Pitfall 1)"
  - "Removed unused path import from GsdRegistryService — REGISTRY_PATH is a hardcoded absolute path, no path.join needed"

patterns-established:
  - "GsdRegistryService: singleton TTL-cache-read-patch pattern for file-backed JSON config"
  - "GsdHookLogWatcher: singleton watcher with setupSocketNamespace + startWatching + stopWatching lifecycle"

requirements-completed:
  - INFRA-02

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 12 Plan 01: Backend Foundation Services Summary

**GsdRegistryService (30s TTL cache, atomic rename writes) and GsdHookLogWatcher (fs.watchFile, /gsd-hooks Socket.IO namespace with 200-line backfill) singletons as service-layer foundation for GSD Control Center API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T09:28:14Z
- **Completed:** 2026-02-18T09:30:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- GsdRegistryService: reads recovery-registry.json with 30s TTL, falls back to cache on ENOENT, patches agents atomically via writeFile+rename, invalidates cache after write
- GsdHookLogWatcher: watches /tmp/gsd-hooks.log via fs.watchFile (polling, works before file exists), emits new lines to /gsd-hooks namespace, backfills 200 lines on connect
- Both services handle missing files gracefully (no crash on ENOENT)
- TypeScript compiles with zero errors, no new npm dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GsdRegistryService with TTL cache and atomic writes** - `49a2670` (feat)
2. **Task 2: Create GsdHookLogWatcher with fs.watchFile and Socket.IO namespace** - `3543a1e` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified
- `src/server/services/GsdRegistryService.ts` - Registry read/cache/patch service exporting `gsdRegistryService` singleton
- `src/server/services/GsdHookLogWatcher.ts` - Hook log watcher with Socket.IO namespace fan-out exporting `gsdHookLogWatcher` singleton

## Decisions Made
- Used `fs.watchFile` (not `fs.watch`) for `/tmp/gsd-hooks.log` because watchFile polls and works when the file does not yet exist at server start time
- Backfill reads last 200 lines (not 20) to safely cover ~20 events at ~5.7 lines/event average (per Pitfall 5 in research)
- `stat.size <= currentOffset` guard prevents duplicate line emission from Linux inotify batching multiple change events per write
- Removed unused `path` import from GsdRegistryService since REGISTRY_PATH is a hardcoded absolute constant

## Deviations from Plan

None - plan executed exactly as written. The only minor cleanup was removing the `path` import that the plan spec included but which wasn't needed (the REGISTRY_PATH is a hardcoded string constant, not constructed via `path.join`). This is a Rule 1 cleanup (unused import) rather than a meaningful deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Both services read/write files at known paths that are managed by the GSD skill installation.

## Next Phase Readiness

- `gsdRegistryService` ready to import in gsdRoutes.ts (Plan 02)
- `gsdHookLogWatcher` ready to wire in index.ts with `setupSocketNamespace(socketServer)` + `startWatching()` + `stopWatching()` in shutdown handler
- Both services follow existing singleton pattern — identical wiring to existing services

---
*Phase: 12-backend-foundation*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: src/server/services/GsdRegistryService.ts
- FOUND: src/server/services/GsdHookLogWatcher.ts
- FOUND: .planning/phases/12-backend-foundation/12-01-SUMMARY.md
- FOUND: commit 49a2670 (Task 1: GsdRegistryService)
- FOUND: commit 3543a1e (Task 2: GsdHookLogWatcher)
