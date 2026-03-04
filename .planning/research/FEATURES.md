# Feature Research

**Domain:** Telegram bot notification bridge — monitoring dashboard to Telegram operator awareness (v3.3 milestone)
**Researched:** 2026-03-04
**Confidence:** HIGH (grammY official docs verified, Telegram Bot API verified, codebase dependencies directly inspected)

---

## Context: What Already Exists

These features are ADDITIVE to a shipping product. The following are already complete and must not be rebuilt:

- `detectAgentState()` regex heuristics in `TerminalStreamService` — detects 'waiting_for_permission', 'idle', 'active', 'error' states from PTY output stream
- `useBudgetAlerts` hook — polls `/api/history/budget-config/status` every 30s, returns 'ok' | 'warning' | 'exceeded' per-system (not per-agent yet)
- `OpenClawConfigReader.getTopicMappings()` — reads `~/.openclaw/openclaw.json`, returns `TopicMapping[]` with `{ agentId, agentName, groupId, topicId, systemPrompt }` per agent
- `AgentInstance.telegramTopicId` field — already in SQLite schema and type definitions
- Browser notification system (`useBrowserNotifications`) — push notifications to browser on permission prompt; opt-in
- `GatewayApiClient.sendPrompt()` — sends prompts to agents via OpenClaw Gateway API (can be reused for "approve" delivery)
- `TerminalStreamService` — PTY per session; `onData` callback tapped for recording; same tap point usable for Telegram notification trigger

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the operator expects when a "Telegram notifications" milestone ships. Missing these makes the feature feel half-built.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Permission prompt → Telegram message | Core reason for the milestone — operator wants to know when an agent is blocked, from anywhere | MEDIUM | `TerminalStreamService.onData` already detects agent state via `detectAgentState()`; new `TelegramNotificationService` subscribes to state transitions and sends via grammY `bot.api.sendMessage(groupId, text, { message_thread_id: topicId })` |
| Inline approve button on permission prompt message | One-tap approve is the primary UX goal from PROJECT.md; typing `/approve` or navigating to browser defeats the purpose | MEDIUM | grammY `InlineKeyboard().text('Approve', 'approve:agentId:sessionName')` attached to the notification message; `bot.callbackQuery('approve:*', handler)` receives tap; handler calls `tmuxSessionManager.sendInput(sessionName, '1\n')` or `gatewayApiClient.sendPrompt()` |
| Budget alert → Telegram message (amber/red) | Budget alerts already exist in the dashboard; Telegram extension is the same signal via a different channel | LOW | Reuse existing per-agent budget status polling; when threshold crosses (ok→warning, warning→exceeded), call `bot.api.sendMessage()` to agent's topic. Budget check runs server-side on existing 30s interval |
| Duplicate suppression / cooldown | Without dedup, a stalled agent re-triggers permission prompt detection on every PTY output line, flooding Telegram | MEDIUM | In-memory `Map<string, number>` keyed by `agentId + alertType`, value = last-sent timestamp. Only send if `Date.now() - lastSent > COOLDOWN_MS`. Configurable per type (permission prompt default: 2 min; budget alert default: 10 min) |
| Bot token configuration | Operator must provide a bot token from BotFather; must not be hardcoded | LOW | Read from `WARDEN_TELEGRAM_BOT_TOKEN` env var. Warden already uses `process.env` for other config. No new config file format needed |
| Notification settings UI | Operator needs to toggle notification types on/off and adjust cooldown; settings stored in SQLite (same pattern as budget_config, rotation_config) | MEDIUM | New collapsible panel in Settings area (or dedicated Telegram tab in HistoryView). Toggles: enable permission alerts, enable budget alerts. Cooldown inputs per type. Single-row SQLite table: `notification_config` |

### Differentiators (Competitive Advantage)

Features that go beyond basic "bot sends a message" and make the Warden → Telegram bridge genuinely useful for a solo operator.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Edit notification message after approve | After the operator taps Approve, the message updates to "Approved by operator at HH:MM" and the inline button disappears — prevents re-tapping stale prompts | LOW | `bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: new InlineKeyboard() })` + `bot.api.editMessageText(...)` called inside the `callbackQuery` handler after approve action succeeds |
| Per-agent Telegram topic routing | Each agent's notifications go to its own configured Telegram topic (already mapped in `openclaw.json`) rather than a single group chat | LOW | `getTopicMappings()` already returns `{ groupId, topicId }` per agent; pass `message_thread_id: parseInt(topicId)` in `sendMessage` call. No new config plumbing needed |
| Approve via tmux direct input vs Gateway API | Direct `tmux send-keys` is more reliable for permission prompts (sends '1\n' to the waiting process); Gateway API is for prompt injection, not interactive selection | MEDIUM | `TmuxSessionManager.sendKeys(sessionName, '1')` is the right approval mechanism for Claude Code permission prompts (which expect a numbered menu selection); expose as `POST /api/instances/:sessionName/approve` to keep the approve action in a clean API layer |
| Connection status logging | Bot start/stop logged to console with timestamp; Telegram polling errors logged with retry behaviour | LOW | grammY long-polling catches errors and auto-retries; add `console.log('[TelegramBot] Started polling')` on init and error handler with backoff logging |
| Graceful shutdown on server stop | Bot polling stops cleanly when the Express server shuts down (no orphan polling processes) | LOW | `bot.stop()` called in existing server shutdown handler (`process.on('SIGTERM')` or equivalent in `src/server/index.ts`) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Webhook mode instead of long polling | Webhooks are "more production-grade" | Warden already has Nginx + SSL but the server is also behind an IP whitelist; configuring Telegram's servers to bypass IP whitelist adds complexity. Long polling is simpler, lower latency for a single-server operator tool, and grammY docs explicitly recommend it for single-server deployments | Use grammY `bot.start()` (long polling) — simpler, no webhook registration, no IP whitelist changes |
| Telegram as two-way command interface | Would allow `/status`, `/list`, `/stop agentId` commands via Telegram | Adds significant attack surface (commands from Telegram bypass IP whitelist); Warden is a trusted-operator tool behind IP whitelist for a reason; command parsing complexity for little gain | Keep Telegram interaction strictly to: outbound notifications + one tap approve. Full control remains in the dashboard |
| Persistent per-agent notification state in Telegram (pinned messages, edit history) | Provides a Telegram-native status board | Managing pinned message IDs across restarts, editing on state change, handling deleted messages creates fragile state synchronisation | Use stateless notification messages with inline buttons; message edits on approve only |
| SMS/email fallback when Telegram unreachable | Redundancy for critical alerts | Scope creep; Telegram delivery is reliable for a single-operator tool; adds external service dependencies (Twilio, SendGrid) | If Telegram bot errors, log to server console — the operator can SSH in. Browser notifications are already the primary fallback |
| Per-message cooldown tracking across restarts (SQLite persistence) | Prevents re-flooding after server restart | Adds DB writes on every notification; restarts happen rarely; in-memory cooldown Map is lost on restart but the operator is unlikely to be flooded in the first 2 minutes after a restart | Use in-memory Map; cooldowns reset on restart — acceptable for this use case |
| Rich message formatting with markdown tables, session details | More context in the Telegram message | Telegram MarkdownV2 escaping is error-prone (many characters must be escaped); plain text + emoji is easier to maintain and less likely to cause `Bad Request: can't parse entities` errors | Use plain text + HTML parse_mode for simple bold/code spans only; avoid MarkdownV2 |

---

## Feature Dependencies

```
[TelegramNotificationService — core singleton]
    └──requires──> [WARDEN_TELEGRAM_BOT_TOKEN env var]
    └──requires──> [grammY bot instance — one Bot per process]
    └──requires──> [OpenClawConfigReader.getTopicMappings() — already exists]
    └──requires──> [TmuxSessionManager.sendKeys() — already exists via execFile]

[Permission prompt → Telegram message]
    └──requires──> [TelegramNotificationService]
    └──requires──> [detectAgentState() output tap — in TerminalStreamService.onData]
    └──requires──> [State transition tracking (ok → waiting_for_permission only, not every line)]
    └──enhances──> [Inline approve button]
    └──requires──> [Duplicate suppression]

[Inline approve button]
    └──requires──> [Permission prompt → Telegram message] (message must exist to attach button)
    └──requires──> [TelegramNotificationService callbackQuery handler]
    └──requires──> [POST /api/instances/:sessionName/approve endpoint or direct TmuxSessionManager call]
    └──enhances──> [Edit message after approve] (mark message as acted on)

[Edit message after approve]
    └──requires──> [Inline approve button]
    └──requires──> [In-memory Map<agentId, messageId> to know which message to edit]

[Budget alert → Telegram]
    └──requires──> [TelegramNotificationService]
    └──requires──> [Server-side budget threshold check — extend existing /api/history/budget-config/status logic]
    └──requires──> [Duplicate suppression] (budget alerts fire every 30s if not suppressed)
    └──conflicts──> [Per-agent budget alerts] (current budget_config is system-wide; per-agent is an extension)

[Duplicate suppression]
    └──requires──> [TelegramNotificationService] (cooldown state lives on the service)
    └──applies to──> [All alert types: permission prompt, budget warning, budget exceeded]

[Notification settings UI]
    └──requires──> [New SQLite table: notification_config]
    └──requires──> [New API routes: GET/POST /api/notifications/config]
    └──requires──> [TelegramNotificationService reads config on each send (or cached with 30s TTL)]
    └──enhances──> [Duplicate suppression] (cooldown values come from notification_config)

[Bot token configuration]
    └──requires──> [WARDEN_TELEGRAM_BOT_TOKEN in process.env]
    └──blocks──> [all other Telegram features] (nothing works without valid token)
```

### Dependency Notes

- **Token is the absolute first dependency:** Without a valid `WARDEN_TELEGRAM_BOT_TOKEN`, grammY throws on `new Bot(token)`. Service must degrade gracefully (log warning, disable Telegram features) if env var is absent — this prevents breaking the existing dashboard on deployments that do not yet have the bot configured.
- **State transition tracking is required, not raw output tapping:** `detectAgentState()` returns a state hint per output chunk. To avoid re-sending a notification for every output line while the agent is still waiting, the notification service must track per-session `previousState` and only notify on transitions to `waiting_for_permission` (not on repeated chunks while already in that state).
- **Approve must go directly to tmux, not Gateway:** Claude Code permission prompts are menu selections (press 1, 2, etc.). The Gateway API is for injecting user messages into conversations, not for interactive menu navigation. The approve action needs `tmux send-keys -t sessionName '1' Enter`.
- **Budget alerts are currently system-wide:** `useBudgetAlerts` polls a single system-level status. For per-agent Telegram routing, the backend needs to compute per-agent alert levels. The budget threshold data is in SQLite (`token_usage` + `budget_config`); the query extension is straightforward but is a dependency of per-agent budget routing.
- **callbackQuery handler needs the session name in callback data:** The approve button's `callback_data` string (`approve:agentId:sessionName`) must embed enough identity to find the right tmux session. callback_data is limited to 64 bytes — `approve:gideon:gideon-myproject-a1b2c3d4` fits within that limit.

---

## MVP Definition

### Launch With (v3.3)

Minimum scope to deliver the milestone goal: operator receives Telegram notification when agent blocks, taps to approve, unblocks without opening browser.

- [ ] `TelegramNotificationService` singleton — bot init from env var, graceful degradation if token absent, long polling start/stop lifecycle
- [ ] Permission prompt detection → Telegram message with inline Approve button, routed to agent's configured topic via `getTopicMappings()`
- [ ] `callbackQuery` handler for approve — calls `tmux send-keys`, edits message to show "Approved", removes inline button
- [ ] Duplicate suppression — in-memory cooldown Map, configurable per alert type, default 2 min for permission prompts
- [ ] Budget alert forwarding — amber and red thresholds sent to operator's primary topic; dedup with 10 min cooldown
- [ ] Notification settings UI — enable/disable per alert type + cooldown duration; stored in SQLite `notification_config` table; settings panel in HistoryView or as new Settings tab

### Add After Core Is Working (v3.3.x)

- [ ] Per-agent budget threshold routing — route budget alerts to the specific agent's topic rather than a catch-all topic (requires extending per-agent budget query)
- [ ] Test notification button in settings UI — lets operator verify bot token and topic routing without waiting for a real event
- [ ] Notification history log — last N sent notifications in the settings panel (useful for debugging; SQLite append-only, 100-row cap)

### Future Consideration (v3.4+)

- [ ] "Deny" button alongside Approve — sends 'n' or '2' to the permission menu for a different choice (uncommon but possible use case)
- [ ] Context pressure alert — notify when agent context window exceeds 90% (already tracked in `useAgentLiveStatus`; same notification path as permission prompts)
- [ ] Scheduled quiet hours — suppress notifications between configurable times (e.g., 23:00–07:00); stored in `notification_config`

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bot token + TelegramNotificationService init | HIGH | LOW | P1 |
| Permission prompt → Telegram message | HIGH | MEDIUM | P1 |
| Inline approve button + callbackQuery handler | HIGH | MEDIUM | P1 |
| Edit message after approve | HIGH | LOW | P1 |
| Duplicate suppression | HIGH | LOW | P1 |
| Budget alert forwarding | MEDIUM | LOW | P1 |
| Notification settings UI | MEDIUM | MEDIUM | P1 |
| Per-agent budget routing | MEDIUM | MEDIUM | P2 |
| Test notification button | MEDIUM | LOW | P2 |
| Notification history log | LOW | LOW | P2 |
| Deny button | LOW | LOW | P3 |
| Context pressure alert | MEDIUM | LOW | P3 |
| Scheduled quiet hours | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v3.3 launch
- P2: Should have — add after P1s are working
- P3: Future milestone

---

## UX Flows

### Flow 1: Permission Prompt → Approve

```
Agent stalls (Claude Code shows permission menu)
    → TerminalStreamService.onData() detects state change to 'waiting_for_permission'
    → TelegramNotificationService checks cooldown (skip if < 2 min since last send for this agent)
    → getTopicMappings() returns groupId + topicId for this agent
    → bot.api.sendMessage(groupId, "[Agent] Gideon is waiting for permission\n/home/forge/project\nRequesting: bash command\n\nTime: 14:32:01", {
        message_thread_id: topicId,
        reply_markup: new InlineKeyboard().text("Approve", "approve:gideon:gideon-project-a1b2")
      })
    → Stores { agentId → messageId } in memory

Operator sees Telegram notification on phone
    → Taps "Approve" button
    → Telegram sends callback_query with data "approve:gideon:gideon-project-a1b2"
    → bot.callbackQuery handler receives it
    → Calls answerCallbackQuery (required by Telegram, clears loading spinner)
    → Calls tmuxSessionManager.sendKeys('gideon-project-a1b2', '1\r')
    → Edits message: replaces text with "Approved at 14:32:45 by operator"
    → Calls editMessageReplyMarkup with empty InlineKeyboard (removes Approve button)
    → Agent unblocks and continues
```

### Flow 2: Budget Alert

```
Server-side budget check runs (every 30s, same interval as existing budget polling)
    → Detects system-level (or per-agent) cost has crossed amber threshold
    → TelegramNotificationService checks cooldown (skip if < 10 min since last budget alert)
    → Sends to operator's primary topic: "Budget Alert — Amber\nDaily spend: $8.42 / $10.00 limit\nBurn rate: $1.2/hr"
    → No inline button (budget alerts are informational; no approve action)
    → Updates cooldown timestamp
```

### Flow 3: Settings Panel

```
Operator opens Warden dashboard → navigates to History/Settings tab
    → Notification settings panel shows:
        - "Telegram Notifications" toggle (master enable)
        - "Permission prompt alerts" toggle + cooldown input (minutes)
        - "Budget alerts" toggle + cooldown input (minutes)
        - Bot status indicator (green dot if bot polling, red if token missing)
    → Operator toggles off "Budget alerts" during testing phase
    → UI calls POST /api/notifications/config with updated settings
    → TelegramNotificationService reads updated config from DB on next send attempt
```

---

## Technical Notes

### grammY vs alternatives

**grammY** is the correct choice for this project. Reasons:
- TypeScript-first design; outstanding type inference for context, inline keyboards, callback handlers
- Long polling as default mode — no infrastructure changes needed (no webhook registration, no Nginx changes, no IP whitelist modifications for Telegram's servers)
- `bot.callbackQuery('approve:*', handler)` with wildcard matching simplifies routing
- Active maintenance, 28k+ GitHub stars, well-documented
- `bot.stop()` cleanly terminates polling for graceful shutdown integration

**node-telegram-bot-api** is not suitable: no TypeScript support, plain event emitter (not middleware), poor scalability patterns per official Telegram bot samples page.

**Telegraf** is a viable alternative but grammY is newer and has better TypeScript ergonomics. No reason to prefer Telegraf here.

**Confidence: HIGH** — grammY docs and GitHub directly verified.

### Telegram API: Topic Routing

OpenClawConfigReader already exposes `groupId` and `topicId` strings per agent via `getTopicMappings()`. The `message_thread_id` parameter on `sendMessage` is an integer. Parse with `parseInt(topicId, 10)`. Works for Telegram supergroup forum topics. General topic (ID 1) behaves differently — if the agent's topic is the General topic, omit `message_thread_id` (or test against the configured group first).

**Confidence: HIGH** — Telegram Bot API official docs verified; `message_thread_id` is a documented parameter on `sendMessage`.

### Approve Mechanism

The permission prompt is a numbered menu in Claude Code's terminal output (typically: "1. Allow this once", "2. Allow in this project", "3. Deny"). Sending `1\n` via tmux selects option 1. This must be delivered via `tmux send-keys` (not Gateway API). The Gateway API sends chat messages to the Claude Code session, not interactive menu selections to the process stdin.

Existing path: `TmuxSessionManager` wraps `execFile('tmux', ...)` — add a `sendKeys(sessionName: string, keys: string): Promise<void>` method calling `tmux send-keys -t sessionName keys`.

**Confidence: HIGH** — inspected TmuxSessionManager.ts and instanceRoutes.ts; tmux send-keys is used in existing `sendCtrlC` implementation already present in the codebase.

### Cooldown / Deduplication

In-memory `Map<string, number>` is appropriate because:
- Cooldown resets on restart are acceptable (described in Anti-Features reasoning above)
- No DB write overhead on each notification (notifications can be frequent)
- Simple implementation: `if (Date.now() - lastSent.get(key) < cooldownMs) return`

Default values calibrated to this use case:
- Permission prompt: 2 min (agent may re-output the prompt multiple times per second while waiting; 2 min gives operator time to respond without repeat floods)
- Budget alert: 10 min (cost crosses threshold once and stays there; 10 min avoids flooding but provides reminders)

### Telegram Rate Limits

Telegram allows 1 message/second per chat. In a single-operator tool with 5 agents, the maximum notification rate is far below this limit. No rate limiting middleware needed for this use case. If ever needed, grammY's `@grammyjs/auto-retry` plugin handles 429 errors with exponential backoff automatically.

**Confidence: HIGH** — grammY flood control docs verified; rate limits are 1 msg/sec per chat, well within single-operator use.

---

## Sources

- grammY official docs — Long Polling vs Webhooks: https://grammy.dev/guide/deployment-types
- grammY official docs — Inline Keyboards plugin: https://grammy.dev/plugins/keyboard
- grammY official docs — Flood control / rate limits: https://grammy.dev/advanced/flood
- grammY GitHub — 28k stars, active 2025 maintenance: https://github.com/grammyjs/grammY
- Telegram Bot API — sendMessage with message_thread_id: https://core.telegram.org/bots/api
- Telegram Bot API — Inline keyboards and callback queries: https://core.telegram.org/bots/2-0-intro
- Telegram Bot API — Buttons reference: https://core.telegram.org/api/bots/buttons
- grammY comparison page — grammY vs Telegraf vs NTBA: https://grammy.dev/resources/comparison
- Warden codebase — OpenClawConfigReader.ts, TerminalStreamService.ts, TmuxSessionManager.ts, GatewayApiClient.ts, DatabaseConnection.ts, types.ts, openclawTypes.ts (direct inspection)

---

*Feature research for: Warden Dashboard v3.3 Telegram Operator Awareness*
*Researched: 2026-03-04*
