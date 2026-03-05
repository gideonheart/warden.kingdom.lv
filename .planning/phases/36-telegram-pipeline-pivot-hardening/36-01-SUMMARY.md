---
phase: 36-telegram-pipeline-pivot-hardening
plan: 01
subsystem: api
tags: [telegram, notifications, fetch, openclaw, send-only]

# Dependency graph
requires:
  - phase: 35-notification-budget-alerts
    provides: TelegramBotService, NotificationPoller, notification infrastructure
provides:
  - Send-only TelegramBotService using Gideon's bot token from openclaw.json
  - Deleted ApprovalCallbackHandler and ApprovalStateTracker
  - FIX-01 FIX-02 FIX-03 FIX-04 implemented
affects: [36-02, notification-settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Send-only Telegram via raw fetch (no grammy): initialize() loads token, sendToTopic() POSTs"
    - "topicId validation: parseInt + Number.isFinite guard before any API call"
    - "Pane excerpt sanitization: replace backticks before wrapping in triple-backtick code fence"

key-files:
  created: []
  modified:
    - src/shared/openclawTypes.ts
    - src/server/services/OpenClawConfigReader.ts
    - src/server/services/TelegramBotService.ts
    - src/server/services/NotificationPoller.ts
    - src/server/index.ts
    - src/server/routes/notificationRoutes.ts
    - src/client/components/NotificationSettingsPanel.tsx
    - tests/unit/TelegramBotService.test.ts
  deleted:
    - src/server/services/ApprovalCallbackHandler.ts
    - src/server/services/ApprovalStateTracker.ts
    - tests/unit/ApprovalCallbackHandler.test.ts
    - tests/unit/ApprovalStateTracker.test.ts

key-decisions:
  - "Use raw fetch instead of grammy Bot for Telegram sends — eliminates long-polling conflict with Gideon's bot"
  - "Read bot token from openclaw.json channels.telegram.botToken via OpenClawConfigReader — no env var needed"
  - "Removed grammy and @grammyjs/auto-retry from package.json — no bot framework needed for send-only mode"
  - "botConnected renamed to botConfigured in API response and client — reflects send-only (no connection state)"

patterns-established:
  - "initialize() pattern for async service setup that reads config at startup"
  - "isConfigured() as lightweight status check for notification settings panel"

requirements-completed: [FIX-01, FIX-02, FIX-03, FIX-04]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 36 Plan 01: Telegram Pipeline Pivot Summary

**Send-only TelegramBotService using Gideon's bot token from openclaw.json via fetch, with all approval infrastructure deleted and grammy dependency removed**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T01:59:10Z
- **Completed:** 2026-03-05T02:03:43Z
- **Tasks:** 2
- **Files modified:** 8 modified, 4 deleted

## Accomplishments

- Rewrote TelegramBotService from grammy-based long-polling to send-only fetch approach, reading bot token from openclaw.json instead of `WARDEN_TELEGRAM_BOT_TOKEN` env var (FIX-01)
- Deleted ApprovalCallbackHandler, ApprovalStateTracker, and their tests — zero remaining references confirmed (FIX-02)
- Added topicId validation (`Number.isFinite`) in `sendToTopic` to log warning and return early on invalid values (FIX-04)
- Sanitized pane excerpts by stripping backticks before Telegram send to prevent code fence breakage (FIX-03)
- Removed grammy and @grammyjs/auto-retry from package.json (9 packages removed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite TelegramBotService to send-only mode with openclaw.json bot token** - `c1560a6` (feat)
2. **Task 2: Delete approval infrastructure and its test files** - `2b766f4` (chore)

## Files Created/Modified

- `src/shared/openclawTypes.ts` - Added `botToken?: string` to `channels.telegram` type
- `src/server/services/OpenClawConfigReader.ts` - Added `getBotToken()` method
- `src/server/services/TelegramBotService.ts` - Complete rewrite: initialize(), isConfigured(), fetch-based sendToTopic with topicId validation
- `src/server/services/NotificationPoller.ts` - Removed approvalStateTracker import/usage; sendToTopic instead of sendToTopicWithApproveButton; FIX-03 backtick sanitization
- `src/server/index.ts` - Removed ApprovalCallbackHandler/approvalStateTracker imports; `void telegramBotService.initialize()` instead of `start()`; removed `await stop()` from shutdown
- `src/server/routes/notificationRoutes.ts` - `botConfigured: isConfigured()` (was `botConnected: isRunning()`)
- `src/client/components/NotificationSettingsPanel.tsx` - Updated to use `botConfigured` field (pre-existing change aligned with rename)
- `tests/unit/TelegramBotService.test.ts` - Full rewrite: tests for initialize(), isConfigured(), sendToTopic with fetch mock, topicId validation
- **Deleted:** `src/server/services/ApprovalCallbackHandler.ts`
- **Deleted:** `src/server/services/ApprovalStateTracker.ts`
- **Deleted:** `tests/unit/ApprovalCallbackHandler.test.ts`
- **Deleted:** `tests/unit/ApprovalStateTracker.test.ts`

## Decisions Made

- Used raw `fetch` instead of grammy Bot framework for Telegram API calls — eliminates the long-polling conflict between Warden and Gideon both running on the same bot token
- Bot token sourced from `openclaw.json channels.telegram.botToken` via existing `OpenClawConfigReader` infrastructure — consistent with how all other openclaw.json data is accessed
- Removed `grammy` and `@grammyjs/auto-retry` entirely from package.json since no other consumers exist
- Renamed `botConnected` → `botConfigured` in both the API response and client component to accurately reflect send-only mode (no active connection, just token presence)

## Deviations from Plan

None - plan executed exactly as written. The `NotificationSettingsPanel.tsx` client update was already present as a pre-existing staged change aligned with the planned `botConnected` → `botConfigured` rename.

## Issues Encountered

None.

## User Setup Required

The user must add `botToken` to their `~/.openclaw/openclaw.json` under `channels.telegram`:
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC-your-bot-token-here",
      "groups": { ... }
    }
  }
}
```

This replaces the previous `WARDEN_TELEGRAM_BOT_TOKEN` environment variable approach.

## Next Phase Readiness

- Send-only Telegram infrastructure is ready for Plan 02 (FIX-05, FIX-06 client panel updates)
- `isConfigured()` method available for notification settings UI status indicator
- All approval infrastructure cleanly removed — no zombie references

---
*Phase: 36-telegram-pipeline-pivot-hardening*
*Completed: 2026-03-05*
