# Stack Research

**Domain:** Warden Dashboard v3.3 — Telegram Operator Awareness (bot client integration)
**Researched:** 2026-03-04
**Confidence:** HIGH

---

## Context: Milestone v3.3 — Additive Only

This file covers ONLY the new technical capabilities needed for v3.3 Telegram integration. The following are the validated production stack — do not re-research:

| Already Present | Version | Notes |
|-----------------|---------|-------|
| Express 5 | ^5.0.0 | `src/server/index.ts` — SIGTERM/SIGINT handlers in place |
| Socket.IO 4 | ^4.8.0 | Terminal namespace, `/terminal` |
| React 19 | ^19.0.0 | Hook-based, memo-stabilized |
| better-sqlite3 | ^11.0.0 | WAL-mode, inline migrations in `DatabaseConnection.ts` |
| node-pty | ^1.0.0 | PTY bridge for tmux sessions |
| Tailwind CSS 4 | ^4.0.0 | `warden-*` color tokens |
| TypeScript 5 | ^5.7.0 | Strict ESM |
| OpenClawConfigReader | (service) | Reads `~/.openclaw/openclaw.json`, has `channels.telegram` section with `groupId`/`topicId` mappings already parsed |
| TopicMapping type | `src/shared/openclawTypes.ts` | `{ agentId, agentName, groupId, topicId, systemPrompt }` |
| detectAgentState | (TerminalStreamService) | Permission prompt detection regex — emits state changes |
| BudgetAlertService | (service) | Per-agent budget alert at 80%/100% thresholds |
| notification_cooldown | (NOT YET in DB) | Needs new migration — see below |

---

## Recommended Stack

### Core Addition: One Package

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| grammy | ^1.41.1 | Telegram Bot API client — send notifications, receive inline button callbacks | Actively maintained (published 2 days before research date). First-class TypeScript — ships its own declarations, no `@types/grammy` needed. Clean, minimal API surface that matches the use case exactly: `bot.api.sendMessage()` for outbound, `bot.callbackQuery()` for inbound. `bot.start()` / `bot.stop()` integrates directly with the existing SIGTERM/SIGINT shutdown pattern in `src/server/index.ts`. Long polling runs without any webhook/domain/SSL configuration changes. |

**That is the entire stack addition. One package. No other new dependencies.**

---

## Why grammy Over Alternatives

### grammy vs node-telegram-bot-api (NTBA)

NTBA is "largely unmaintained and thus horribly out of date" (confirmed by grammy's official comparison docs, corroborated by multiple community sources). It has no first-class TypeScript support — only community `@types` declarations. Its architecture "fails horribly at scaling" for even moderately complex bots. There is no reason to choose it over grammy for new code.

### grammy vs telegraf

telegraf was the previous Node.js community standard. It is now "widely outdated" (per grammy comparison docs) with most community plugins having migrated to grammy. Its TypeScript types in v4 became "so complex they were too hard to understand" — the inverse of why you'd want TypeScript. No good reason to use it for new code.

### grammy vs raw Telegram Bot API HTTP

Viable — grammy is a thin wrapper over the Bot API HTTP endpoints. However, implementing long polling, offset tracking, callback query handling, and error retries manually would add ~200 LOC of plumbing code. grammy provides exactly this, typed, tested, and maintained.

### Long Polling vs Webhooks

Official grammy docs state: "if you don't have a good reason to use webhooks, there are no major drawbacks to long polling." This server runs 24/7, so polling overhead is irrelevant. Webhooks would require an Nginx route change to expose a bot path, a `setWebhook` call on startup, webhook secret management, and SSL cert on the endpoint — all infrastructure changes for zero benefit. Long polling works immediately with no config changes.

---

## Installation

```bash
# Single new dependency
npm install grammy
```

No `@types/grammy` — types are bundled with the package.

---

## Integration Architecture

### Service pattern (matches existing codebase)

The bot runs as `TelegramNotificationService` — a singleton service initialized in `src/server/index.ts` alongside `instanceTracker`, `sessionUsageReader`, and `recordingRotationService`:

```typescript
// src/server/index.ts additions:
import { telegramNotificationService } from './services/TelegramNotificationService.js';

// After other services start:
await telegramNotificationService.start();

// In handleShutdown():
await telegramNotificationService.stop();
```

If Telegram is disabled in `openclaw.json` or `botToken` is missing, `start()` logs a warning and returns without calling `bot.start()`. Zero impact on other features.

### Bot token source

The bot token lives in `openclaw.json` under `channels.telegram`. Add a `botToken` field alongside the existing `enabled` and `groups` fields:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "1234567890:AAXXXXXX",
      "groups": {
        "-1001234567890": {
          "topics": { "42": { "systemPrompt": "..." } }
        }
      }
    }
  }
}
```

`OpenClawConfigReader` already strips JSON5 comments and caches for 30 seconds. Add `botToken?: string` to the `OpenClawConfig` type in `src/shared/openclawTypes.ts`.

**Security note:** `openclaw.json` lives in `~/.openclaw/` on a server with IP-whitelist-only access. This is acceptable for a single-operator tool. No `.env` file needed.

### Sending notifications to Telegram forum topics

The existing `TopicMapping` type already provides `groupId` (numeric chat ID) and `topicId` (message thread ID). Use grammy's raw API method:

```typescript
import { Bot, InlineKeyboard } from 'grammy';

await bot.api.sendMessage(
  groupId,                          // e.g. "-1001234567890"
  messageText,
  {
    message_thread_id: Number(topicId),   // forum topic thread
    reply_markup: inlineKeyboard,
    parse_mode: 'HTML',
  }
);
```

### Inline keyboard for one-tap approve

```typescript
import { InlineKeyboard } from 'grammy';

// Build the keyboard
const keyboard = new InlineKeyboard()
  .text('Approve', `approve:${sessionName}`);

// Handle button press — MUST call answerCallbackQuery()
bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const sessionName = ctx.match![1];
  await sendApprovalToTmux(sessionName);           // "1\n" via tmux send-keys
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });  // remove button after use
  await ctx.answerCallbackQuery({ text: 'Approved' });
});
```

`answerCallbackQuery()` MUST be called on every `callback_query` update — Telegram displays a spinning indicator to the user until it receives this acknowledgement.

### allowedUpdates filter

Pass `allowed_updates: ['callback_query']` to `bot.start()` so Telegram only delivers button presses. The bot has no handlers for regular messages, so filtering at the API level prevents unnecessary network traffic:

```typescript
bot.start({
  allowed_updates: ['callback_query'],
});
```

### Graceful shutdown

grammy's `bot.stop()` halts long polling and confirms the last received update offset with Telegram servers. Plug into existing SIGTERM/SIGINT handler:

```typescript
// In handleShutdown() — same pattern as instanceTracker.stopPeriodicSync()
await telegramNotificationService.stop();  // internally: await bot.stop()
```

### Error isolation

grammy errors must NOT crash the Express process. Use grammy's error handler:

```typescript
bot.catch((error) => {
  console.error('[Telegram] Bot error:', error);
  // Log and continue — never rethrow
});
```

Wrap `bot.api.sendMessage()` calls in try/catch within `TelegramNotificationService`. A failed Telegram send is a non-critical degradation.

---

## New SQLite Table: notification_cooldown

Cooldown state stored in SQLite (not in-memory) so it survives process restarts. Add as an inline migration in `DatabaseConnection.runMigrations()`:

```sql
CREATE TABLE IF NOT EXISTS notification_cooldown (
  key TEXT PRIMARY KEY,           -- "{type}:{sessionName}", e.g. "permission:warden-foo-abc"
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_cooldown_expires
  ON notification_cooldown(expires_at);
```

**Check before sending:**

```typescript
const row = db.prepare(
  'SELECT 1 FROM notification_cooldown WHERE key = ? AND expires_at > CURRENT_TIMESTAMP'
).get(key);
if (row) return;  // skip — still in cooldown
```

**Record after sending:**

```typescript
db.prepare(`
  INSERT OR REPLACE INTO notification_cooldown (key, sent_at, expires_at)
  VALUES (?, CURRENT_TIMESTAMP, datetime('now', '+' || ? || ' seconds'))
`).run(key, cooldownSeconds);
```

**Expired row cleanup** (optional, run periodically or on startup):

```typescript
db.prepare("DELETE FROM notification_cooldown WHERE expires_at <= CURRENT_TIMESTAMP").run();
```

Default cooldown: 300 seconds (5 minutes) per session per notification type. Make this configurable via a new `notification_config` table (single-row, same `CHECK(id=1)` pattern as `rotation_config`).

---

## New SQLite Table: notification_config

Single-row config for notification settings, stored in DB (not openclaw.json — operator preference, not agent identity):

```sql
CREATE TABLE IF NOT EXISTS notification_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  permission_alerts_enabled INTEGER NOT NULL DEFAULT 1,
  budget_alerts_enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Upsert via `INSERT OR REPLACE`. Read on each service initialization, cache in-process. Same pattern as `rotation_config`.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Separate bot process (pm2, standalone service) | Separate process adds deployment complexity, IPC surface, restart ordering. Existing SIGTERM handling is complete. | Run `bot.start()` inside the Express process as a `TelegramNotificationService` |
| Webhooks (`webhookCallback` from grammy) | Requires Nginx route change + `setWebhook` API call + SSL endpoint + secret management. Zero benefit for an always-on server. | Long polling — zero infrastructure change |
| `@grammyjs/runner` | Concurrent update processing for high-throughput bots. This bot receives one operator button tap per approval. | Default `bot.start()` is sufficient |
| Redis or external store for cooldown | Third-party dependency; single-operator system with maybe 10 concurrent notifications max | SQLite `notification_cooldown` table — consistent with existing data layer |
| In-memory `Map` for cooldown | Does not survive process restarts — a restart would allow duplicate notifications within the cooldown window | SQLite `notification_cooldown` table |
| `dotenv` | Token already read from `openclaw.json` by existing `OpenClawConfigReader` | Add `botToken` field to `openclaw.json` config |
| telegraf | "Widely outdated," complex TypeScript types, ecosystem has moved to grammy | grammy |
| node-telegram-bot-api | "Largely unmaintained," no TypeScript, poor architecture | grammy |

---

## Stack Patterns by Variant

**If `channels.telegram.enabled` is false or `botToken` is missing:**
- `TelegramNotificationService.start()` logs `[Telegram] disabled — skipping bot start`
- Returns without calling `bot.start()`
- All other Warden features continue unaffected
- Same graceful degradation pattern as `OpenClawConfigReader` already applies to missing `openclaw.json`

**If a Telegram send fails (network error, bot not in group, topic deleted, etc.):**
- Log the error via `bot.catch()` handler
- Do NOT insert cooldown row on failure — allow retry on next trigger
- Do NOT rethrow — failure must not propagate to the calling service
- Subsequent notifications for other agents/topics are unaffected

**If `topicId` is not found in `openclaw.json` for an agent:**
- Fall back to sending to the group's primary topic (if configured) or skip
- Log `[Telegram] No topic configured for agent ${agentId} — skipping`

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| grammy ^1.41.1 | Node.js 22+ | grammy targets Node.js 18+; no conflict with existing Node.js 22 requirement |
| grammy ^1.41.1 | TypeScript ^5.7.0 | grammy ships its own declarations; no `@types/grammy` needed |
| grammy ^1.41.1 | better-sqlite3 ^11.0.0 | No interaction; fully independent layers |
| grammy ^1.41.1 | Express 5 + Socket.IO 4 | No conflict; grammy long polling runs on its own internal timer, not the HTTP server |
| grammy ^1.41.1 | ESM (`"type": "module"`) | grammy ships ESM-compatible exports; import with `import { Bot } from 'grammy'` |

---

## Sources

- [grammy.dev/resources/comparison](https://grammy.dev/resources/comparison) — NTBA "largely unmaintained and horribly out of date," telegraf "widely outdated." HIGH confidence (official grammy docs).
- [grammy.dev/guide/deployment-types](https://grammy.dev/guide/deployment-types) — Long polling recommended for always-running servers; "no major drawbacks." HIGH confidence (official grammy docs).
- [grammy.dev/plugins/keyboard](https://grammy.dev/plugins/keyboard) — `InlineKeyboard` API, `bot.callbackQuery()` handler, `answerCallbackQuery()` requirement. HIGH confidence (official grammy docs).
- [grammy.dev/ref/core/bot](https://grammy.dev/ref/core/bot) — `bot.stop()` graceful shutdown, `allowed_updates` option. HIGH confidence (official grammy docs).
- WebSearch: grammy version 1.41.1, "last published 2 days ago" (as of 2026-03-04), 339+ dependents. MEDIUM confidence (search result summary).
- WebSearch: NTBA/telegraf deprecation consensus from multiple independent sources. MEDIUM confidence.
- `src/server/index.ts` — confirmed SIGTERM/SIGINT handlers, service initialization pattern. HIGH confidence (read directly).
- `src/shared/openclawTypes.ts` — confirmed `TopicMapping`, `OpenClawConfig.channels.telegram` structure. HIGH confidence (read directly).
- `src/server/database/DatabaseConnection.ts` — confirmed inline migration pattern, `rotation_config` single-row table pattern. HIGH confidence (read directly).
- `src/server/services/OpenClawConfigReader.ts` — confirmed `getTopicMappings()` parses `groupId`/`topicId` from openclaw.json. HIGH confidence (read directly).

---

*Stack research for: Warden Dashboard v3.3 — Telegram Operator Awareness*
*Researched: 2026-03-04*
