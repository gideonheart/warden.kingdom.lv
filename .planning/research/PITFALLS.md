# Pitfalls Research

**Domain:** Adding Telegram bot notification and one-tap approve to an existing Node.js/Express monitoring dashboard (Warden v3.3)
**Researched:** 2026-03-04
**Confidence:** HIGH — Telegram API official docs, grammY official docs, verified against existing Warden codebase and known tech debt

---

## Critical Pitfalls

### Pitfall 1: Bot Token Leaking into Source Code or Git History

**What goes wrong:**
The Telegram bot token is hardcoded in `src/server/` or committed to `.env` without `.gitignore` protection. Anyone with repo access (or any future leak of the repo) gains full control of the bot. Token leaks also happen via `console.log(process.env)` calls during debugging, or via error messages that serialize the config object.

**Why it happens:**
Developers prototype quickly by pasting the token from BotFather directly into code. The token looks like a config value, and config values often get hardcoded before the DX for environment variables is set up. Warden's `OpenClawConfigReader` already reads `~/.openclaw/openclaw.json` as the pattern for secrets — developers may put the bot token there for convenience, but that file gets serialized and logged.

**How to avoid:**
- Store the token in an environment variable: `WARDEN_TELEGRAM_BOT_TOKEN`
- Load it at startup, fail hard with a readable error if missing: `if (!token) throw new Error('WARDEN_TELEGRAM_BOT_TOKEN is not set')`
- Never pass the config object (which includes the token) into any logging call
- Add `.env` to `.gitignore` from the start if not already present (Warden does not currently use `.env`)
- Consider reading from `openclaw.json`'s `warden_bot_token` field (already behind file permissions) rather than env — but still do NOT log the value
- Add GitGuardian or `git-secrets` pre-commit hook if the repo is ever made less private

**Warning signs:**
- `console.log(config)` statements in server startup code
- Bot token visible in server logs on startup
- `.env` file tracked by git (check `git ls-files | grep .env`)
- Token hardcoded in any `.ts` file (grep: `[0-9]{9}:[A-Za-z0-9_-]{35}`)

**Phase to address:**
Phase 1 (Bot Foundation & Lifecycle) — the token loading pattern must be established before any other code is written.

---

### Pitfall 2: Two Polling Instances Conflict (409 Error Crashes Bot)

**What goes wrong:**
Long polling with `bot.start()` sends `getUpdates` to Telegram. If two Node.js processes try to poll the same token simultaneously, Telegram returns `409 Conflict: terminated by other getUpdates request`. The second process's polling loop crashes. In development, this happens when the developer runs `npm run dev` (which starts the server) while a previous instance is still shutting down. In production, this happens when Forge/PM2 starts a new deployment before fully stopping the old one.

**Why it happens:**
`node-pty` processes and Socket.IO connections are cleaned up when the process exits, but a polling loop does not automatically clean up — it needs explicit `bot.stop()` called before the process exits. If the Express server crashes or is hard-killed (`kill -9`), the old polling session persists on Telegram's side for approximately 30-60 seconds. The new process starts immediately and hits the conflict.

**How to avoid:**
- Register `SIGTERM` and `SIGINT` handlers that call `await bot.stop()` before `process.exit()`. Warden's Express server already has no shutdown handler — add one for both Express and the bot in the same handler:
  ```typescript
  async function shutdown(signal: string) {
    console.log(`[Shutdown] ${signal} received`);
    await bot.stop();
    server.close(() => process.exit(0));
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  ```
- On startup, call `await bot.api.deleteWebhook()` before calling `bot.start()` — this clears any leftover webhook that would conflict with polling
- For development with `tsx watch` (hot-reload), be aware that tsx does NOT guarantee orderly process teardown; test graceful shutdown explicitly

**Warning signs:**
- Server logs show `409 Conflict: terminated by other getUpdates request` at startup
- Bot stops responding to Telegram messages after server restart
- Two Node.js processes visible with `ps aux | grep node` after restart

**Phase to address:**
Phase 1 (Bot Foundation & Lifecycle) — shutdown handling must be implemented alongside bot initialization, not retrofitted later.

---

### Pitfall 3: Duplicate Permission Prompt Notifications Spam the Operator

**What goes wrong:**
`detectAgentState()` polls via `GET /api/gsd/agents/live-status` on an interval (currently client-side every few seconds). Each time an agent is in `permission_prompt` state, the poll returns that state. The Telegram notification service sends a new message every poll cycle. The operator receives 20-40 identical "Agent X needs permission" messages in their Telegram topic within minutes. They mute the bot. The feature becomes useless.

**Why it happens:**
State detection is level-based (snapshot of current state), not edge-based (state transition). The browser notification system already handles this correctly with `permissionStateSessionsRef` tracking the previous state set — but the Telegram notification service starts from scratch and doesn't have that infrastructure.

**How to avoid:**
Implement a per-agent cooldown Map on the server:
```typescript
// Key: `${agentId}:${notificationType}`, Value: last-sent timestamp
const notificationCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes default

function shouldSendNotification(agentId: string, type: 'permission' | 'budget_warning' | 'budget_exceeded'): boolean {
  const key = `${agentId}:${type}`;
  const lastSent = notificationCooldown.get(key) ?? 0;
  if (Date.now() - lastSent < COOLDOWN_MS) return false;
  notificationCooldown.set(key, Date.now());
  return true;
}
```
Additionally, track state transitions server-side (previous state per agent) — only send on the ENTERING of `permission_prompt`, not while it's sustained. Clear the "in permission" flag when the state leaves `permission_prompt`.

Cooldown values must be configurable per the milestone requirements — store in SQLite `notification_config` table and expose in the settings UI.

**Warning signs:**
- Telegram topic receives multiple identical messages within a minute
- Operator mutes or blocks the bot
- Server logs show repeated `sendMessage` calls to the same topic with identical content

**Phase to address:**
Phase 2 (Permission Prompt Forwarding) — deduplication must be part of the initial implementation, not a followup. Notification without deduplication is worse than no notification.

---

### Pitfall 4: Callback Query Expires — One-Tap Approve Button Becomes Dead

**What goes wrong:**
Telegram shows the "Approve" inline keyboard button on the permission prompt message. The agent is stalled for 10 minutes while the operator is away from Telegram. The operator returns, taps the "Approve" button, and... nothing happens. The callback query was answered (grammY internally calls `answerCallbackQuery` to dismiss the loading spinner), but the approval action itself was silently dropped because the server-side state it referenced (the pending permission prompt) is gone or the agent already timed out.

A secondary variant: Telegram's Bot API requires `answerCallbackQuery` to be called within a strict window (approximately 30 seconds to prevent the "pending" spinner from spinning indefinitely on the user's device). If the server's handler does slow work before answering, the user sees a permanent loading indicator on the button.

**Why it happens:**
The callback handler does real work (tmux input injection) before calling `answerCallbackQuery`. If the tmux command takes more than ~10-30 seconds, the query is already "stale" from Telegram's perspective. Operators also tap approve long after the prompt has been superseded by a new agent action.

**How to avoid:**
- Answer the callback query IMMEDIATELY (first line of handler, before any async operations):
  ```typescript
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery(); // answer first, always
    const data = ctx.callbackQuery.data;
    // ... then do the real work
  });
  ```
- Include the agent session name and a short timestamp token in the `callback_data` to validate freshness:
  ```
  callback_data: `approve:${agentId}:${Math.floor(Date.now() / 60000)}`  // minute-precision token
  ```
  On receipt, reject approve requests with tokens older than 15 minutes with a friendly error message: "This approval has expired. The agent state may have changed."
- After sending the approval action, edit the original message to remove the inline keyboard (call `ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })`) so the button no longer appears clickable

**Warning signs:**
- Telegram shows spinning loading indicator on button indefinitely
- `ctx.answerCallbackQuery` logs show it's called after async tmux operations
- Operator can tap approve on messages sent hours ago

**Phase to address:**
Phase 3 (One-Tap Approve) — callback lifecycle must be specced before implementation begins. Answer-first is a non-negotiable pattern.

---

### Pitfall 5: One-Tap Approve Has No Sender Verification — Any Telegram User Can Approve

**What goes wrong:**
The Telegram message with the inline keyboard is sent to a group topic. Any member of that group who sees the message can tap "Approve" and inject text into a live agent tmux session running as the `forge` user. In Warden's threat model (IP-whitelisted, single operator), this is not currently a risk — but if the Telegram group ever includes other members (shared team, family with access to the phone), unauthorized approvals can run arbitrary commands.

More specifically: `callback_data` contains the action (`approve`) and the session name. Anyone who receives or forwards the message can trigger the approve action.

**Why it happens:**
Inline keyboard callback queries carry the `from.id` of the user who pressed the button, but bots don't automatically validate this. The handler fires for any user who presses the button.

**How to avoid:**
- In every `callback_query` handler, verify that `ctx.from.id` matches the configured operator Telegram user ID:
  ```typescript
  const OPERATOR_TELEGRAM_USER_ID = Number(process.env.WARDEN_TELEGRAM_OPERATOR_ID);

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.from.id !== OPERATOR_TELEGRAM_USER_ID) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
      return;
    }
    // proceed with approval
  });
  ```
- Store the operator's Telegram user ID in config (openclaw.json or env). The operator can find their user ID via `@userinfobot` in Telegram.
- Log all unauthorized callback attempts with `from.id`, `from.username`, and the action attempted

**Warning signs:**
- No `ctx.from.id` check in the callback handler
- Approve action works when triggered from a different Telegram account
- No audit log of who triggered approvals

**Phase to address:**
Phase 3 (One-Tap Approve) — security check must be in the initial implementation spec. Not acceptable to add as a followup.

---

### Pitfall 6: detectAgentState() Regex Heuristics Trigger False-Positive Permission Notifications

**What goes wrong:**
The current `detectAgentState()` function in `gsdRoutes.ts` (line 31) matches:
```typescript
if (/Do you want to proceed\?|❯\s*1\.\s*Yes/i.test(pane)) return 'permission_prompt';
```
Any terminal output containing "Do you want to proceed?" — including agent-generated documentation, npm package prompts, git commit hooks, or Python installer scripts — incorrectly triggers `permission_prompt`. The Telegram notification fires, the operator approves, and the approve action (which sends `1\n` to tmux via `send-keys`) dismisses a prompt that was not actually a Claude Code permission prompt, potentially confirming an unintended package installation or git action.

The `PROJECT.md` already notes: *"detectAgentState() regex heuristics fragile but functional; deferred"*

**Why it happens:**
The regex was written for the Claude Code UI pattern and works well enough for dashboard display. For Telegram notification triggering, the false positive cost is much higher — a spurious browser notification badge is annoying; a spurious Telegram message that causes the operator to send "1\n" to a running process can have side effects.

**How to avoid:**
- Add additional context anchors to the permission regex. Claude Code permission prompts appear in a specific UI context — the `❯ 1. Yes` pattern is more reliable than "Do you want to proceed?". Narrow the match:
  ```typescript
  // More specific: require the numbered yes/no pattern from Claude Code's UI
  if (/❯\s*1\.\s*Yes.*allow|❯\s*1\.\s*Yes.*proceed/i.test(pane)) return 'permission_prompt';
  ```
- Add a configurable "notification confidence threshold" — only send Telegram notification if the pattern matches on two consecutive polls (state must be sustained for 2 poll cycles)
- For the Telegram notification specifically, include the raw tmux pane excerpt in the message so the operator can see the actual prompt text before approving
- Never send `1\n` as the hardcoded approve action — let the operator see what they're approving

**Warning signs:**
- Telegram permission notifications fire during `npm install` or `git commit` operations
- Permission badge appears in dashboard for sessions that are not waiting for user input
- Approve sends `1\n` to a session that resumes with an unexpected package installed

**Phase to address:**
Phase 2 (Permission Prompt Forwarding) — the notification spec must describe what snippet of pane content is included in the message body, and how to distinguish Claude Code prompts from other terminal prompts.

---

### Pitfall 7: Rate Limit Causes Notification Burst to Fail Silently

**What goes wrong:**
If multiple agents hit permission prompts simultaneously (during a coordinated GSD run with 4-5 agents), the bot tries to send 4-5 messages in rapid succession to potentially different topics. Telegram's rate limit (1 message/second per chat, 30 messages/second global) triggers a `429 Too Many Requests` error with a `retry_after` header. The notification service either:
- Throws and silently drops the notification (no log, no retry), OR
- Retries immediately, making the rate limit worse

**Why it happens:**
Telegram's rate limits are "unspecified" but real. Single-chat: avoid more than 1 msg/sec. Global: ~30 msg/sec. For Warden's use case (5 agents, different topics), the per-chat limit is the constraint. The same topic receiving budget alert + permission notification within 1 second triggers it.

**How to avoid:**
- Use grammY's `auto-retry` plugin (`@grammyjs/auto-retry`) which automatically catches 429 errors, waits `retry_after` seconds, and retries:
  ```typescript
  import { autoRetry } from '@grammyjs/auto-retry';
  bot.api.config.use(autoRetry());
  ```
- Wrap all `bot.api.sendMessage()` calls in a try/catch that logs the failure with full context (agent ID, topic ID, notification type) even after retries are exhausted
- For the budget alert case where a notification must not be lost, persist a "pending notification" to SQLite and retry on the next poll cycle

**Warning signs:**
- Server logs show `429` errors from Telegram API calls
- Operator does not receive expected notifications during high-activity GSD runs
- No retry logic visible in notification service code

**Phase to address:**
Phase 1 (Bot Foundation & Lifecycle) — install `auto-retry` plugin at bot initialization time, before any notification code is written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding Telegram topic IDs in code | Fast to prototype | Topic IDs change if group is recreated; no configurability | Never — read from `openclaw.json` topic mappings which are already loaded |
| In-memory cooldown Map for deduplication | Zero infrastructure | Lost on server restart; all cooldowns reset, notification storm on restart | Acceptable for MVP if restart is rare; persist cooldown timestamps to SQLite for production |
| Single polling loop, no error recovery | Simple to implement | Uncaught error in polling crashes the bot silently; no reconnect | Never — wrap `bot.start()` in a try/catch with restart logic or use grammY's built-in error handler |
| `answerCallbackQuery` after async operations | Simpler sequential code | Telegram spinner hangs indefinitely for slow operations | Never — always call `answerCallbackQuery` as the first operation in any callback handler |
| Sending full pane content to Telegram | Easy to implement | Pane content has ANSI escape codes; Telegram renders them as garbage characters | Never — strip ANSI before sending: use `strip-ansi` package |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Telegram Bot API + long polling | Starting polling without deleting webhook first | Call `bot.api.deleteWebhook()` before `bot.start()` to avoid 409 conflicts |
| grammY `bot.start()` in Express server | Running `bot.start()` as blocking call on main thread | `bot.start()` returns a Promise; call it without `await` and let it run in background, OR use `bot.startPolling()` non-blocking variant |
| Telegram `message_thread_id` for topics | Sending to group chat_id without `message_thread_id` | Warden's `openclaw.json` already has topic mappings — use `message_thread_id` from `topic_id` field for forum-enabled supergroups |
| ANSI escape codes in terminal output | Forwarding raw tmux pane content to Telegram | Strip ANSI with `strip-ansi` before including any terminal excerpt in a Telegram message |
| `callback_data` size limit | Embedding long session names or full context | `callback_data` max is 64 bytes; store full context in SQLite keyed by a short token; put only the token in `callback_data` |
| Telegram message editing | Calling `editMessageText` with identical content | Telegram returns "Bad Request: message is not modified" (400 error) — check if content differs before editing, or handle the 400 gracefully |
| grammY error handler | Not setting `bot.catch()` handler | Unhandled errors in middleware crash silently; always set `bot.catch((err) => console.error(err))` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling for agent state on server-side | Server does tmux captures for every notification check, independent of client polling | Reuse the existing `/api/gsd/agents/live-status` response; the server already polls tmux every ~5s for the dashboard — share the result, don't add a second polling loop | Immediately with 5+ agents — doubles tmux subprocess overhead |
| `sendMessage` without retry in high-activity burst | Notifications dropped during coordinated multi-agent runs | Use `@grammyjs/auto-retry` transformer; rate limit is 1 msg/sec per chat | At 2+ agents simultaneously hitting permission prompts in the same topic |
| In-memory cooldown Map growing unbounded | Memory leak if agents churn frequently over days | Cap the Map at 100 entries with LRU eviction, or use SQLite-backed cooldown timestamps | After weeks of continuous operation with many agent restarts |
| Synchronous ANSI strip on large pane content | Slight delay for very long pane captures | `strip-ansi` is synchronous regex; for 5KB pane snapshots this is <1ms; not a concern at this scale | Not a real concern for single-server single-operator scale |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No sender verification on callback queries | Any Telegram group member can approve agent permissions, potentially running arbitrary tmux commands as `forge` | Check `ctx.from.id === OPERATOR_TELEGRAM_USER_ID` before processing any callback query |
| Bot token in source code or logs | Full bot control for anyone with repo or log access | Load from env/config, never log, add pre-commit hook |
| Unsanitized agent/session names in `callback_data` | Session names could contain characters that break callback_data parsing | Use an opaque short token (timestamp + agentId hash) as callback_data; store full context in SQLite |
| `sendMessage` with unescaped user-controlled content in Markdown mode | If `parse_mode: 'Markdown'` is used, special characters in agent names or project paths cause "Bad Request: can't parse entities" errors | Use `parse_mode: 'HTML'` and HTML-escape interpolated values, or avoid parse_mode entirely for messages with dynamic content |
| Approve action hardcoded to `1\n` | Sending wrong tmux input if the prompt is not what was expected | Include the approval text in the notification message body; require the operator to see the prompt before approving |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Notification message has no context (just "Agent X needs permission") | Operator cannot decide to approve without opening the browser | Include a 3-5 line excerpt of the pane content showing the actual permission prompt text |
| Approve button remains clickable after approval was processed | Operator taps it again; double-send of `1\n` to tmux; potentially confirms a second prompt | Edit the message after approval to remove the inline keyboard: `ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })` |
| Budget alert message is identical for warning and exceeded thresholds | Operator ignores "exceeded" message thinking it's the same as "warning" | Use distinct emoji, wording, and urgency in the message for each threshold: amber for warning, red for exceeded |
| Bot sends notification to wrong topic | Operator sees notifications for a different agent's session | Show agent name and session slug clearly in every message header; make topic mapping visible in the settings UI |
| Notification settings UI shows toggles but no cooldown config | Operator cannot reduce notification frequency | Include a numeric cooldown input (minutes) per notification type next to each toggle |

---

## "Looks Done But Isn't" Checklist

- [ ] **Token security:** Grep for `[0-9]{9}:[A-Za-z0-9_-]{35}` in all `.ts` files — no matches. Confirm token loaded from env/config only.
- [ ] **Graceful shutdown:** Stop server with `SIGTERM`, confirm `bot.stop()` is called before process exits; restart server, confirm no 409 Conflict error.
- [ ] **Duplicate suppression:** Trigger permission prompt on an agent. Wait 30 seconds. Confirm only ONE Telegram message was sent. Wait for cooldown to expire. Trigger again — confirm one more message.
- [ ] **Callback answer timing:** Tap Approve. Confirm the Telegram loading spinner dismisses within 1-2 seconds (before any tmux operation completes).
- [ ] **Callback expiry:** Send a permission notification. Wait 20 minutes. Tap Approve. Confirm a helpful "expired" error is shown, not a silent no-op.
- [ ] **Sender verification:** Log into a second Telegram account that is in the group. Tap Approve from that account. Confirm the action is rejected with "Unauthorized".
- [ ] **ANSI stripping:** Check Telegram message body for any ANSI escape sequences (`\x1b[`, `\033[`). There must be none.
- [ ] **callback_data size:** Verify `callback_data` string for each button is ≤64 bytes. Log the length during development.
- [ ] **Topic routing:** Send permission notification for each configured agent. Verify each message arrives in the correct Telegram topic.
- [ ] **Bot restart resilience:** Restart server while an agent is in `permission_prompt` state. Verify bot reconnects and detects the state on next poll cycle.
- [ ] **409 conflict prevention:** Start server normally. Kill it with `kill -9` (simulating hard crash). Immediately restart. Confirm bot starts without 409 error (may need 30-60 second wait).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bot token leaked to source code | HIGH | Revoke token immediately via BotFather (`/revoke`); generate new token; update config; rotate any other secrets that may have been similarly exposed |
| 409 Conflict loop on restart | LOW | Call `curl "https://api.telegram.org/bot{TOKEN}/deleteWebhook"` then restart server; or wait 60 seconds for Telegram's session to expire |
| Duplicate notification storm | LOW | Deploy cooldown fix; the in-progress storm self-limits once cooldown Map is populated; consider temporarily stopping the bot (`bot.stop()`) via admin route to drain |
| Stale approve button pressed | LOW | Server rejects via timestamp token check; log the attempt; send a new notification with fresh context if agent is still waiting |
| Unauthorized approval triggered | MEDIUM | Review tmux session history to see what input was injected; if agent ran an unintended command, stop/restart the agent; add sender check to code |
| False-positive permission notification | LOW | Operator dismisses; refine regex; add confidence threshold; no side effect unless operator also tapped Approve on the false positive |
| `callback_data` too large (>64 bytes) | MEDIUM | Telegram silently truncates or rejects the button; redesign to use opaque token with SQLite lookup |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Bot token leaking | Phase 1 (Bot Foundation) | Grep for raw token pattern in codebase; confirm env-loaded only |
| 409 Conflict on restart | Phase 1 (Bot Foundation) | SIGTERM test + immediate restart test |
| Duplicate notification spam | Phase 2 (Permission Forwarding) | 30s sustained permission state → confirm 1 message sent |
| Callback query expiry | Phase 3 (One-Tap Approve) | 20-minute delay before tap → friendly expired error shown |
| Unauthorized approve | Phase 3 (One-Tap Approve) | Second Telegram account cannot trigger approve |
| detectAgentState false positives | Phase 2 (Permission Forwarding) | npm install run → no spurious permission notification |
| Rate limit silent drop | Phase 1 (Bot Foundation) | auto-retry plugin installed; 429 errors retried automatically |
| ANSI codes in Telegram message | Phase 2 (Permission Forwarding) | Inspect raw message text in Telegram for escape sequences |
| callback_data > 64 bytes | Phase 3 (One-Tap Approve) | Log callback_data lengths during development; assertion added |

---

## Sources

- grammY official docs — Flood Limits: https://grammy.dev/advanced/flood (HIGH confidence)
- grammY official docs — Long Polling vs Webhooks: https://grammy.dev/guide/deployment-types (HIGH confidence)
- grammY official docs — Auto-Retry plugin: https://grammy.dev/plugins/auto-retry (HIGH confidence)
- grammY official docs — Transformer-Throttler plugin: https://grammy.dev/plugins/transformer-throttler (HIGH confidence)
- Telegram Bot API official docs — answerCallbackQuery: https://core.telegram.org/bots/api#answercallbackquery (HIGH confidence)
- Telegram Bot API official docs — Error reference: https://core.telegram.org/api/errors (HIGH confidence)
- Telegram Bots FAQ — rate limits: https://core.telegram.org/bots/faq (HIGH confidence)
- python-telegram-bot wiki — Avoiding flood limits: https://github.com/python-telegram-bot/python-telegram-bot/wiki/Avoiding-flood-limits (MEDIUM confidence, different library but same API)
- node-telegram-bot-api issue #488 — 409 Conflict: https://github.com/yagop/node-telegram-bot-api/issues/488 (MEDIUM confidence, same API behavior)
- GitGuardian — Telegram Bot Token detector: https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/detectors/specifics/telegrambot_bot_token (HIGH confidence)
- Warden codebase: `src/server/routes/gsdRoutes.ts` — `detectAgentState()` regex at line 29-40 (HIGH confidence, direct code inspection)
- Warden codebase: `src/client/hooks/useBrowserNotifications.ts` — state-transition detection pattern (HIGH confidence, reuse as server-side template)
- Warden PROJECT.md — tech debt notes on `detectAgentState()` fragility (HIGH confidence, project documentation)
- codex.so — Fix sending messages from Bot in Telegram Group Topics: https://codex.so/telegram-bots-in-group-topics (MEDIUM confidence, verified against Bot API docs)

---
*Pitfalls research for: v3.3 Telegram Operator Awareness (bot notifications, permission forwarding, one-tap approve)*
*Researched: 2026-03-04*
*Confidence: HIGH — Telegram API official docs + grammY official docs + direct codebase inspection*
