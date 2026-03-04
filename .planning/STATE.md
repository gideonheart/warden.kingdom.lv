# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

**Current focus:** v3.1 — Agent Control & Deep Insights (Phase 24 Plan 02 complete)

## Current Position

Phase: 24 of 26 (Session Recording & Replay)
Plan: 2 of 3 complete (Phase 24 Plans 01-02 done)
Status: Phase 24 Plan 02 complete — full recording UI layer: REC button with pulse indicator, RecordingLibrary sortable table, RecordingPlayer with asciicast v2 replay
Last activity: 2026-03-04 - Phase 24 Plan 02 executed (24-02: recording UI — useRecordingState hook, REC button, RecordingLibrary, RecordingPlayer, Recordings nav tab)

Progress: [████████████████░░░░░░░░░░░░░░] 54% (21/26 phases complete — Phase 24 in progress, Plan 01/3 done)

## Performance Metrics

**Completed milestones:** v1.0 (6 phases), v1.1 (2), v2.0 (3), v2.1 (3), v2.3 (4), v3.0 (2) = 20 phases shipped

**v3.1 scope:** 5 phases, ~9 plans estimated, 15 requirements

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.

Key decisions relevant to v3.1:

- [Phase 11]: setImmediate tap pattern for PTY output — zero latency impact; reuse for recording capture in Phase 24
- [Phase 12]: execFile (not exec) for all shell invocations — prevents injection; apply to spawn logic in Phase 21
- [Phase 12]: Fire-and-forget spawn returns 202 immediately; session appears via InstanceTracker within 10s — same pattern for Phase 21 start
- [Phase 18]: Upsert replaces full daily totals (idempotent scanner) — per-model aggregates needed for Phase 23 model comparison
- [v3.0 Research]: useAgentLiveStatus polling at App.tsx level — Phase 21 'starting'/'stopping' states extend same pattern
- [Quick-2038 scope]: Phase 25 is a stretch goal — may be deferred if Phase 24 recording infrastructure needs more time
- [21-01]: promise chain fire-and-forget for start (not spawn detach) — tmux commands fast (<1s), no event loop blocking risk
- [21-01]: buildSessionName made public — instanceRoutes pre-registers session name before tmux creation
- [21-01]: markMissingSessionsStopped guards only 'active'/'idle' — 'starting'/'stopping' have own lifecycle handlers
- [21-02]: activeInstances filter includes all 6 statuses — API controls scope, UI shows everything returned
- [21-02]: Confirmation dialogs inline (not modal) — local state string|null pattern for compact UX
- [21-02]: Dismiss button uses client-side Set — no server call, tab reappears on next poll if still in DB
- [21-03]: 30-minute retention window for stopped/error sessions in listActiveInstances() — balances restart access vs tab bar clutter
- [21-03]: OR clause (not UNION) for stopped/error retention — simpler, readable, same single-pass performance
- [22-01]: SQL numeric constants interpolated directly (hours/days) — not user input, no injection risk
- [22-01]: upsertBudgetConfig(agentId, 0) deletes row — "no budget = no alert" via delete-on-zero
- [22-01]: /budget-config/status route before /:agentId — prevents Express param shadowing
- [22-01]: Aggregate alertLevel computed in application layer, not SQL — clarity over cleverness
- [22-02]: useBudgetAlerts uses previousRef guard — only calls setAlertLevel when value changes, preventing unnecessary re-renders every 30s
- [22-02]: editingBudget Record<string,string> per agent — isolates draft state, avoids controlled/uncontrolled input issues
- [22-02]: Amber badge animate-pulse, red badge static — visual distinction between warning and exceeded states
- [22-02]: Projection card conditionally rendered when burnRates.length > 0 — no misleading $0.00 projections when no data
- [Phase 23-token-analytics-export]: processJsonlFile() receives both dailyUsage and modelDailyUsage maps — ensures both accumulators see identical records in single pass
- [Phase 23-token-analytics-export]: model || 'unknown' as fallback key in per-model accumulation — handles JSONL records missing model field gracefully
- [Phase 23-token-analytics-export]: CSV export always sends full unfiltered dataset with date-stamped filename — consistent with TOKN-14 spec
- [Phase 23]: ModelComparisonView defines formatAgentId() locally — avoids cross-component import coupling
- [Phase 23]: Global max scaling for bars — allows cross-agent cost comparison at a glance
- [Phase 26-01]: Shared filter inputs (affecting multiple tabs) belong in the tab bar header row, not inside individual tab content blocks
- [Phase 26-01]: TIME_RANGE_LABELS['24h'] = 'Today' — calculateDateFrom uses calendar-day midnight, not a rolling 24h window; label must match implementation semantics
- [Phase 26-01]: Scan Now button stays in usage tab block — it is a usage-tab-specific action, unlike the agent filter which affects both tabs
- [Phase 24-01]: RecordingCaptureService holds in-memory frame buffer per session — no intermediate disk writes, writes full asciicast v2 on stop
- [Phase 24-01]: PTY output tap in TerminalStreamService.ptyProcess.onData after broadcast loop — zero-latency impact
- [Phase 24-01]: Auto-stop recording on ptyProcess.onExit with reason 'session_ended' — guarantees .cast file written even if operator never clicks stop
- [Phase 24-01]: recordingCaptureService singleton exported — clean import from both TerminalStreamService and recordingRoutes without circular deps
- [Phase 24-02]: useRecordingState uses optimistic local state with elapsed ticker — no polling needed; server call only on start/stop
- [Phase 24-02]: RecordingPlayer uses RAF loop for playback — writes all frames up to current virtual time per tick, naturally handles any speed multiplier
- [Phase 24-02]: seekTo() resets terminal and replays all frames from start to target — ensures correctness; acceptable for session recording lengths
- [Phase 24-02]: RecordingLibrary shows Play only for recordings with stoppedAt — prevents attempting to play still-active recordings

### Pending Todos

None

### Blockers/Concerns

**Phase 24 (Recording Replay):**
- Plans 01 and 02 complete — backend and UI layer both done. Plan 03 (if it exists) would cover remaining items.
- asciicast v2 replay player implemented as custom RAF-driven xterm.js writes — no new npm dependency needed.

**Phase 25 (Stretch):**
- Depends on Phase 19 permission detection stability. If detectAgentState() heuristics produce false positives, auto-record trigger will over-record. Research phase should confirm false-positive rate before committing to on-permission-prompt trigger.

Phase 24 Plan 01 complete — no active blockers.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2039 | Review Phase 21 commits and confirm milestone completion readiness | 2026-03-04 | 494482e | [2039-review-phase-21-commits-and-confirm-mile](./quick/2039-review-phase-21-commits-and-confirm-mile/) |
| 2040 | Fix Phase 22 verification gaps — API response key mismatches in TokenUsageView | 2026-03-04 | 24ddd1d | [2040-fix-phase-22-verification-gaps-inline-in](./quick/2040-fix-phase-22-verification-gaps-inline-in/) |
| 2041 | Re-run Phase 22 verification — confirm all must-haves pass after quick-2040 fixes | 2026-03-04 | b73bf54 | [2041-re-run-phase-22-verification-after-quick](./quick/2041-re-run-phase-22-verification-after-quick/) |

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed 24-02-PLAN.md (Recording UI: REC button, RecordingLibrary, RecordingPlayer, Recordings nav tab)
Next step: Execute Phase 24 Plan 03 (if planned) — or proceed to Phase 25/26
