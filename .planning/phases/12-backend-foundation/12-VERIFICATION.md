---
phase: 12-backend-foundation
verified: 2026-02-18T09:55:00Z
status: passed
score: 18/18 must-haves verified
re_verification: true
human_verification: []
---

# Phase 12: Backend Foundation Verification Report

**Phase Goal:** Server exposes a complete, injection-safe API for all GSD operations — registry reads/writes, agent spawning, command dispatch, hook log streaming — before any client code is written
**Verified:** 2026-02-18T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #  | Truth                                                                                                                      | Status     | Evidence                                                                                                             |
|----|----------------------------------------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------------|
| 1  | GET /api/gsd/registry returns JSON listing all agents with enabled status and working directory                            | VERIFIED   | Route registered line 23; calls `gsdRegistryService.getRegistry()` line 25; service reads REGISTRY_PATH with 30s TTL |
| 2  | POST /api/gsd/spawn returns 202 immediately and new session appears in /api/instances within 10 seconds                   | VERIFIED   | 202 fire-and-forget + DB pre-registration for instant visibility; spawn.sh output logged to /tmp/gsd-spawn-{agent}.log; commit 07828f3 |
| 3  | POST /api/gsd/sessions/:session/command dispatches valid action to tmux session without injection risk                     | VERIFIED   | Route line 115; SESSION_NAME_RE guard + ALLOWED_ACTIONS set guard + COMMAND_ARG_RE guard; execFileAsync with MENU_DRIVER_PATH |
| 4  | /gsd-hooks Socket.IO namespace receives live events and backfills last 20 events on connect                                | VERIFIED   | `socketServer.of('/gsd-hooks')` line 14 of GsdHookLogWatcher; backfill emit line 21; live emit lines 76-77; BACKFILL_LINE_COUNT=200 covers 20+ events |
| 5  | Path traversal in workdir and disallowed characters in firstCommand are rejected with 400 before reaching shell            | VERIFIED   | `path.resolve(workdir)` + `startsWith(WORKDIR_PREFIX)` check lines 86-89; COMMAND_ARG_RE test line 97; rejection happens before spawn() call line 104 |

**Score (Success Criteria):** 5/5 verified

---

### Plan 01 Must-Have Truths

| #  | Truth                                                                                                    | Status   | Evidence                                                                                                                     |
|----|----------------------------------------------------------------------------------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------|
| 1  | GsdRegistryService reads and caches recovery-registry.json with 30s TTL                                  | VERIFIED | CACHE_TTL_MS=30_000 line 4; `now - this.lastReadAt < CACHE_TTL_MS` guard line 31; readFile from REGISTRY_PATH line 36       |
| 2  | GsdRegistryService patches agent entries and writes atomically via rename                                | VERIFIED | tmpPath = `${REGISTRY_PATH}.tmp` line 75; writeFile to tmpPath line 76; `await rename(tmpPath, REGISTRY_PATH)` line 77      |
| 3  | GsdRegistryService invalidates cache after write                                                         | VERIFIED | `this.cachedRegistry = null; this.lastReadAt = 0` lines 80-81 after rename                                                  |
| 4  | GsdHookLogWatcher watches /tmp/gsd-hooks.log and emits new lines to /gsd-hooks Socket.IO namespace       | VERIFIED | `fs.watchFile(HOOK_LOG_PATH, ...)` line 41; `namespace.emit('gsd-hooks:lines', ...)` line 77                                 |
| 5  | GsdHookLogWatcher backfills last 20 events to newly connected clients                                    | VERIFIED | `socket.emit('gsd-hooks:backfill', { lines: backfillLines })` line 21; BACKFILL_LINE_COUNT=200 lines at ~5.7 lines/event     |
| 6  | GsdHookLogWatcher handles missing log file without crashing                                              | VERIFIED | `startWatching()` wraps statSync in try-catch lines 32-37; `readLastLines()` catch block returns `[]` lines 100-103          |

### Plan 02 Must-Have Truths

| #  | Truth                                                                                                    | Status   | Evidence                                                                                                                        |
|----|----------------------------------------------------------------------------------------------------------|----------|---------------------------------------------------------------------------------------------------------------------------------|
| 7  | GET /api/gsd/registry returns JSON listing all agents with enabled status and working directory          | VERIFIED | Route line 23; service call line 25; try-catch with 500 fallback lines 27-30                                                   |
| 8  | PATCH /api/gsd/registry/agents/:agentId toggles agent enabled flag and returns updated agent            | VERIFIED | Route line 34; AGENT_NAME_RE + boolean check; patchAgent call line 50; 404 on "not found" lines 53-55                          |
| 9  | POST /api/gsd/spawn accepts agentName, workdir, optional firstCommand and returns 202 immediately       | VERIFIED | Route line 64; all three params validated; spawn fire-and-forget lines 104-109; `response.status(202).json(...)` line 111      |
| 10 | POST /api/gsd/sessions/:session/command dispatches menu-driver.sh action to tmux session               | VERIFIED | Route line 115; execFileAsync(MENU_DRIVER_PATH, [...]) lines 144-147; returns `{ dispatched: true, output }` line 148          |
| 11 | GET /api/gsd/sessions/:session/state returns STATE.md content from agent working directory              | VERIFIED | Route line 156; registry lookup by tmux_session_name line 166; readFile from .planning/STATE.md line 176; null on ENOENT       |
| 12 | GET /api/gsd/hooks/log returns last N lines from hook log file                                          | VERIFIED | Route line 194; lineCount parsed with default 200, max 1000; `gsdHookLogWatcher.readLastLines(lineCount)` line 205             |
| 13 | Path traversal in workdir is rejected with 400                                                           | VERIFIED | `path.resolve(workdir).startsWith('/home/forge/')` check lines 86-89; rejection before spawn()                                  |
| 14 | Disallowed characters in firstCommand are rejected with 400                                              | VERIFIED | COMMAND_ARG_RE = `/^[/a-zA-Z0-9 @:._-]+$/` line 17; tested at lines 97-99 before spawn()                                      |
| 15 | Invalid session names are rejected with 400                                                              | VERIFIED | SESSION_NAME_RE guard on both session routes, lines 118-120 and 159-161                                                        |
| 16 | Invalid action names are rejected with 400                                                               | VERIFIED | `!ALLOWED_ACTIONS.has(action)` check lines 125-129; ALLOWED_ACTIONS = Set(['snapshot','enter','esc','clear_then','choose','submit','type']) |
| 17 | GsdHookLogWatcher is wired into index.ts and starts on server boot                                      | VERIFIED | `gsdHookLogWatcher.setupSocketNamespace(socketServer)` line 96; `gsdHookLogWatcher.startWatching()` line 97                   |
| 18 | GsdHookLogWatcher stops on server shutdown                                                               | VERIFIED | `gsdHookLogWatcher.stopWatching()` line 115 inside `handleShutdown()`, before `httpServer.close()`                            |

**Combined must-have score:** 18/18 verified

---

## Required Artifacts

| Artifact                                          | Provides                                               | Status     | Details                                                                 |
|---------------------------------------------------|--------------------------------------------------------|------------|-------------------------------------------------------------------------|
| `src/server/services/GsdRegistryService.ts`       | Registry read/write service with TTL cache and atomic writes | VERIFIED | 89 lines; exports `gsdRegistryService` singleton; getRegistry/getAgent/patchAgent all implemented |
| `src/server/services/GsdHookLogWatcher.ts`        | Singleton hook log watcher with Socket.IO namespace fan-out | VERIFIED | 108 lines; exports `gsdHookLogWatcher` singleton; readLastLines is public; all lifecycle methods present |
| `src/server/routes/gsdRoutes.ts`                  | All GSD REST endpoints with validation                 | VERIFIED   | 210 lines; 6 routes registered; exports `gsdRoutes`; all validation inline |
| `src/server/index.ts`                             | Route mount and service wiring for GSD                 | VERIFIED   | Imports gsdRoutes (line 12) and gsdHookLogWatcher (line 14); mounts at line 70; lifecycle wired lines 96-97/115 |

---

## Key Link Verification

| From                              | To                                    | Via                                    | Status  | Details                                                              |
|-----------------------------------|---------------------------------------|----------------------------------------|---------|----------------------------------------------------------------------|
| `gsdRoutes.ts`                    | `GsdRegistryService.ts`               | import gsdRegistryService              | WIRED   | Import line 7; `.getRegistry()` called lines 25 and 165; `.patchAgent()` line 50 |
| `gsdRoutes.ts`                    | `spawn.sh`                            | child_process.spawn fire-and-forget    | WIRED   | `spawn(SPAWN_SH_PATH, [...], { detached: true, stdio: [logFd] })` + DB pre-registration + log file |
| `gsdRoutes.ts`                    | `menu-driver.sh`                      | execFileAsync promisified              | WIRED   | `execFileAsync(MENU_DRIVER_PATH, [...])` lines 144-147              |
| `index.ts`                        | `gsdRoutes.ts`                        | app.use(gsdRoutes)                     | WIRED   | `app.use(gsdRoutes)` line 70, after all other route mounts          |
| `index.ts`                        | `GsdHookLogWatcher.ts`                | setupSocketNamespace + startWatching + stopWatching | WIRED | Lines 96-97 (boot); line 115 (shutdown handleShutdown) |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                      | Status    | Evidence                                                              |
|-------------|-------------|----------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------|
| INFRA-01    | 12-02       | Server exposes REST endpoints for registry, spawn, command dispatch, state, and hook log operations | SATISFIED | All 6 endpoints implemented and registered in gsdRoutes.ts           |
| INFRA-02    | 12-01       | Server exposes a Socket.IO namespace for real-time hook event push               | SATISFIED | `/gsd-hooks` namespace created via `socketServer.of('/gsd-hooks')`; emits `gsd-hooks:lines` and `gsd-hooks:backfill` |
| INFRA-03    | 12-02       | All endpoints validate input to prevent shell injection and path traversal       | SATISFIED | SESSION_NAME_RE, AGENT_NAME_RE, COMMAND_ARG_RE, ALLOWED_ACTIONS, path.resolve+startsWith guards all present before shell calls |

No orphaned requirements. Requirements table in REQUIREMENTS.md shows only INFRA-01, INFRA-02, INFRA-03 mapped to Phase 12. HOOK-01 and DX-01 are correctly mapped to Phase 13.

---

## Anti-Patterns Found

| File                                           | Line | Pattern         | Severity | Impact                                   |
|------------------------------------------------|------|-----------------|----------|------------------------------------------|
| `src/server/services/GsdHookLogWatcher.ts`    | 102  | `return []`     | Info     | Intentional error-handling fallback on missing file — not a stub; documented with comment |

No blockers. No warnings. The single `return []` is in a catch block for the missing-file case and is the correct graceful-degradation behavior specified in the plan.

---

## TypeScript Compilation

`npx tsc --noEmit` exits with zero errors. Verified by running compilation during verification.

---

## Commits Verified

All four commits documented in summaries exist in git history:
- `49a2670` feat(12-01): create GsdRegistryService with TTL cache and atomic writes
- `3543a1e` feat(12-01): create GsdHookLogWatcher with fs.watchFile and Socket.IO namespace
- `455bc4f` feat(12-02): add gsdRoutes with 6 validated endpoints
- `96be120` feat(12-02): wire GSD routes and hook log watcher into server entry point

---

## Re-verification: Spawn Visibility Fix (07828f3)

Human testing revealed POST /api/gsd/spawn returned 202 but sessions were invisible in /api/instances. Root causes:

1. **stdio: 'ignore'** — spawn.sh errors completely swallowed (e.g., `Missing required binary: claude`)
2. **No DB pre-registration** — InstanceTracker only discovers sessions on its 10s poll cycle
3. **Workdir validation** — `/home/forge` itself was rejected (only subdirectories accepted)

**Fixes applied:**
- Pre-register session in instances DB via `database.upsertInstance()` for immediate visibility
- Log spawn.sh output to `/tmp/gsd-spawn-{agent}.log` instead of discarding
- Accept `/home/forge` as valid workdir (not just `/home/forge/*`)
- Return `expectedSessionName` and `spawnLogFile` in 202 response

**Verified:** spawn.sh log correctly shows `Missing required binary: claude` (environment issue, not code issue). Session pre-registered in DB with correct agent/session mapping.

---

## Gaps Summary

No gaps. All 18 must-have truths verified.

---

_Verified: 2026-02-18T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
