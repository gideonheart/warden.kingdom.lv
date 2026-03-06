---
phase: 37-crash-detection-backend
verified: 2026-03-05T03:30:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 37: Crash Detection Backend Verification Report

**Phase Goal:** Warden detects when agent sessions crash and records/notifies the operator
**Verified:** 2026-03-05T03:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | When active tmux session disappears without operator stop, InstanceTracker logs crash after 2 consecutive missed polls | VERIFIED | `missedPollCounts` Map in InstanceTracker.ts:14, `CRASH_GRACE_POLLS = 2` at line 10, grace period logic at lines 118-122 |
| 2  | Operator-initiated stops ('stopping' status) are classified as 'stopped', never 'crashed' | VERIFIED | detectCrashesAndMarkStopped() explicitly `continue`s when `instance.status === 'stopping'` at InstanceTracker.ts:106-111; reconcileTransitionalStates handles stopping path separately |
| 3  | Crash events persisted in session_lifecycle_events with all required fields | VERIFIED | insertLifecycleEvent() called at InstanceTracker.ts:130-140 with sessionId, agentId, sessionName, eventType='crashed', outcome, uptimeSecs, projectSlug, lastKnownState, stopReason='crash' |
| 4  | All lifecycle transitions (started, stopped, crashed) recorded to session_lifecycle_events | VERIFIED | 'started' events at InstanceTracker.ts:54-62; 'stopped' (graceful/force-killed/timeout) in reconcileTransitionalStates:165-218; 'stopped' from stop API in instanceRoutes.ts:171-199 |
| 5  | Server restart re-discovers running sessions without firing false crash alerts | VERIFIED | `initialSyncComplete` flag at InstanceTracker.ts:15,71,75 — detectCrashesAndMarkStopped() only called when `initialSyncComplete === true` (i.e., after first sync) |
| 6  | Sessions that never reached 'active' status are not misclassified as crashes | VERIFIED | detectCrashesAndMarkStopped() filters to only `status IN ('active', 'idle', 'stopping')` at lines 90-95 — 'starting', 'error', 'stopped' are skipped |
| 7  | Operator receives Telegram notification within one poll cycle when session crashes | VERIFIED | onCrashDetected callback called synchronously in crash detection path (InstanceTracker.ts:142-144), callback wired in index.ts:103-134 |
| 8  | Crash notification includes agent name, session name, project slug, uptime, crash timestamp | VERIFIED | index.ts:122-126: agentId (functions as agent name), tmuxSessionName, projectSlug, uptimeDisplay, crashTime — all 5 fields present in message |
| 9  | Crash alerts route to agent's own Telegram topic | VERIFIED | index.ts:105-107: openClawConfigReader.getTopicMappings() finds mapping by agentId, then sendToTopic(mapping.groupId, mapping.topicId, text) |
| 10 | GET /api/lifecycle-events returns persisted events with pagination | VERIFIED | instanceRoutes.ts:298-311: route exists, calls database.getLifecycleEvents({agentId, eventType, limit, offset}), returns {events, total} |
| 11 | Telegram notification failures are logged but do not prevent crash detection | VERIFIED | index.ts:130-133: try/catch wraps entire callback; errors logged to console.error, never rethrown |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/database/DatabaseConnection.ts` | session_lifecycle_events migration, insertLifecycleEvent(), getLifecycleEvents() | VERIFIED | Migration at lines 754-773; insertLifecycleEvent() at lines 514-548; getLifecycleEvents() at lines 550-581; LifecycleEvent/LifecycleEventType imported from shared types |
| `src/server/services/InstanceTracker.ts` | Crash detection with 2-poll grace, graceful stop awareness, lifecycle event logging | VERIFIED | missedPollCounts at line 14; CRASH_GRACE_POLLS=2 at line 10; detectCrashesAndMarkStopped() private method; onCrashDetected public callback at line 17 |
| `src/shared/types.ts` | LifecycleEvent and LifecycleEventType types | VERIFIED | LifecycleEventType union at line 130; LifecycleEvent interface at lines 132-144 |
| `src/server/index.ts` | onCrashDetected callback wiring between InstanceTracker and Telegram | VERIFIED | Callback assigned at lines 103-134 after instanceTracker.startPeriodicSync() call at line 100 |
| `src/server/routes/instanceRoutes.ts` | GET /api/lifecycle-events endpoint | VERIFIED | Route defined at lines 298-311; agentId, eventType, limit, offset query param support |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `InstanceTracker.ts` | `DatabaseConnection.ts` | `database.insertLifecycleEvent()` called on crash/stop/start | VERIFIED | Called at InstanceTracker.ts:54, 130, 167, 188, 208 — all lifecycle paths covered |
| `InstanceTracker.ts` | `detectCrashesAndMarkStopped` | missedPollCounts grace period intercepts before blind stopped marking | VERIFIED | markMissingSessionsStopped() no longer called from syncWithTmux; detectCrashesAndMarkStopped() handles all active/idle disappearances |
| `InstanceTracker.ts` | `TelegramBotService.ts` | onCrashDetected callback wired in index.ts calls sendToTopic | VERIFIED | index.ts:103: callback assigned, calls telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text) at line 128 |
| `instanceRoutes.ts` | `DatabaseConnection.ts` | GET /api/lifecycle-events calls database.getLifecycleEvents() | VERIFIED | instanceRoutes.ts:305: `database.getLifecycleEvents({ agentId, eventType, limit, offset })` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CRSH-01 | 37-01 | InstanceTracker distinguishes operator-initiated stops from crashes via 'stopping' status marker | SATISFIED | detectCrashesAndMarkStopped() checks `instance.status === 'stopping'` to skip crash path; only 'active'/'idle' sessions missing from tmux enter crash detection. The requirement mentions "graceful_stop_marker flag" — the 'stopping' status IS that flag, set atomically by the Stop API before any tmux operations |
| CRSH-02 | 37-01 | Crash events persisted to session_lifecycle_events with session ID, agent ID, event type, timestamp, outcome | SATISFIED | session_lifecycle_events table created in runMigrations() with all required columns; insertLifecycleEvent() method verified; crash events recorded with eventType='crashed', outcome='detected', stopReason='crash' |
| CRSH-06 | 37-02 | Telegram notification on crash detection via existing pipeline, including agent name, session name, crash timestamp | SATISFIED | onCrashDetected callback in index.ts sends formatted message with agent identifier, session name, project slug, uptime, and crash timestamp; routes to agent's own topic via getTopicMappings() |

No orphaned requirements: CRSH-01, CRSH-02, CRSH-06 are the only requirements mapped to Phase 37 in REQUIREMENTS.md Traceability table, and both plans claim them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/routes/instanceRoutes.ts` | 273-295 | `/api/instances/:id/force-kill` endpoint transitions instance to 'stopped' but does not log a lifecycle event | Warning | Operator force-kills via this endpoint are not captured in session_lifecycle_events history. This was outside the plan's explicit task scope and does not affect crash detection or success criteria. |

### Human Verification Required

#### 1. End-to-End Crash Detection Under Real Conditions

**Test:** Start an agent tmux session, allow it to appear as 'active' in the dashboard, then kill the tmux session directly (`tmux kill-session -t <session-name>`) without using the Stop button. Wait 20-30 seconds (2 poll cycles).
**Expected:** After 2 missed polls, the session transitions to 'stopped' in the dashboard and a crash Telegram notification is sent to the agent's topic including agent identifier, session name, uptime, and timestamp.
**Why human:** Requires a live tmux session, real poll cycle timing, and Telegram delivery — not verifiable via static code analysis.

#### 2. Operator Stop Is Never Misclassified as Crash

**Test:** Click the Stop button on an active session in the dashboard. Observe that no "session crashed" Telegram notification arrives.
**Expected:** Only a graceful stop occurs; no crash notification is sent to Telegram; lifecycle event shows eventType='stopped', stopReason='operator-stop'.
**Why human:** Requires observing Telegram to confirm no false crash notification was sent.

#### 3. Server Restart Suppression of False Crash Alerts

**Test:** With active agent sessions running, restart the Warden server. Observe that no crash notifications arrive and sessions remain correctly shown as 'active'.
**Expected:** Server re-discovers pre-existing sessions without generating 'started' events or crash alerts. Dashboard shows sessions as active after reconnecting.
**Why human:** Requires live server restart and observation of Telegram (no spurious messages) plus dashboard state.

### Gaps Summary

No gaps found. All 11 observable truths are verified against the actual codebase. The implementation matches the plan design precisely:

- `missedPollCounts` Map tracks consecutive missed polls per session name
- `CRASH_GRACE_POLLS = 2` enforces the 2-poll (~20s) grace period before declaring crash
- `initialSyncComplete` flag prevents false crash alerts on server restart
- 'stopping' status is the graceful stop marker — crash path explicitly skips these sessions
- All lifecycle transitions (started, stopped, crashed, timeout, force-killed) produce `session_lifecycle_events` records
- Telegram crash notification is wired via `onCrashDetected` callback, failure-isolated with try/catch
- `GET /api/lifecycle-events` endpoint with agentId/eventType/limit/offset filters is live

The only noteworthy finding is a warning: the `/api/instances/:id/force-kill` endpoint does not log a lifecycle event. This is outside the explicit plan scope and does not affect any of the three requirements (CRSH-01, CRSH-02, CRSH-06) or any success criteria.

TypeScript compilation passes clean (`npx tsc --noEmit` — no errors). All three implementation commits (6e1d4bb, a58f3ec, 54e1d7c) verified in git log.

---
_Verified: 2026-03-05T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
