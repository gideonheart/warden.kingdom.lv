# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

**Current focus:** v3.1 — Agent Control & Deep Insights (Phase 23 complete)

## Current Position

Phase: 23 of 25 (Token Analytics & Export) — COMPLETE
Plan: 2 of 2 complete (Phase 23 fully done)
Status: Phase 23 complete — data layer + client UI for TOKN-12 (model comparison bar chart) and TOKN-14 (CSV export with toast)
Last activity: 2026-03-04 - Phase 23 Plan 02 executed (23-02: ModelComparisonView, Model Costs tab, Export CSV button)

Progress: [████████████████░░░░░░░░░░░░░░] 53% (20/25 phases complete)

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

### Pending Todos

None

### Blockers/Concerns

**Phase 24 (Recording Replay):**
- asciicast v2 replay player: may need a new npm dependency (asciinema-player) or a custom implementation using setInterval-driven xterm.js write calls. Evaluate dependency cost vs build effort during planning.

**Phase 25 (Stretch):**
- Depends on Phase 19 permission detection stability. If detectAgentState() heuristics produce false positives, auto-record trigger will over-record. Research phase should confirm false-positive rate before committing to on-permission-prompt trigger.

Phase 23 complete — no active blockers.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2039 | Review Phase 21 commits and confirm milestone completion readiness | 2026-03-04 | 494482e | [2039-review-phase-21-commits-and-confirm-mile](./quick/2039-review-phase-21-commits-and-confirm-mile/) |
| 2040 | Fix Phase 22 verification gaps — API response key mismatches in TokenUsageView | 2026-03-04 | 24ddd1d | [2040-fix-phase-22-verification-gaps-inline-in](./quick/2040-fix-phase-22-verification-gaps-inline-in/) |
| 2041 | Re-run Phase 22 verification — confirm all must-haves pass after quick-2040 fixes | 2026-03-04 | b73bf54 | [2041-re-run-phase-22-verification-after-quick](./quick/2041-re-run-phase-22-verification-after-quick/) |

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed 23-02-PLAN.md (Token Analytics Export client UI: ModelComparisonView, Model Costs tab, Export CSV button with toast)
Next step: Phase 24 — Recording Replay (research then execute)
