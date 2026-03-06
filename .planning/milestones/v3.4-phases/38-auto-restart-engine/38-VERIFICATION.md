---
phase: 38-auto-restart-engine
verified: 2026-03-05T04:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 38: Auto-Restart Engine Verification Report

**Phase Goal:** Warden can automatically restart crashed sessions based on per-agent policy with safety limits
**Verified:** 2026-03-05T04:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can configure per-agent crash restart policy (none/once/always) from the dashboard, defaulting to none | VERIFIED | `RestartPolicyDropdown` in `AgentSidebar.tsx` lines 90-137; `onChangeRestartPolicy` wired in both desktop and mobile sidebar instances in `App.tsx` lines 682-684, 713-714 |
| 2 | When a crash is detected and the agent's policy allows restart, a new tmux session spawns automatically with the same project path | VERIFIED | `AutoRestartService.attemptRestart()` reads policy, waits 7s, calls `tmuxSessionManager.createSessionWithClaude(agentId, derivedProjectSlug, projectPath)` using `crashedInstance.projectPath` |
| 3 | Auto-restart outcomes (success or failure) are logged to the lifecycle events table | VERIFIED | `database.insertLifecycleEvent(...)` called with `eventType: 'auto-restarted'` and `outcome: 'success'` or `outcome: 'failed'` in `AutoRestartService.ts` lines 78-105 |
| 4 | After 3 restarts in one hour for the same agent, the restart policy flips to 'none' and a Telegram alert notifies the operator of the restart storm | VERIFIED | `isRateLimited()` uses sliding window with `MAX_RESTARTS_PER_HOUR = 3`, `STORM_WINDOW_MS = 60*60*1000`; `handleStormDetected()` calls `database.markStormDisabled(agentId)` then `telegramBotService.sendToTopic(...)` |

**Score:** 4/4 observable truths verified

### Plan-Level Truths (Plan 01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | Operator can see a restart policy dropdown (none/once/always) next to each agent in AgentSidebar | VERIFIED | `RestartPolicyDropdown` renders `<select>` with none/once/always options; shown when `onChangeRestartPolicy` prop is present |
| 6 | Changing the dropdown immediately persists the selected policy to the database | VERIFIED | `updateRestartPolicy` in `useAgentConfig.ts` calls `PUT /api/restart-policies/:agentId`, route calls `database.setRestartPolicy()` |
| 7 | Default policy for all agents is 'none' until operator explicitly changes it | VERIFIED | `getRestartPolicy()` returns `{ crashRestartMode: 'none', stormDisabledAt: null }` for unknown agents; DB default is `'none'` |
| 8 | When storm limiter auto-disables policy, a warning badge appears next to the dropdown | VERIFIED | `RestartPolicyDropdown` renders amber dot (`bg-amber-500 animate-pulse`) when `stormDisabledAt` is not null (lines 119-124) |

### Plan-Level Truths (Plan 02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9 | Operator sees a toast notification when auto-restart happens | VERIFIED | `App.tsx` lines 57-101: `toastMessages` state, `previousInstanceIdsRef` diff, toast rendered at lines 733-744 with `bg-warden-panel border-warden-accent` styling, auto-dismisses after 5s |

**Overall Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/types.ts` | `CrashRestartMode` type, `RestartPolicy` interface | VERIFIED | Lines 132-138: `CrashRestartMode = 'none' \| 'once' \| 'always'`, `RestartPolicy` interface with `agentId`, `crashRestartMode`, `stormDisabledAt`. `'auto-restarted'` added to `LifecycleEventType` at line 130 |
| `src/server/database/DatabaseConnection.ts` | `session_lifecycle_policy` table migration, `getRestartPolicy()`, `setRestartPolicy()`, `getAllRestartPolicies()`, `markStormDisabled()` | VERIFIED | Migration lines 822-830; methods at lines 583-628. All four methods present and substantive |
| `src/server/routes/instanceRoutes.ts` | `GET /api/restart-policies`, `PUT /api/restart-policies/:agentId` | VERIFIED | Lines 314-347: both endpoints implemented with validation and DB calls |
| `src/client/components/AgentSidebar.tsx` | `RestartPolicyDropdown` component per agent row | VERIFIED | Lines 90-137: full component; rendered conditionally at lines 205-212 |
| `src/server/services/AutoRestartService.ts` | `AutoRestartService` class with `attemptRestart()`, `isRateLimited()`, `handleStormDetected()` | VERIFIED | All three methods present with full implementations (183 lines total) |
| `src/server/index.ts` | `autoRestartService` wired into `onCrashDetected` callback | VERIFIED | Import at line 16; `void autoRestartService.attemptRestart(instance, uptimeSecs, projectSlug)` at line 137 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AgentSidebar.tsx` | `/api/restart-policies` | `fetch` in `useAgentConfig.updateRestartPolicy` | WIRED | `useAgentConfig.ts` line 68: `fetch('/api/restart-policies/${encodeURIComponent(agentId)}', { method: 'PUT', ... })` |
| `instanceRoutes.ts` | `database.getRestartPolicy` / `database.setRestartPolicy` | route handler | WIRED | Lines 317 and 340-341: routes call both methods |
| `index.ts` | `AutoRestartService.attemptRestart` | `onCrashDetected` callback | WIRED | Line 137: `void autoRestartService.attemptRestart(instance, uptimeSecs, projectSlug)` |
| `AutoRestartService.ts` | `tmuxSessionManager.createSessionWithClaude` | session spawn | WIRED | Line 74: `await tmuxSessionManager.createSessionWithClaude(agentId, derivedProjectSlug, projectPath)` |
| `AutoRestartService.ts` | `database.insertLifecycleEvent` | restart outcome logging | WIRED | Lines 78-104: called on both success (`outcome: 'success'`) and failure (`outcome: 'failed'`) paths |
| `AutoRestartService.ts` | `telegramBotService.sendToTopic` | storm alert notification | WIRED | Lines 171: `await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, stormMessage)` inside try/catch |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CRSH-03 | 38-01 | Per-agent crash restart policy stored in `session_lifecycle_policy` SQLite table; `crash_restart_mode` (none/once/always); default `none`; configurable from dashboard | SATISFIED | Table migration in `DatabaseConnection.ts` lines 822-830; `getRestartPolicy()` returns `'none'` default; `RestartPolicyDropdown` in `AgentSidebar.tsx` |
| CRSH-04 | 38-02 | Auto-restart execution calls `TmuxSessionManager.createSessionWithClaude()` with saved project path when crash detected and policy allows; logs restart outcome to `session_lifecycle_events` | SATISFIED | `AutoRestartService.attemptRestart()` uses `crashedInstance.projectPath`; calls `createSessionWithClaude`; calls `insertLifecycleEvent` with `eventType: 'auto-restarted'` |
| CRSH-05 | 38-02 | Restart storm rate limiter enforces maximum 3 restarts per hour per agent; after limit hit, flips `crash_restart_mode` to `none` and sends Telegram alert | SATISFIED | `MAX_RESTARTS_PER_HOUR = 3`, `STORM_WINDOW_MS = 60*60*1000`; `handleStormDetected()` calls `database.markStormDisabled()` and `telegramBotService.sendToTopic()` |

All three requirement IDs declared in plan frontmatter are accounted for and satisfied. No orphaned requirements found for Phase 38 in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TODO/FIXME comments, placeholder returns, empty implementations, or stub handlers found in any phase-38 files.

---

### Human Verification Required

#### 1. Storm limiter fires Telegram alert after real crash loop

**Test:** Configure an agent's restart policy to 'always', then manually kill the agent's tmux session three times within an hour.
**Expected:** After the third crash-and-restart cycle, policy reverts to 'none' in the dashboard dropdown (amber dot appears) and a Telegram message arrives in the agent's topic channel.
**Why human:** Requires a real running session, real crash events firing `onCrashDetected`, and a live Telegram bot connection.

#### 2. Toast appears when auto-restart creates a new session

**Test:** With an agent on 'once' or 'always' policy, kill the agent's tmux session and wait 7 seconds.
**Expected:** A toast notification appears in the bottom-right corner of the dashboard reading "{agentId} auto-restarted — new session active", then disappears after 5 seconds.
**Why human:** Requires a running server with real crash detection; toast detection depends on timing of instance poll intervals.

#### 3. Visual appearance of storm-limiter warning badge

**Test:** Use the API to `markStormDisabled` for an agent, then reload the dashboard.
**Expected:** An amber pulsing dot appears to the left of the restart policy dropdown for that agent, with a tooltip explaining the storm disable event.
**Why human:** UI visual inspection required.

---

### Gaps Summary

No gaps. All 9 must-have truths are verified. All 6 required artifacts exist, are substantive (not stubs), and are wired into the broader system. All 6 key links between components are confirmed. All 3 requirement IDs (CRSH-03, CRSH-04, CRSH-05) are satisfied. TypeScript compilation passes with zero errors.

The auto-restart engine is fully operational:
- Restart policy layer: SQLite table + REST API + dropdown UI with storm-limiter badge
- Auto-restart engine: 7s delayed spawn, sliding-window storm limiter, lifecycle event logging
- Operator awareness: toast notification in dashboard, Telegram storm alert

Three items are flagged for human verification but are not blocking — they require a live running system with real crash events.

---

_Verified: 2026-03-05T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
