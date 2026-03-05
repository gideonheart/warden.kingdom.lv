---
phase: 32-bot-foundation
plan: 01
subsystem: infra
tags: [grammy, telegram, bot, long-polling, auto-retry, vitest, tdd]

# Dependency graph
requires: []
provides:
  - TelegramBotService singleton with start/stop/isRunning lifecycle
  - grammy long-polling bot with fire-and-forget start pattern
  - Missing-token graceful degradation (logs warning, doesn't crash)
  - autoRetry transformer for 429/5xx rate-limit handling
  - Unit test suite covering BOT-01, BOT-02, BOT-04
affects:
  - 33-notifications (uses telegramBotService.start/stop, sends messages)
  - 34-inline-keyboards (builds on bot for interactive operator controls)
  - 35-settings (uses bot for settings delivery)

# Tech tracking
tech-stack:
  added:
    - grammy ^1.41.1 (Telegram bot client, long polling)
    - "@grammyjs/auto-retry ^2.0.2 (transparent 429/5xx retry plugin)"
  patterns:
    - Singleton service class with start()/stop() lifecycle matching RecordingRotationService pattern
    - Fire-and-forget bot.start() (no await — returns never-resolving Promise)
    - bot.catch() installed before bot.start() to prevent default error handler from stopping bot
    - Token guard: read env var, log warning [not set], never log token value

key-files:
  created:
    - src/server/services/TelegramBotService.ts
    - tests/unit/TelegramBotService.test.ts
  modified:
    - package.json (grammy + @grammyjs/auto-retry added)
    - package-lock.json

key-decisions:
  - "grammy Bot mock uses vi.fn(function() { return mockBotInstance; }) not arrow function — vi.fn requires constructable function for new Bot() calls"
  - "TelegramBotService.start() is void/synchronous — bot.start() is fire-and-forget, no await"
  - "autoRetry() uses default config (unlimited retries, respects retry_after) — no caps for Phase 32"

patterns-established:
  - "Singleton service pattern: export class + export const singleton = new Class() at bottom of file"
  - "Non-blocking Telegram bot start: call bot.start().catch() without await"
  - "Secret env var guard: read to local var, check falsy, never pass var to console methods"

requirements-completed: [BOT-01, BOT-02, BOT-04]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 32 Plan 01: Bot Foundation Summary

**grammy TelegramBotService singleton with long-polling start, missing-token graceful degradation, autoRetry, and 11 TDD unit tests passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T22:22:00Z
- **Completed:** 2026-03-04T22:24:40Z
- **Tasks:** 2 (RED + GREEN TDD cycle)
- **Files modified:** 4

## Accomplishments
- Installed grammy 1.41.1 and @grammyjs/auto-retry 2.0.2 dependencies
- Wrote 11 failing unit tests (RED) covering BOT-01, BOT-02, BOT-04 requirements
- Implemented TelegramBotService singleton that passes all 11 tests (GREEN)
- Token security verified: WARDEN_TELEGRAM_BOT_TOKEN never passed to any console method
- Full suite 51/51 green; typecheck clean; production build passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Install grammy dependencies and write failing unit tests (RED)** - `50bd567` (test)
2. **Task 2: Implement TelegramBotService to pass all tests (GREEN)** - `105d201` (feat)

_Note: TDD task 2 commit includes the MockBot constructor fix (Rule 1 auto-fix) alongside the implementation._

## Files Created/Modified
- `src/server/services/TelegramBotService.ts` - TelegramBotService class with start/stop/isRunning lifecycle, grammy Bot, autoRetry, error handler, fire-and-forget start
- `tests/unit/TelegramBotService.test.ts` - 11 unit tests covering BOT-01/BOT-02/BOT-04; vi.mock for grammy and @grammyjs/auto-retry
- `package.json` - grammy and @grammyjs/auto-retry added to dependencies
- `package-lock.json` - lockfile updated

## Decisions Made
- **MockBot constructor form:** `vi.fn(function() { return mockBotInstance; })` required over arrow function because vitest's `vi.fn(() => ...)` arrow form cannot be used as a constructor via `new`. This is vitest-specific behavior.
- **fire-and-forget bot.start():** `start()` returns void (not Promise<void>) — consistent with the plan's explicit requirement and research notes confirming bot.start() should not be awaited.
- **autoRetry default config:** No caps on retry attempts for Phase 32 — the default unlimited retry mode is safest for a long-running server process.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MockBot vi.fn arrow function to be constructable**
- **Found during:** Task 2 (implementing TelegramBotService to pass tests)
- **Issue:** Test file used `vi.fn(() => mockBotInstance)` for MockBot but arrow functions cannot be constructors. When TelegramBotService called `new Bot(token)`, vitest threw `TypeError: () => mockBotInstance is not a constructor`.
- **Fix:** Changed to `vi.fn(function () { return mockBotInstance; })` — a regular function that can be used as a constructor.
- **Files modified:** tests/unit/TelegramBotService.test.ts
- **Verification:** All 11 tests pass after fix
- **Committed in:** 105d201 (Task 2 commit, alongside implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 - constructor function form in test mock)
**Impact on plan:** Essential fix for test correctness. No scope creep. Tests now accurately verify the service.

## Issues Encountered
- vitest `vi.fn()` arrow function cannot be used as a constructor — must use `function()` form for mocking ES classes called via `new`. Fixed inline per Rule 1.

## User Setup Required
None - no external service configuration required during this plan.

`WARDEN_TELEGRAM_BOT_TOKEN` must be set in the production environment (Laravel Forge) before deploying Phase 32. This was flagged in STATE.md as a Research Flag and is not a blocker for implementation.

## Next Phase Readiness
- `TelegramBotService` is ready; Phase 33 (notifications) can import `telegramBotService` and call `telegramBotService.start()` in server `index.ts`
- `start()` / `stop()` wiring into `handleShutdown()` in `src/server/index.ts` is planned for Phase 33 or a subsequent plan in Phase 32
- No blockers

## Self-Check: PASSED

- FOUND: src/server/services/TelegramBotService.ts
- FOUND: tests/unit/TelegramBotService.test.ts
- FOUND: .planning/phases/32-bot-foundation/32-01-SUMMARY.md
- FOUND commit: 50bd567 (test: RED state)
- FOUND commit: 105d201 (feat: GREEN implementation)

---
*Phase: 32-bot-foundation*
*Completed: 2026-03-04*
