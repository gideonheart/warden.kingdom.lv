---
phase: 32-bot-foundation
plan: 02
subsystem: infra
tags: [grammy, telegram, bot, server-lifecycle, shutdown, express]

# Dependency graph
requires:
  - phase: 32-01
    provides: TelegramBotService singleton with start()/stop() lifecycle
provides:
  - TelegramBotService wired into Express server startup (after other services, before httpServer.listen)
  - Graceful bot shutdown in handleShutdown() via await telegramBotService.stop()
  - Async handleShutdown() with void signal handler pattern
affects:
  - 33-notifications (bot now starts on server boot — ready to receive update handlers)
  - 34-inline-keyboards (builds on running bot for interactive controls)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Async handleShutdown pattern — convert sync shutdown fn to async, use void in signal handlers
    - Bot lifecycle ordering — start after all sync services, stop before httpServer.close()

key-files:
  created: []
  modified:
    - src/server/index.ts

key-decisions:
  - "telegramBotService.start() placed after all other periodic services (instanceTracker, sessionUsageReader, recordingRotationService) and before httpServer.listen() — consistent with service startup ordering"
  - "handleShutdown() converted to async to await telegramBotService.stop() — ensures clean offset confirmation before HTTP close"
  - "Signal handlers use void pattern: () => { void handleShutdown('SIGTERM'); } — suppresses unhandled Promise rejection lint warning while keeping correct async semantics"

patterns-established:
  - "Async shutdown function pattern: async function handleShutdown() + process.on('SIGTERM', () => { void handleShutdown('SIGTERM'); })"
  - "Bot stop before HTTP close: await bot stop must precede httpServer.close() to flush offset confirmation"

requirements-completed: [BOT-03]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 32 Plan 02: Bot Foundation Summary

**TelegramBotService wired into Express server lifecycle — starts on boot after other services, stops gracefully on SIGTERM/SIGINT before HTTP close**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T22:27:23Z
- **Completed:** 2026-03-04T22:29:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `import { telegramBotService }` to `src/server/index.ts` alongside other service imports
- Called `telegramBotService.start()` in service startup sequence (after `recordingRotationService.startPeriodicRotation()`, before `httpServer.listen()`)
- Converted `handleShutdown()` from synchronous to async, added `await telegramBotService.stop()` before `httpServer.close()`
- Updated signal handlers to use `void` pattern for async function invocation
- All 51 tests pass; typecheck clean; production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire TelegramBotService into server lifecycle and verify production build** - `e989d88` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/server/index.ts` - Added telegramBotService import, start() call in service sequence, async handleShutdown with stop(), void signal handler pattern

## Decisions Made
- `telegramBotService.start()` is placed after all other periodic services and before `httpServer.listen()` — consistent with the established ordering pattern of other services.
- `handleShutdown()` converted to async because `telegramBotService.stop()` is an async method that confirms the offset to Telegram before returning. Awaiting it prevents 409 Conflict on rapid restart.
- Signal handlers use `void` pattern to properly invoke the async function without creating unhandled rejection warnings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

`WARDEN_TELEGRAM_BOT_TOKEN` must be set in the production environment (Laravel Forge) before deploying. This was flagged in STATE.md as a Research Flag in Phase 32-01 and remains a prerequisite for the bot to start. Without it, the server starts normally and logs a single warning — no crash.

## Next Phase Readiness
- Phase 32 complete: `TelegramBotService` is built (Plan 01) and wired (Plan 02). BOT-01, BOT-02, BOT-03, BOT-04 all satisfied.
- Phase 33 (notifications) can now import `telegramBotService` and add message handlers — the bot is started on server boot and will process any registered handlers.
- No blockers.

## Self-Check: PASSED

- FOUND: src/server/index.ts (modified with telegramBotService import, start, stop)
- FOUND commit: e989d88 (feat: wire TelegramBotService into server lifecycle)
- VERIFIED: grep 'telegramBotService' src/server/index.ts shows import (line 17), start (line 98), stop (line 117)
- VERIFIED: grep 'async function handleShutdown' src/server/index.ts — line 105
- VERIFIED: grep 'void handleShutdown' src/server/index.ts — lines 130, 131
- VERIFIED: grep 'telegramBotService' dist/server/server/index.js — import, start, stop present in production build
- VERIFIED: 51/51 tests pass; typecheck clean; production build succeeds

---
*Phase: 32-bot-foundation*
*Completed: 2026-03-04*
