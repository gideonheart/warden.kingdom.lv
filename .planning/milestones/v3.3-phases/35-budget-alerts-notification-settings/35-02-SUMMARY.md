---
phase: 35-budget-alerts-notification-settings
plan: 02
subsystem: notifications-ui
tags: [react, express, sqlite, notifications, telegram, settings-panel]

# Dependency graph
requires:
  - phase: 35-01
    provides: BudgetAlertPoller, notification_config DB table, getNotificationConfig/setNotificationConfig

provides:
  - GET/PUT /api/notifications/config endpoints with botConnected status field
  - notificationRoutes Express router
  - NotificationSettingsPanel React component (4th tab in HistoryView)
  - BudgetAlertPoller wired into server lifecycle (startPolling / stopPolling)
  - NotificationPoller config-aware (reads permissionAlertsEnabled + permissionCooldownMs from DB on each poll cycle)

affects:
  - src/server/index.ts (BudgetAlertPoller lifecycle + notificationRoutes mount)
  - src/client/components/HistoryView.tsx (4th Notifications tab)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - GET endpoint spreads DB config and appends live botConnected status field
    - PUT endpoint validates each field individually, builds patch object, rejects empty patch with 400
    - Optimistic UI update on save, re-fetch to revert on error
    - onBlur (not onChange) for number inputs — avoids excessive API calls during typing
    - key={config.field} on input to reset defaultValue when server data changes
    - permissionAlertsEnabled early return in pollAllSessions() — skips all session polling when disabled

key-files:
  created:
    - src/server/routes/notificationRoutes.ts
    - src/client/components/NotificationSettingsPanel.tsx
  modified:
    - src/server/index.ts
    - src/server/services/NotificationPoller.ts
    - src/client/components/HistoryView.tsx

key-decisions:
  - "GET /api/notifications/config spreads DB config and adds botConnected live — single endpoint gives UI everything it needs"
  - "PUT validates each field independently with early returns — clear per-field error messages, partial patches are valid"
  - "Config read moved to pollAllSessions() — reads once per cycle, passes cooldownMs down to pollSession() (reduces DB calls)"
  - "onBlur for cooldown inputs, not onChange — prevents rapid PUT calls while typing; clamp to >= 1 minute before saving"
  - "key={config.permissionCooldownMs} on input resets defaultValue when server data changes (controlled vs uncontrolled pattern)"

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 35 Plan 02: Notification Settings UI Summary

**Notification settings panel with bot status indicator, permission/budget toggles and cooldown inputs; notification API routes; BudgetAlertPoller wired into server lifecycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T00:15:38Z
- **Completed:** 2026-03-05T00:19:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `notificationRoutes.ts` with GET/PUT `/api/notifications/config` — spreads `NotificationConfig` and adds live `botConnected: telegramBotService.isRunning()` field
- PUT validates each field individually (type + finiteness + bounds), returns `{ status: 'ok' }` on success, 400 with specific message on validation failure or empty patch
- Wired `budgetAlertPoller.startPolling()` and `budgetAlertPoller.stopPolling()` into `src/server/index.ts` lifecycle
- Mounted `notificationRoutes` after `recordingRoutes` in Express app
- Refactored `NotificationPoller.pollAllSessions()` to read config once at the top — early return if `permissionAlertsEnabled` is false, passes `permissionCooldownMs` to `pollSession()` (DB read happens once per cycle, not per session)
- Created `NotificationSettingsPanel.tsx` — fetches config on mount, shows green/red bot status dot, permission and budget toggle buttons, cooldown minute inputs with onBlur save
- Added `notifications` as 4th tab in `HistoryView` desktop tabs and mobile accordion
- Production build succeeds, all 90 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: notification API routes, BudgetAlertPoller wiring, NotificationPoller config-aware** - `9d222cf` (feat)
2. **Task 2: NotificationSettingsPanel component and Notifications tab in HistoryView** - `152eb74` (feat)

## Files Created/Modified
- `src/server/routes/notificationRoutes.ts` — New: GET/PUT /api/notifications/config with field-level validation
- `src/server/index.ts` — Added budgetAlertPoller import, startPolling(), stopPolling(), notificationRoutes mount
- `src/server/services/NotificationPoller.ts` — pollAllSessions() reads config once, early return on disabled, passes cooldownMs to pollSession()
- `src/client/components/NotificationSettingsPanel.tsx` — New: bot status indicator, two toggle sections with cooldown inputs
- `src/client/components/HistoryView.tsx` — Added `notifications` to HistoryTab type, tabs array, desktop content, mobile accordion

## Decisions Made
- Config read moved to `pollAllSessions()` so it happens once per cycle (not per session) — reduces DB calls when many sessions are active
- `onBlur` for number inputs prevents a PUT on every keystroke; `key={value}` prop resets the uncontrolled input when server data changes after fetch
- Optimistic local state update on save, re-fetch to revert — keeps UI responsive without showing stale data on error

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/server/routes/notificationRoutes.ts` — FOUND
- `src/client/components/NotificationSettingsPanel.tsx` — FOUND
- `src/client/components/HistoryView.tsx` — contains 'notifications' tab
- `src/server/index.ts` — contains budgetAlertPoller start/stop
- `src/server/services/NotificationPoller.ts` — config read in pollAllSessions()
- Task 1 commit `9d222cf` — FOUND
- Task 2 commit `152eb74` — FOUND
- All 90 tests pass
- Production build succeeds

---
*Phase: 35-budget-alerts-notification-settings*
*Completed: 2026-03-05*
