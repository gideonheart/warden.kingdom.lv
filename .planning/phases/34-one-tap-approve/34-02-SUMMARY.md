---
phase: 34-one-tap-approve
plan: 02
subsystem: api
tags: [telegram, grammy, inline-keyboard, tmux, notifications, approval]

# Dependency graph
requires:
  - phase: 34-01
    provides: "ApprovalStateTracker (in-memory map) and ApprovalCallbackHandler (registers on bot) — core approval services"
  - phase: 33-02
    provides: "NotificationPoller with sendPermissionNotification, TelegramBotService with sendToTopic"
provides:
  - "sendToTopicWithApproveButton() on TelegramBotService returning message_id"
  - "registerCallbackHandler() on TelegramBotService for pre-start handler registration"
  - "NotificationPoller wired to send approve button and register ApprovalStateTracker entries"
  - "ApprovalCallbackHandler registered on bot before start() in server/index.ts"
  - "ApprovalStateTracker.pruneExpired() called each poll cycle"
affects:
  - 34-one-tap-approve

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-start callback handler registration: registerCallbackHandler() accumulates handlers applied in start() before bot.start()"
    - "Message tracking via return value: sendToTopicWithApproveButton returns message_id; null-check guards approvalStateTracker.register()"

key-files:
  created: []
  modified:
    - src/server/services/TelegramBotService.ts
    - src/server/services/NotificationPoller.ts
    - src/server/index.ts
    - tests/unit/TelegramBotService.test.ts

key-decisions:
  - "sendToTopicWithApproveButton is a separate method (not a parameter flag) — cleaner API, sendToTopic remains for non-approval messages"
  - "registerCallbackHandler stores handlers in an array (not a single slot) — supports multiple handlers without breaking single-responsibility"
  - "approvalStateTracker.pruneExpired() placed at start of pollAllSessions() — no extra timer needed, piggybacks on 10s poll"
  - "messageId null-check before register() — prevents partial approval records when bot is not running"

patterns-established:
  - "Pre-start handler registration pattern: register -> start() applies all handlers"
  - "Return-value-based state tracking: async send returns ID used for later message editing"

requirements-completed: [APRV-01, APRV-02, APRV-04]

# Metrics
duration: 10min
completed: 2026-03-04
---

# Phase 34 Plan 02: Wire Approve Button into Notification Pipeline Summary

**Inline Approve button wired end-to-end: permission notifications now include InlineKeyboard button, tapping it injects '1' into the agent's tmux session and edits the Telegram message to show approval timestamp**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-04T23:35:23Z
- **Completed:** 2026-03-04T23:45:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- TelegramBotService extended with `sendToTopicWithApproveButton()` (InlineKeyboard with `approve:{sessionName}` callback) returning `message_id`
- TelegramBotService extended with `registerCallbackHandler()` + handler application loop in `start()` before `bot.start()`
- NotificationPoller updated to call `sendToTopicWithApproveButton` and register returned `message_id` with `approvalStateTracker`
- `approvalStateTracker.pruneExpired()` called at the start of each poll cycle — no extra timer needed
- `ApprovalCallbackHandler` constructed and registered in `server/index.ts` before `telegramBotService.start()`
- 7 new tests added (APRV-01 suite + registerCallbackHandler suite) — 81 total pass, typecheck clean, production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sendToTopicWithApproveButton and registerCallbackHandler to TelegramBotService** - `27588ad` (feat)
2. **Task 2: Wire NotificationPoller to use approve button and register handler in server startup** - `735dde6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/server/services/TelegramBotService.ts` - Added `sendToTopicWithApproveButton()`, `registerCallbackHandler()`, handler loop in `start()`, `InlineKeyboard` import
- `src/server/services/NotificationPoller.ts` - Imported `approvalStateTracker`, replaced `sendToTopic` with `sendToTopicWithApproveButton`, register approval on success, prune expired on each poll
- `src/server/index.ts` - Imported `ApprovalCallbackHandler`, `approvalStateTracker`, `tmuxSessionManager`; wired approval handler before bot start
- `tests/unit/TelegramBotService.test.ts` - Added `mockSendMessage`, `MockInlineKeyboard`, 7 new tests for APRV-01 and registerCallbackHandler

## Decisions Made

- `sendToTopicWithApproveButton` is a separate method rather than a flag parameter on `sendToTopic` — cleaner API, old `sendToTopic` remains usable for non-approval messages
- `registerCallbackHandler` stores handlers in an array — supports multiple handlers without coupling to a single callback type
- `pruneExpired()` piggybacked on the existing 10-second poll cycle — no additional timer needed
- `messageId !== null` guard before `approvalStateTracker.register()` — avoids registering records when bot is not running (null return) which would never be edited

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- End-to-end one-tap approve flow is complete: permission notification -> Approve button -> tmux injection -> message edit
- APRV-01, APRV-02, APRV-04 requirements satisfied
- APRV-03 (operator ID verification) and APRV-05 (expiry) were built in Plan 01 and are active in ApprovalCallbackHandler
- Phase 34 is complete; all approval requirements covered

## Self-Check: PASSED

- FOUND: `.planning/phases/34-one-tap-approve/34-02-SUMMARY.md`
- FOUND: `src/server/services/TelegramBotService.ts`
- FOUND: `src/server/services/NotificationPoller.ts`
- FOUND: `src/server/index.ts`
- FOUND commit: `27588ad` (feat: Task 1)
- FOUND commit: `735dde6` (feat: Task 2)

---
*Phase: 34-one-tap-approve*
*Completed: 2026-03-04*
