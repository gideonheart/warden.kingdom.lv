---
phase: 34-one-tap-approve
plan: 01
subsystem: api
tags: [grammy, telegram, vitest, tdd, approval, tmux]

# Dependency graph
requires:
  - phase: 33-notification-polling
    provides: NotificationPoller and TelegramBotService that this approval layer will extend

provides:
  - ApprovalStateTracker in-memory service with register/get/markConsumed/pruneExpired/clear
  - ApprovalCallbackHandler with operator auth, expiry, double-tap idempotency, tmux injection, message edit
  - 16 unit tests covering APRV-02, APRV-03, APRV-04, APRV-05 business rules

affects:
  - 34-02 (will wire ApprovalCallbackHandler into TelegramBotService and NotificationPoller)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ApprovalStateTracker: in-memory Map with sentAt/consumed fields for approval lifecycle management"
    - "markConsumed() called synchronously BEFORE async tmux call to prevent double-tap race (Node.js event loop property)"
    - "callbackQuery handler registered via register(bot) pattern — keeps TelegramBotService lifecycle-clean and ApprovalCallbackHandler SRP-clean"
    - "Every callback query code path must call ctx.answerCallbackQuery() to dismiss Telegram spinner"

key-files:
  created:
    - src/server/services/ApprovalStateTracker.ts
    - src/server/services/ApprovalCallbackHandler.ts
    - tests/unit/ApprovalStateTracker.test.ts
    - tests/unit/ApprovalCallbackHandler.test.ts
  modified: []

key-decisions:
  - "ApprovalStateTracker uses in-memory Map — no SQLite needed; 15-min window; server restart loses pending approvals (acceptable tradeoff)"
  - "markConsumed() is synchronous and called before await sendPromptToSession() — prevents double-tap race; Node.js single-threaded event loop makes this atomic"
  - "ApprovalCallbackHandler receives approvalTracker and tmuxSessionManager via constructor — testable without mocking globals"
  - "register(bot) pattern: handler class registers itself on the bot reference; caller (TelegramBotService.start) passes bot after construction but before bot.start()"
  - "Expired approval: return 'Approval expired' without editing message — simpler, leaves button visible but functional UI feedback is sufficient"
  - "Session gone (tmux throws): answer with 'Session no longer available', do NOT edit message (button stays visible as indicator of failure)"

patterns-established:
  - "Pattern: TDD RED-GREEN cycle — stub service with empty methods, write failing tests, implement, verify all pass"
  - "Pattern: vi.useFakeTimers() + vi.setSystemTime() for time-dependent unit tests (reused from NotificationDeduplicator)"
  - "Pattern: createMockBot() captures registered handler via callbackQuery mock for direct test invocation"

requirements-completed: [APRV-02, APRV-03, APRV-04, APRV-05]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 34 Plan 01: One-Tap Approve — Core Services Summary

**ApprovalStateTracker (in-memory approval lifecycle) and ApprovalCallbackHandler (operator auth + expiry + double-tap guard + tmux injection + message edit) implemented with 16 passing unit tests covering APRV-02/03/04/05**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T23:29:20Z
- **Completed:** 2026-03-04T23:32:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- ApprovalStateTracker: pure in-memory approval tracking with register/get/markConsumed/pruneExpired/clear; 8 unit tests all pass
- ApprovalCallbackHandler: full approval flow with operator ID gate (APRV-03), 15-min expiry (APRV-05), synchronous double-tap prevention, tmux injection (APRV-02), and message edit to remove button (APRV-04)
- 16 total unit tests pass; full suite of 75 tests green; TypeScript typecheck clean; production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: ApprovalStateTracker stub + 8 failing tests (RED)** - `9bab680` (test)
2. **Task 2: Full implementation + ApprovalCallbackHandler with 8 tests (GREEN)** - `a532962` (feat)

_Note: TDD tasks have two commits — RED (stub + failing tests) then GREEN (implementation + passing tests)_

## Files Created/Modified

- `src/server/services/ApprovalStateTracker.ts` - In-memory Map tracking pending approvals; exports ApprovalStateTracker class, approvalStateTracker singleton, and APPROVAL_EXPIRY_MS constant
- `src/server/services/ApprovalCallbackHandler.ts` - Callback query handler for approve button taps; register(bot) attaches handler to grammy Bot instance
- `tests/unit/ApprovalStateTracker.test.ts` - 8 tests: register, get, markConsumed, no-op, overwrite, pruneExpired (expired + preserved), clear
- `tests/unit/ApprovalCallbackHandler.test.ts` - 8 tests: non-operator rejection, missing env, expired, no record, successful approve, message edit, double-tap, all-paths coverage

## Decisions Made

- ApprovalStateTracker uses in-memory Map — no SQLite needed for 15-min approval window; server restart losing pending approvals is acceptable
- markConsumed() synchronous before async sendPromptToSession() call prevents double-tap race condition (Node.js single-threaded event loop property)
- ApprovalCallbackHandler receives dependencies via constructor for clean unit testability
- register(bot) pattern keeps TelegramBotService lifecycle responsibility separate from approval business logic (SRP)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this plan. Phase 34 integration (plan 02) will wire these services into the server.

## Next Phase Readiness

- ApprovalStateTracker ready to be instantiated in server/index.ts and used by NotificationPoller for register() calls
- ApprovalCallbackHandler ready to be instantiated and have register(bot) called from TelegramBotService.start()
- Both services fully tested and type-safe; no blocking concerns

---
*Phase: 34-one-tap-approve*
*Completed: 2026-03-04*

## Self-Check: PASSED

- FOUND: src/server/services/ApprovalStateTracker.ts
- FOUND: src/server/services/ApprovalCallbackHandler.ts
- FOUND: tests/unit/ApprovalStateTracker.test.ts
- FOUND: tests/unit/ApprovalCallbackHandler.test.ts
- FOUND: .planning/phases/34-one-tap-approve/34-01-SUMMARY.md
- FOUND commit: 9bab680 (test(34-01): add failing tests for ApprovalStateTracker)
- FOUND commit: a532962 (feat(34-01): implement ApprovalStateTracker and ApprovalCallbackHandler with tests)
- FOUND commit: 7366774 (docs(34-01): complete one-tap-approve core services plan)
