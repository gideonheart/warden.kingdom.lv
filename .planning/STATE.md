# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab
**Current focus:** v3.4 Smart Session Lifecycle — COMPLETE (all 5 phases, 20/20 requirements)

## Current Position

Phase: 40 of 40 (Lifecycle History + E2E Verification)
Plan: 2 of 2 complete
Status: Phase 40 COMPLETE — v3.4 milestone done. All E2E tests pass (31 passed, 1 skipped).
Last activity: 2026-03-05 - Completed quick task 2048: Add rotate session button to terminal header

Progress: [██████████] 100% (10/10 plans)

## Performance Metrics

**Completed milestones:** v1.0 (6 phases), v1.1 (2), v2.0 (3), v2.1 (3), v2.3 (4), v3.0 (2), v3.1 (6), v3.2 (4), v3.3 (4) = 34 phases shipped
**Current milestone:** v3.4 Smart Session Lifecycle — 5 phases, 9 plans, 17 requirements

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.

- 36-01: Send-only Telegram using Gideon's bot token from openclaw.json via fetch; no grammy Bot needed
- 36-01: `botToken` sourced from `openclaw.json channels.telegram.botToken` via OpenClawConfigReader
- 36-01: `botConnected` renamed to `botConfigured` — reflects send-only mode (no connection state)
- 36-02: budget_alert_state SQLite table persists per-agent dedup state across server restarts (FIX-05)
- 36-02: hydratePersistentState() called before first poll — cooldown context survives restart
- 36-02: NotificationSettingsPanel uses botConfigured with 'Bot configured/not configured' text (FIX-06)
- 37-01: 2-poll grace period (CRASH_GRACE_POLLS=2, ~20s) before declaring crash to prevent false alerts from transient glitches
- 37-01: initialSyncComplete flag suppresses 'started' events on server restart — pre-existing sessions silently re-discovered
- 37-01: stopping status sessions skip crash detection path; reconcileTransitionalStates handles them separately
- 37-01: onCrashDetected callback on InstanceTracker as extension point for Plan 02 Telegram notifications
- [Phase 37-02]: onCrashDetected callback assigned after instanceTracker.startPeriodicSync() — ensures wiring in place before first sync fires
- [Phase 37-02]: Notification failure isolation via try/catch in callback — Telegram errors never propagate into crash detection flow
- [Phase 37-02]: lifecycle-events endpoint placed in instanceRoutes — logically grouped with instance management routes
- 38-01: storm_disabled_at cleared on every operator mode change — manual change signals operator awareness, re-arming auto-restart
- 38-01: Default crashRestartMode is 'none' via DB DEFAULT; getRestartPolicy() returns none for unknown agents without a DB row
- 38-01: RestartPolicyDropdown lives inside AgentSidebar.tsx (small component, no separate file per plan spec)
- 38-01: onChangeRestartPolicy is optional prop — sidebar renders without dropdown when not provided
- [Phase 38]: 38-02: Record restart timestamp after both success and failure — storm limiter counts attempts not just successes
- [Phase 38]: 38-02: Pre-register instance as 'starting' before spawning so UI tab appears during the 7s delay period
- [Phase 38]: 38-02: Toast detection uses previousInstanceIdsRef + stopped sibling check — no server-side event stream needed
- [Phase 39]: 39-02: getLastProjectPaths() uses ORDER BY last_active_at DESC with first-occurrence Map — one DB query for all agents
- [Phase 39]: 39-02: projectPath override on start endpoint is backward compatible — omitting it restores original behavior
- [Phase 39]: 39-02: QuickLaunchModal fetches /api/agents/last-projects lazily on isOpen=true, not at App mount
- [Phase 39-01]: IdleTimeoutService polls tmux sessions every 60s (not 10s like NotificationPoller) — minute-granularity timeout needs no finer resolution
- [Phase 39-01]: idleTimeoutMinutes added to RestartPolicy type (same DB table as crash policy) rather than a separate type — consolidated fetch with restart policies
- [Phase 40-01]: Lifecycle tab placed second in HistoryView tabs array (after Sessions) — lifecycle events are most actionable v3.4 history data
- [Phase 40-01]: Force-kill lifecycle insert placed inside existing try/catch — logging failure silently skips event log rather than returning 500
- [Phase 40-01]: NaN guard pattern: rawVal !== undefined && !Number.isNaN(rawVal) ? rawVal : undefined — use for all parseInt query params
- [Phase 40]: playwright.config.ts updated to use port 3001 (production server) — Vite dev server hits ENOSPC inotify limit on this host
- [Phase 40]: Use .first() on all Playwright locators to handle mobile accordion DOM duplication

### Research Flags

None

### Pending Todos

None

### Blockers/Concerns

- NotificationPoller polls stopped sessions (dead capture-pane calls) — pre-existing tech debt from v3.3
- ~~[quick-2046] force-kill endpoint missing lifecycle event log (TD-4)~~ CLOSED in 40-01
- ~~[quick-2046] NaN not guarded after parseInt in GET /api/lifecycle-events (TD-5)~~ CLOSED in 40-01

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2039 | Review Phase 21 commits and confirm milestone completion readiness | 2026-03-04 | 494482e | [2039-review-phase-21-commits-and-confirm-mile](./quick/2039-review-phase-21-commits-and-confirm-mile/) |
| 2040 | Fix Phase 22 verification gaps — API response key mismatches in TokenUsageView | 2026-03-04 | 24ddd1d | [2040-fix-phase-22-verification-gaps-inline-in](./quick/2040-fix-phase-22-verification-gaps-inline-in/) |
| 2041 | Re-run Phase 22 verification — confirm all must-haves pass after quick-2040 fixes | 2026-03-04 | b73bf54 | [2041-re-run-phase-22-verification-after-quick](./quick/2041-re-run-phase-22-verification-after-quick/) |
| 2042 | Propose top 3 concrete next milestone options | 2026-03-04 | aed4d8d | [2042-propose-top-3-concrete-next-milestone-op](./quick/2042-propose-top-3-concrete-next-milestone-op/) |
| 2043 | Propose 3 fresh concrete next milestones (v4.1 Health Monitor, v4.2 Fleet View, v4.3 Prompt Workbench) | 2026-03-05 | 11b72ac | [2043-propose-3-concrete-next-milestone-direct](./quick/2043-propose-3-concrete-next-milestone-direct/) |
| 2044 | Code review of v3.3 milestone + 3 fresh milestone proposals (Analytics, Session Lifecycle, Quality Foundation) | 2026-03-05 | cb0fd37 | [2044-review-recent-commits-for-quality-edge-c](./quick/2044-review-recent-commits-for-quality-edge-c/) |
| 2045 | Add Telegram topic ID inline label to AgentSidebar agent rows | 2026-03-05 | c9c7083 | [2045-add-telegram-topic-id-to-agent-sidebar-i](./quick/2045-add-telegram-topic-id-to-agent-sidebar-i/) |
| 2046 | Review Phase 37 commits for edge cases and determine v3.4 milestone status | 2026-03-05 | 9702600 | [2046-review-phase-37-commits-for-edge-cases-a](./quick/2046-review-phase-37-commits-for-edge-cases-a/) |
| 2047 | Enhance agent sidebar with agent registry working directory and context fill | 2026-03-05 | eb9de31 | [2047-enhance-agent-sidebar-with-agent-registr](./quick/2047-enhance-agent-sidebar-with-agent-registr/) |
| 2048 | Add Rotate Session button to terminal header + backend endpoint | 2026-03-05 | 14b7943 | [2048-add-rotate-session-button-to-gsd-manager](./quick/2048-add-rotate-session-button-to-gsd-manager/) |
## Session Continuity

Last session: 2026-03-05
Stopped at: Completed quick task 2048: Add rotate session button to GSD manager
Next step: v3.4 DONE — ready for next milestone planning
