---
phase: 12-backend-foundation
plan: 02
subsystem: api
tags: [express-router, input-validation, path-traversal, fire-and-forget, socket.io]

# Dependency graph
requires:
  - 12-01 (GsdRegistryService singleton, GsdHookLogWatcher singleton)
provides:
  - gsdRoutes Express Router with 6 validated REST endpoints
  - GsdHookLogWatcher wired into server lifecycle (start/stop)
  - All GSD API surface accessible via curl
affects:
  - 13 (client plugin consumes these endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inline regex validation (no middleware library) per existing project pattern
    - fire-and-forget spawn with detached:true + child.unref() for long-blocking scripts
    - String(request.params.foo) cast to avoid Express 5 string|string[] params type
    - dynamic import of fs/promises readFile inside route handler (avoids top-level import conflict)

key-files:
  created:
    - src/server/routes/gsdRoutes.ts
  modified:
    - src/server/index.ts
    - src/server/services/GsdHookLogWatcher.ts

key-decisions:
  - "String(request.params.x) cast resolves Express 5 ParamsDictionary string|string[] type error without introducing request generics"
  - "readLastLines changed from private to public on GsdHookLogWatcher to allow REST endpoint access without a wrapper method"
  - "dynamic import of readFile inside GET /sessions/:session/state handler avoids naming conflict with top-level readFile import"

patterns-established:
  - "All GSD endpoints follow instanceRoutes.ts pattern: Router() + named export + inline validation + try-catch 500"
  - "GsdHookLogWatcher lifecycle: setupSocketNamespace + startWatching on boot, stopWatching in handleShutdown"

requirements-completed:
  - INFRA-01
  - INFRA-03

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 12 Plan 02: GSD Routes and Server Wiring Summary

**GSD REST API: 6 fully-validated endpoints (registry read/patch, spawn fire-and-forget, session command dispatch, session state read, hook log read) wired into Express server with GsdHookLogWatcher lifecycle management**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T09:32:27Z
- **Completed:** 2026-02-18T09:36:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `src/server/routes/gsdRoutes.ts`: 6 REST endpoints with full inline validation
  - `GET /api/gsd/registry`: returns registry JSON from GsdRegistryService
  - `PATCH /api/gsd/registry/agents/:agentId`: toggles enabled flag with 404 on missing agent
  - `POST /api/gsd/spawn`: validates workdir prefix + firstCommand char allowlist; 202 fire-and-forget
  - `POST /api/gsd/sessions/:session/command`: dispatches action via menu-driver.sh; ALLOWED_ACTIONS set
  - `GET /api/gsd/sessions/:session/state`: reads STATE.md from agent working_directory, null on ENOENT
  - `GET /api/gsd/hooks/log`: returns last N lines (1-1000, default 200) from hook log
- All security rejections verified: path traversal → 400, shell metacharacters → 400, invalid session names → 400, invalid actions → 400
- `src/server/index.ts`: gsdRoutes mounted, GsdHookLogWatcher started on boot and stopped on shutdown
- `src/server/services/GsdHookLogWatcher.ts`: readLastLines changed from private to public
- TypeScript compiles with zero errors, no new npm dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create gsdRoutes with 6 validated endpoints** - `455bc4f` (feat)
2. **Task 2: Wire GSD routes and services into server entry point** - `96be120` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified

- `src/server/routes/gsdRoutes.ts` — Router with 6 GSD endpoints, all inputs validated before shell/FS operations
- `src/server/index.ts` — imports gsdRoutes and gsdHookLogWatcher; mounts routes; lifecycle wiring
- `src/server/services/GsdHookLogWatcher.ts` — readLastLines visibility changed private → public

## Decisions Made

- Used `String(request.params.x)` to resolve Express 5 `ParamsDictionary` `string | string[]` type error; no need for Request generics or external type libraries
- `readLastLines` made public on `GsdHookLogWatcher` rather than adding a wrapper method — simpler and the REST-only caller context doesn't warrant a separate public API
- Dynamic `import('fs/promises')` inside the `/sessions/:session/state` handler was initially considered to avoid top-level naming conflicts; ultimately used a top-level `readFile` import directly since `execFileAsync` uses the `execFile` symbol not `readFile`

## Deviations from Plan

None — plan executed exactly as written. The only minor deviation was a TypeScript fix: Express 5's `ParamsDictionary` types `request.params[key]` as `string | string[]`. Resolved by wrapping with `String()` before regex tests. This is Rule 1 (type error = blocking bug) — fix inline, no user permission needed.

## Issues Encountered

None. All 6 endpoints return correct responses. Validation rejects exactly the cases specified in the plan.

## User Setup Required

None — all endpoints use services and paths already defined in Plan 01.

## Next Phase Readiness

- All 6 GSD REST endpoints accessible at `http://127.0.0.1:3001/api/gsd/*`
- `/gsd-hooks` Socket.IO namespace live and backfilling on connect
- Phase 13 client plugin can import and call all endpoints immediately

---
*Phase: 12-backend-foundation*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: src/server/routes/gsdRoutes.ts
- FOUND: src/server/index.ts
- FOUND: src/server/services/GsdHookLogWatcher.ts
- FOUND: .planning/phases/12-backend-foundation/12-02-SUMMARY.md
- FOUND: commit 455bc4f (Task 1: gsdRoutes 6 endpoints)
- FOUND: commit 96be120 (Task 2: server wiring)
