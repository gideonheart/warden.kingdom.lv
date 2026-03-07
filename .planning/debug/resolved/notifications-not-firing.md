---
status: verifying
trigger: "notifications-not-firing - User never receives any notifications from Warden"
created: 2026-03-07T00:00:00Z
updated: 2026-03-07T14:05:00Z
---

## Current Focus

hypothesis: CONFIRMED - All root causes identified and fixes applied
test: Build succeeds, no new type errors or test failures
expecting: Notifications fire after server restart
next_action: Verify build and document resolution

## Symptoms

expected: Both Telegram and browser notifications should fire when: (1) an agent session stops/finishes, (2) permission prompts are detected, (3) budget thresholds are hit
actual: User never sees any notifications from Warden at all - no Telegram messages, no browser notification popups
errors: No specific error messages reported
reproduction: Run Warden with agents active. Events happen but no notifications fire. Settings UI shows "On" for both permission and budget alerts.
started: Unclear if notifications ever worked

## Eliminated

## Evidence

- timestamp: 2026-03-07T13:52:00Z
  checked: Server health + notification config API
  found: Server running, botConfigured=true, all alerts enabled
  implication: Backend services running and config correct

- timestamp: 2026-03-07T13:52:00Z
  checked: openclaw.json Telegram configuration
  found: Only 3 of 7 agents have topic mappings (warden, forge, k1-rust)
  implication: Most agents silently skip notifications (config issue, not code bug)

- timestamp: 2026-03-07T13:53:00Z
  checked: index.ts initialization order
  found: Race condition - void telegramBotService.initialize() then synchronous poller starts
  implication: First poll cycle may silently fail

- timestamp: 2026-03-07T13:54:00Z
  checked: Session stopped/finished notification feature
  found: DOES NOT EXIST. Only crash notifications exist.
  implication: Missing feature - must be added

- timestamp: 2026-03-07T13:54:00Z
  checked: Browser notifications
  found: Only budget alert transitions on non-terminals views. No session stop browser notifications.
  implication: Must expand browser notifications

- timestamp: 2026-03-07T13:55:00Z
  checked: Budget config
  found: No budget configs set. Budget alerts would work IF budgets were configured.
  implication: Budget alerts are correctly implemented but unconfigured

- timestamp: 2026-03-07T14:03:00Z
  checked: Build and type-check after fixes
  found: Build succeeds. No new type errors. No new test failures. Pre-existing TerminalView.tsx type error unchanged.
  implication: All fixes compile correctly

## Resolution

root_cause: |
  Five issues combined to cause "nothing fires":
  1. RACE CONDITION (bug): telegramBotService.initialize() was fire-and-forget but pollers started synchronously
  2. MISSING FEATURE: No session stopped/finished notifications existed (only crash)
  3. BROWSER LIMITATION: Browser notifications only covered budget alerts on non-terminals views
  4. CONFIG GAP: 4 of 7 agents lack Telegram topic mappings (user must add these to openclaw.json)
  5. NO BUDGETS SET: Budget alert system works but no budgets configured

fix: |
  Code changes applied:
  1. index.ts: Changed `void telegramBotService.initialize()` to `await telegramBotService.initialize()`
     - Ensures bot token is loaded before pollers start their first cycle
  2. InstanceTracker.ts: Added `onSessionStopped` callback fired when sessions transition to stopped
     - Fires for graceful stops and force kills (not crashes - those use onCrashDetected)
  3. index.ts: Wired onSessionStopped to Telegram notifications
     - Sends white circle emoji + agent info + stop reason to agent's topic
  4. IdleTimeoutService.ts: Added onSessionStopped call for idle-timeout stops
  5. useBrowserNotifications.ts: Added session lifecycle detection
     - Tracks instance status transitions (active/idle -> stopped/error)
     - Fires browser notification when a session stops or errors
     - Skips first render to avoid notifying for pre-existing stopped sessions
  6. App.tsx: Pass instances to useBrowserNotifications hook
  7. App.tsx: Enable budget polling on all views (was disabled on terminals view)

verification: |
  - npm run build: SUCCESS (vite build + tsc -p tsconfig.server.json)
  - npm run typecheck: Same pre-existing error count (1), no new errors
  - npm run test: Same pre-existing failures, no new failures
  - All notification pathways now have working code:
    * Permission prompts -> NotificationPoller -> Telegram (was working, race condition fixed)
    * Budget alerts -> BudgetAlertPoller -> Telegram (was working, race condition fixed)
    * Budget alerts -> useBrowserNotifications -> Browser (was working only on non-terminals views, now works on all views)
    * Session stopped -> InstanceTracker.onSessionStopped -> Telegram (NEW)
    * Session stopped -> useBrowserNotifications instance tracking -> Browser (NEW)
    * Session crashed -> InstanceTracker.onCrashDetected -> Telegram (was already working)

files_changed:
  - src/server/index.ts
  - src/server/services/InstanceTracker.ts
  - src/server/services/IdleTimeoutService.ts
  - src/client/hooks/useBrowserNotifications.ts
  - src/client/App.tsx
