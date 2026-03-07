# Warden Notification System Investigation

**Date:** 2026-03-07
**Scope:** Complete map of all notification channels, gap analysis, and options for native OS/phone push notifications

---

## 1. Current Notification Architecture Map

Warden currently has **four notification channels** across server-side and client-side:

### A. Telegram Permission Prompt Notifications (server-side, polling)

**Data flow:**

```
NotificationPoller (10s interval)
  -> instanceTracker.listActiveInstances() [get all active tmux sessions]
  -> execFile('tmux', ['capture-pane', '-pt', '{session}:0.0', '-S', '-20'])
  -> stripAnsi(stdout) [strip ANSI escape codes]
  -> detectAgentState(cleanPane) [regex-based state detection]
  -> NotificationDeduplicator.recordAndCheck(session, state, cooldownMs)
     [fires on FIRST transition into 'permission_prompt', suppresses sustained state]
     [resets cooldown when session exits permission_prompt state]
  -> sendPermissionNotification()
     -> openClawConfigReader.getTopicMappings() [lookup agent -> Telegram group/topic]
     -> telegramBotService.sendToTopic(groupId, topicId, markdownText)
        -> fetch() POST to https://api.telegram.org/bot{token}/sendMessage
```

**State detection:** `detectAgentState()` in `src/server/utils/agentStateDetection.ts` uses regex patterns:
- `permission_prompt`: matches `"Do you want to proceed?"` or `"1. Yes"` patterns
- Also detects `menu`, `idle`, `error`, `working` states (only `permission_prompt` triggers notification)

**Deduplication:** `NotificationDeduplicator` (in-memory, per-session):
- Fires on first transition INTO `permission_prompt`
- Suppresses repeated detections while state remains `permission_prompt` (sustained state)
- Suppresses re-entry within `cooldownMs` after last notification
- Resets cooldown when session fully exits `permission_prompt` state (allows immediate re-notification)

**Configuration:**
- SQLite table: `notification_config` (single-row, id=1)
- Fields: `permission_alerts_enabled` (boolean, default true), `permission_cooldown_ms` (default 120000 = 2 min)
- REST API: `GET/PUT /api/notifications/config`
- UI: `NotificationSettingsPanel` component in History view

**Dependencies:**
- `~/.openclaw/openclaw.json`: bot token (`telegram.botToken`), topic mappings per agent (`telegram.topicMappings[]`)
- Tmux sessions must be running (captures pane output via `tmux capture-pane`)
- `TelegramBotService` must be initialized with a valid bot token

**Known issue (from STATE.md):** NotificationPoller polls stopped sessions (dead `capture-pane` calls). The poller uses `instanceTracker.listActiveInstances()` which should filter out stopped sessions, but there may be a race between InstanceTracker marking sessions stopped and NotificationPoller iterating them. The catch block silently ignores dead session errors.

### B. Telegram Budget Alert Notifications (server-side, polling)

**Data flow:**

```
BudgetAlertPoller (10s interval)
  -> database.getNotificationConfig() [check if budgetAlertsEnabled]
  -> database.getBudgetAlertStatus() [SQL join: budget_config x token_usage for today]
     [returns per-agent: todayCostUsd, dailyBudgetUsd, budgetPct, alertLevel]
  -> checkAgent(status, cooldownMs) per agent
     [level escalation check: ok -> warning -> exceeded]
     [cooldown check: suppress same-level alerts within budgetCooldownMs]
  -> setBudgetAlertState() [persist dedup state to SQLite for restart survival]
  -> sendBudgetAlert()
     -> openClawConfigReader.getTopicMappings()
     -> telegramBotService.sendToTopic(groupId, topicId, markdownText)
```

**Alert levels:**
- `ok`: budget usage < 80% -- no alert
- `warning`: budget usage >= 80% and < 100% -- yellow circle emoji
- `exceeded`: budget usage >= 100% -- red circle emoji

**Deduplication:** In-memory `records` Map + SQLite `budget_alert_state` table:
- Fires immediately on first breach or level escalation (warning -> exceeded)
- Suppresses repeated alerts within `budgetCooldownMs` window (default 600000 = 10 min)
- Resets state when agent returns to `ok` (next breach fires fresh)
- Hydrates from SQLite on startup (prevents false re-alerts after server restart)

**Configuration:**
- SQLite table: `notification_config` (shared with permission alerts)
- Fields: `budget_alerts_enabled` (boolean, default true), `budget_cooldown_ms` (default 600000 = 10 min)
- Budget thresholds: `budget_config` table (per-agent `daily_budget_usd`)
- Persistent dedup: `budget_alert_state` table (per-agent `alert_level`, `last_alerted_at`)

**Dependencies:**
- `~/.openclaw/openclaw.json`: bot token, topic mappings
- `token_usage` table: populated by `SessionUsageReader` from agent usage files
- `budget_config` table: configured via History view UI

### C. Telegram Crash Notifications (server-side, event-driven)

**Data flow:**

```
InstanceTracker.onCrashDetected [event callback, set in index.ts]
  -> inline handler in src/server/index.ts
     -> openClawConfigReader.getTopicMappings()
     -> telegramBotService.sendToTopic(groupId, topicId, markdownText)
  -> autoRestartService.attemptRestart() [fire-and-forget, separate concern]
```

**Message content:** Red circle emoji, agent ID, session name, project slug, uptime duration, crash timestamp.

**Deduplication:** None -- fires once per crash event (event-driven, not polling).

**Configuration:** Not configurable. Always fires if:
1. Bot token is configured in `openclaw.json`
2. A Telegram topic mapping exists for the crashed agent

**Dependencies:**
- Same as A and B for Telegram delivery
- `InstanceTracker` crash detection (polls tmux session list, detects disappeared sessions)

### D. Browser Budget Notifications (client-side, Notification API)

**Data flow:**

```
App.tsx
  -> useBudgetAlerts(enabled) hook
     -> polls GET /api/history/budget-config/status every 30s
     -> returns BudgetAlertLevel: 'ok' | 'warning' | 'exceeded'
  -> useBrowserNotifications({ budgetAlertLevel }) hook
     -> tracks previousBudgetLevelRef (ref-based transition detection)
     -> on transition to 'warning' or 'exceeded':
        -> new Notification('Warden -- Budget Warning/Exceeded', { body, tag })
        -> tag: 'warden-budget-{level}' (browser dedup layer)
```

**Configuration:**
- localStorage key: `warden:notifications-enabled` (opt-in toggle, persists across reloads)
- Browser `Notification.permission` API (default/granted/denied)
- Toggle button: bell icon in TerminalView header bar

**UI integration:**
- `TerminalView` receives `notificationsEnabled`, `onToggleNotifications`, `notificationPermission` props
- Bell icon shows in terminal header when Notification API is supported
- `NotificationSettingsPanel` in History view controls server-side Telegram notification settings (separate from browser notifications)

**Limitations:**
- Only fires for budget alerts, NOT for permission prompts
- Only works while the Warden tab is open in the browser
- Requires browser tab to be loaded (not a background/service worker notification)
- No sound or vibration configuration

---

## 2. What Does NOT Exist Today

### Missing infrastructure for native push notifications:

1. **No PWA / Web App Manifest** -- There is no `manifest.json` or `<link rel="manifest">`. Users cannot "install" Warden to their home screen or app list.

2. **No Service Worker** -- No `service-worker.js` or Workbox configuration. A service worker is required for:
   - Receiving push events when the tab is closed
   - Showing notifications from the background
   - Offline caching (progressive enhancement)

3. **No Web Push API integration** -- No VAPID key pair generation, no `PushManager.subscribe()`, no push event handling server-side.

4. **No push subscription storage** -- No database table for storing push subscription endpoints (each browser instance generates a unique push endpoint URL).

5. **Browser notifications only work with tab open** -- The current `useBrowserNotifications` hook uses the synchronous `new Notification()` constructor, which requires the page to be loaded and JavaScript running. When the tab is closed, no notifications fire.

6. **No native mobile app** -- No React Native, Capacitor, Ionic, or other mobile framework. Warden is a pure web application.

7. **Permission prompt notifications are Telegram-only** -- The browser notification system (`useBrowserNotifications`) only handles budget alerts. Permission prompts go exclusively via Telegram. A user without Telegram configured will never know an agent is waiting for permission unless they are looking at the Warden tab.

8. **No notification sound** -- Neither browser nor Telegram notifications include custom audio alerts from Warden (Telegram uses its own notification sounds).

9. **No notification history/log** -- There is no record of sent notifications. You cannot review what was notified or when.

---

## 3. Options for Native OS/Phone Notifications

### Option A: Web Push Notifications (PWA)

**What:** Add a service worker, Web Push API, and VAPID keys to make Warden a Progressive Web App with background push notification capability.

**How it works:**
1. Server generates a VAPID key pair (one-time setup, stored in config)
2. Client registers a service worker that handles `push` events
3. Client calls `PushManager.subscribe()` with VAPID public key to get a push subscription
4. Server stores the subscription endpoint (URL + keys) in a new SQLite table
5. When a notification event occurs (permission prompt, budget alert, crash), server sends push via the `web-push` npm library to all stored subscriptions
6. Service worker receives the push event and calls `self.registration.showNotification()`

**Pros:**
- Works on desktop browsers (Chrome, Firefox, Edge) even when the tab is closed
- Works on Android Chrome (including when browser is backgrounded)
- Supports "Add to Home Screen" / installed web app mode
- No app store submission required
- No additional external services -- VAPID keys are self-generated
- Can coexist with existing Telegram notifications

**Cons:**
- iOS Safari: Web Push works ONLY if the site is installed as a PWA first (added to home screen), and only since iOS 16.4+. The user must explicitly add to home screen before push subscriptions work.
- Requires HTTPS in production (localhost works for development)
- Adds `web-push` npm dependency
- Push subscriptions expire and need refresh logic
- Each browser/device generates a separate subscription -- need subscription management UI

**Effort:** Medium (2-3 quick tasks):
- Task 1: Service worker + web app manifest + VAPID key generation
- Task 2: Push subscription flow (client subscribe, server store, settings UI)
- Task 3: Server-side push sender (integrate into NotificationPoller, BudgetAlertPoller, crash handler)

### Option B: Telegram as the Primary Mobile Channel (already exists)

**What:** Telegram is already delivering notifications to the user's phone via the Telegram app. This is the current production notification path.

**How it works:** Already implemented -- NotificationPoller (permission prompts), BudgetAlertPoller (budget alerts), and crash handler (session crashes) all send to Telegram group topics via TelegramBotService.

**Pros:**
- Already built and working in production
- Works on all platforms (iOS, Android, desktop, web)
- Reliable delivery via Telegram's infrastructure
- Rich formatting (Markdown messages with emoji, code blocks)
- No additional infrastructure needed

**Cons:**
- Requires the Telegram app installed and configured
- Notifications go to a group topic (not a personal direct message)
- User must be a member of the Telegram group to receive notifications
- Depends on external service (Telegram Bot API availability)
- Bot token and topic mapping must be configured in `openclaw.json`

**Enhancement opportunities (no new infrastructure):**
- Add direct message support (send to user's DM instead of/in addition to group topics)
- Add a notification digest/summary (e.g., daily summary of all alerts)
- Add inline action buttons (Telegram Bot API supports inline keyboards) for approve/deny directly from Telegram

**Effort:** Zero for current functionality. Low effort for enhancements.

### Option C: ntfy.sh (Self-hosted Push Relay)

**What:** Use [ntfy.sh](https://ntfy.sh/) as a push notification relay. ntfy is an open-source, self-hostable HTTP-based pub/sub notification service.

**How it works:**
1. Server POSTs notification payloads to a ntfy topic URL (e.g., `https://ntfy.sh/warden-alerts` or self-hosted `https://ntfy.yourdomain.com/warden-alerts`)
2. User subscribes to the topic via ntfy mobile app (iOS/Android) or browser
3. ntfy handles all push delivery infrastructure

**Pros:**
- Free and open source (no paid subscription)
- Can be self-hosted (Docker container) or use the public ntfy.sh server
- Works on iOS AND Android via native ntfy apps
- Simple integration: single HTTP POST per notification (similar to current Telegram sendToTopic)
- Supports priorities, tags, icons, action buttons, click URLs
- Supports UnifiedPush standard (interoperable with other push clients)

**Cons:**
- Requires user to install the ntfy app on their phone
- If self-hosted, requires running and maintaining another service
- If using public ntfy.sh, topic names must be unique and notifications are public by default (can be secured with auth)
- Less ubiquitous than Telegram (user may not already have ntfy)

**Effort:** Low (1 quick task):
- Create a `NtfySenderService` alongside `TelegramBotService`
- Add ntfy topic URL + auth token to configuration
- Wire into NotificationPoller, BudgetAlertPoller, crash handler
- Add settings UI toggle

### Option D: Gotify (Self-hosted Push Server)

**What:** Use [Gotify](https://gotify.net/) as a fully self-hosted push notification server with its own client apps.

**How it works:**
1. Run Gotify server as a Docker container (provides REST API + WebSocket)
2. Server POSTs notifications to Gotify's REST API
3. User installs Gotify app (Android only, or web UI) and configures server URL

**Pros:**
- Fully self-hosted -- no external service dependencies at all
- Simple REST API for sending notifications
- Supports priorities and Markdown formatting
- Open source, well-documented

**Cons:**
- Android only for native push (no iOS app)
- Requires running another server process
- Smaller ecosystem and community compared to ntfy
- Web client requires keeping a browser tab open (same limitation as current)
- No iOS push support makes this less useful for the mobile use case

**Effort:** Low-Medium (1-2 quick tasks)

---

## 4. Recommendation

Based on the project's constraints and current state:

### Already covered: Phone notifications via Telegram

Telegram already covers the primary mobile notification use case. Permission prompts, budget alerts, and crash notifications are all delivered to the operator's phone via the Telegram app. This works on iOS, Android, and desktop -- no additional work needed.

### Most impactful standard addition: Web Push (Option A)

For native OS notifications that work when the browser tab is closed, Web Push (PWA) is the standards-based approach. It would give desktop users notifications without requiring Telegram, and give Android users browser-based push. The iOS limitation (must install as PWA first) is acceptable for a single-operator tool.

### Lowest effort for additional phone push: ntfy.sh (Option C)

If Telegram is insufficient or the operator wants a dedicated notification channel separate from Telegram groups, ntfy.sh provides the lowest-effort path. A single `NtfySenderService` class + configuration UI would cover it.

### Best immediate quick win: See Section 5

The highest-value, lowest-effort improvement requires no new infrastructure at all.

---

## 5. Quick Win: Browser Notifications for Permission Prompts

Currently, permission prompt notifications are Telegram-only. Browser notifications only fire for budget alerts. This means an operator watching the Warden tab will not get a browser notification when an agent needs permission -- they only see it if they happen to be looking at that agent's terminal tab.

**What it would take to add browser notifications for permission prompts:**

1. **Server-side:** The server already detects permission prompts via NotificationPoller. Add a Socket.IO event emission alongside the Telegram notification:
   ```
   socketServer.emit('notification:permission_prompt', { agentId, sessionName, excerpt })
   ```

2. **Client-side:** The `useBrowserNotifications` hook already has the infrastructure for `Notification` API calls. Extend it to:
   - Accept a Socket.IO event listener for `notification:permission_prompt`
   - Fire a `new Notification('Warden -- Permission Required', { body: agentId + ' needs permission', tag: 'warden-permission-' + sessionName })`

3. **No new dependencies needed.** Socket.IO is already used for terminal streaming. The Notification API is already integrated for budget alerts.

**Effort estimate:** ~1 quick task. The pattern is identical to the existing budget alert browser notification, just wired to a different event source.

**Benefit:** Operators who have the Warden tab open (but may be on a different browser tab or have the window minimized) will get an OS notification when any agent needs permission, without needing Telegram.

---

## Appendix: File Reference

| Component | File | Role |
|-----------|------|------|
| NotificationPoller | `src/server/services/NotificationPoller.ts` | Permission prompt detection via tmux capture-pane |
| BudgetAlertPoller | `src/server/services/BudgetAlertPoller.ts` | Budget threshold monitoring |
| NotificationDeduplicator | `src/server/services/NotificationDeduplicator.ts` | Permission prompt dedup logic |
| TelegramBotService | `src/server/services/TelegramBotService.ts` | Telegram Bot API sender (send-only) |
| OpenClawConfigReader | `src/server/services/OpenClawConfigReader.ts` | Bot token + topic mapping source |
| agentStateDetection | `src/server/utils/agentStateDetection.ts` | Regex-based agent state detection |
| notificationRoutes | `src/server/routes/notificationRoutes.ts` | GET/PUT /api/notifications/config |
| DatabaseConnection | `src/server/database/DatabaseConnection.ts` | notification_config, budget_alert_state tables |
| index.ts | `src/server/index.ts` | Crash notification handler, service wiring |
| useBrowserNotifications | `src/client/hooks/useBrowserNotifications.ts` | Browser Notification API for budget alerts |
| useBudgetAlerts | `src/client/hooks/useBudgetAlerts.ts` | Client-side budget alert level polling |
| NotificationSettingsPanel | `src/client/components/NotificationSettingsPanel.tsx` | Server-side notification config UI |
| TerminalView | `src/client/components/TerminalView.tsx` | Bell icon toggle for browser notifications |
| App.tsx | `src/client/App.tsx` | Wires useBrowserNotifications + useBudgetAlerts |
| types.ts | `src/shared/types.ts` | NotificationConfig, BudgetAlertStatus types |
