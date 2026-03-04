---
phase: 21-agent-lifecycle-controls
verified: 2026-03-04T07:30:00Z
status: passed
score: 5/5 success criteria verified
re_verification: true
previous_status: gaps_found
previous_score: 4/5
gaps_closed:
  - "Stopped/errored sessions now returned by /api/instances for 30 minutes via OR clause in listActiveInstances() — stopped tabs persist in tab bar for Restart access"
gaps_remaining: []
regressions: []
human_verification:
  - test: "Start an agent session, wait for active state, click Stop and confirm"
    expected: "Tab shows orange pulsing Stopping... badge, then transitions to gray Stopped badge with Restart button — tab remains visible for 30 minutes after stopping"
    why_human: "Real-time badge transitions and tab persistence require running app; the SQL fix is confirmed but visual persistence needs manual observation"
  - test: "With a stopped tab visible (within 30 minutes of stopping), click Restart and confirm the amber dialog"
    expected: "New session starts with same agent identity, tab shows yellow Starting... badge, then transitions to green Active within 15 seconds"
    why_human: "Depends on real tmux session creation and InstanceTracker 10s polling cycle"
  - test: "Click Start on a running agent in the sidebar"
    expected: "Start button shows 'Running' (disabled state) — no duplicate session created"
    why_human: "Visual disabled state requires human inspection"
---

# Phase 21: Agent Lifecycle Controls Verification Report

**Phase Goal:** Operator can start, stop, and restart agent sessions from the dashboard with safety dialogs and real-time lifecycle state tracking — Warden transitions from observer to active controller.
**Verified:** 2026-03-04T07:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 21-03)

## Re-Verification Summary

Previous verification (2026-03-04T07:00:00Z) found 1 gap:

- **SC-3 PARTIAL:** Stopped sessions disappeared from API response, preventing operators from clicking Restart on stopped tabs. Root cause: `listActiveInstances()` WHERE clause excluded `'stopped'` and `'error'` statuses.

Gap closure plan 21-03 applied a single SQL OR clause fix (commit `93b4f4a`) to `src/server/database/DatabaseConnection.ts`. Re-verification confirms the fix is correctly implemented, the commit exists, the build passes, and no regressions were introduced to previously-passing items.

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can select any configured agent and click Start; a new tmux session with Claude Code running appears as a tab within 15 seconds | VERIFIED | `POST /api/instances/start` exists; returns 202; `createSessionWithClaude` fires async; pre-registers with 'starting'; InstanceTracker promotes to active; AgentSidebar `StartButton` wired to `handleStartAgent` in App.tsx |
| 2 | Operator can click Stop; confirmation dialog appears, Claude Code receives Ctrl+C, session enters stopping state for up to 5s, then tmux session is killed and tab reflects stopped | VERIFIED | `gracefulStopSession()` sends Ctrl+C, polls at 500ms intervals for 5s, then force-kills; InstanceTabBar has `confirmingStopSession` state with inline dialog; `STATUS_COLORS.stopping = 'bg-warden-error/60 animate-pulse'`; TerminalView stopping overlay at line 702 |
| 3 | Operator can restart a stopped or errored session; restart triggers stop-then-start with same agent identity and project path; stopped tab remains visible for restart access | VERIFIED | `listActiveInstances()` now includes `OR (status IN ('stopped', 'error') AND last_active_at >= datetime('now', '-30 minutes'))` — stopped tabs persist for 30 min; `POST /api/instances/:id/restart` stops then starts with same identity; Restart button in InstanceTabBar for stopped/error status; TerminalView stopped overlay has Restart button |
| 4 | Session tab badges display all four lifecycle states — starting, active, stopping, stopped — with visually distinct indicators that update in real time without page reload | VERIFIED | `STATUS_COLORS`: `active: 'bg-warden-success'`, `idle: 'bg-warden-idle'`, `starting: 'bg-warden-warning animate-pulse'`, `stopping: 'bg-warden-error/60 animate-pulse'`, `stopped: 'bg-warden-idle'`, `error: 'bg-warden-error'`; InstanceTabBar renders status dot and label for non-active states; useActiveInstances polls every 10s |
| 5 | Start button is disabled when the agent already has an active session; duplicate start attempts via the API return HTTP 409; stop and restart require a confirmation dialog before executing | VERIFIED | `activeAgentIds` Set in App.tsx (active/idle/starting statuses); passed to AgentSidebar; `StartButton` renders "Running" (disabled) when `isActive`; API returns 409 via `instanceTracker.findActiveByAgentId`; InstanceTabBar has both `confirmingStopSession` and `confirmingRestartSession` state with inline confirm/cancel |

**Score:** 5/5 success criteria verified

---

## Required Artifacts

### Plan 21-01 Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/shared/types.ts` | VERIFIED | `AgentInstanceStatus = 'active' \| 'idle' \| 'stopped' \| 'error' \| 'starting' \| 'stopping'` |
| `src/server/routes/instanceRoutes.ts` | VERIFIED | POST /start (202), POST /:id/stop (graceful), POST /:id/restart (202), POST /:id/force-kill (200) all present |
| `src/server/services/TmuxSessionManager.ts` | VERIFIED | `createSessionWithClaude()` line 50, `sendCtrlC()` line 57 confirmed present |
| `src/server/services/InstanceTracker.ts` | VERIFIED | `reconcileTransitionalStates()`, `findActiveByAgentId()`, `updateStatus()` all confirmed present |

### Plan 21-02 Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/client/components/AgentSidebar.tsx` | VERIFIED | `StartButton` sub-component at line 25; `onStartAgent`/`activeAgentIds` props; disabled when `activeAgentIds.has(agent.id)` |
| `src/client/components/InstanceTabBar.tsx` | VERIFIED | `confirmingRestartSession` state at line 41; `STATUS_COLORS` import; stop/restart/force-kill/dismiss buttons; confirmation dialogs |
| `src/client/components/TerminalView.tsx` | VERIFIED | `instanceStatus?: AgentInstanceStatus` prop at line 29; overlays for starting (line 690), stopping (line 702), stopped (line 711), error (line 730) |
| `src/client/components/gsdShared.tsx` | VERIFIED | `STATUS_COLORS.starting = 'bg-warden-warning animate-pulse'` line 13, `STATUS_COLORS.stopping = 'bg-warden-error/60 animate-pulse'` line 14 |
| `src/client/hooks/useActiveInstances.ts` | VERIFIED | App.tsx `activeInstances` useMemo includes all 6 statuses at lines 57-64 |

### Plan 21-03 Artifacts (Gap Closure)

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/server/database/DatabaseConnection.ts` | VERIFIED | `listActiveInstances()` at line 66 now includes OR clause at line 75: `OR (status IN ('stopped', 'error') AND last_active_at >= datetime('now', '-30 minutes'))` with explanatory comment |

---

## Key Link Verification

### Plan 21-01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `instanceRoutes.ts` | `TmuxSessionManager.ts` | `createSessionWithClaude` and `sendCtrlC` calls | WIRED | Lines 79, 129, 230 of instanceRoutes.ts call tmuxSessionManager methods |
| `InstanceTracker.ts` | `DatabaseConnection.ts` | `upsertInstance` and `updateInstanceStatus` for lifecycle states | WIRED | Multiple callsites in InstanceTracker.ts; DB is the persistence layer |
| `instanceRoutes.ts` | `InstanceTracker.ts` | `findActiveByAgentId` for 409 duplicate guard | WIRED | Line 79 of instanceRoutes.ts: `instanceTracker.findActiveByAgentId(trimmedAgentId)` |

### Plan 21-02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `App.tsx` | `/api/instances/start` | fetch POST in `handleStartAgent` | WIRED | Line 229 of App.tsx: `fetch('/api/instances/start', { method: 'POST', ... })` |
| `InstanceTabBar.tsx` | `/api/instances/:id/stop` | fetch POST after confirmation dialog | WIRED | Line 52 of InstanceTabBar.tsx: `fetch('/api/instances/${instance.id}/stop', { method: 'POST' })` |
| `InstanceTabBar.tsx` | `/api/instances/:id/restart` | fetch POST via App.tsx `onRestart` callback | WIRED | Line 249 of App.tsx: `fetch('/api/instances/${instanceId}/restart', { method: 'POST' })` |

### Plan 21-03 Key Links (Gap Closure)

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `DatabaseConnection.ts` | `App.tsx` | GET /api/instances returns stopped/error sessions; App.tsx activeInstances filter already includes them | WIRED | OR clause at DatabaseConnection.ts line 75; App.tsx useMemo includes `instance.status === 'stopped'` and `instance.status === 'error'` at lines 61-63 |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ORCH-01 | 21-01, 21-02 | Operator can start a new agent session; appears within 15s | SATISFIED | POST /start + fire-and-forget pattern + InstanceTracker 15s promotion threshold + StartButton in AgentSidebar |
| ORCH-02 | 21-01, 21-02 | Graceful shutdown: Ctrl+C, 5s grace period, then kill | SATISFIED | `gracefulStopSession()` with GRACE_PERIOD_MS=5000, GRACE_POLL_INTERVAL_MS=500; stop confirmation dialog in InstanceTabBar |
| ORCH-03 | 21-01, 21-02, 21-03 | Restart stopped/errored session with same identity | SATISFIED | Restart API endpoint works; stopped tabs now persist for 30 minutes (gap closure); Restart button accessible from both InstanceTabBar and TerminalView stopped overlay |
| ORCH-04 | 21-02 | Status badges reflect full lifecycle in real time | SATISFIED | STATUS_COLORS with animate-pulse for transitional states; InstanceTabBar renders status dots and labels; 10s poll cycle |
| ORCH-05 | 21-01, 21-02 | Safety guards: confirmation dialog, disabled Start, 409 on duplicate | SATISFIED | All three guards implemented and wired |

All five Phase 21 requirements are marked Complete in REQUIREMENTS.md traceability table. No orphaned requirements found — all ORCH-01 through ORCH-05 are claimed by Phase 21 plans and verified as satisfied.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/routes/instanceRoutes.ts` | 3 | `import { openSync, closeSync } from 'fs'` unused | Info | Dead code carry-over from 21-01; no functional impact |

No blocker or warning anti-patterns found.

---

## Build Verification

```
vite v6.4.1 building for production...
107 modules transformed.
dist/client/assets/index-CLOAXHPp.css   47.83 kB
dist/client/assets/index-C2UjmRD_.js   633.73 kB
built in 5.70s
tsc -p tsconfig.server.json — zero errors
```

Build passes cleanly.

---

## Regression Check

All previously-verified items spot-checked after gap closure commit and confirmed intact:

- `findActiveInstanceByAgentId()` still uses `status IN ('active', 'idle', 'starting')` — duplicate guard correctly excludes stopped sessions
- `markMissingSessionsStopped()` still guards on `'active'/'idle'` only — transitional states not clobbered
- `listAllInstances()` unchanged — returns everything unfiltered
- `confirmingStopSession` and `confirmingRestartSession` state in InstanceTabBar intact
- `STATUS_COLORS` animate-pulse classes for starting/stopping intact
- All four terminal overlays (starting/stopping/stopped/error) in TerminalView intact
- `activeAgentIds` Set derivation in App.tsx intact — correctly includes only active/idle/starting for duplicate guard

No regressions detected.

---

## Human Verification Required

### 1. Stopped Tab Persistence After Gap Closure

**Test:** Start a session from the sidebar. Once it shows as active (green badge), click Stop on the tab and confirm. Watch the tab after stopping completes.
**Expected:** Tab remains visible with gray Stopped badge and Restart button for at least 30 minutes. The gap closure should keep the tab alive across multiple 10s poll cycles.
**Why human:** Cannot verify real-time tab persistence programmatically. The SQL fix is confirmed correct; end-to-end behavior in the running app needs manual observation.

### 2. Restart from Stopped Tab

**Test:** With a stopped tab visible (within 30 minutes of stopping), click Restart and confirm the amber dialog.
**Expected:** New session starts with same agent identity. Tab shows yellow pulsing Starting... badge, then transitions to green Active badge within 15 seconds.
**Why human:** Depends on real tmux session creation and InstanceTracker 10s polling cycle to discover the new session.

### 3. Confirmation Dialog Visual Distinction

**Test:** Click Stop on an active session (observe action button color). Cancel. Click Restart on a stopped session (observe action button color). Cancel.
**Expected:** Stop dialog uses red action button (danger signal). Restart dialog uses amber/warning action button (caution signal). Both have Cancel.
**Why human:** Color distinction requires visual inspection of running UI.

---

## Gap Closure Narrative

The single gap from the initial verification has been closed.

**Gap:** `listActiveInstances()` excluded `'stopped'` and `'error'` sessions, causing stopped tabs to disappear from the API response on the next poll. Operators could not click Restart on a tab that no longer existed in the response.

**Fix applied in commit `93b4f4a`** — a single SQL OR clause added to `DatabaseConnection.ts` `listActiveInstances()`:

```sql
WHERE status IN ('active', 'idle', 'starting', 'stopping')
   -- Retain recently-stopped and recently-errored sessions for 30 minutes so the
   -- operator can see the tab and click Restart before it ages out of the tab bar.
   OR (status IN ('stopped', 'error') AND last_active_at >= datetime('now', '-30 minutes'))
```

No client-side changes were required. App.tsx already included `'stopped'` and `'error'` in its `activeInstances` filter (established in Plan 21-02). The Restart buttons in InstanceTabBar and TerminalView overlays were already implemented. Only the server-side query was blocking the flow.

Phase 21 is now fully complete across all three plans:

- **21-01:** Server-side lifecycle API (start/stop/restart/force-kill endpoints, InstanceTracker transitional state handling)
- **21-02:** Client-side lifecycle UI (lifecycle badges, Start button with disabled state, confirmation dialogs, terminal overlays)
- **21-03:** Gap closure — stopped session visibility for 30-minute restart access window

---

*Verified: 2026-03-04T07:30:00Z*
*Verifier: Claude (gsd-verifier)*
