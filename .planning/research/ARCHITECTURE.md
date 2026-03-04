# Architecture Research

**Domain:** Warden Dashboard v3.3 — Telegram Bot Operator Awareness Integration
**Researched:** 2026-03-04
**Confidence:** HIGH — direct source code analysis of shipped v3.2 codebase + grammy library verification

---

## System Overview

v3.3 adds a Telegram notification bot that runs inside the same Node.js process as Warden. The diagram shows the new `TelegramBotService` layer and its connections to the two event sources: permission prompt detection (from `gsdRoutes`'s `detectAgentState` poll) and budget alert level changes (from `DatabaseConnection.getBudgetAlertStatus`). Boxes marked `[NEW]` or `[MOD]`.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          React 19 Client (SPA)                              │
├────────────────────────────────────────────────────────────────────────────┤
│  [MOD] Settings panel — Telegram notification toggles, cooldown config      │
│  (new NotificationSettingsPanel component inside HistoryView or new tab)   │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │  REST /api/notifications/*
┌──────────────────────────────────▼─────────────────────────────────────────┐
│                         Express 5 Server                                    │
│                                                                             │
│  ┌──────────────────────┐   ┌───────────────────────────────────────────┐  │
│  │InstanceTracker       │   │ NotificationPoller [NEW]                  │  │
│  │(10s poll loop)       │   │ setInterval every 10s:                    │  │
│  │                      │   │  1. capture tmux panes → detectAgentState │  │
│  └──────────────────────┘   │  2. getBudgetAlertStatus from DB          │  │
│                             │  3. emit 'permission_prompt' events        │  │
│  ┌──────────────────────┐   │  4. emit 'budget_alert' events            │  │
│  │TerminalStreamService │   └─────────────┬─────────────────────────────┘  │
│  │(PTY onData tap)      │                 │ EventEmitter events             │
│  └──────────────────────┘   ┌─────────────▼─────────────────────────────┐  │
│                             │ TelegramBotService [NEW]                   │  │
│  ┌──────────────────────┐   │ - grammy Bot instance (long polling)       │  │
│  │GsdRegistryService    │   │ - listens for 'permission_prompt' events   │  │
│  │(tmux session lookup) │◄──│ - listens for 'budget_alert' events       │  │
│  └──────────────────────┘   │ - dedup/cooldown via in-memory Map        │  │
│                             │ - sends messages with inline keyboards     │  │
│  ┌──────────────────────┐   │ - handles callback_query → tmux write     │  │
│  │OpenClawConfigReader  │◄──│ - reads topic → agentId mappings          │  │
│  └──────────────────────┘   └────────────────────────────────────────── ┘  │
│                                                                             │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │ DatabaseConnection           │  │ TmuxSessionManager                  │ │
│  │ (getBudgetAlertStatus)       │  │ (sendPromptToSession / write input) │ │
│  └──────────────────────────────┘  └─────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────┐                                          │
│  │ notificationRoutes [NEW]     │  GET/PUT /api/notifications/config       │
│  └──────────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────────┘
                    │ Telegram Bot API (long polling, HTTPS outbound)
                    ▼
              Telegram Cloud
```

---

## New vs Modified: Explicit Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/server/services/NotificationPoller.ts` | Polls agent states and budget status; emits typed events |
| `src/server/services/TelegramBotService.ts` | grammy Bot instance; receives events; sends Telegram messages; handles callback queries |
| `src/server/services/NotificationDeduplicator.ts` | Cooldown Map keyed on `${agentId}:${eventType}`; configurable window; tracks last-sent timestamps |
| `src/server/routes/notificationRoutes.ts` | `GET/PUT /api/notifications/config` — enable/disable per type, cooldown window |
| `src/client/components/NotificationSettingsPanel.tsx` | UI to toggle alert types and set cooldown window |

### Modified Files

| File | Change | Estimated Lines |
|------|--------|-----------------|
| `src/server/index.ts` | Instantiate and start `NotificationPoller`, `TelegramBotService`; mount `notificationRoutes`; stop both on shutdown | ~12 |
| `src/server/database/DatabaseConnection.ts` | Add `notification_config` table migration; add `getNotificationConfig()` / `upsertNotificationConfig()` | ~40 |
| `src/shared/types.ts` | Add `NotificationConfig` interface | ~8 |

### No Changes Required

- `TerminalStreamService` — permission prompt detection now happens in `NotificationPoller` via independent tmux capture, not tapped from PTY onData. Keeps SRP clean; PTY stream path stays zero-latency.
- `GsdRegistryService` / `gsdRoutes.ts` — `detectAgentState()` is copied (or imported as a shared utility) into `NotificationPoller`; it does not need to be modified.
- `OpenClawConfigReader` — read-only access, no changes needed.
- `TmuxSessionManager` — `sendPromptToSession()` is already implemented and sufficient for the one-tap approve action.

---

## Component Responsibilities

### NotificationPoller (NEW)

**File:** `src/server/services/NotificationPoller.ts`

**Responsibility:** Detects state transitions for both event types and emits named events. Does not touch Telegram.

**Design:** Extends `EventEmitter`. Runs a `setInterval` every 10 seconds (same cadence as `InstanceTracker`). On each tick:

1. For each active instance, runs `tmux capture-pane -pt {session}:0.0 -S -5` and calls `detectAgentState(pane)` from the shared utility.
2. Compares result against `previousAgentStates: Map<sessionName, AgentStateHint>`. If state changed to `'permission_prompt'`, emits `'permission_prompt'` event with `{ sessionName, agentId, topicId }`.
3. Calls `database.getBudgetAlertStatus()`. Compares per-agent levels against `previousBudgetLevels: Map<agentId, alertLevel>`. If level worsened, emits `'budget_alert'` event with `{ agentId, alertLevel, todayCostUsd, dailyBudgetUsd }`.

**Key constraint:** Only emits on state _transitions_, not on sustained states. Uses `Map` refs for previous-state tracking — same pattern as `useBrowserNotifications` on the client.

**Why not tap PTY onData for permission detection:** The `TerminalStreamService` PTY is only alive while a browser client is connected (due to the 30s keep-alive). If no browser is open, no PTY exists, and no permission prompt would be detected from the stream. `NotificationPoller` uses `tmux capture-pane` directly — same approach as `detectAgentState()` in `gsdRoutes.ts` — and works regardless of browser connection state. This is the existing, tested pattern on the server.

### TelegramBotService (NEW)

**File:** `src/server/services/TelegramBotService.ts`

**Responsibility:** Owns the grammy `Bot` instance. Listens to `NotificationPoller` events. Sends Telegram messages. Handles callback queries from inline keyboards to approve permission prompts.

**Design:**

```typescript
export class TelegramBotService {
  private bot: Bot;
  private deduplicator: NotificationDeduplicator;

  constructor(
    private readonly notificationPoller: NotificationPoller,
    private readonly configReader: OpenClawConfigReader,
    private readonly tmuxManager: TmuxSessionManager,
    private readonly database: DatabaseConnection,
  ) {}

  async start(): Promise<void> // initializes bot handlers, starts long polling
  stop(): Promise<void>        // calls bot.stop(), emits shutdown log
}
```

**Event subscriptions:**

```typescript
notificationPoller.on('permission_prompt', async (event) => {
  if (deduplicator.isDuplicate('permission_prompt', event.sessionName)) return;
  const config = database.getNotificationConfig();
  if (!config.permissionPromptEnabled) return;
  const topicId = await resolveTopicForAgent(event.agentId);
  if (!topicId) return;
  await bot.api.sendMessage(groupId, messageText, {
    message_thread_id: topicId,
    reply_markup: {
      inline_keyboard: [[
        { text: 'Approve', callback_data: `approve:${event.sessionName}` }
      ]]
    }
  });
  deduplicator.record('permission_prompt', event.sessionName);
});

notificationPoller.on('budget_alert', async (event) => {
  // Similar pattern, no inline keyboard needed
});
```

**Callback query handler:**

```typescript
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;  // e.g. 'approve:gideon-project-abc1'
  if (data.startsWith('approve:')) {
    const sessionName = data.slice('approve:'.length);
    await tmuxSessionManager.sendPromptToSession(sessionName, '1');
    await ctx.answerCallbackQuery({ text: 'Approved.' });
    // Edit the original message to show approved state (remove keyboard)
    await ctx.editMessageText(`${originalText}\n\nApproved by operator.`);
  }
});
```

**Why grammy over node-telegram-bot-api:** grammy is TypeScript-first, actively maintained (2024-2025), has typed context and filter queries, and has superior inline keyboard support. node-telegram-bot-api has numerous open GitHub issues around callback_query not triggering. grammy is the clear ecosystem choice for new projects in 2025-2026. (MEDIUM confidence — verified via grammy.dev official docs + npm trends)

**Bot configuration:** Bot token from `openclaw.json` (the existing `OpenClawConfigReader` already knows how to read this file) or from a `WARDEN_TELEGRAM_BOT_TOKEN` env var. Prefer env var to keep secrets out of config files.

### NotificationDeduplicator (NEW)

**File:** `src/server/services/NotificationDeduplicator.ts`

**Responsibility:** Tracks when a notification was last sent for a given `(agentId, eventType)` pair. Returns `true` if within the cooldown window.

**Design:** Pure in-memory. `Map<string, number>` keyed on `${eventType}:${agentId}` → timestamp. Cooldown window configurable from DB config. No persistence needed — reboot clears state, which is correct (first event after restart should always notify).

```typescript
export class NotificationDeduplicator {
  private lastSent: Map<string, number> = new Map();

  isDuplicate(eventType: string, agentId: string): boolean {
    const key = `${eventType}:${agentId}`;
    const lastTime = this.lastSent.get(key) ?? 0;
    return Date.now() - lastTime < this.cooldownMs;
  }

  record(eventType: string, agentId: string): void {
    this.lastSent.set(`${eventType}:${agentId}`, Date.now());
  }

  updateCooldown(cooldownMs: number): void {
    this.cooldownMs = cooldownMs;
  }
}
```

### notificationRoutes (NEW)

**File:** `src/server/routes/notificationRoutes.ts`

**Routes:**

```
GET  /api/notifications/config
  → returns { permissionPromptEnabled, budgetAlertEnabled, cooldownMinutes }

PUT  /api/notifications/config
  → body: { permissionPromptEnabled?, budgetAlertEnabled?, cooldownMinutes? }
  → upserts notification_config table row
  → calls deduplicator.updateCooldown(cooldownMs)
```

**SQLite table:**

```sql
CREATE TABLE IF NOT EXISTS notification_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  permission_prompt_enabled INTEGER NOT NULL DEFAULT 1,
  budget_alert_enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Follows the `budget_config` singleton-row pattern already established in `DatabaseConnection.ts`.

---

## Detailed Integration Points

### 1. Where Permission Prompt Events Originate

**Not** from `TerminalStreamService.onData`. The PTY only exists while a browser tab is connected — and the goal of Telegram alerts is precisely to unblock agents _when no browser is open_.

**From:** `NotificationPoller.tick()` which calls:
```typescript
tmux capture-pane -pt {sessionName}:0.0 -S -5
```
This is the same `execFileAsync('tmux', ['capture-pane', ...])` call already used in `gsdRoutes.ts` at line 76. `NotificationPoller` calls it directly on every active instance every 10 seconds.

**Permission prompt detection function:** The `detectAgentState(pane: string): AgentStateHint` function currently lives in `gsdRoutes.ts` (line 29-40). To share it with `NotificationPoller` without creating a circular dependency:

- Extract `detectAgentState` and `extractContextPressure` into a new shared utility: `src/server/utils/agentStateDetection.ts`
- `gsdRoutes.ts` imports from there (replacing the local definition)
- `NotificationPoller` imports from the same utility

This is a clean refactor with no behavior change to `gsdRoutes.ts`.

### 2. Where Budget Alert Events Originate

**From:** `NotificationPoller.tick()` which calls `database.getBudgetAlertStatus()`. This method already exists in `DatabaseConnection` (line 280-298) and returns per-agent `alertLevel: 'ok' | 'warning' | 'exceeded'`.

`NotificationPoller` tracks the previous `alertLevel` per agent in a `Map<agentId, alertLevel>`. Only fires `'budget_alert'` event when an agent's level _worsens_ (ok → warning, ok → exceeded, warning → exceeded). Recovering back to ok does not fire.

### 3. Event Transport: EventEmitter (not message queue, not direct call)

**Recommendation: EventEmitter.**

Three options were evaluated:

| Option | Pros | Cons |
|--------|------|------|
| Direct method call (`botService.handlePermissionPrompt()`) | Simple, no indirection | Creates tight coupling: `NotificationPoller` must hold a reference to `TelegramBotService`. Future second listener (e.g., a webhook) requires modifying `NotificationPoller` |
| Node.js `EventEmitter` | Loose coupling: `NotificationPoller` knows nothing about Telegram. Multiple listeners possible. Native Node.js, no dependency | Async errors in listeners must be caught; no guaranteed delivery |
| Message queue (Redis, BullMQ) | Durable, cross-process | Overkill: single-process, single-operator, events are not critical enough to need persistence |

**EventEmitter is the right choice** for this architecture. The project already uses event-based patterns (Socket.IO, PTY callbacks). `NotificationPoller` extending `EventEmitter` fits naturally:

```typescript
// NotificationPoller
this.emit('permission_prompt', { sessionName, agentId, topicId });

// TelegramBotService (in constructor)
notificationPoller.on('permission_prompt', this.handlePermissionPrompt.bind(this));
```

Async listener error safety:
```typescript
notificationPoller.on('permission_prompt', async (event) => {
  try {
    await this.handlePermissionPrompt(event);
  } catch (error) {
    console.error('[TelegramBot] Failed to send permission prompt notification:', error);
    // Non-fatal: next poll cycle will re-detect if still in permission_prompt state
    // and deduplicator's lack of record() call means it will retry after cooldown expires
  }
});
```

### 4. Callback Query Routing Back to tmux

When the operator taps "Approve" in Telegram:

1. Telegram sends a `callback_query` update to Warden's bot (via long polling `getUpdates`)
2. grammy's `bot.on('callback_query:data', ctx => ...)` handler fires
3. Parse `ctx.callbackQuery.data` — format: `approve:{sessionName}`
4. Validate `sessionName` against `SESSION_NAME_RE` (the same regex already in `gsdRoutes.ts`: `/^[a-zA-Z][a-zA-Z0-9_-]*$/`)
5. Call `tmuxSessionManager.sendPromptToSession(sessionName, '1')` — this sends `1` followed by Enter to the tmux session, which is the correct response to Claude Code's permission prompt ("1. Yes")
6. Call `ctx.answerCallbackQuery({ text: 'Approved.' })` — required by Telegram protocol to clear the loading indicator; must be called within 10 seconds
7. Call `ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })` — removes the inline keyboard from the message so the button cannot be tapped again

**Session name validation rationale:** The callback data comes from Telegram (external input), so it must be validated even though we set it originally. An attacker with access to the bot (knowing the bot token) could send arbitrary callback data. The `SESSION_NAME_RE` regex limits the surface.

**The `tmuxSessionManager.sendPromptToSession()` method already does exactly what is needed:**
```typescript
// From TmuxSessionManager.ts line 81-86
async sendPromptToSession(sessionName: string, prompt: string): Promise<void> {
  await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, '-l', '--', prompt]);
  await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, 'Enter']);
}
```
Sending `'1'` as the prompt triggers the "Yes, I want to proceed" selection in Claude Code's permission prompt UI.

### 5. Topic Resolution: agentId → Telegram groupId + topicId

`OpenClawConfigReader.getTopicMappings()` already returns `TopicMapping[]` with `{ agentId, groupId, topicId }`. `TelegramBotService` calls this to resolve which Telegram thread to post to:

```typescript
const mappings = await openClawConfigReader.getTopicMappings();
const mapping = mappings.find(m => m.agentId === event.agentId);
if (!mapping) {
  console.warn(`[TelegramBot] No topic mapping for agent ${event.agentId}, skipping notification`);
  return;
}
await bot.api.sendMessage(mapping.groupId, text, {
  message_thread_id: parseInt(mapping.topicId, 10),
  ...
});
```

**Note:** The `groupId` in `openclaw.json` is the Telegram group chat ID (negative integer for groups). The `topicId` is the forum thread ID. `grammy`'s `sendMessage` supports `message_thread_id` for forum supergroups. (HIGH confidence — official Telegram Bot API docs)

### 6. Bot Token Source

The notification bot is a **separate bot** from OpenClaw's main gateway bot (noted in PROJECT.md out-of-scope). It needs its own token from BotFather.

Source priority:
1. `WARDEN_TELEGRAM_BOT_TOKEN` environment variable — preferred for production (Forge sets env vars per-service)
2. Fallback: new field in `openclaw.json` under a `warden` key — but env var is cleaner

`TelegramBotService` reads token at startup. If token is missing, it logs a warning and does not start the bot (graceful degradation — Warden continues to work without Telegram).

### 7. Long Polling and Process Lifecycle

grammy's `bot.start()` runs a long polling loop. It must be started after the Express server is up, and stopped before process exit.

**In `src/server/index.ts`:**

```typescript
// After httpServer.listen(...)
await telegramBotService.start();   // non-blocking: starts long polling loop internally

// In handleShutdown():
await telegramBotService.stop();    // calls bot.stop(), drains pending updates
recordingRotationService.stopPeriodicRotation();
// ... rest of existing shutdown sequence
```

grammy's `bot.stop()` is graceful — it cancels the current `getUpdates` long-poll request and confirms the last received update ID to Telegram. No updates are lost.

**Long polling vs webhook:** Long polling is the correct choice here. Warden runs behind Nginx with IP whitelist; webhook would require a publicly accessible URL routed to the internal bot endpoint. Long polling has no such requirement and is simpler for a single-operator tool. (HIGH confidence — grammy official docs confirm this recommendation)

---

## Data Flow Diagrams

### Permission Prompt Detection and Notification Flow

```
NotificationPoller.tick() [every 10s]
  for each active instance:
    tmux capture-pane -pt {session}:0.0 -S -5
    detectAgentState(pane) → 'permission_prompt'
    previousStates.get(session) !== 'permission_prompt'?
      YES → emit 'permission_prompt' { sessionName, agentId }
      NO  → skip (sustained state, already notified)
    previousStates.set(session, 'permission_prompt')

TelegramBotService listener:
  deduplicator.isDuplicate('permission_prompt', sessionName)?
    YES → return (cooldown active)
    NO  →
      config.permissionPromptEnabled?
        NO  → return (user disabled)
        YES →
          mapping = topicMappings.find(agentId)
          mapping exists?
            NO  → log warning, return
            YES →
              bot.api.sendMessage(groupId, 'Agent needs approval', {
                message_thread_id: topicId,
                reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: 'approve:{sessionName}' }]] }
              })
              deduplicator.record('permission_prompt', sessionName)
```

### One-Tap Approve Flow

```
Operator taps "Approve" in Telegram
  Telegram sends callback_query to bot (via long poll)
  grammy delivers update to bot.on('callback_query:data') handler
    data = 'approve:gideon-project-abc1'
    sessionName = 'gideon-project-abc1'
    SESSION_NAME_RE.test(sessionName) → valid
    tmuxSessionManager.sendPromptToSession(sessionName, '1')
      tmux send-keys -t gideon-project-abc1:0.0 -l -- 1
      tmux send-keys -t gideon-project-abc1:0.0 Enter
      → Claude Code receives '1\n' → selects 'Yes, proceed'
    ctx.answerCallbackQuery({ text: 'Approved.' })   → clears spinner
    ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })  → disables button
```

### Budget Alert Flow

```
NotificationPoller.tick() [every 10s]
  database.getBudgetAlertStatus() → BudgetAlertStatus[]
  for each entry:
    previousBudgetLevels.get(agentId) vs entry.alertLevel
      level worsened?
        YES → emit 'budget_alert' { agentId, alertLevel, todayCostUsd, dailyBudgetUsd }
    previousBudgetLevels.set(agentId, entry.alertLevel)

TelegramBotService listener:
  deduplicator.isDuplicate('budget_alert', agentId)? → cooldown check
  config.budgetAlertEnabled? → user enabled check
  mapping = topicMappings.find(agentId)
  bot.api.sendMessage(groupId, alertText, { message_thread_id: topicId })
  deduplicator.record('budget_alert', agentId)
```

### Notification Config Update Flow

```
Operator taps toggle in NotificationSettingsPanel
  PUT /api/notifications/config { permissionPromptEnabled: false }
  notificationRoutes handler:
    database.upsertNotificationConfig(...)
    response 200

NotificationPoller + TelegramBotService:
  next event emission → config fetched from DB at send time (not cached)
  permissionPromptEnabled = false → notification skipped
```

---

## Recommended Build Order

Dependencies: `NotificationPoller` must be built before `TelegramBotService` (publisher before subscriber). DB migration before routes. Routes before UI.

**Step 1 — Shared utility extraction (prerequisite)**

Extract `detectAgentState()` and `extractContextPressure()` from `gsdRoutes.ts` into `src/server/utils/agentStateDetection.ts`. Update `gsdRoutes.ts` import. No behavior change.

Rationale: `NotificationPoller` needs this function. Extracting it avoids code duplication and imports from routes (which would be architecturally backwards).

**Step 2 — DB migration (prerequisite for routes and config)**

Add `notification_config` table migration to `DatabaseConnection.ts`. Add `getNotificationConfig()` and `upsertNotificationConfig()` methods. Add `NotificationConfig` type to `src/shared/types.ts`.

**Step 3 — NotificationDeduplicator (standalone utility)**

Build `NotificationDeduplicator` — pure in-memory, no dependencies. Testable in isolation.

**Step 4 — NotificationPoller (core event source)**

Build `NotificationPoller` extending `EventEmitter`. Depends on: `DatabaseConnection`, `GsdRegistryService` (for active session list), `agentStateDetection` utility. Wire periodic polling. Emit typed events.

**Step 5 — TelegramBotService (main new service)**

Build `TelegramBotService`. Install grammy (`npm install grammy`). Subscribe to `NotificationPoller` events. Implement `sendMessage` helpers with inline keyboards. Implement callback query handler.

**Step 6 — notificationRoutes (REST API)**

Build `notificationRoutes.ts`. Mount in `src/server/index.ts` alongside existing routes. Start `NotificationPoller` and `TelegramBotService` in `index.ts`. Add stop calls to `handleShutdown`.

**Step 7 — NotificationSettingsPanel (client UI)**

Build `NotificationSettingsPanel.tsx`. Integrate into the History/Settings area or as a new settings tab. Fetch config on mount, save on change.

---

## Architecture Patterns to Follow

### Pattern 1: Singleton Row Config (established precedent)

**What:** Single-row SQLite config using `CHECK (id = 1)` with `INSERT OR REPLACE` upsert.
**When to use:** `notification_config` table — same as `budget_config`, `rotation_config`, `auto_record_config`.

```typescript
this.db.prepare(`
  INSERT INTO notification_config (id, permission_prompt_enabled, budget_alert_enabled, cooldown_minutes)
  VALUES (1, @permissionPromptEnabled, @budgetAlertEnabled, @cooldownMinutes)
  ON CONFLICT(id) DO UPDATE SET
    permission_prompt_enabled = excluded.permission_prompt_enabled,
    budget_alert_enabled = excluded.budget_alert_enabled,
    cooldown_minutes = excluded.cooldown_minutes,
    updated_at = CURRENT_TIMESTAMP
`).run({ ... });
```

### Pattern 2: EventEmitter for Loose Service Coupling

**What:** `NotificationPoller extends EventEmitter`. Emits named events with typed payloads. `TelegramBotService` subscribes.
**When to use:** Any case where one service produces events that multiple consumers might need, or where the producer should not be aware of what consumes its output.
**Trade-offs:** Async errors in listeners must be wrapped in try/catch. No guaranteed delivery. Both are acceptable here.

```typescript
// Producer
export class NotificationPoller extends EventEmitter {
  private tick(): void {
    this.emit('permission_prompt', payload);
  }
}

// Consumer
notificationPoller.on('permission_prompt', async (event: PermissionPromptEvent) => {
  try {
    await handleEvent(event);
  } catch (error) {
    console.error('[TelegramBot] Handler error:', error);
  }
});
```

### Pattern 3: Transition-Only Emission (state machine guard)

**What:** Track previous state per agent. Only emit event when state _transitions_ to the target state, not when it _remains_ in that state.
**When to use:** All notification events. A permission prompt that lingers for 30 minutes should not send 180 notifications.

```typescript
// In NotificationPoller
if (state === 'permission_prompt' && previousStates.get(sessionName) !== 'permission_prompt') {
  this.emit('permission_prompt', event);
}
previousStates.set(sessionName, state);
```

### Pattern 4: Duplicate Suppression with Cooldown Map

**What:** In-memory `Map<key, timestamp>`. Before sending, check if `Date.now() - lastSent < cooldownMs`. After sending, record timestamp.
**When to use:** After the transition guard — belt-and-suspenders. If the poller restarts (app restart), the transition guard resets. Cooldown adds an independent time-based guard.
**Why in-memory (not DB):** Telegram notifications are ephemeral. If the server restarts, the operator likely wants to be notified again. In-memory is correct behavior.

### Pattern 5: Callback Data Encoding

**What:** Encode structured data into the 64-byte `callback_data` string as `{action}:{payload}`.
**When to use:** All inline keyboard buttons in this milestone.

```typescript
// Encoding (send time)
callback_data: `approve:${sessionName}`

// Decoding (receive time)
if (data.startsWith('approve:')) {
  const sessionName = data.slice('approve:'.length);
  if (!SESSION_NAME_RE.test(sessionName)) return; // validate before use
  ...
}
```

Note: Telegram limits `callback_data` to 64 bytes. Session names follow `{agentId}-{projectSlug}-{shortUuid}` — e.g., `gideon-kingdom-ab12` (19 chars) + `approve:` (8 chars) = 27 bytes. Well within limit.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Tapping PTY onData for Telegram Notifications

**What people do:** Add notification logic to `TerminalStreamService.ptyProcess.onData()` since that's where terminal output already flows.
**Why it's wrong:** PTY exists only while a browser client is connected. With 30s keep-alive, if no browser is open for 30+ seconds, there is no PTY and no `onData` events, defeating the purpose of a Telegram fallback. The whole value proposition of Telegram alerts is "works when browser is closed."
**Do this instead:** Use `tmux capture-pane` in `NotificationPoller` — this works regardless of PTY state or browser connection.

### Anti-Pattern 2: Sending Telegram Messages on Every Poll Tick

**What people do:** Emit a notification every 10 seconds while an agent remains in `permission_prompt` state.
**Why it's wrong:** Floods the Telegram chat; the operator sees the same alert dozens of times and starts ignoring notifications.
**Do this instead:** Transition-only emission (Pattern 3) + cooldown deduplication (Pattern 4). One notification per event entry, with configurable cooldown for re-alerts.

### Anti-Pattern 3: Direct Coupling from NotificationPoller to TelegramBotService

**What people do:** `NotificationPoller` holds a reference to `TelegramBotService` and calls it directly.
**Why it's wrong:** Makes it impossible to add a second notification channel (e.g., email, Slack) without modifying `NotificationPoller`. Violates SRP — the poller should not know what happens with its detections.
**Do this instead:** `NotificationPoller` extends `EventEmitter` and emits events. `TelegramBotService` subscribes. Future channels add their own subscribers.

### Anti-Pattern 4: Using node-telegram-bot-api Instead of grammy

**What people do:** Install `node-telegram-bot-api` (older, more popular by download count).
**Why it's wrong:** `node-telegram-bot-api` has numerous open GitHub issues around callback queries not triggering (issues #306, #621, #985 on its GitHub). TypeScript types are incomplete. It is in maintenance mode.
**Do this instead:** Use `grammy` — TypeScript-first, actively maintained, callback query handling is a core feature with typed filter queries (`bot.on('callback_query:data', ...)`).

### Anti-Pattern 5: Placing Bot Token in openclaw.json

**What people do:** Add `warden.telegramBotToken` to `openclaw.json` since `OpenClawConfigReader` already reads that file.
**Why it's wrong:** `openclaw.json` is shared across the OpenClaw ecosystem. Writing secrets there complicates the config ownership boundary. `OpenClawConfigReader` does not write the file.
**Do this instead:** Read token from `WARDEN_TELEGRAM_BOT_TOKEN` env var. Laravel Forge can inject env vars per-service. Fallback gracefully with a startup warning if the var is absent.

### Anti-Pattern 6: Blocking the Express Event Loop with bot.start()

**What people do:** Await `bot.start()` synchronously in the main startup flow.
**Why it's wrong:** `bot.start()` begins the long polling loop and does not resolve until `bot.stop()` is called. Awaiting it blocks everything after it from running.
**Do this instead:** Call `bot.start()` without `await`. grammy starts polling in the background. The `TelegramBotService.start()` wrapper method should call `void this.bot.start()` (fire-and-forget) after registering all handlers.

---

## Integration Boundaries Summary

| Boundary | Communication Pattern | Notes |
|----------|-----------------------|-------|
| `NotificationPoller` → `TelegramBotService` | `EventEmitter` named events | Loose coupling; `NotificationPoller` knows nothing about Telegram |
| `NotificationPoller` → `DatabaseConnection` | Direct synchronous call (`getBudgetAlertStatus`) | Existing method, no changes |
| `NotificationPoller` → `GsdRegistryService` | Direct async call (`getRegistry()`) | Gets list of active sessions to poll |
| `NotificationPoller` → tmux | `execFileAsync('tmux', ['capture-pane', ...])` | Same pattern as existing `gsdRoutes.ts` line 76 |
| `TelegramBotService` → `OpenClawConfigReader` | Direct async call (`getTopicMappings()`) | Already-cached, 30s TTL |
| `TelegramBotService` → `TmuxSessionManager` | Direct async call (`sendPromptToSession`) | Existing method; sends `'1'` + Enter |
| `TelegramBotService` → `NotificationDeduplicator` | Direct synchronous call | In-memory cooldown gate |
| `TelegramBotService` → Telegram Bot API | grammy long polling (`bot.start()`) | Outbound HTTPS only; no inbound port needed |
| Client → `notificationRoutes` | REST `GET/PUT /api/notifications/config` | Standard JSON, same pattern as `budget-config` routes |
| `notificationRoutes` → `TelegramBotService` | Direct call to update cooldown | After DB write; keeps deduplicator in sync |
| `src/server/index.ts` → new services | Instantiation + `start()`/`stop()` calls | Follow existing pattern: `instanceTracker.startPeriodicSync()` |

---

## Scaling Considerations

Single-operator tool. These are informational.

| Concern | Approach |
|---------|----------|
| Telegram rate limits | ~30 messages/second per bot is the limit. NotificationPoller runs every 10s with ~5 agents max. Zero risk of hitting rate limits. |
| `tmux capture-pane` cost | ~5 agents × 1 exec per 10s = 0.5 execs/second. Negligible. Same load as existing `gsdRoutes` live-status polling. |
| grammy long polling timeout | Default 30s long poll. One HTTPS connection held open. Zero impact on Express or Socket.IO. |
| Bot unavailable (no token) | `TelegramBotService.start()` skips if token missing. All other Warden features continue normally. |
| Telegram outage | `bot.start()` auto-retries with exponential backoff (grammy built-in behavior). NotificationPoller keeps running; events queue in memory as EventEmitter emissions that fail silently. |

---

## Sources

All code analysis findings are HIGH confidence (direct source inspection):

- `src/server/routes/gsdRoutes.ts` — `detectAgentState()`, `extractContextPressure()`, `tmux capture-pane` usage pattern (lines 29-111)
- `src/server/services/TerminalStreamService.ts` — PTY lifecycle, 30s keep-alive behavior, `onData` tap pattern
- `src/server/services/InstanceTracker.ts` — 10s polling pattern; `NotificationPoller` adopts same interval
- `src/server/services/OpenClawConfigReader.ts` — `getTopicMappings()` returning `{ agentId, groupId, topicId }`
- `src/server/services/TmuxSessionManager.ts` — `sendPromptToSession(sessionName, prompt)` existing implementation
- `src/server/database/DatabaseConnection.ts` — `getBudgetAlertStatus()`, `budget_config` singleton-row pattern
- `src/shared/types.ts` — `BudgetAlertStatus`, `AgentInstance` interfaces
- `src/shared/openclawTypes.ts` — `TopicMapping` interface
- `src/client/hooks/useBrowserNotifications.ts` — transition-only detection pattern (refs for previous state tracking) to replicate server-side
- `src/client/hooks/useBudgetAlerts.ts` — budget alert polling pattern; server-side equivalent in NotificationPoller
- `.planning/PROJECT.md` — v3.3 milestone scope; "separate notification-only bot" note; out-of-scope items

grammy library (MEDIUM confidence — official docs + npm):
- [grammy.dev official documentation](https://grammy.dev/guide/)
- [grammy.dev deployment types — long polling](https://grammy.dev/guide/deployment-types)
- [grammy npm package](https://www.npmjs.com/package/grammy)

node-telegram-bot-api callback issues (MEDIUM confidence — GitHub issues):
- [Issue #306 — Inline Keyboard, Callback_query not being called](https://github.com/yagop/node-telegram-bot-api/issues/306)
- [Issue #621 — Callback query not triggering](https://github.com/yagop/node-telegram-bot-api/issues/621)

---

*Architecture research for: Warden v3.3 — Telegram Bot Operator Awareness Integration*
*Researched: 2026-03-04*
