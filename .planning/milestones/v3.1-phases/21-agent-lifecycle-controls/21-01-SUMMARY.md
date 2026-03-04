---
phase: 21-agent-lifecycle-controls
plan: "01"
subsystem: server
tags: [lifecycle, api, tmux, express, sqlite]
dependency_graph:
  requires: []
  provides:
    - POST /api/instances/start (202 fire-and-forget with 'starting' state)
    - POST /api/instances/:id/stop (graceful Ctrl+C + 5s grace + force kill)
    - POST /api/instances/:id/restart (inline stop-then-start)
    - POST /api/instances/:id/force-kill (immediate kill)
    - AgentInstanceStatus 'starting' and 'stopping' transitional states
    - findActiveByAgentId for 409 duplicate guard
  affects:
    - src/shared/types.ts (AgentInstanceStatus extended)
    - src/server/routes/instanceRoutes.ts (rewritten with 4 new endpoints)
    - src/server/services/TmuxSessionManager.ts (new methods)
    - src/server/services/InstanceTracker.ts (transitional state reconciliation)
    - src/server/database/DatabaseConnection.ts (new queries, updated filters)
tech_stack:
  added: []
  patterns:
    - Fire-and-forget promise chain for non-blocking session start (reuses Phase 12 pattern)
    - Polling loop with grace period for graceful shutdown
    - Optimistic status update (set 'stopping' before async work)
    - Transitional state reconciliation in InstanceTracker periodic sync
key_files:
  created: []
  modified:
    - src/shared/types.ts
    - src/server/routes/instanceRoutes.ts
    - src/server/services/TmuxSessionManager.ts
    - src/server/services/InstanceTracker.ts
    - src/server/database/DatabaseConnection.ts
decisions:
  - "Use promise chain (.then/.catch) for start fire-and-forget instead of spawn detach — tmux commands are fast (<1s) so no event loop blocking risk"
  - "buildSessionName made public to allow instanceRoutes to pre-register session name before tmux creation"
  - "markMissingSessionsStopped guards only 'active'/'idle' — 'starting'/'stopping' states have their own lifecycle handlers"
  - "GRACE_PERIOD_MS=5000 with 500ms polling granularity matches plan spec"
metrics:
  duration_seconds: 161
  completed_date: "2026-03-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 21 Plan 01: Server-Side Lifecycle API Summary

**One-liner:** Start/stop/restart/force-kill API endpoints with graceful Ctrl+C shutdown, fire-and-forget 202 starts, and transitional 'starting'/'stopping' states reconciled by InstanceTracker periodic sync.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend types and TmuxSessionManager for lifecycle operations | 81d21a3 | types.ts, TmuxSessionManager.ts |
| 2 | Add lifecycle API endpoints and InstanceTracker sync updates | 67445f4 | instanceRoutes.ts, InstanceTracker.ts, DatabaseConnection.ts |

## What Was Built

### AgentInstanceStatus Extended (Task 1)
The `AgentInstanceStatus` union type now includes 6 states: `active | idle | stopped | error | starting | stopping`. The two new transitional states allow the UI to reflect in-progress lifecycle operations without polling ambiguity.

### TmuxSessionManager New Methods (Task 1)
- `createSessionWithClaude(agentId, projectSlug, projectPath)` — creates a detached tmux session at the specified working directory and sends `claude --dangerously-skip-permissions` + Enter
- `sendCtrlC(sessionName)` — sends `C-c` key to `${sessionName}:0.0` for graceful Claude Code exit
- `buildSessionName` — promoted from private to public for instanceRoutes pre-registration

### Lifecycle API Endpoints (Task 2)

**POST /api/instances/start**
- Validates `agentId` is non-empty string
- Returns 409 if agent already has `active/idle/starting` session (via `findActiveByAgentId`)
- Looks up `workspace` path from `openclaw.json`
- Pre-registers instance with `'starting'` status for immediate UI visibility
- Fires-and-forgets `createSessionWithClaude` via promise chain; updates status to `active` on success, `error` on failure
- Returns 202 immediately

**POST /api/instances/:id/stop**
- Returns 409 if already `stopped` or `stopping`
- Sets optimistic `'stopping'` status for immediate UI feedback
- Checks session existence; if gone, marks stopped immediately
- Sends Ctrl+C, then polls every 500ms for up to 5s
- If session exits during grace period: marks stopped (graceful)
- If grace period expires: calls `destroySession` (force kill), marks stopped
- Returns `{ success, instance, forcedKill }` with forcedKill indicating whether grace period was bypassed

**POST /api/instances/:id/restart**
- Performs inline stop logic (skips grace period overhead is minimal)
- Derives new session name (new UUID suffix for clean state)
- Pre-registers with `'starting'`, fires-and-forgets start
- Returns 202

**POST /api/instances/:id/force-kill**
- Immediately calls `destroySession` without any grace period
- Intended for operator use when 5s grace period is unacceptable
- Returns 200

### DatabaseConnection Updates (Task 2)
- `findActiveInstanceByAgentId(agentId)` — queries `status IN ('active', 'idle', 'starting')` for duplicate guard
- `listActiveInstances()` — now includes `'starting'` and `'stopping'` so transitional sessions appear in tab bar
- `markMissingSessionsStopped()` — comment documents intentional exclusion of `'starting'`/`'stopping'` from auto-stop

### InstanceTracker Transitional State Reconciliation (Task 2)
New `reconcileTransitionalStates()` runs at end of each `syncWithTmux()` cycle:
- `'starting'` sessions: if tmux session appeared and `lastActiveAt` > 15s ago → promote to `'active'`; if never appeared after 30s → mark `'error'`
- `'stopping'` sessions: if tmux session gone → mark `'stopped'`; if still running after 15s → force kill + mark `'stopped'`

## Verification Results

- `npx tsc --noEmit --project tsconfig.server.json` — PASS
- `npx tsc --noEmit` (client + shared) — PASS
- `npm run build` — PASS (chunk size warning is pre-existing, not introduced here)
- All 6 `AgentInstanceStatus` states confirmed in `types.ts`
- `execFile` (not `exec`) used throughout `TmuxSessionManager` per Phase 12 decision
- `/api/instances/start` returns 202 and does not block Node event loop
- `/api/instances/:id/stop` implements Ctrl+C + 5s grace + force kill

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
