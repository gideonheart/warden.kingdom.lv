---
phase: quick-2046
plan: 1
subsystem: crash-detection
tags: [code-review, edge-cases, tech-debt, phase-37, milestone-status]
dependency_graph:
  requires: [phase-37-implementation]
  provides: [phase-37-quality-assessment, v3.4-milestone-status, next-command]
  affects: [phase-38-planning]
tech_stack:
  added: []
  patterns: []
key_files:
  created: [.planning/quick/2046-review-phase-37-commits-for-edge-cases-a/2046-SUMMARY.md]
  modified: []
decisions:
  - "No blockers found in Phase 37 — proceed directly to /gsd:discuss-phase 38"
  - "NaN parseInt issue is minor (defers naturally), not a blocker for Phase 38"
  - "Dead markMissingSessionsStopped() code deferred to Phase 40 tech-debt cleanup"
metrics:
  duration: 8m
  completed_date: 2026-03-05
  tasks_completed: 2
  files_created: 1
---

# Phase Quick-2046: Phase 37 Code Review and v3.4 Milestone Status

**One-liner:** Phase 37 crash detection backend has no blockers — 5 minor/warning issues catalogued, v3.4 is 2/5 phases done, next step is `/gsd:discuss-phase 38`.

---

## Code Review Findings

Reviewed three phase-37 implementation commits (6e1d4bb, a58f3ec, 54e1d7c) by reading:
- `src/server/services/InstanceTracker.ts`
- `src/server/database/DatabaseConnection.ts`
- `src/server/routes/instanceRoutes.ts`
- `src/server/index.ts`
- `src/shared/types.ts`

### Edge Case Analysis

**EC-1: `preExistingSessionNames` computed on every sync — MINOR**

**Verdict:** No bug. The Set is built via `database.listAllInstances()` filtered to non-stopped/non-error instances on every `syncWithTmux()` call, not just the first. However, `initialSyncComplete` gates the actual usage of this Set (line 53: `if (this.initialSyncComplete && !preExistingSessionNames.has(...))`). On sync #1, `initialSyncComplete` is false so the Set is computed but never consulted. On sync #2+, the Set is consulted and correctly identifies pre-existing sessions vs. new ones.

**Issue:** The Set is redundant after the first sync because all new sessions that appear on sync #2+ are genuinely new by definition — `preExistingSessionNames` will contain all sessions known to the DB before the current upsert loop, which is exactly what we need. The logic is correct.

**Tech debt aspect:** The `database.listAllInstances()` call to build the Set is an additional full-table read on every poll, separate from the one inside `detectCrashesAndMarkStopped`. This means every 10-second poll does TWO full `listAllInstances()` calls.

**Severity:** Minor. At current scale (< 20 sessions), negligible. At 100+ sessions with months of history this becomes measurable.

**Fix recommendation:** Could be addressed with a `listNonStoppedInstances()` query that returns only active/idle/starting sessions (far fewer rows). Defer to Phase 40 cleanup.

---

**EC-2: `detectCrashesAndMarkStopped` calls `listAllInstances()` — MINOR (performance)**

**Location:** `InstanceTracker.ts` line 85: `const allInstances = database.listAllInstances();`

**Issue:** `listAllInstances()` returns ALL instances regardless of status — including stopped/error sessions from months ago. The status filter at lines 90-96 skips non-active/idle/stopping instances, so correctness is fine. But the DB query fetches potentially hundreds of historical rows, then discards most of them in application code.

**SQL query inspection:** `SELECT * FROM instances ORDER BY last_active_at DESC` — no WHERE clause, no LIMIT. With a fresh database this is harmless. In production after 6 months, a prolific operator could have 500+ stopped sessions. Each 10s poll fetches all of them.

**Severity:** Minor. Would become a warning at large scale.

**Fix recommendation:** Add `listNonStoppedInstances()` to `DatabaseConnection`:
```sql
SELECT ... FROM instances WHERE status IN ('active', 'idle', 'starting', 'stopping')
ORDER BY last_active_at DESC
```
Use this in `detectCrashesAndMarkStopped` and `reconcileTransitionalStates`. The same method can replace the `preExistingSessionNames` build. Defer to Phase 40 tech-debt cleanup.

---

**EC-3: `parseInt` without NaN validation in `GET /api/lifecycle-events` — WARNING**

**Location:** `instanceRoutes.ts` lines 302-303:
```ts
const limit = typeof request.query.limit === 'string' ? parseInt(request.query.limit, 10) : undefined;
const offset = typeof request.query.offset === 'string' ? parseInt(request.query.offset, 10) : undefined;
```

**Issue:** If a caller passes `?limit=abc`, `parseInt('abc', 10)` returns `NaN`. This `NaN` propagates to `getLifecycleEvents()` in `DatabaseConnection`, where it overrides the `?? 50` default (because `NaN` is truthy in `filters.limit ?? 50` — wait, actually `NaN ?? 50` does NOT fall through because `??` only falls through for `null`/`undefined`, not `NaN`). So `LIMIT NaN` is passed to SQLite.

**Actual SQLite behavior:** SQLite coerces `NaN` to `0` in a LIMIT clause. So `LIMIT 0` returns zero rows. The API returns `{ events: [], total: N }` — empty events array but correct total count. This is confusing but not a crash.

**Severity:** Warning. The endpoint silently returns no events instead of returning a 400 error or the default 50. A client passing a bad limit gets a misleading empty-but-successful response.

**Fix recommendation:** Add NaN guard after parseInt:
```ts
const rawLimit = typeof request.query.limit === 'string' ? parseInt(request.query.limit, 10) : undefined;
const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
```
This is a clean 2-line fix. Consider bundling this fix with Phase 40 when building the lifecycle history UI (the UI will consume this endpoint).

---

**EC-4: `force-kill` endpoint does NOT log a lifecycle event — WARNING**

**Location:** `instanceRoutes.ts` lines 275-295.

**Issue:** `POST /api/instances/:id/force-kill` calls `instanceTracker.updateStatus(instanceId, 'stopped')` directly but inserts no `session_lifecycle_events` row. By contrast, the regular `/stop` endpoint logs a `stopped/force-killed` event on lines 189-199.

**Confirmed gap:** This is the only missing lifecycle event logging path. All other stop paths (graceful stop, already-gone stop, reconcile transitional `stopping` → force-kill, crash detection) correctly log lifecycle events.

**Impact:** If an operator uses force-kill, the lifecycle history will show the session going from `active` → `stopped` with no event record. Phase 40 will build a lifecycle history UI that depends on these records.

**Severity:** Warning. Causes a data gap in lifecycle history, not a crash or security issue. Should be fixed before Phase 40 ships.

**Fix recommendation:** Add lifecycle event logging to force-kill:
```ts
const uptimeSecs = (Date.now() - new Date(instance.createdAt).getTime()) / 1000;
const projectSlug = path.basename(instance.projectPath) || instance.agentId;
database.insertLifecycleEvent({
  sessionId: instance.id,
  agentId: instance.agentId,
  sessionName: instance.tmuxSessionName,
  eventType: 'stopped',
  outcome: 'force-killed',
  uptimeSecs,
  projectSlug,
  lastKnownState: instance.status,
  stopReason: 'operator-stop',
});
```
Recommended to add this in Phase 38 or as a quick task before Phase 40.

---

**EC-5: `markMissingSessionsStopped()` is dead code — MINOR**

**Location:** `DatabaseConnection.ts` lines 106-120.

**Issue:** The method `markMissingSessionsStopped(activeSessionNames: string[])` exists in `DatabaseConnection` but is no longer called from `InstanceTracker.syncWithTmux()` after the Phase 37 crash detection refactor. `detectCrashesAndMarkStopped` now handles this responsibility with grace periods.

**Stale sessions on first boot:** On the FIRST sync (`initialSyncComplete = false`), crash detection is skipped entirely. Sessions that were `active` in the DB but whose tmux sessions died while the server was down will NOT be updated to `stopped` until the SECOND poll cycle (~10s later). This is a 10-second data discrepancy on startup, not a crash or incorrect behavior.

**Severity:** Minor. The dead code is harmless. The 10s startup gap is acceptable behavior (also intentional — avoids marking sessions stopped if they just briefly disappeared during the restart).

**Fix recommendation:** Remove `markMissingSessionsStopped()` from `DatabaseConnection` during Phase 40 tech-debt cleanup. The method is tested nowhere and has no callers.

---

**EC-6: `onCrashDetected` assigned after `startPeriodicSync()` — CONFIRMED SAFE**

**Location:** `index.ts` lines 100-134.

```ts
instanceTracker.startPeriodicSync();       // line 100
instanceTracker.onCrashDetected = ...;     // lines 103-134
```

**Analysis:** `startPeriodicSync()` calls `syncWithTmux()` immediately (line 20). However, `syncWithTmux()` only calls `detectCrashesAndMarkStopped()` when `this.initialSyncComplete` is true (line 71). On the very first sync, `initialSyncComplete` is false, so `detectCrashesAndMarkStopped` is never reached, and `onCrashDetected` is never called.

**Verdict:** Confirmed safe. The ordering is not a bug. No race condition. No window where a crash notification could be missed due to the assignment order.

---

**EC-7: `agentId` in Telegram crash message lacks Markdown escaping — MINOR**

**Location:** `index.ts` line 122:
```ts
`🔴 *${instance.agentId}* session crashed\n\n` +
```

**Analysis:** `agentId` values come from the `KNOWN_AGENT_PREFIXES` set (`gideon`, `warden`, `scout`, `builder`, `forge`) as defined in `TmuxSessionManager`. These are all lowercase alphanumeric strings with no Telegram Markdown special characters (`_`, `*`, `[`, `]`, `(`, `)`). In practice this is never a problem.

**Compare with Phase 36:** The `NotificationPoller` only escapes backticks in the pane excerpt (line 117: `excerpt.replace(/\`/g, "'")`). There's no general Markdown escape utility in the codebase — and the API uses `parse_mode: 'Markdown'` (v1), not `MarkdownV2`. Markdown v1 is more forgiving: it only interprets `*bold*`, `_italic_`, `` `code` ``, and `[text](url)`.

**Verdict:** Not a practical issue given actual agentId values. However, if a future agent has an underscore in its ID (e.g., `my_agent`), the `*my_agent*` in the crash message would fail Markdown parsing since `_` inside `*...*` could confuse the parser.

**Severity:** Minor. No escaping utility needed now, but worth noting for when new agents are added.

**Fix recommendation:** Wrap agentId in backticks instead of asterisks if it may contain underscores, or add a simple escape helper before Phase 39.

---

**EC-8: `missedPollCounts` reset on server restart — CONFIRMED DESIRABLE**

**Analysis:** The in-memory `missedPollCounts` Map is never persisted to SQLite. On server restart, all counts reset to 0. Combined with `initialSyncComplete = false` suppressing crash detection on the first sync, this means a session that was mid-grace-period before restart gets a fresh 2-poll grace period after restart.

**Verdict:** This is intentional and correct behavior. Persisting the grace period across restarts would cause false crash alerts for sessions that disappeared during server downtime. The current approach is more conservative (avoids false alerts at the cost of slightly delayed detection after restart).

**No fix needed.**

---

### Tech Debt Catalogue

| # | Item | Severity | Location | Recommended Action |
|---|------|----------|----------|--------------------|
| TD-1 | Dead code: `markMissingSessionsStopped()` never called | Minor | `DatabaseConnection.ts:106` | Remove in Phase 40 |
| TD-2 | `listAllInstances()` fetches all rows (including history) every poll | Minor | `InstanceTracker.ts:85, 37-41` | Add `listNonStoppedInstances()` in Phase 40 |
| TD-3 | `preExistingSessionNames` Set duplicates the full-table read | Minor | `InstanceTracker.ts:37-41` | Consolidate with TD-2 fix in Phase 40 |
| TD-4 | Force-kill missing lifecycle event log | Warning | `instanceRoutes.ts:275-295` | Fix before Phase 40 ships lifecycle history UI |
| TD-5 | NaN not guarded after `parseInt` in lifecycle-events API | Warning | `instanceRoutes.ts:302-303` | Fix when building lifecycle history UI in Phase 40 |
| TD-6 | `activeSessionNames.includes()` is O(n) inside loops | Minor | `InstanceTracker.ts:99, 155, 181` | Convert to `Set<string>` in Phase 40 (trivial) |

---

## v3.4 Milestone Status

**Milestone:** v3.4 Smart Session Lifecycle

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 36 | Telegram Pipeline Pivot & Hardening | COMPLETE | 2/2 |
| 37 | Crash Detection Backend | COMPLETE | 2/2 |
| 38 | Auto-Restart Engine | NOT STARTED | 0/2 |
| 39 | Idle Timeout & Quick-Launch | NOT STARTED | 0/2 |
| 40 | Lifecycle History & E2E Verification | NOT STARTED | 0/2 |

**Summary:** 2 of 5 phases complete. 3 phases remaining. v3.4 is NOT complete.

---

## Recommended Fixes

### Fix Now (before Phase 38)

None required. No blockers found.

### Fix Before Phase 40 Ships (lifecycle history UI)

- **TD-4:** Add lifecycle event logging to force-kill endpoint. The lifecycle history UI will expose a gap if this is missing. (~10 lines of code, quick task candidate.)
- **TD-5:** Add NaN validation to `parseInt` calls in `GET /api/lifecycle-events`. The UI will call this endpoint — silent empty results on bad input would be confusing.

### Defer to Phase 40 Tech-Debt Cleanup

- TD-1: Remove dead `markMissingSessionsStopped()`
- TD-2 + TD-3: Replace `listAllInstances()` with `listNonStoppedInstances()` in InstanceTracker
- TD-6: Convert `activeSessionNames` array to Set for O(1) lookups

### Monitor but No Action Needed

- EC-6: `onCrashDetected` assignment ordering (confirmed safe)
- EC-7: agentId Markdown escaping (safe for current agent IDs)
- EC-8: `missedPollCounts` reset on restart (intentionally desirable)

---

## Build Verification

- `npm run typecheck` — PASSED (no type errors)
- `npm run build` — PASSED (production build succeeds, client + server)

---

## Next Command

No blockers found in Phase 37. The implementation is solid. Two warning-level items (force-kill missing lifecycle event, NaN parseInt) are appropriate to address before Phase 40 ships the lifecycle history UI, but they do not block Phase 38.

**Exact next command:**

```
/gsd:discuss-phase 38
```

Phase 38 is the Auto-Restart Engine — per-agent restart policy, automatic crash recovery, and restart storm rate limiting. The crash detection backend from Phase 37 provides the `onCrashDetected` callback hook that Phase 38 will extend.

---

## Self-Check

- SUMMARY.md exists: this file
- Typecheck: PASSED
- Build: PASSED
- All 8 edge cases reviewed with severity ratings
- All 6 tech debt items catalogued
- v3.4 milestone status accurately determined (2/5 phases, 3 remaining)
- Next command provided: `/gsd:discuss-phase 38`
