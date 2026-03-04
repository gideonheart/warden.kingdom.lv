# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab
**Current focus:** v3.3 Telegram Operator Awareness

## Current Position

Phase: 33 — Permission Prompt Detection and Forwarding
Plan: 01 complete (1/2 plans done — Phase 33 in progress)
Status: Phase 33 Plan 01 complete — NotificationDeduplicator and detectAgentState() TDD; PERM-04, PERM-05 satisfied
Last activity: 2026-03-04 — 33-01-PLAN.md executed, NotificationDeduplicator built and tested with TDD

```
Progress: [##░░] 2/4 phases (Phase 32 complete, Phase 33 Plan 01 complete)
Milestone: v3.3 Telegram Operator Awareness
```

## Performance Metrics

**Completed milestones:** v1.0 (6 phases), v1.1 (2), v2.0 (3), v2.1 (3), v2.3 (4), v3.0 (2), v3.1 (6), v3.2 (4) = 31 phases shipped
**Current milestone:** v3.3 — Phase 32 complete, Phase 33 Plan 01 complete (2/4 phases)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.

**v3.3-specific decisions (to be made during implementation):**

- grammy ^1.41.1 selected for Telegram bot client (TypeScript-first, long polling, inline keyboards, graceful shutdown)
- `@grammyjs/auto-retry` for 429 rate-limit handling at bot init
- `strip-ansi` for ANSI stripping of tmux pane excerpts before Telegram message composition
- Bot token from `WARDEN_TELEGRAM_BOT_TOKEN` env var — never logged or committed
- Operator Telegram user ID from `WARDEN_TELEGRAM_OPERATOR_ID` env var
- `NotificationPoller` with 10-second interval using `tmux capture-pane` (NOT PTY `onData`) — works without browser open
- `detectAgentState()` extracted from `gsdRoutes.ts` to `src/server/utils/agentStateDetection.ts` (shared utility)
- `NotificationDeduplicator` with in-memory cooldown Map — configurable window, defaults: 2 min permission, 10 min budget
- `notification_config` SQLite table following singleton-row pattern (same as `budget_config`, `rotation_config`)
- Phase 33 depends on Phase 32; Phase 34 depends on Phase 33; Phase 35 depends on Phase 33
- [Phase 32-bot-foundation]: MockBot vi.fn must use function() not arrow fn for constructability via new Bot(token)
- [Phase 32-bot-foundation]: TelegramBotService.start() is void — bot.start() fire-and-forget, no await
- [Phase 32-bot-foundation]: autoRetry() default config (unlimited retries) selected for Phase 32
- [Phase 32-02]: handleShutdown() converted to async — await telegramBotService.stop() before httpServer.close() prevents 409 Conflict on rapid restart
- [Phase 32-02]: Signal handlers use void pattern — () => { void handleShutdown('SIGTERM'); } correct async invocation without unhandled rejection
- [Phase 33-01]: lastNotifiedAt reset to null on permission state exit — enables immediate re-notification on clean re-entry without cooldown wait
- [Phase 33-01]: previousState checked BEFORE update in recordAndCheck() — transition detection requires reading old state before writing new state

### Research Flags

- **Phase 33:** Verify narrowed `detectAgentState()` regex (`❯ 1. Yes`) against actual Claude Code terminal output before finalizing. Capture a real permission prompt pane and confirm match.
- **Phase 32 deployment:** `WARDEN_TELEGRAM_BOT_TOKEN` must be set in production (Laravel Forge env) before Phase 32 deploy.
- **Phase 34 prereq:** Operator must look up their Telegram user ID via `@userinfobot` before Phase 34 testing.

### Pending Todos

None

### Blockers/Concerns

None

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2039 | Review Phase 21 commits and confirm milestone completion readiness | 2026-03-04 | 494482e | [2039-review-phase-21-commits-and-confirm-mile](./quick/2039-review-phase-21-commits-and-confirm-mile/) |
| 2040 | Fix Phase 22 verification gaps — API response key mismatches in TokenUsageView | 2026-03-04 | 24ddd1d | [2040-fix-phase-22-verification-gaps-inline-in](./quick/2040-fix-phase-22-verification-gaps-inline-in/) |
| 2041 | Re-run Phase 22 verification — confirm all must-haves pass after quick-2040 fixes | 2026-03-04 | b73bf54 | [2041-re-run-phase-22-verification-after-quick](./quick/2041-re-run-phase-22-verification-after-quick/) |
| 2042 | Propose top 3 concrete next milestone options | 2026-03-04 | aed4d8d | [2042-propose-top-3-concrete-next-milestone-op](./quick/2042-propose-top-3-concrete-next-milestone-op/) |

## Session Continuity

Last session: 2026-03-04 (Plan 33-01 execution)
Stopped at: Completed 33-01-PLAN.md — NotificationDeduplicator built with TDD; detectAgentState() extracted; PERM-04, PERM-05 satisfied
Next step: Execute Phase 33 Plan 02 — NotificationPoller service wiring
