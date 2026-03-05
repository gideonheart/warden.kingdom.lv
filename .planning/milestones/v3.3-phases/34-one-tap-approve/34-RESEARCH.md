# Phase 34: One-Tap Approve - Research

**Researched:** 2026-03-04
**Domain:** grammy inline keyboards, Telegram callback queries, tmux send-keys, approval state tracking
**Confidence:** HIGH

---

## Summary

Phase 34 adds an "Approve" inline keyboard button to the permission prompt notification sent by `NotificationPoller` in Phase 33. When the operator taps the button, the bot receives a `callback_query` update, verifies the sender is the configured operator, sends `1\n` to the agent's tmux session via `tmux send-keys`, and edits the original Telegram message to replace the button with a static "Approved at HH:MM" timestamp. Non-operator taps are rejected with an ephemeral response; expired taps (>15 min since the notification was sent) and duplicate taps (idempotency) are safely rejected without sending input to the agent.

The implementation requires: (1) upgrading `TelegramBotService.sendToTopic()` to accept an optional inline keyboard and return the sent message's `message_id`; (2) a new `ApprovalStateTracker` service that maps `sessionName → {chatId, messageId, sentAt, consumed}` to enable expiry checks and idempotency; (3) a new `ApprovalCallbackHandler` that registers `bot.callbackQuery('approve:*', ...)` on the bot, validates operator ID, checks expiry, marks consumed, injects tmux input, and edits the message; and (4) wiring the callback data as `approve:{sessionName}` to route from notification → callback back to the correct session.

The existing `TmuxSessionManager.sendPromptToSession()` pattern shows how `tmux send-keys` works — the approval input should use the same `-l` literal flag approach with `1` followed by an `Enter` key press. The `WARDEN_TELEGRAM_OPERATOR_ID` env var (documented in `STATE.md`) provides the operator Telegram user ID for authorization gating.

**Primary recommendation:** Build `ApprovalStateTracker` as a pure in-memory service (no SQLite needed for phase 34), register the callback handler inside `TelegramBotService` (or a separate `ApprovalCallbackHandler`), and use `bot.api.editMessageText()` with the original message text and an empty `reply_markup` to replace the button after approval.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APRV-01 | Permission notification includes inline keyboard Approve button | `InlineKeyboard.text('Approve', 'approve:{sessionName}')` passed to `sendMessage` via `reply_markup`; grammy `InlineKeyboard` builder confirmed in `node_modules/grammy/out/convenience/keyboard.d.ts` |
| APRV-02 | Tapping Approve sends input to agent's tmux session to unblock it | `bot.callbackQuery('approve:*', ...)` handler calls `tmuxSessionManager.sendPromptToSession(sessionName, '1')` which issues `tmux send-keys -l -- 1` then `Enter`; unblocks Claude Code's numbered prompt |
| APRV-03 | Only configured operator Telegram user ID can trigger approve action | `WARDEN_TELEGRAM_OPERATOR_ID` env var; in callback handler check `ctx.callbackQuery.from.id === parseInt(operatorId, 10)`; non-operators get `ctx.answerCallbackQuery('Not authorized')` with ephemeral notification |
| APRV-04 | Approve button removed from message after processing (edit-after-approve) | `bot.api.editMessageText(chatId, messageId, newText, { reply_markup: undefined })` removes button; grammy `editMessageText` confirmed in `node_modules/grammy/out/core/api.d.ts` |
| APRV-05 | Approval requests expire after configurable timeout (default 15 min) | `ApprovalStateTracker` stores `sentAt: Date.now()` when notification sent; callback handler checks `Date.now() - sentAt > APPROVAL_EXPIRY_MS`; expired taps answered with ephemeral "expired" message |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | ^1.41.1 | `InlineKeyboard` builder, `bot.callbackQuery()`, `bot.api.editMessageText()`, `ctx.answerCallbackQuery()` | Already installed; all required APIs confirmed in type definitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TmuxSessionManager | existing | `sendPromptToSession(sessionName, '1')` to inject approval input | Already implements `tmux send-keys -l` pattern correctly |
| TelegramBotService | existing | Add `sendToTopicWithApproveButton()` returning `{messageId}` | Extend, not replace |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory `ApprovalStateTracker` | SQLite approval table | DB persistence unnecessary — approval window is 15 min; server restart loses pending approvals (acceptable); simpler |
| `editMessageText()` to remove button | `editMessageReplyMarkup()` with empty keyboard | `editMessageText` lets us also update the text to "Approved at HH:MM"; more useful UX feedback |
| `approve:{sessionName}` callback data | UUID-based token | Session name is already unique and identifies the target; avoids needing a lookup table for token → session |

**Installation:**
```bash
# No new packages needed — grammy already installed
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/server/
├── services/
│   ├── TelegramBotService.ts      # extend: add sendToTopicWithApproveButton(), registerCallbackHandler()
│   ├── NotificationPoller.ts      # update: call sendToTopicWithApproveButton() instead of sendToTopic()
│   └── ApprovalStateTracker.ts    # NEW — in-memory Map of pending approvals with expiry and consumed flag
└── index.ts                       # no changes needed (handler registered inside TelegramBotService)
```

### Pattern 1: InlineKeyboard with Callback Button

**What:** `grammy` exports `InlineKeyboard` class with `.text(label, callbackData)` for creating callback buttons.

**When to use:** Every permission notification now includes this button.

**Example:**
```typescript
// Source: node_modules/grammy/out/convenience/keyboard.d.ts — line 530
import { InlineKeyboard } from 'grammy';

const keyboard = new InlineKeyboard().text('Approve', `approve:${sessionName}`);

const sentMessage = await bot.api.sendMessage(chatId, text, {
  message_thread_id: parseInt(topicId, 10),
  parse_mode: 'Markdown',
  reply_markup: keyboard,
});
// sentMessage.message_id: number — store this in ApprovalStateTracker
```

### Pattern 2: Callback Query Handler (bot.callbackQuery)

**What:** `bot.callbackQuery(trigger, handler)` registers a middleware for callback_query updates whose data matches the trigger string or regex.

**When to use:** Register once during `TelegramBotService.start()` after bot is created.

**Example:**
```typescript
// Source: node_modules/grammy/out/composer.d.ts — line 370
bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const sessionName = ctx.match[1];
  const operatorId = parseInt(process.env.WARDEN_TELEGRAM_OPERATOR_ID ?? '0', 10);

  // APRV-03: operator authorization
  if (ctx.callbackQuery.from.id !== operatorId) {
    await ctx.answerCallbackQuery({ text: 'Not authorized', show_alert: true });
    return;
  }

  const approval = approvalStateTracker.get(sessionName);

  // APRV-05: expiry check
  if (!approval || Date.now() - approval.sentAt > APPROVAL_EXPIRY_MS) {
    await ctx.answerCallbackQuery({ text: 'Approval expired', show_alert: true });
    return;
  }

  // APRV-04+Success5: idempotency — consumed flag prevents double-send
  if (approval.consumed) {
    await ctx.answerCallbackQuery();
    return;
  }

  approvalStateTracker.markConsumed(sessionName);

  // APRV-02: inject tmux input
  await tmuxSessionManager.sendPromptToSession(sessionName, '1');

  // APRV-01/04: acknowledge and edit message to remove button
  await ctx.answerCallbackQuery({ text: 'Approved!' });

  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  await bot.api.editMessageText(
    approval.chatId,
    approval.messageId,
    `${approval.originalText}\n\n_Approved at ${timeStr}_`,
    { parse_mode: 'Markdown' } // no reply_markup = button removed
  );
});
```

### Pattern 3: ApprovalStateTracker

**What:** In-memory Map tracking pending approvals. Each entry expires after `APPROVAL_EXPIRY_MS` (15 min). The `consumed` flag prevents double-send on rapid duplicate taps.

**When to use:** Called by `NotificationPoller` when notification sent; read by callback handler.

**Example:**
```typescript
// src/server/services/ApprovalStateTracker.ts
const APPROVAL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

interface ApprovalRecord {
  chatId: string;
  messageId: number;
  topicId: string;
  originalText: string;
  sentAt: number;
  consumed: boolean;
}

export class ApprovalStateTracker {
  private records = new Map<string, ApprovalRecord>();

  register(sessionName: string, record: Omit<ApprovalRecord, 'consumed' | 'sentAt'>): void {
    this.records.set(sessionName, {
      ...record,
      sentAt: Date.now(),
      consumed: false,
    });
  }

  get(sessionName: string): ApprovalRecord | undefined {
    return this.records.get(sessionName);
  }

  markConsumed(sessionName: string): void {
    const record = this.records.get(sessionName);
    if (record) record.consumed = true;
  }

  /** Clean up entries older than expiry window — call periodically or on each poll */
  pruneExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now - record.sentAt > APPROVAL_EXPIRY_MS) {
        this.records.delete(key);
      }
    }
  }

  clear(): void {
    this.records.clear();
  }
}

export const approvalStateTracker = new ApprovalStateTracker();
```

### Pattern 4: TelegramBotService Extension

**What:** `sendToTopicWithApproveButton()` replaces `sendToTopic()` for permission notifications. Returns the sent message's `message_id` so `NotificationPoller` can register the approval in `ApprovalStateTracker`.

**Example:**
```typescript
// Extension to TelegramBotService
async sendToTopicWithApproveButton(
  chatId: string,
  topicId: string,
  text: string,
  sessionName: string,
): Promise<number | null> {
  if (!this.bot) {
    console.warn('[TelegramBot] sendToTopicWithApproveButton called but bot is not running');
    return null;
  }
  try {
    const keyboard = new InlineKeyboard().text('Approve', `approve:${sessionName}`);
    const sentMessage = await this.bot.api.sendMessage(chatId, text, {
      message_thread_id: parseInt(topicId, 10),
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    return sentMessage.message_id;
  } catch (error) {
    console.error(`[TelegramBot] Failed to send with approve button to topic ${topicId}:`, error);
    return null;
  }
}
```

### Pattern 5: Registering Callback Handler in bot.start()

**What:** Callback handler is registered inside `TelegramBotService.start()` — after `new Bot(token)` but before `bot.start()`. This keeps all bot logic inside `TelegramBotService`.

**Alternative:** A separate `ApprovalCallbackHandler` class receives the `bot` reference and registers the handler. This is cleaner for separation of concerns if the callback handler grows complex.

**Recommended:** Pass `bot` instance reference (or a setter) to `ApprovalCallbackHandler.register(bot)` and call it from `TelegramBotService.start()`. This follows SRP — `TelegramBotService` manages bot lifecycle, `ApprovalCallbackHandler` manages the approval business logic.

### Anti-Patterns to Avoid

- **Using `editMessageReplyMarkup` with an empty keyboard object `{inline_keyboard: [[]]}` instead of omitting `reply_markup`:** This leaves an empty keyboard visible. Omit `reply_markup` entirely in `editMessageText` to remove it completely.
- **Not calling `ctx.answerCallbackQuery()`:** Telegram shows a loading spinner until `answerCallbackQuery` is called. Always call it — even on error paths — to dismiss the spinner.
- **Storing callback data longer than 64 bytes:** Telegram's limit is 64 bytes for `callback_data`. Session names like `warden-project-abc1` are ~25 bytes + `approve:` prefix = ~33 bytes. Safe, but worth verifying against real session names.
- **Using `parseInt(operatorId, 10)` and comparing with `===` to `ctx.callbackQuery.from.id`:** Telegram user IDs are `number` type; the env var is a string. Always parse the env var before comparison.
- **Sending `1\n` as literal text:** `sendPromptToSession('1')` already appends Enter via a second `send-keys Enter` call. Do NOT pass `'1\n'` — the `\n` will be treated as a literal newline character by the `-l` flag.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inline keyboard creation | Manual `{inline_keyboard: [[{text, callback_data}]]}` object | `grammy` `InlineKeyboard` builder | Builder handles array nesting, serialization, and is type-safe |
| Callback query routing | Manual update type check | `bot.callbackQuery(pattern, handler)` | grammy filters updates to `callback_query:data` type automatically |
| Answer callback query | Manual `bot.api.answerCallbackQuery(id, ...)` | `ctx.answerCallbackQuery(...)` | Context shortcut auto-fills `callback_query_id` |
| Input injection | Custom tmux pipe/socket | `tmuxSessionManager.sendPromptToSession(sessionName, '1')` | Already tested pattern; handles `-l` flag correctly |

**Key insight:** The hardest part is the idempotency + expiry interaction. A user who taps the button twice rapidly before the first response arrives will trigger two callback_query updates. The `consumed` flag set synchronously before the async tmux call prevents double-injection.

---

## Common Pitfalls

### Pitfall 1: Double-Tap Race Condition (APRV-05 success criterion 5)
**What goes wrong:** Two rapid taps fire two callback_query updates simultaneously. Both check `consumed = false`, both call `sendPromptToSession()`, agent receives `1\n` twice.
**Why it happens:** `consumed = false` is read by both handlers before either writes `true`; JavaScript event loop doesn't make the check+set atomic.
**How to avoid:** The in-process event loop IS single-threaded for synchronous operations. Call `approvalStateTracker.markConsumed(sessionName)` synchronously BEFORE the async `sendPromptToSession()` call. Since `markConsumed` is synchronous and the Node.js event loop is cooperative, the second callback handler will see `consumed = true` even if both updates arrive before either resolves.
**Warning signs:** Agent receives two identical approval inputs; two "Approved at HH:MM" messages appear.

### Pitfall 2: Expired Approval Still Edits Message
**What goes wrong:** Operator taps expired button, handler returns early, but the message still shows the Approve button (no edit happens). This is actually correct — just make sure the "expired" answer is clear enough.
**Why it happens:** Not a bug, but the expired message showing a non-functional button is confusing UX.
**How to avoid:** For expired taps, optionally edit the message to say "Expired" as well. Or just rely on the ephemeral answer notification — simpler, fewer edge cases.

### Pitfall 3: callback_data Length Limit
**What goes wrong:** `callback_data` exceeds 64 bytes; Telegram API rejects the sendMessage call.
**Why it happens:** `approve:${sessionName}` — if session names are long, this can exceed 64 bytes.
**How to avoid:** Verify: typical session name is `{agentId}-{projectSlug}-{shortUuid}` = e.g. `warden-kingdom-lv-abc1` = 22 chars + `approve:` = 30 bytes. Well within limit. Log a warning if > 50 chars.
**Warning signs:** `Telegram API error: BUTTON_DATA_INVALID` in bot error log.

### Pitfall 4: Operator ID env var not set
**What goes wrong:** `WARDEN_TELEGRAM_OPERATOR_ID` is undefined; `parseInt(undefined, 10)` = `NaN`; `NaN !== userId` is always true; ALL taps are rejected as unauthorized.
**Why it happens:** Missing environment variable on production server.
**How to avoid:** On bot startup, log a warning if `WARDEN_TELEGRAM_OPERATOR_ID` is not set. In the callback handler, if operatorId is `NaN`, log a specific error: "WARDEN_TELEGRAM_OPERATOR_ID not configured — all approvals rejected."
**Warning signs:** Operator taps button, gets "Not authorized" despite being the real operator.

### Pitfall 5: editMessageText Fails After Session Disappears
**What goes wrong:** Agent session disappears between approval trigger and message edit; `editMessageText` still succeeds (editing Telegram message doesn't require the session to exist), but the message shows "Approved" even though the input send failed.
**Why it happens:** `sendPromptToSession` throws if the tmux session is gone; `editMessageText` is called unconditionally.
**How to avoid:** Check if `sendPromptToSession` throws; if it does, DON'T edit the message (leave button visible so operator knows it failed). Answer callback query with a failure message.

### Pitfall 6: Forgetting to answer callback_query on ALL code paths
**What goes wrong:** On any early return (not authorized, expired, consumed), if `ctx.answerCallbackQuery()` is not called, the user sees a loading spinner for ~5 seconds until Telegram times out.
**Why it happens:** Telegram requires `answerCallbackQuery` be called for every received callback_query.
**How to avoid:** Every code path (authorize check fail, expiry fail, consumed, success) MUST call `ctx.answerCallbackQuery()`. Consider a try/finally pattern.

---

## Code Examples

Verified patterns from official sources:

### Sending Message with InlineKeyboard
```typescript
// Source: node_modules/grammy/out/convenience/keyboard.d.ts line 530 + api.d.ts line 156
import { InlineKeyboard } from 'grammy';

const keyboard = new InlineKeyboard().text('Approve', `approve:${sessionName}`);
const sentMessage = await bot.api.sendMessage(chatId, text, {
  message_thread_id: parseInt(topicId, 10),
  parse_mode: 'Markdown',
  reply_markup: keyboard,
});
const messageId = sentMessage.message_id; // number — use for later edit
```

### Registering Callback Query Handler
```typescript
// Source: node_modules/grammy/out/composer.d.ts line 370
bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const sessionName = ctx.match[1]; // regex capture group
  // ... validate, inject, edit
  await ctx.answerCallbackQuery({ text: 'Approved!' });
});
```

### Editing Message to Remove Button
```typescript
// Source: node_modules/grammy/out/core/api.d.ts line 1205
await bot.api.editMessageText(
  chatId,           // string (e.g. "-100123456789")
  messageId,        // number from sentMessage.message_id
  updatedText,      // new message text
  {
    parse_mode: 'Markdown',
    // omit reply_markup — removes the inline keyboard entirely
  }
);
```

### answerCallbackQuery Context Shortcut
```typescript
// Source: node_modules/grammy/out/context.d.ts line 1291
// ctx.answerCallbackQuery auto-fills callback_query_id
await ctx.answerCallbackQuery(); // silent dismiss
await ctx.answerCallbackQuery({ text: 'Message shown in popup' }); // popup
await ctx.answerCallbackQuery({ text: 'Alert!', show_alert: true }); // modal alert
```

### Tmux Input Injection (existing pattern from TmuxSessionManager)
```typescript
// Source: src/server/services/TmuxSessionManager.ts lines 81-86
async sendPromptToSession(sessionName: string, prompt: string): Promise<void> {
  // Send the prompt text literally (using -l flag to avoid special character interpretation)
  await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, '-l', '--', prompt]);
  // Send Enter key to submit the prompt
  await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, 'Enter']);
}
// Usage for approval: tmuxSessionManager.sendPromptToSession(sessionName, '1')
// This sends "1" literally then Enter — selects option 1 in Claude Code's permission prompt
```

### Operator ID Validation
```typescript
// Source: STATE.md — WARDEN_TELEGRAM_OPERATOR_ID env var; CallbackQuery.from.User.id is number
const rawOperatorId = process.env.WARDEN_TELEGRAM_OPERATOR_ID;
if (!rawOperatorId) {
  console.warn('[ApprovalCallback] WARDEN_TELEGRAM_OPERATOR_ID not set — all approvals blocked');
  await ctx.answerCallbackQuery({ text: 'Bot misconfigured', show_alert: true });
  return;
}
const operatorId = parseInt(rawOperatorId, 10);
if (ctx.callbackQuery.from.id !== operatorId) {
  await ctx.answerCallbackQuery({ text: 'Not authorized', show_alert: true });
  return;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Plain text notification (Phase 33) | Notification with inline keyboard (Phase 34) | Operator can approve without opening browser |
| sendToTopic() returns void | sendToTopicWithApproveButton() returns message_id | Enables editing the message after approval |
| No input validation | Operator ID check + expiry check | Prevents unauthorized approvals and stale approvals |

**Key sequencing constraint:** The callback handler must be registered on the `bot` object BEFORE `bot.start()` is called. Registration happens in `TelegramBotService.start()` setup block.

---

## Open Questions

1. **Where to register the callback handler — inside TelegramBotService or separate class?**
   - What we know: `bot` object is private to `TelegramBotService`; handler needs access to `tmuxSessionManager` and `approvalStateTracker`
   - What's unclear: Whether exposing the bot reference or using a callback registration pattern is cleaner
   - Recommendation: Add a `registerCallbackHandler(handler: (bot: Bot) => void)` method on `TelegramBotService`, called from server/index.ts after creating the handler. OR: create `ApprovalCallbackHandler` with a `register(bot: Bot)` method, call it from `TelegramBotService.start()` — this keeps index.ts clean.

2. **What text to use when editing the approved message?**
   - What we know: Success criterion 2 says "button disappears...replaced by 'Approved at HH:MM'"
   - What's unclear: Whether to keep the original notification text or replace it entirely
   - Recommendation: Keep original text + append `\n\n_Approved at HH:MM_` — preserves audit trail, satisfies success criterion 2.

3. **Pruning expired ApprovalStateTracker entries**
   - What we know: 15-min expiry; in-memory map grows by one entry per permission notification
   - What's unclear: Whether pruning is necessary in practice (notification rate is low)
   - Recommendation: Call `approvalStateTracker.pruneExpired()` inside `NotificationPoller.pollAllSessions()` — free housekeeping every 10 seconds, no additional timer needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |
| Estimated runtime | ~5 seconds |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APRV-01 | sendMessage called with InlineKeyboard containing Approve button | unit (mock bot.api.sendMessage, verify reply_markup) | `npm run test -- tests/unit/TelegramBotService.test.ts` | Yes (extend existing) |
| APRV-02 | tmuxSessionManager.sendPromptToSession called with '1' on valid approve tap | unit (mock tmux, mock bot callback, verify send-keys) | `npm run test -- tests/unit/ApprovalCallbackHandler.test.ts` | No — Wave 0 gap |
| APRV-03 | Non-operator tap calls answerCallbackQuery with rejection, no tmux call | unit (mock callback from non-operator user ID) | `npm run test -- tests/unit/ApprovalCallbackHandler.test.ts` | No — Wave 0 gap |
| APRV-04 | editMessageText called with no reply_markup after successful approve | unit (spy on bot.api.editMessageText) | `npm run test -- tests/unit/ApprovalCallbackHandler.test.ts` | No — Wave 0 gap |
| APRV-05 | Tap on expired approval calls answerCallbackQuery with expired message, no tmux | unit (ApprovalStateTracker with fake timers, verify expiry behavior) | `npm run test -- tests/unit/ApprovalStateTracker.test.ts` | No — Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd:verify-work` runs
- **Estimated feedback latency per task:** ~5 seconds

### Wave 0 Gaps (must be created before implementation)
- [ ] `tests/unit/ApprovalStateTracker.test.ts` — covers register/get/markConsumed/pruneExpired/expiry behavior (pure unit, no mocks needed)
- [ ] `tests/unit/ApprovalCallbackHandler.test.ts` — covers APRV-02, APRV-03, APRV-04, APRV-05 using vi.mock for tmuxSessionManager and mock bot context

*(Existing vitest infrastructure in place — only new test files are missing; `TelegramBotService.test.ts` can be extended for APRV-01)*

---

## Sources

### Primary (HIGH confidence)
- `node_modules/grammy/out/convenience/keyboard.d.ts` — `InlineKeyboard` class, `.text(label, data)` method (line 530), returns `CallbackButton` type
- `node_modules/grammy/out/composer.d.ts` — `bot.callbackQuery(trigger, handler)` (line 370), `CallbackQueryContext<C>` type
- `node_modules/grammy/out/context.d.ts` — `ctx.answerCallbackQuery()` shortcut (line 1291), `ctx.editMessageText()` (line 1335)
- `node_modules/grammy/out/core/api.d.ts` — `bot.api.editMessageText(chatId, messageId, text, other)` (line 1205), `bot.api.answerCallbackQuery(id, other)` (line 1047), `bot.api.sendMessage` returns `Promise<Message.TextMessage>` (line 156)
- `node_modules/@grammyjs/types/markup.d.ts` — `CallbackQuery.from: User` (line 103), `CallbackQuery.id: string` (line 101), `InlineKeyboardButton.CallbackButton.callback_data: string` (line 23)
- `node_modules/@grammyjs/types/message.d.ts` — `Message.ServiceMessage.message_id: number` (line 10), `Message.ServiceMessage.chat: Chat` (line 22)
- `src/server/services/TmuxSessionManager.ts` — `sendPromptToSession(sessionName, prompt)` pattern (lines 81-86); `tmux send-keys -l -- {prompt}` then `Enter`
- `src/server/services/TelegramBotService.ts` — existing `sendToTopic()` pattern to extend
- `.planning/STATE.md` — `WARDEN_TELEGRAM_OPERATOR_ID` env var decision confirmed

### Secondary (MEDIUM confidence)
- Telegram Bot API docs (from grammy type comments in `@grammyjs/types/markup.d.ts` line 98-114) — `answerCallbackQuery` must be called for every received callback_query; 64-byte limit on `callback_data`

### Tertiary (LOW confidence)
- None — all critical claims verified against installed package type definitions and existing codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs confirmed in local `node_modules` type definitions
- Architecture: HIGH — patterns derived from existing codebase (TelegramBotService, TmuxSessionManager, NotificationPoller)
- Pitfalls: HIGH — race condition and double-tap analysis derived from requirements; expiry/operator ID pitfalls from code analysis
- Idempotency logic: HIGH — Node.js single-threaded event loop behavior for synchronous markConsumed call is well-understood

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (grammy ^1.41.1 stable; APIs verified against installed version)
