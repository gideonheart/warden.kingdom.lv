---
phase: 33-permission-prompt-detection-and-forwarding
plan: 02
subsystem: notifications
tags: [telegram, grammy, strip-ansi, tmux, polling, notification-pipeline, permission-prompt]

# Dependency graph
requires:
  - phase: 33-01-permission-prompt-detection-and-forwarding
    provides: NotificationDeduplicator and detectAgentState() shared utility
  - phase: 32-bot-foundation
    provides: TelegramBotService wired into server lifecycle with start/stop
provides:
  - NotificationPoller at src/server/services/NotificationPoller.ts
  - sendToTopic() method on TelegramBotService for topic-routed Telegram messaging
  - End-to-end permission prompt notification pipeline (PERM-01, PERM-02, PERM-03)
affects:
  - 34-operator-messaging (uses same sendToTopic mechanism)
  - 35-budget-alert-notifications (can follow same NotificationPoller pattern)

# Tech tracking
tech-stack:
  added:
    - strip-ansi@^7.2.0 (ESM-native ANSI stripping for tmux pane output before detection)
  patterns:
    - tmux capture-pane via execFileAsync with -S flag for last N lines
    - ANSI stripping BEFORE state detection — prevents regex interference from cursor escape codes
    - Promise.allSettled for parallel session polling (failures isolated per session)
    - Fire-and-forget notification: errors caught at sendPermissionNotification level, never propagate
    - Poller starts after bot, stops before bot — correct dependency ordering in lifecycle

key-files:
  created:
    - src/server/services/NotificationPoller.ts
  modified:
    - src/server/services/TelegramBotService.ts
    - src/server/index.ts
    - package.json
    - package-lock.json

key-decisions:
  - "ANSI stripping applied BEFORE detectAgentState() call — research Pitfall 1: ANSI codes around cursor character break permission prompt regex"
  - "Promise.allSettled for parallel session polling — dead session errors isolated, one failed poll never aborts others"
  - "sendPermissionNotification catches all errors — NotificationPoller is fire-and-forget, never propagates to poll loop"
  - "notificationPoller.startPolling() called after telegramBotService.start() — bot must be live before first poll can send"
  - "notificationPoller.stopPolling() called before telegramBotService.stop() — poller stopped first so it cannot call sendToTopic() on a stopping bot"

patterns-established:
  - "Immediate-first-poll pattern: call pollAllSessions() before setInterval() — matches InstanceTracker.startPeriodicSync() convention"
  - "Dead session silent ignore: execFileAsync('tmux', ...) errors caught and swallowed — InstanceTracker handles cleanup on its own sync cycle"

requirements-completed: [PERM-01, PERM-02, PERM-03]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 33 Plan 02: Permission Prompt Detection and Forwarding Summary

**strip-ansi-stripped tmux capture-pane polling every 10 seconds triggers topic-routed Telegram notifications via grammy sendToTopic() when permission prompts are detected — completing the full PERM-01/02/03 notification pipeline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T23:00:10Z
- **Completed:** 2026-03-04T23:03:30Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Installed strip-ansi v7.2.0 as production dependency — ESM-native, safe for `"type": "module"` project
- Added `sendToTopic(chatId, topicId, text)` to TelegramBotService — Markdown-formatted, topic-routed, error-safe
- Built NotificationPoller: 10-second tmux capture-pane polling, ANSI-stripped detection, deduplicator-gated notifications
- Wired NotificationPoller into server lifecycle: starts after bot, stops before bot on shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Install strip-ansi, add sendToTopic to TelegramBotService, and create NotificationPoller** - `9b6f04f` (feat)
2. **Task 2: Wire NotificationPoller into server lifecycle and verify full build** - `8f091a5` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/server/services/NotificationPoller.ts` - 10-second polling service; captures tmux panes, strips ANSI, detects permission prompts, sends Telegram notifications via topic routing
- `src/server/services/TelegramBotService.ts` - Added `sendToTopic()` method for topic-routed Markdown messages; no-op guard when bot not running; errors caught and logged
- `src/server/index.ts` - Import and lifecycle wiring: `notificationPoller.startPolling()` after bot start, `notificationPoller.stopPolling()` before bot stop
- `package.json` - strip-ansi@^7.2.0 added to production dependencies
- `package-lock.json` - Updated lockfile

## Decisions Made
- ANSI stripping applied before `detectAgentState()` — ANSI escape codes around terminal cursor characters would break the `❯ 1. Yes` regex match (documented as Pitfall 1 in research).
- `Promise.allSettled` used for parallel session polling — ensures one dead tmux session error doesn't abort polling for all other active sessions.
- `sendPermissionNotification()` wraps everything in try/catch — NotificationPoller is inherently fire-and-forget; errors are logged but never propagate back to the poll loop.
- Lifecycle ordering: start poller after bot (so `sendToTopic()` has a live bot on first poll), stop poller before bot (so no `sendToTopic()` call hits a stopping bot).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - straightforward implementation. strip-ansi v7.2.0 resolved (newer patch than v7.1.0 specified, within `^7.1.0` range). All 59 tests pass, typecheck clean, production build verified.

## User Setup Required
None - no external service configuration required by this plan. (WARDEN_TELEGRAM_BOT_TOKEN must be set in production — documented in Phase 32.)

## Next Phase Readiness
- Full notification pipeline is complete: PERM-01 (notification on permission prompt), PERM-02 (topic-routed with ANSI-stripped excerpt), PERM-03 (tmux capture-pane polling without browser), PERM-04/05 (deduplication from Plan 01)
- Phase 34 (operator messaging) can use the same `sendToTopic()` method
- All 59 tests pass; TypeScript typecheck clean; production build succeeds

## Self-Check: PASSED

- FOUND: src/server/services/NotificationPoller.ts
- FOUND: src/server/services/TelegramBotService.ts (with sendToTopic())
- FOUND: src/server/index.ts (with notificationPoller.startPolling() and notificationPoller.stopPolling())
- COMMIT 9b6f04f: feat(33-02) — verified in git log
- COMMIT 8f091a5: feat(33-02) — verified in git log
- All 59 tests pass (vitest run)
- TypeScript typecheck clean
- Production build succeeds
- grep 'notificationPoller' dist/server/server/index.js — FOUND
- grep 'sendToTopic' dist/server/server/services/TelegramBotService.js — FOUND
- grep 'strip-ansi' package.json — FOUND

---
*Phase: 33-permission-prompt-detection-and-forwarding*
*Completed: 2026-03-04*
