# Phase 33: Permission Prompt Detection and Forwarding - Research

**Researched:** 2026-03-04
**Domain:** tmux pane polling, agent state detection, Telegram topic notification routing
**Confidence:** HIGH

---

## Summary

Phase 33 implements a server-side `NotificationPoller` service that polls every 10 seconds via `tmux capture-pane`, detects when a Claude Code session enters a permission prompt state, and sends a Telegram message to the agent's configured topic. All components are server-side and operate independently of whether the browser is open.

Three new constructs are required: (1) a shared utility `agentStateDetection.ts` (extracted and narrowed from `gsdRoutes.ts`), (2) a `NotificationPoller` singleton service (mirrors the `InstanceTracker` pattern), and (3) a `NotificationDeduplicator` module (in-memory Map tracking per-session state + timestamps). Additionally, `TelegramBotService` gains a `sendToTopic()` method, and `strip-ansi` v7 (ESM) is installed as an explicit production dependency for ANSI stripping of pane output before Telegram message composition.

The `detectAgentState()` function already exists in `gsdRoutes.ts` with the regex `/Do you want to proceed\?|❯\s*1\.\s*Yes/i` for `permission_prompt` detection. The research flag in `STATE.md` advises verifying this regex against a real permission prompt pane — this should be done in Phase 33 Wave 0 before finalizing the regex. The routing chain is: `tmuxSessionName → agentId → openClawConfigReader.getTopicMappings() → {groupId, topicId} → bot.api.sendMessage(groupId, text, { message_thread_id: parseInt(topicId) })`.

**Primary recommendation:** Extract `detectAgentState()` to a shared utility, build `NotificationPoller` as a singleton service wired into `index.ts`, use in-memory `NotificationDeduplicator` with state-transition detection (PERM-04) as the primary suppression mechanism and a 2-minute cooldown (PERM-05) as secondary protection, and install `strip-ansi@^7.1.0` as an explicit production dependency.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERM-01 | Operator receives Telegram notification when any agent enters permission prompt state | `NotificationPoller` polls `tmux capture-pane` every 10s; TelegramBotService.sendToTopic() fires on state entry; works without browser open |
| PERM-02 | Notification sent to agent's configured Telegram topic with pane excerpt (ANSI-stripped) | `openClawConfigReader.getTopicMappings()` resolves agentId → {groupId, topicId}; `strip-ansi@^7.1.0` strips escape codes; `bot.api.sendMessage(groupId, text, { message_thread_id })` routes to topic |
| PERM-03 | Detection runs via tmux capture-pane polling (works without browser open) | `execFileAsync('tmux', ['capture-pane', '-pt', sessionName, '-S', '-20'])` is independent of PTY/socket connections |
| PERM-04 | Only state transitions trigger notifications (entering permission state, not sustained) | `NotificationDeduplicator` tracks `previousState` per session; fires only when transitioning FROM non-permission TO permission; sustained state = no further notification |
| PERM-05 | Duplicate notifications suppressed within configurable cooldown (default 2 min) | In-memory `Map<sessionName, {state, lastNotifiedAt}>` with `PERMISSION_COOLDOWN_MS = 2 * 60 * 1000`; on state exit, reset `lastNotifiedAt` so re-entry fires a new notification (success criteria 5) |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | ^1.41.1 | Telegram message sending via `bot.api.sendMessage()` with `message_thread_id` | Already installed (Phase 32); `sendMessage` supports `message_thread_id` for topic routing — confirmed in `@grammyjs/types` |
| strip-ansi | ^7.1.0 | Strip ANSI escape codes from tmux pane output before Telegram message | v7 is ESM-native (project is `"type": "module"`); v6 is CJS-only (currently installed as transitive dev dep — NOT safe to import in ESM server code without `createRequire` workaround) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| child_process.execFile | Node built-in | `tmux capture-pane -pt session -S -20` for pane capture | Already used in `gsdRoutes.ts` for the same purpose — replicate same pattern |
| better-sqlite3 | ^11.0.0 | No new tables in Phase 33; cooldown is in-memory | `notification_config` table is Phase 35 (NSET-03); Phase 33 uses in-memory Map only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| strip-ansi v7 (ESM) | `createRequire` to import v6 CJS | `createRequire` workaround works but adds complexity; v7 is the clean ESM-native solution; v7 is only used server-side so no bundler issues |
| strip-ansi v7 | Hand-rolled regex `text.replace(/\x1B\[[0-9;]*m/g, '')` | Regex misses hyperlink sequences, cursor movement, and other non-color ANSI codes that appear in tmux pane output |
| In-memory deduplicator | SQLite cooldown table | Database adds persistence across restarts but `notification_config` UI (NSET-03) is Phase 35; in-memory is correct for Phase 33 |
| Per-session state tracking | Global last-notification timestamp | Per-session is required by PERM-04 and success criteria 4 (two agents simultaneously = separate notifications each) |

**Installation:**
```bash
npm install strip-ansi@^7.1.0
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/server/
├── services/
│   ├── TelegramBotService.ts      # existing — add sendToTopic() method
│   ├── NotificationPoller.ts      # NEW — polling loop + orchestration
│   └── NotificationDeduplicator.ts # NEW — state tracking + cooldown
├── utils/
│   └── agentStateDetection.ts     # NEW — detectAgentState() extracted from gsdRoutes.ts
└── index.ts                       # wire NotificationPoller start/stop

tests/unit/
└── NotificationPoller.test.ts     # NEW — covers PERM-01 to PERM-05
```

### Pattern 1: NotificationPoller as Singleton Service

**What:** Mirrors `InstanceTracker` exactly — `startPolling()` / `stopPolling()` lifecycle methods, `setInterval`-based 10-second loop, dependency-injected services.

**When to use:** Always — matches every other long-running service in the codebase.

**Example:**
```typescript
// src/server/services/NotificationPoller.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import stripAnsi from 'strip-ansi';
import { instanceTracker } from './InstanceTracker.js';
import { telegramBotService } from './TelegramBotService.js';
import { openClawConfigReader } from './OpenClawConfigReader.js';
import { detectAgentState } from '../utils/agentStateDetection.js';
import { NotificationDeduplicator } from './NotificationDeduplicator.js';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 10_000;
const PANE_LINES = 20;

export class NotificationPoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private deduplicator = new NotificationDeduplicator();

  startPolling(): void {
    this.pollInterval = setInterval(() => { void this.pollAllSessions(); }, POLL_INTERVAL_MS);
    console.log('[NotificationPoller] Started polling every 10s');
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async pollAllSessions(): Promise<void> {
    const instances = instanceTracker.listActiveInstances();
    await Promise.allSettled(
      instances.map(instance => this.pollSession(instance.tmuxSessionName, instance.agentId))
    );
  }

  private async pollSession(sessionName: string, agentId: string): Promise<void> {
    try {
      const { stdout } = await execFileAsync('tmux', [
        'capture-pane', '-pt', `${sessionName}:0.0`, '-S', `-${PANE_LINES}`,
      ]);
      const state = detectAgentState(stdout);
      const shouldNotify = this.deduplicator.recordAndCheck(sessionName, state);

      if (shouldNotify) {
        const excerpt = stripAnsi(stdout).trim().slice(-500);
        await this.sendPermissionNotification(agentId, sessionName, excerpt);
      }
    } catch {
      // Dead session — ignore silently
    }
  }

  private async sendPermissionNotification(
    agentId: string,
    sessionName: string,
    excerpt: string,
  ): Promise<void> {
    try {
      const mappings = await openClawConfigReader.getTopicMappings();
      const mapping = mappings.find(m => m.agentId === agentId);

      if (!mapping) {
        console.warn(`[NotificationPoller] No Telegram topic configured for agent: ${agentId}`);
        return;
      }

      const text = `[${agentId}] Permission prompt detected in ${sessionName}:\n\`\`\`\n${excerpt}\n\`\`\``;
      await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    } catch (error) {
      console.error(`[NotificationPoller] Failed to send notification for ${agentId}:`, error);
    }
  }
}

export const notificationPoller = new NotificationPoller();
```

### Pattern 2: NotificationDeduplicator — State Transition Detection

**What:** In-memory Map tracking `{previousState, lastNotifiedAt}` per session. Returns `true` only when transitioning INTO `permission_prompt` from a non-permission state and outside cooldown window.

**When to use:** Always called by `NotificationPoller.pollSession()`.

**Example:**
```typescript
// src/server/services/NotificationDeduplicator.ts
import type { AgentStateHint } from '../../shared/gsdTypes.js';

const PERMISSION_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

interface SessionRecord {
  previousState: AgentStateHint | null;
  lastNotifiedAt: number | null;
}

export class NotificationDeduplicator {
  private records = new Map<string, SessionRecord>();

  /**
   * Record the current state for sessionName and return true if a
   * permission_prompt notification should be fired.
   *
   * Fires when:
   * - New state is 'permission_prompt'
   * - Previous state was NOT 'permission_prompt' (state transition, PERM-04)
   * - Last notification was > PERMISSION_COOLDOWN_MS ago (PERM-05)
   *
   * Resets lastNotifiedAt when session exits permission_prompt state,
   * so re-entry fires a new notification (success criteria 5).
   */
  recordAndCheck(sessionName: string, state: AgentStateHint): boolean {
    const record = this.records.get(sessionName) ?? { previousState: null, lastNotifiedAt: null };
    const now = Date.now();

    let shouldFire = false;

    if (state === 'permission_prompt') {
      const wasAlreadyInPermissionState = record.previousState === 'permission_prompt';
      const isWithinCooldown =
        record.lastNotifiedAt !== null && now - record.lastNotifiedAt < PERMISSION_COOLDOWN_MS;

      if (!wasAlreadyInPermissionState && !isWithinCooldown) {
        shouldFire = true;
        record.lastNotifiedAt = now;
      }
    } else {
      // Exiting permission state — reset so re-entry triggers a new notification (success criteria 5)
      if (record.previousState === 'permission_prompt') {
        record.lastNotifiedAt = null;
      }
    }

    record.previousState = state;
    this.records.set(sessionName, record);
    return shouldFire;
  }

  /** Remove all tracking state — used in tests and graceful shutdown */
  clear(): void {
    this.records.clear();
  }
}
```

### Pattern 3: TelegramBotService.sendToTopic()

**What:** Add `sendToTopic(chatId: string, topicId: string, text: string)` to `TelegramBotService`. Method is a no-op when bot is not running.

**Example:**
```typescript
// Addition to TelegramBotService
async sendToTopic(chatId: string, topicId: string, text: string): Promise<void> {
  if (!this.bot) {
    console.warn('[TelegramBot] sendToTopic called but bot is not running — skipping');
    return;
  }
  try {
    await this.bot.api.sendMessage(chatId, text, {
      message_thread_id: parseInt(topicId, 10),
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error(`[TelegramBot] Failed to send to topic ${topicId}:`, error);
  }
}
```

**grammy API confirmation:** `bot.api.sendMessage(chat_id, text, other)` where `other` is typed from `@grammyjs/types` and includes `message_thread_id?: number`. Verified in `node_modules/@grammyjs/types/methods.d.ts`.

### Pattern 4: agentStateDetection.ts Utility

**What:** Extract `detectAgentState()` from `gsdRoutes.ts` to a shared utility. The existing function in `gsdRoutes.ts` still imports from the new location (no behavior change there). Both `gsdRoutes.ts` and `NotificationPoller.ts` import from the shared utility.

**Example:**
```typescript
// src/server/utils/agentStateDetection.ts
import type { AgentStateHint } from '../../shared/gsdTypes.js';

export function detectAgentState(pane: string): AgentStateHint {
  if (/enter to select|numbered.*option/i.test(pane)) return 'menu';
  if (/Do you want to proceed\?|❯\s*1\.\s*Yes/i.test(pane)) return 'permission_prompt';
  if (/what can i help|waiting for/i.test(pane)) return 'idle';
  const lines = pane.split('\n');
  for (const line of lines) {
    if (/error|failed|exception/i.test(line) && !/error handling/i.test(line)) {
      return 'error';
    }
  }
  return 'working';
}
```

**Research flag (from STATE.md):** Verify the `❯\s*1\.\s*Yes` regex against a real Claude Code permission prompt pane capture before finalizing. The prompt may include ANSI sequences around the `❯` cursor. Run `tmux capture-pane -pt <session>:0.0 -S -20 | cat -v` during a permission prompt to inspect raw bytes. If ANSI sequences appear between `❯` and `1`, apply `stripAnsi()` before the regex test, or adjust the regex to tolerate ANSI in the pattern.

### Pattern 5: Wiring into index.ts

**What:** Start `notificationPoller` after `telegramBotService.start()` (so bot is ready); stop it before `telegramBotService.stop()` in `handleShutdown()`.

**Example:**
```typescript
// src/server/index.ts additions
import { notificationPoller } from './services/NotificationPoller.js';

// After existing service starts:
telegramBotService.start();
notificationPoller.startPolling();   // ADD — depends on telegramBotService being started first

// In handleShutdown():
notificationPoller.stopPolling();    // ADD — stop before telegramBotService.stop()
await telegramBotService.stop();
```

### Anti-Patterns to Avoid

- **Polling via PTY onData (TerminalStreamService):** Only active when browser is connected. `tmux capture-pane` is the correct approach (PERM-03 explicitly requires this).
- **Shared singleton NotificationDeduplicator:** The deduplicator is instantiated inside `NotificationPoller` (composition), not as a module-level singleton. This makes it easy to reset in tests.
- **Sending raw (ANSI-colored) tmux output to Telegram:** Telegram does not render ANSI codes — they appear as garbled `^[[31m` text. Always `stripAnsi()` before composing the message.
- **Awaiting all topic mapping lookups in parallel without caching:** `openClawConfigReader.getTopicMappings()` already has a 30-second cache — safe to call per-poll without concern.
- **parseInt(topicId) without radix:** Always pass `10` as the radix to `parseInt(topicId, 10)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Custom regex `/\x1B\[[0-9;]*m/g` | `strip-ansi@^7.1.0` | Regex misses OSC (hyperlink), cursor, erase sequences that appear in real tmux pane output — `strip-ansi` handles all ANSI/VT100 sequences correctly |
| Telegram topic routing | Custom Telegram API fetch | `bot.api.sendMessage()` with `message_thread_id` | grammy already handles auth, rate limits (via autoRetry), and error recovery |
| Polling loop | Manual `while(true)` with `await sleep()` | `setInterval` pattern (same as `InstanceTracker`) | `setInterval` is established pattern in codebase; no new primitives needed |

**Key insight:** The hardest part of this phase is NOT the Telegram sending — grammy handles that trivially. The complexity is in the state-transition deduplication logic (PERM-04/PERM-05 interaction). Focus testing effort there.

---

## Common Pitfalls

### Pitfall 1: ANSI Codes in Permission Prompt Regex Match
**What goes wrong:** The `detectAgentState()` regex matches against raw tmux pane output that contains ANSI sequences. The `❯` cursor character may be surrounded by color codes (`\x1b[32m❯\x1b[0m`), causing the regex to fail.
**Why it happens:** `tmux capture-pane` returns raw terminal output including all ANSI escape codes. The current regex `/❯\s*1\.\s*Yes/i` assumes the cursor is a plain Unicode character.
**How to avoid:** Before running `detectAgentState()`, apply `stripAnsi()` to the pane content. This also ensures the extracted excerpt in the notification is clean.
**Warning signs:** Permission prompts visible in the terminal but notifications never fire. Verify with: `tmux capture-pane -pt <session>:0.0 -S -20 | cat -v | grep '1. Yes'`

### Pitfall 2: Notification Fires on Every Poll While Stalled (PERM-04 violation)
**What goes wrong:** Operator receives 30+ notifications during a 5-minute permission stall (one per poll).
**Why it happens:** State comparison compares against initial null, not against `'permission_prompt'`. Or the `previousState` is updated AFTER the notification check instead of before.
**How to avoid:** In `recordAndCheck()`, check if `previousState === 'permission_prompt'` BEFORE deciding to fire. Update `previousState` at the END of the method (after the decision).
**Warning signs:** Multiple identical Telegram messages for the same session within minutes.

### Pitfall 3: Re-entry After Exit Silently Suppressed (PERM-05 / success criteria 5 violation)
**What goes wrong:** Agent leaves permission state, re-enters it, but no notification fires because `lastNotifiedAt` still has the old timestamp.
**Why it happens:** `lastNotifiedAt` is only reset at notification time, not when the session exits the permission state.
**How to avoid:** When `state !== 'permission_prompt'` AND `previousState === 'permission_prompt'`, explicitly set `record.lastNotifiedAt = null`. This ensures the next entry fires immediately.
**Warning signs:** Second permission prompt produces no notification in tests.

### Pitfall 4: Both Agents Get No Notification When Stalling Simultaneously (PERM-04 + success criteria 4)
**What goes wrong:** Only one of two simultaneous stalled agents gets notified.
**Why it happens:** Using a shared/global deduplicator state rather than per-session state.
**How to avoid:** Deduplicator uses `Map<sessionName, ...>` — each session has independent state. `Promise.allSettled()` in `pollAllSessions()` ensures both sessions are polled.
**Warning signs:** In tests with two sessions both in permission_prompt, only one notification fires.

### Pitfall 5: strip-ansi v6 CJS Import in ESM Server Code
**What goes wrong:** TypeScript/Node.js compilation error or runtime error when importing `strip-ansi` in `NotificationPoller.ts`.
**Why it happens:** `strip-ansi` v6 is CJS-only. The project is `"type": "module"`. The v6 package is currently installed as a transitive dev dependency of other packages — it's not safe to import directly in ESM server code.
**How to avoid:** Install `strip-ansi@^7.1.0` as an explicit production dependency. Import as `import stripAnsi from 'strip-ansi';`. v7.1.0 is ESM-native.
**Warning signs:** `ERR_REQUIRE_ESM` or type error on `require('strip-ansi')` during build.

### Pitfall 6: Dead Session tmux capture-pane Errors Propagate
**What goes wrong:** When a session exits between the `listActiveInstances()` call and the `capture-pane` call, `execFileAsync` throws. If not caught, it surfaces as an unhandled rejection.
**Why it happens:** Race condition between poll cycles and session lifecycle.
**How to avoid:** Wrap each `pollSession()` in try/catch and swallow the error silently. `Promise.allSettled()` in `pollAllSessions()` prevents one failed session from blocking others.
**Warning signs:** `[NotificationPoller]` errors in logs for sessions that just stopped.

---

## Code Examples

Verified patterns from official sources:

### tmux capture-pane (same pattern as gsdRoutes.ts)
```typescript
// Source: existing src/server/routes/gsdRoutes.ts (proven pattern)
const { stdout } = await execFileAsync('tmux', [
  'capture-pane', '-pt', `${sessionName}:0.0`, '-S', '-20',
]);
```

### grammy sendMessage to topic (confirmed in @grammyjs/types/methods.d.ts)
```typescript
// Source: node_modules/@grammyjs/types/methods.d.ts — message_thread_id is optional on sendMessage
await bot.api.sendMessage(chatId, text, {
  message_thread_id: parseInt(topicId, 10),
  parse_mode: 'Markdown',
});
```

### strip-ansi v7 ESM import
```typescript
// Source: strip-ansi v7.1.0 (ESM-native, "type": "module")
import stripAnsi from 'strip-ansi';
const cleanText = stripAnsi(rawPaneOutput);
```

### TopicMapping lookup chain
```typescript
// Source: OpenClawConfigReader.getTopicMappings() → TopicMapping (src/shared/openclawTypes.ts)
const mappings = await openClawConfigReader.getTopicMappings();
const mapping = mappings.find(m => m.agentId === agentId);
if (!mapping) {
  console.warn(`[NotificationPoller] No Telegram topic for agent: ${agentId}`);
  return;
}
// mapping.groupId = Telegram chat ID (e.g. "-100123456789")
// mapping.topicId = Telegram thread ID (e.g. "42")
await bot.api.sendMessage(mapping.groupId, text, {
  message_thread_id: parseInt(mapping.topicId, 10),
});
```

### State transition detection (core deduplication logic)
```typescript
// Correct implementation of PERM-04 + PERM-05 interaction
recordAndCheck(sessionName: string, state: AgentStateHint): boolean {
  const record = this.records.get(sessionName) ?? { previousState: null, lastNotifiedAt: null };
  const now = Date.now();
  let shouldFire = false;

  if (state === 'permission_prompt') {
    const wasAlreadyPermission = record.previousState === 'permission_prompt';
    const withinCooldown =
      record.lastNotifiedAt !== null && now - record.lastNotifiedAt < PERMISSION_COOLDOWN_MS;

    if (!wasAlreadyPermission && !withinCooldown) {
      shouldFire = true;
      record.lastNotifiedAt = now;
    }
  } else if (record.previousState === 'permission_prompt') {
    // Exiting permission state — reset so re-entry fires (success criteria 5)
    record.lastNotifiedAt = null;
  }

  record.previousState = state;
  this.records.set(sessionName, record);
  return shouldFire;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| PTY onData for state detection | tmux capture-pane polling | Works without browser open (PERM-03) |
| Single global notification cooldown | Per-session state Map | Enables simultaneous multi-agent notifications (success criteria 4) |
| strip-ansi v6 (CJS) | strip-ansi v7 (ESM) | Clean ESM import in server code; no createRequire workaround |

**Key design constraint:** Phase 33 uses in-memory cooldown only (constant = 2 min). Persistent notification preferences (configurable via UI) are Phase 35 (NSET-01, NSET-02, NSET-03). The `notification_config` SQLite table is NOT created in Phase 33.

---

## Open Questions

1. **Permission prompt regex accuracy against real ANSI output**
   - What we know: Current regex is `/Do you want to proceed\?|❯\s*1\.\s*Yes/i` — works on plain text
   - What's unclear: Real Claude Code terminal output wraps `❯` in ANSI color codes; regex may fail on raw pane output
   - Recommendation: In Wave 0, test by running `tmux capture-pane -pt <active-session>:0.0 -S -20 | cat -v` during a real permission prompt. If ANSI codes surround the cursor, strip ANSI before calling `detectAgentState()` (preferred) or adjust the regex. Stripping before detection is cleaner.

2. **Message format for Telegram notification**
   - What we know: PERM-02 requires "ANSI-stripped excerpt"; success criteria 2 says "readable"
   - What's unclear: Exact format (Markdown vs plain, length, header format) not specified in requirements
   - Recommendation: Use last 500 chars of ANSI-stripped pane, wrapped in triple-backtick Markdown code block. Header: `⚠️ [agentId] needs permission`. Validate that `parse_mode: 'Markdown'` handles backtick blocks correctly with grammy (no escaping needed for code blocks in standard Markdown mode).

3. **topicId type: string vs number in TopicMapping**
   - What we know: `TopicMapping.topicId` is typed as `string` in `openclawTypes.ts`; `message_thread_id` in grammy is `number`
   - What's unclear: Whether topicId in openclaw config is always a valid integer string
   - Recommendation: Use `parseInt(topicId, 10)` in `sendToTopic()`; validate result is a finite integer; log warning and skip if `NaN`.

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
| PERM-01 | NotificationPoller fires notification when agent enters permission_prompt | unit (mock tmux + mock bot) | `npm run test -- tests/unit/NotificationPoller.test.ts` | No — Wave 0 gap |
| PERM-02 | Notification goes to correct Telegram topic; excerpt is ANSI-stripped | unit (spy on sendToTopic) | `npm run test -- tests/unit/NotificationPoller.test.ts` | No — Wave 0 gap |
| PERM-03 | Detection uses tmux capture-pane, not PTY onData | unit (verify execFileAsync called with 'tmux', 'capture-pane') | `npm run test -- tests/unit/NotificationPoller.test.ts` | No — Wave 0 gap |
| PERM-04 | Sustained permission state produces exactly one notification | unit (NotificationDeduplicator state machine) | `npm run test -- tests/unit/NotificationDeduplicator.test.ts` | No — Wave 0 gap |
| PERM-05 | Re-entry after exit fires new notification; sustained state does not re-notify | unit (NotificationDeduplicator cooldown reset) | `npm run test -- tests/unit/NotificationDeduplicator.test.ts` | No — Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd:verify-work` runs
- **Estimated feedback latency per task:** ~5 seconds

### Wave 0 Gaps (must be created before implementation)

- [ ] `tests/unit/NotificationDeduplicator.test.ts` — covers PERM-04 and PERM-05 logic with pure unit tests (no mocking required — pure in-memory class)
- [ ] `tests/unit/NotificationPoller.test.ts` — covers PERM-01, PERM-02, PERM-03 using `vi.mock('child_process')` for execFileAsync and mocking `telegramBotService` and `openClawConfigReader`

*(Existing vitest infrastructure in place — only test files are missing)*

---

## Sources

### Primary (HIGH confidence)
- `src/server/routes/gsdRoutes.ts` — existing `detectAgentState()` implementation; `tmux capture-pane` usage pattern
- `src/server/services/InstanceTracker.ts` — polling singleton pattern to replicate for `NotificationPoller`
- `src/server/services/TelegramBotService.ts` — existing bot lifecycle; `bot.api` access pattern
- `src/shared/openclawTypes.ts` — `TopicMapping` type: `{agentId, groupId, topicId}` for notification routing
- `node_modules/@grammyjs/types/methods.d.ts` — confirmed `sendMessage` includes `message_thread_id?: number` in params
- `node_modules/grammy/out/core/api.js` — confirmed `sendMessage(chat_id, text, other)` helper wrapping raw API

### Secondary (MEDIUM confidence)
- strip-ansi v6 package.json: `"version": "6.0.1"`, no `"type"` field (CJS) — installed as transitive dev dep only
- strip-ansi v7 npm info: `"type": "module"` confirmed ESM-native; latest v7.1.0

### Tertiary (LOW confidence)
- None — all critical claims verified against codebase files and npm registry

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — grammy topic routing confirmed in types; strip-ansi v7 confirmed ESM; polling pattern confirmed in existing codebase
- Architecture: HIGH — all patterns derived from existing codebase (InstanceTracker, gsdRoutes, TelegramBotService)
- Pitfalls: HIGH — ANSI-in-regex and state-transition pitfalls derived from requirements analysis and existing code review
- Deduplication logic: HIGH — derived directly from success criteria 3, 4, 5 in phase description

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable libraries; strip-ansi and grammy APIs unlikely to change in minor versions)
