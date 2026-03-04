# Phase 32: Bot Foundation - Research

**Researched:** 2026-03-04
**Domain:** Telegram bot lifecycle management with grammy in Node.js/Express
**Confidence:** HIGH

---

## Summary

Phase 32 establishes a Telegram bot that lives inside the existing Warden Express process. The bot must start on server boot (non-blocking), stop cleanly on SIGTERM/SIGINT, and never crash when the token is absent or when Telegram sends rate-limit responses.

The technology choices are already locked in STATE.md: `grammy ^1.41.1` for long polling, `@grammyjs/auto-retry ^2.0.2` for 429 handling, and `WARDEN_TELEGRAM_BOT_TOKEN` as the env var. Research confirms these are correct for the requirements and that no alternative needs to be explored.

The key architectural insight is that `bot.start()` returns a Promise that **never resolves** during normal operation. The correct pattern is fire-and-forget (do not `await`), with errors caught via `bot.catch()`. Graceful shutdown is achieved by calling `bot.stop()` inside the existing `handleShutdown()` function in `src/server/index.ts`. The `TelegramBotService` should be a singleton class matching the existing service pattern (see `InstanceTracker`, `RecordingRotationService`), with `start()` / `stop()` lifecycle methods and an internal null-guard for when the token is missing.

**Primary recommendation:** Implement `TelegramBotService` as a singleton with `start()`/`stop()` lifecycle methods; call `bot.start()` without `await` inside `start()`; call `bot.stop()` inside the existing `handleShutdown()`; guard both on token presence.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOT-01 | Warden runs its own Telegram bot client using grammy with long polling | grammy 1.41.1 confirmed current; `bot.start()` initiates long polling without blocking Express |
| BOT-02 | Bot token loaded from environment variable, never logged or committed | `process.env.WARDEN_TELEGRAM_BOT_TOKEN` pattern; guard with null check; log only presence/absence, never value |
| BOT-03 | Bot starts on server boot and stops gracefully on shutdown (SIGTERM/SIGINT) | `bot.start()` fire-and-forget in `startPeriodicSync()`-equivalent method; `bot.stop()` in existing `handleShutdown()` |
| BOT-04 | Bot handles Telegram API rate limits with auto-retry | `@grammyjs/auto-retry` 2.0.2 — `bot.api.config.use(autoRetry())` at init time |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | ^1.41.1 | Telegram bot client, long polling, message dispatch | TypeScript-first, actively maintained, official plugin ecosystem, selected in STATE.md |
| @grammyjs/auto-retry | ^2.0.2 | Auto-retry 429 flood-limit and 5xx errors | Official grammy plugin; transparent to call sites; selected in STATE.md |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @grammyjs/types | 3.25.0 | Telegram Bot API type definitions | Bundled transitively with grammy; provides `BotInfo`, `Update`, etc. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| grammy long polling | telegraf | telegraf is older, less TypeScript-native; locked decision |
| grammy long polling | webhook mode | Webhook requires Nginx reverse-proxy config; out of scope per REQUIREMENTS.md |
| @grammyjs/auto-retry | Manual retry logic | auto-retry handles exponential backoff, `retry_after`, 5xx, HttpErrors — hand-rolling misses edge cases |

**Installation:**
```bash
npm install grammy @grammyjs/auto-retry
```

---

## Architecture Patterns

### Recommended Project Structure

Phase 32 adds one new file to the existing service pattern:

```
src/server/
├── services/
│   ├── TelegramBotService.ts    # NEW — bot lifecycle singleton
│   ├── InstanceTracker.ts       # existing pattern to follow
│   └── RecordingRotationService.ts  # existing pattern to follow
└── index.ts                     # wire TelegramBotService start/stop here
```

### Pattern 1: Singleton Service with start()/stop()

**What:** A class with a `private bot: Bot | null` field, initialized only when `WARDEN_TELEGRAM_BOT_TOKEN` is present. Exposes `start()` and `stop()` that are no-ops when bot is null.

**When to use:** Always — this matches every other service in the codebase (`InstanceTracker`, `RecordingRotationService`, `SessionUsageReader`).

**Example:**
```typescript
// Source: grammy.dev/ref/core/bot + grammy.dev/advanced/reliability.html
import { Bot, GrammyError, HttpError } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

export class TelegramBotService {
  private bot: Bot | null = null;

  start(): void {
    const token = process.env.WARDEN_TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn('[TelegramBot] WARDEN_TELEGRAM_BOT_TOKEN not set — bot disabled');
      return;
    }

    this.bot = new Bot(token);
    this.bot.api.config.use(autoRetry());

    this.bot.catch((error) => {
      const err = error.error;
      if (err instanceof GrammyError) {
        console.error('[TelegramBot] Telegram API error:', err.description);
      } else if (err instanceof HttpError) {
        console.error('[TelegramBot] Network error contacting Telegram:', err);
      } else {
        console.error('[TelegramBot] Unexpected error:', err);
      }
    });

    // Fire-and-forget — bot.start() returns a Promise that never resolves
    // during normal operation. Do NOT await it.
    this.bot.start({
      onStart: (botInfo) => {
        console.log(`[TelegramBot] Bot started: @${botInfo.username}`);
      },
    }).catch((error) => {
      console.error('[TelegramBot] Fatal error during polling:', error);
    });
  }

  async stop(): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.stop();
      console.log('[TelegramBot] Bot stopped cleanly');
    } catch (error) {
      console.error('[TelegramBot] Error during bot stop:', error);
    } finally {
      this.bot = null;
    }
  }

  isRunning(): boolean {
    return this.bot?.isRunning() ?? false;
  }
}

export const telegramBotService = new TelegramBotService();
```

### Pattern 2: Wiring into handleShutdown()

**What:** Call `telegramBotService.start()` after `httpServer.listen()` (or alongside other service starts). Call `telegramBotService.stop()` inside the existing `handleShutdown()` function, before `httpServer.close()`.

**When to use:** Required — the existing shutdown handler must coordinate bot stop with HTTP server close.

**Example (in `src/server/index.ts`):**
```typescript
// Source: grammy.dev/advanced/reliability.html
// After existing service starts:
instanceTracker.startPeriodicSync();
sessionUsageReader.startPeriodicScan();
recordingRotationService.startPeriodicRotation();
telegramBotService.start();   // ADD THIS

// In handleShutdown():
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n[Warden] Received ${signal}, shutting down...`);

  const forceExitTimeout = setTimeout(() => {
    console.log('[Warden] Force exit after timeout');
    process.exit(1);
  }, 10_000);
  forceExitTimeout.unref();

  recordingRotationService.stopPeriodicRotation();
  sessionUsageReader.stopPeriodicScan();
  instanceTracker.stopPeriodicSync();
  await telegramBotService.stop();   // ADD THIS (before httpServer.close)

  httpServer.close(() => { /* ... */ });
}
```

Note: `handleShutdown` currently returns `void`. Since `telegramBotService.stop()` is async, `handleShutdown` will need to become `async` and the `process.on` signal handlers will need to call it with a leading `void` (or wrap with `.catch()`).

### Anti-Patterns to Avoid

- **Awaiting `bot.start()`:** This blocks the process forever — the Promise only resolves when the bot stops. Call without `await`.
- **Logging the token:** Never log `token` or `process.env.WARDEN_TELEGRAM_BOT_TOKEN` — log only `[set]` / `[not set]`.
- **No `bot.catch()` handler:** Without a handler, grammy's default error handler stops the bot and re-throws. Install a handler before calling `start()`.
- **Not calling `bot.stop()` on shutdown:** Causes a 409 Conflict error on rapid restart because the previous polling session isn't cleanly closed with Telegram.
- **Starting bot inside route handlers:** Bot must be a process-scoped singleton, not re-created per request.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limit retries | Custom 429 detection + setTimeout loop | `@grammyjs/auto-retry` | Handles `retry_after` field, 5xx, HttpErrors, exponential backoff — edge cases are many |
| Telegram API typing | Raw `fetch` to Bot API | grammy Bot class | grammy bundles `@grammyjs/types` with all Telegram API types correctly versioned |
| Custom polling loop | Manual `getUpdates` loop with `offset` tracking | `bot.start()` | Offset management, webhook deletion on start, error recovery — grammy handles all of this |

**Key insight:** The Telegram Bot API has subtle state (offset tracking, webhook conflicts, flood control) that is deceptively hard to implement correctly from scratch. grammy encapsulates all of it.

---

## Common Pitfalls

### Pitfall 1: 409 Conflict on Rapid Restart

**What goes wrong:** New bot instance starts long polling before previous instance has released its polling connection, resulting in `ETELEGRAM: 409 Conflict: terminated by other long poll` error.

**Why it happens:** The previous process exited without calling `bot.stop()` (which sends a final `getUpdates` offset confirmation to Telegram and aborts the pending long-poll connection).

**How to avoid:** Always call `await bot.stop()` in the `handleShutdown()` function before the process exits. The existing 10-second force-exit timeout is sufficient because `bot.stop()` is fast.

**Warning signs:** `409 Conflict` in server logs immediately after a restart.

### Pitfall 2: Blocking the Express Process with `await bot.start()`

**What goes wrong:** `await bot.start()` never returns during normal operation — the server hangs at startup and never begins serving HTTP requests.

**Why it happens:** `bot.start()` returns a Promise that only resolves when the bot stops. Awaiting it blocks the call site forever.

**How to avoid:** Call `bot.start()` without `await`. Attach a `.catch()` to handle fatal polling errors (e.g., invalid token).

**Warning signs:** HTTP server never logs `[Warden] Server running at...` after adding `await`.

### Pitfall 3: Unhandled grammy Errors Crashing the Process

**What goes wrong:** A middleware error or Telegram API error causes grammy's default error handler to stop the bot and re-throw, which may become an unhandled rejection.

**Why it happens:** grammy's default error handler (when no `bot.catch()` is set) stops the bot on first error.

**How to avoid:** Always install `bot.catch()` before calling `bot.start()`. Log errors without re-throwing.

**Warning signs:** Bot stops responding after first API error.

### Pitfall 4: Token Leaking in Logs

**What goes wrong:** The bot token appears in log output, which may be written to log files or CI output.

**Why it happens:** Developers log the full env var value for debugging.

**How to avoid:** Log only `'[TelegramBot] Token: [set]'` when token is present. Never pass `token` to `console.log`.

### Pitfall 5: handleShutdown async/sync mismatch

**What goes wrong:** Current `handleShutdown` is synchronous. Adding `await telegramBotService.stop()` without making it `async` causes stop() to run but not be awaited — bot may not finish stopping before `httpServer.close()`.

**Why it happens:** The `process.on('SIGTERM', () => handleShutdown('SIGTERM'))` pattern doesn't await the callback.

**How to avoid:** Change `handleShutdown` to `async function` and wrap the signal handler as `process.on('SIGTERM', () => { void handleShutdown('SIGTERM'); })`. The existing 10-second force-exit timeout provides the outer time bound.

---

## Code Examples

Verified patterns from official sources:

### Bot Initialization with auto-retry and error handler
```typescript
// Source: grammy.dev/ref/core/bot + grammy.dev/plugins/auto-retry
import { Bot, GrammyError, HttpError } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

const bot = new Bot(process.env.WARDEN_TELEGRAM_BOT_TOKEN!);
bot.api.config.use(autoRetry());   // Transparent 429/5xx retry

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('[TelegramBot] API error:', e.description);
  } else if (e instanceof HttpError) {
    console.error('[TelegramBot] Network error:', e);
  } else {
    console.error('[TelegramBot] Unknown error:', e);
  }
});
```

### Non-blocking Start
```typescript
// Source: grammy.dev/ref/core/bot — "Promise that never resolves except if stopped"
// Correct: fire-and-forget
bot.start({
  onStart: (botInfo) => console.log(`[TelegramBot] @${botInfo.username} online`),
}).catch((error) => console.error('[TelegramBot] Fatal:', error));

// WRONG — blocks forever:
// await bot.start();
```

### Graceful Stop
```typescript
// Source: grammy.dev/advanced/reliability.html
await bot.stop();
// bot.stop() confirms the last update offset to Telegram before returning.
// Subsequent bot.start() calls on a new process will NOT get a 409 Conflict.
```

### Token Guard (BOT-02)
```typescript
const token = process.env.WARDEN_TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn('[TelegramBot] WARDEN_TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
  return;   // All other features continue normally
}
// Never: console.log('[TelegramBot] Token:', token)
```

### auto-retry Configuration
```typescript
// Source: grammy.dev/plugins/auto-retry
// Default (recommended for phase 32): unlimited retries, respects retry_after
bot.api.config.use(autoRetry());

// Optional: cap retries (if you want faster failure in some scenario):
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-telegram-bot-api | grammy | ~2021 | grammy is TypeScript-native, has official plugin ecosystem, better maintained |
| Manual retry loops | @grammyjs/auto-retry | 2022 | Plugin handles `retry_after`, 5xx, HttpErrors transparently |
| Webhook-only for production | Long polling valid for dedicated servers | Always | Long polling is simpler when no load balancer or reverse proxy is needed |

**Deprecated/outdated:**
- `node-telegram-bot-api`: Less TypeScript support, less maintained, prone to 409 issues
- Polling via `offset` tracking manually: grammy handles this; no reason to hand-roll

---

## Integration with Existing Codebase

### Existing service pattern (InstanceTracker reference)
```typescript
// src/server/services/InstanceTracker.ts — pattern to follow
export class InstanceTracker {
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  startPeriodicSync(): void { /* ... */ }
  stopPeriodicSync(): void { /* ... */ }
}

export const instanceTracker = new InstanceTracker();
```

`TelegramBotService` follows the same pattern:
- Class with private state (`bot: Bot | null`)
- `start()` / `stop()` lifecycle methods
- Exported singleton: `export const telegramBotService = new TelegramBotService()`

### handleShutdown() change (index.ts)
Current `handleShutdown` is synchronous. It must become `async` to `await telegramBotService.stop()`. The `process.on` callbacks must use `void handleShutdown(signal)` to avoid unhandled promise rejections. The existing 10-second force-exit `setTimeout` still provides the hard outer bound.

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
| BOT-01 | TelegramBotService.start() creates Bot and begins long polling | unit (mock grammy) | `npm run test -- tests/unit/TelegramBotService.test.ts` | No — Wave 0 gap |
| BOT-02 | Missing token logs warning and returns without crash; token never logged | unit | `npm run test -- tests/unit/TelegramBotService.test.ts` | No — Wave 0 gap |
| BOT-03 | stop() calls bot.stop(); start() smoke test via handleShutdown integration | unit | `npm run test -- tests/unit/TelegramBotService.test.ts` | No — Wave 0 gap |
| BOT-04 | autoRetry() is registered on bot.api.config | unit (spy on api.config.use) | `npm run test -- tests/unit/TelegramBotService.test.ts` | No — Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before verify-work runs
- **Estimated feedback latency per task:** ~5 seconds

### Wave 0 Gaps (must be created before implementation)
- [ ] `tests/unit/TelegramBotService.test.ts` — covers BOT-01, BOT-02, BOT-03, BOT-04 using vitest `vi.mock('grammy')` and `vi.mock('@grammyjs/auto-retry')`

*(Existing vitest infrastructure is in place — only the test file is missing)*

---

## Open Questions

1. **handleShutdown async conversion side effects**
   - What we know: `handleShutdown` is currently synchronous; `httpServer.close()` uses a callback
   - What's unclear: Converting to async while keeping `httpServer.close(() => {...})` callback style requires care — the `async` function completes before the close callback runs
   - Recommendation: Keep `httpServer.close()` callback-based; `await telegramBotService.stop()` before calling `httpServer.close()`. This is safe because bot stop is fast (~50ms) and well within the 10-second force-exit.

2. **Should autoRetry use default config or capped config?**
   - What we know: Default `autoRetry()` retries indefinitely (respecting `retry_after`); this is safest for a server process that must remain connected
   - What's unclear: Could a very long `retry_after` (Telegram can set up to 1 hour) delay other bot functionality?
   - Recommendation: Use default `autoRetry()` for Phase 32. Fine-grained limits can be added in Phase 33/34 if needed.

---

## Sources

### Primary (HIGH confidence)
- grammy.dev/ref/core/bot — `Bot` class API: `start()`, `stop()`, `catch()`, `isRunning()`, `api.config.use()`
- grammy.dev/plugins/auto-retry — `autoRetry()` plugin: config options, what it handles
- grammy.dev/advanced/reliability.html — graceful shutdown pattern (`SIGTERM` → `bot.stop()`)
- grammy.dev/guide/errors — `GrammyError`, `HttpError`, `bot.catch()` handler signature
- npm registry: grammy@1.41.1, @grammyjs/auto-retry@2.0.2 — version confirmation

### Secondary (MEDIUM confidence)
- WebSearch: `bot.start()` confirmed as fire-and-forget Promise that never resolves (multiple sources + Deno docs agree)
- WebSearch: 409 Conflict root cause — previous instance not calling `bot.stop()` before exit

### Tertiary (LOW confidence)
- None — all critical claims verified via official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — grammy 1.41.1 and auto-retry 2.0.2 verified on npm; locked in STATE.md
- Architecture: HIGH — service pattern matches existing codebase; grammy lifecycle documented officially
- Pitfalls: HIGH — 409 conflict and blocking start() verified via official docs and multiple community sources

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable library; grammy follows semver, no breaking changes expected in patch/minor)
