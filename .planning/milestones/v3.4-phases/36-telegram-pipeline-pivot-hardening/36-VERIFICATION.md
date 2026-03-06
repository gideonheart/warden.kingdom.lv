---
phase: 36-telegram-pipeline-pivot-hardening
verified: 2026-03-05T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Send a Telegram notification and confirm it arrives in the correct topic"
    expected: "Notification appears in the Telegram group topic mapped to the agent (e.g. Warden -> topic 41). Message is plain text with no inline Approve button."
    why_human: "Requires a live openclaw.json with a real botToken and a running Telegram group to observe delivery."
  - test: "Trigger a permission prompt in an agent session and confirm notification text renders correctly when pane excerpt contains backticks"
    expected: "Telegram message displays with backticks replaced by single quotes — code block does not break prematurely."
    why_human: "Requires live tmux session with code output and a real Telegram delivery to observe rendering."
  - test: "Send a notification to an agent whose topicId mapping is absent from openclaw.json"
    expected: "Server logs '[NotificationPoller] No Telegram topic mapping found for agent: X' and no Telegram API call is made."
    why_human: "Requires observing server log output with controlled openclaw.json state."
---

# Phase 36: Telegram Pipeline Pivot & Hardening — Verification Report

**Phase Goal:** Route Telegram notifications through Gideon's bot (send-only, no polling), remove standalone bot infrastructure, fix notification edge cases
**Verified:** 2026-03-05
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Notifications sent via Gideon's bot token from `openclaw.json` — no `WARDEN_TELEGRAM_BOT_TOKEN` env var | VERIFIED | `TelegramBotService.initialize()` calls `openClawConfigReader.getBotToken()` which reads `config.channels?.telegram?.botToken`. No env var reference exists anywhere in `src/`. |
| 2 | Notifications land in correct Telegram topic per agent-to-topic mapping | VERIFIED | `NotificationPoller.sendPermissionNotification()` calls `openClawConfigReader.getTopicMappings()`, finds the matching entry by `agentId`, then calls `telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text)`. Same pattern in `BudgetAlertPoller`. |
| 3 | `ApprovalCallbackHandler`, `ApprovalStateTracker`, and `sendToTopicWithApproveButton` are completely removed | VERIFIED | Both files deleted. Zero references to `ApprovalCallbackHandler`, `ApprovalStateTracker`, `approvalStateTracker`, `approvalCallbackHandler`, `sendToTopicWithApproveButton` in `src/` or `tests/`. `grammy` and `@grammyjs/auto-retry` removed from `package.json`. |
| 4 | Markdown special characters in pane excerpts do not break Telegram sends | VERIFIED | `NotificationPoller` line 117: `const sanitizedExcerpt = excerpt.replace(/\`/g, "'")` strips backticks before wrapping excerpt in triple-backtick code fence. |
| 5 | Invalid `topicId` produces clear log warning and graceful return | VERIFIED | `TelegramBotService.sendToTopic()` lines 50-54: `parseInt(topicId, 10)` then `if (!Number.isFinite(parsedTopicId))` logs `[TelegramBot] Invalid topicId "${topicId}" — must be a finite integer. Skipping send.` and returns early. |
| 6 | Budget alert state survives server restart — no false re-alerts | VERIFIED | `BudgetAlertPoller.startPolling()` calls `this.hydratePersistentState()` before first `pollBudgets()`. `hydratePersistentState()` calls `database.getAllBudgetAlertStates()`. On alert fire: `database.setBudgetAlertState()`. On return to 'ok': `database.deleteBudgetAlertState()`. `budget_alert_state` table exists in `DatabaseConnection.runMigrations()`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/services/TelegramBotService.ts` | Send-only Telegram service using bot token from openclaw.json | VERIFIED | 79 lines. Contains `initialize()`, `isConfigured()`, `sendToTopic()`. No grammy imports. Uses raw `fetch`. Calls `openClawConfigReader.getBotToken()`. |
| `src/shared/openclawTypes.ts` | `botToken` field in `OpenClawConfig channels.telegram` type | VERIFIED | Line 45: `botToken?: string` present in `channels.telegram` type definition. |
| `src/server/database/DatabaseConnection.ts` | `budget_alert_state` table migration and CRUD methods | VERIFIED | Migration at lines 675-683. Four CRUD methods present: `getBudgetAlertState` (485), `setBudgetAlertState` (492), `deleteBudgetAlertState` (503), `getAllBudgetAlertStates` (507). |
| `src/server/services/BudgetAlertPoller.ts` | Persistent budget alert state that survives restart | VERIFIED | Contains `hydratePersistentState()` (line 57). Called in `startPolling()` (line 45) before first poll. |
| `src/client/components/NotificationSettingsPanel.tsx` | Updated UI with 'Bot configured/not configured' status | VERIFIED | Interface uses `botConfigured: boolean` (line 5). Renders "Bot configured" / "Bot not configured" (line 72). No "Approve" references. |
| `src/server/services/ApprovalCallbackHandler.ts` | DELETED (dead code removal) | VERIFIED | File does not exist. Zero references in codebase. |
| `src/server/services/ApprovalStateTracker.ts` | DELETED (dead code removal) | VERIFIED | File does not exist. Zero references in codebase. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TelegramBotService.ts` | `OpenClawConfigReader.ts` | `openClawConfigReader.getBotToken()` | WIRED | Line 15 of TelegramBotService: `this.botToken = await openClawConfigReader.getBotToken()` |
| `NotificationPoller.ts` | `TelegramBotService.ts` | `telegramBotService.sendToTopic()` (no approve button) | WIRED | Line 124-127: `await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text)` |
| `BudgetAlertPoller.ts` | `DatabaseConnection.ts` | `database.getAllBudgetAlertStates()`, `database.setBudgetAlertState()`, `database.deleteBudgetAlertState()` | WIRED | Lines 58, 106, 129 of BudgetAlertPoller call respective methods on `database` singleton. |
| `notificationRoutes.ts` | `TelegramBotService.ts` | `telegramBotService.isConfigured()` | WIRED | Line 13 of notificationRoutes: `botConfigured: telegramBotService.isConfigured()` |
| `NotificationSettingsPanel.tsx` | API `/api/notifications/config` | `fetch('/api/notifications/config')` reading `botConfigured` field | WIRED | Component fetches config and reads `config.botConfigured` (lines 14, 68, 72). Route returns `botConfigured` field. Names match. |
| `server/index.ts` | `TelegramBotService.ts` | `void telegramBotService.initialize()` | WIRED | Line 103: `void telegramBotService.initialize()` called at startup. No `start()`, `stop()`, or `registerCallbackHandler()` calls. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| FIX-01 | 36-01 | Read bot token from `openclaw.json` — send-only mode | SATISFIED | `TelegramBotService.initialize()` reads from `openClawConfigReader.getBotToken()`. No env var references. Raw `fetch` sends messages. |
| FIX-02 | 36-01 | Remove `ApprovalCallbackHandler`, `ApprovalStateTracker`, inline Approve button, `sendToTopicWithApproveButton()` | SATISFIED | Files deleted. Zero grep matches for all approval symbols in `src/` and `tests/`. `grammy` removed from `package.json`. |
| FIX-03 | 36-01 | Escape/strip Markdown special chars in pane excerpts | SATISFIED | `NotificationPoller` line 117 strips backticks from excerpt before wrapping in triple-backtick code fence. |
| FIX-04 | 36-01 | Validate `topicId` as finite integer before API call | SATISFIED | `sendToTopic()` lines 50-54: `parseInt` + `Number.isFinite` guard with clear console warning on invalid. |
| FIX-05 | 36-02 | Persist `lastAlertedAt` per agent to SQLite, hydrate on startup | SATISFIED | `budget_alert_state` table migration in DatabaseConnection. `BudgetAlertPoller.hydratePersistentState()` called before first poll. Persist/delete on state changes. |
| FIX-06 | 36-02 | Replace "Bot connected/disconnected" with "Bot configured/not configured" in UI | SATISFIED | `NotificationSettingsPanel` uses `botConfigured` field and renders "Bot configured" / "Bot not configured". API route returns `botConfigured` from `isConfigured()`. No old `botConnected` or "connected/disconnected" text anywhere. |

**Orphaned requirements:** None. All six FIX-0X requirements assigned to Phase 36 in REQUIREMENTS.md traceability table are accounted for and covered by the two plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `DatabaseConnection.ts` | 115 | `placeholders` variable name | Info | SQL `?` placeholder markers for `NOT IN (...)` query — not a stub pattern. Intentional. |

No blocker or warning anti-patterns found. The one "info" item is a SQL variable placeholder, not a code stub.

### Human Verification Required

#### 1. Live Telegram delivery to correct topic

**Test:** Configure `~/.openclaw/openclaw.json` with a real `botToken` under `channels.telegram`, start the server, trigger a permission prompt in a tmux session mapped to a known topic, and observe the Telegram group.
**Expected:** A Telegram message appears in the correct topic (e.g. Warden session notifies topic 41). The message contains the agent name, session name, and a sanitized excerpt. No inline Approve button is present.
**Why human:** Requires live Telegram infrastructure and a real bot token. Cannot verify message delivery programmatically without executing against the Telegram API.

#### 2. Backtick sanitization visible in Telegram rendering

**Test:** Trigger a permission prompt where the tmux pane contains backtick characters (e.g., a shell command like `` `echo foo` ``). Observe the Telegram notification.
**Expected:** Backticks in the excerpt appear as single quotes (`'`). The triple-backtick code fence is not broken. Message renders as a complete code block.
**Why human:** Telegram Markdown rendering must be observed in the actual Telegram client.

#### 3. Server restart deduplication

**Test:** Trigger a budget alert for an agent, confirm it fires. Restart the server within the cooldown window. Confirm the alert does NOT re-fire immediately after restart.
**Expected:** After restart, BudgetAlertPoller hydrates the prior alert state from SQLite and suppresses the re-alert within cooldown.
**Why human:** Requires observing server-side behavior across a restart cycle with real budget data.

### Gaps Summary

No gaps found. All six success criteria are fully implemented and verified against the actual codebase:

1. Bot token sourced from `openclaw.json` — `TelegramBotService.initialize()` calls `openClawConfigReader.getBotToken()`. No `WARDEN_TELEGRAM_BOT_TOKEN` env var exists anywhere.
2. Correct topic routing — `getTopicMappings()` looks up the agent's group and topic IDs, which are passed to `sendToTopic()`.
3. Approval infrastructure deleted — both files gone, zero grep matches, grammy uninstalled.
4. Backtick sanitization — `excerpt.replace(/\`/g, "'")` applied before building notification text.
5. Invalid topicId handled — `Number.isFinite(parseInt(topicId, 10))` guard with warning log and early return.
6. Budget alert state persisted — `budget_alert_state` table, CRUD methods, hydration in `startPolling()`, persist/delete on state transitions.

Build passes cleanly (vite + tsc, zero errors).

---

_Verified: 2026-03-05_
_Verifier: Claude (gsd-verifier)_
