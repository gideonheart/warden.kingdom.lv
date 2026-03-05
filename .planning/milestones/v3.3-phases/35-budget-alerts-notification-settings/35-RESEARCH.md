# Phase 35: Budget Alerts and Notification Settings - Research

**Researched:** 2026-03-04
**Domain:** Budget threshold monitoring, Telegram alert forwarding, server-side notification settings persistence, React settings panel UI
**Confidence:** HIGH

---

## Summary

Phase 35 builds on the fully operational Telegram bot and NotificationPoller infrastructure from Phases 32–34. The core work is: (1) a `BudgetAlertPoller` service that reads budget alert status from the existing `getBudgetAlertStatus()` database method on each 10-second poll cycle, fires Telegram messages when amber (80%) or red (100%) thresholds are crossed, and suppresses repeats within a 10-minute cooldown, and (2) a `notification_config` SQLite table (singleton-row pattern) that persists operator preferences — enabled/disabled per notification type, cooldown durations — so they survive restarts and take effect without a server restart.

The existing `NotificationDeduplicator` handles per-session state transitions well but is not directly applicable to budget alerts, which are per-agent percentage-level events rather than state-machine transitions. A separate, simpler `BudgetAlertDeduplicator` (or in-memory Map directly in `BudgetAlertPoller`) is the correct approach: track `{agentId → {level, lastAlertedAt}}` and fire only when the level escalates OR the cooldown expires.

For the Notification Settings UI, the pattern is identical to the recording `RotationConfig` settings panel: a React component fetches current settings via GET, renders toggles and number inputs, and PUTs changes back to the API immediately on change. Settings take effect server-side on the next poll cycle because the poller reads config from the database (not from memory) on each poll cycle — no restart required.

The `TelegramBotService.isRunning()` method already exists and returns the bot connection status; the UI can consume this via a new `/api/notifications/config` endpoint that includes `botConnected: boolean`.

**Primary recommendation:** Build `BudgetAlertPoller` as a new singleton service following the `NotificationPoller` pattern; add `notification_config` singleton-row SQLite table following the `rotation_config` pattern; add a `NotificationSettingsPanel` React component using the budget config fetch/PUT pattern from `TokenUsageView`; wire everything through `index.ts` and `historyRoutes.ts` (or a new `notificationRoutes.ts`).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUDG-01 | Operator receives Telegram notification when agent reaches budget threshold (amber 80% / red 100%) | `getBudgetAlertStatus()` already returns per-agent `alertLevel` ('ok'/'warning'/'exceeded'); `BudgetAlertPoller` polls this every 10s; fires via `TelegramBotService.sendToTopic()` with distinct amber vs red formatting |
| BUDG-02 | Budget notifications suppressed within separate cooldown (default 10 min) | In-memory Map `{agentId → {level, lastAlertedAt}}` in `BudgetAlertPoller`; fires only on level escalation OR if > cooldown since last alert; cooldown duration read from `notification_config` table on each poll cycle |
| NSET-01 | Dashboard panel with toggles per notification type (permission prompts, budget alerts) | New `NotificationSettingsPanel` React component in `HistoryView`; fetches `/api/notifications/config`; PUTs changes immediately; same pattern as `RotationConfig` UI |
| NSET-02 | Configurable cooldown windows per notification type in settings panel | `notification_config` stores `permission_cooldown_ms` and `budget_cooldown_ms` as INTEGER columns; UI renders number inputs (minutes); saves via PUT API |
| NSET-03 | Notification preferences persisted in SQLite `notification_config` table | Singleton-row table (id = 1 CHECK constraint) following `rotation_config` pattern; migrated inline in `DatabaseConnection.runMigrations()` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.0.0 | `notification_config` table — GET + UPSERT singleton row | Already installed; same pattern used for `rotation_config` and `budget_config` tables |
| grammy | ^1.41.1 | `bot.api.sendMessage()` for budget alert Telegram messages | Already installed; `TelegramBotService.sendToTopic()` is the correct method to reuse |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 | ^19.0.0 | `NotificationSettingsPanel` component | Already in use throughout client — follow existing component patterns |
| Express 5 | ^5.0.0 | New notification config API routes | Already in use; add to `historyRoutes.ts` or new `notificationRoutes.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Singleton-row `notification_config` | Per-type rows with a `type` discriminator column | Singleton-row is simpler and already the established pattern for `rotation_config`; use it |
| Reading config from DB on each poll | Caching config in service memory | DB-read per poll is simpler and guarantees settings take effect immediately without restart; better-sqlite3 synchronous reads are fast enough for a 10s interval |
| New `notificationRoutes.ts` | Adding to `historyRoutes.ts` | Either works; `historyRoutes.ts` already has budget config endpoints — extending it is DRY. However, a dedicated `notificationRoutes.ts` keeps notification concerns separate. Prefer new file for clarity. |

**Installation:**
```bash
# No new packages needed — all required libraries are already installed
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/server/
├── services/
│   ├── BudgetAlertPoller.ts         # NEW — polls budget status, fires Telegram on threshold breach
│   └── NotificationPoller.ts        # EXISTING — needs config-aware cooldown (reads from DB)
├── routes/
│   └── notificationRoutes.ts        # NEW — GET/PUT /api/notifications/config
└── database/
    └── DatabaseConnection.ts        # ADD — notification_config migration + get/set methods

src/client/components/
└── NotificationSettingsPanel.tsx    # NEW — toggles + cooldown inputs + bot status indicator

tests/unit/
└── BudgetAlertPoller.test.ts        # NEW — covers BUDG-01, BUDG-02
```

### Pattern 1: BudgetAlertPoller Singleton Service

**What:** Mirrors `NotificationPoller` but polls `database.getBudgetAlertStatus()` (synchronous SQLite read) rather than `tmux capture-pane`. No child process spawning needed.

**When to use:** Always — runs alongside `NotificationPoller` on the same 10-second interval.

**Example:**
```typescript
// src/server/services/BudgetAlertPoller.ts
import { database } from '../database/DatabaseConnection.js';
import { telegramBotService } from './TelegramBotService.js';
import { openClawConfigReader } from './OpenClawConfigReader.js';

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_BUDGET_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

type BudgetLevel = 'ok' | 'warning' | 'exceeded';

interface AgentBudgetRecord {
  level: BudgetLevel;
  lastAlertedAt: number | null;
}

export class BudgetAlertPoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private records = new Map<string, AgentBudgetRecord>();

  startPolling(): void {
    console.log('[BudgetAlertPoller] Starting budget threshold polling (10s interval)');
    void this.pollBudgets();
    this.pollInterval = setInterval(() => { void this.pollBudgets(); }, POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[BudgetAlertPoller] Stopped budget threshold polling');
    }
  }

  private async pollBudgets(): Promise<void> {
    // Read notification config from DB on every cycle — ensures UI changes take effect immediately
    const config = database.getNotificationConfig();
    if (!config.budgetAlertsEnabled) return;

    const statuses = database.getBudgetAlertStatus();
    await Promise.allSettled(statuses.map((status) => this.checkAgent(status, config.budgetCooldownMs)));
  }

  private async checkAgent(
    status: { agentId: string; alertLevel: BudgetLevel; budgetPct: number; todayCostUsd: number; dailyBudgetUsd: number },
    cooldownMs: number,
  ): Promise<void> {
    const level = status.alertLevel;
    if (level === 'ok') {
      // Reset record on return to ok — allows re-alerting on next threshold breach
      this.records.delete(status.agentId);
      return;
    }

    const record = this.records.get(status.agentId) ?? { level: 'ok', lastAlertedAt: null };
    const now = Date.now();
    const isEscalation = this.isLevelEscalation(record.level, level);
    const cooldownExpired = record.lastAlertedAt === null || (now - record.lastAlertedAt >= cooldownMs);

    if (!isEscalation && !cooldownExpired) return; // Suppress within cooldown

    record.level = level;
    record.lastAlertedAt = now;
    this.records.set(status.agentId, record);

    await this.sendBudgetAlert(status.agentId, level, status.budgetPct, status.todayCostUsd, status.dailyBudgetUsd);
  }

  private isLevelEscalation(previous: BudgetLevel, current: BudgetLevel): boolean {
    // Escalation: ok→warning, ok→exceeded, warning→exceeded
    if (previous === 'ok' && (current === 'warning' || current === 'exceeded')) return true;
    if (previous === 'warning' && current === 'exceeded') return true;
    return false;
  }

  private async sendBudgetAlert(
    agentId: string,
    level: BudgetLevel,
    budgetPct: number,
    todayCostUsd: number,
    dailyBudgetUsd: number,
  ): Promise<void> {
    try {
      const mappings = await openClawConfigReader.getTopicMappings();
      const mapping = mappings.find((m) => m.agentId === agentId);
      if (!mapping) return;

      const emoji = level === 'exceeded' ? '🔴' : '🟡';
      const label = level === 'exceeded' ? 'EXCEEDED' : 'WARNING';
      const text =
        `${emoji} *Budget ${label}* — ${agentId}\n\n` +
        `Today: \`$${todayCostUsd.toFixed(2)}\` / \`$${dailyBudgetUsd.toFixed(2)}\` (${budgetPct.toFixed(1)}%)`;

      await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    } catch (error) {
      console.error(`[BudgetAlertPoller] Failed to send budget alert for ${agentId}:`, error);
    }
  }
}

export const budgetAlertPoller = new BudgetAlertPoller();
```

### Pattern 2: notification_config Singleton-Row Table (following rotation_config)

**What:** Single row (id = 1, enforced by CHECK constraint) storing all notification preferences. Methods: `getNotificationConfig()` and `setNotificationConfig()`.

**When to use:** Always — read on every poll cycle by both `BudgetAlertPoller` and `NotificationPoller` to honor current settings.

**Example:**
```typescript
// Addition to DatabaseConnection.runMigrations()
this.db.exec(`
  CREATE TABLE IF NOT EXISTS notification_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    permission_alerts_enabled INTEGER NOT NULL DEFAULT 1,
    budget_alerts_enabled INTEGER NOT NULL DEFAULT 1,
    permission_cooldown_ms INTEGER NOT NULL DEFAULT 120000,
    budget_cooldown_ms INTEGER NOT NULL DEFAULT 600000,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Method additions to DatabaseConnection class
getNotificationConfig(): NotificationConfig {
  const row = this.db.prepare(
    'SELECT permission_alerts_enabled AS permissionAlertsEnabled, budget_alerts_enabled AS budgetAlertsEnabled, permission_cooldown_ms AS permissionCooldownMs, budget_cooldown_ms AS budgetCooldownMs FROM notification_config WHERE id = 1'
  ).get() as { permissionAlertsEnabled: number; budgetAlertsEnabled: number; permissionCooldownMs: number; budgetCooldownMs: number } | undefined;

  return {
    permissionAlertsEnabled: (row?.permissionAlertsEnabled ?? 1) === 1,
    budgetAlertsEnabled: (row?.budgetAlertsEnabled ?? 1) === 1,
    permissionCooldownMs: row?.permissionCooldownMs ?? 120_000,
    budgetCooldownMs: row?.budgetCooldownMs ?? 600_000,
  };
}

setNotificationConfig(config: Partial<NotificationConfig>): void {
  const current = this.getNotificationConfig();
  const merged = { ...current, ...config };
  this.db.prepare(`
    INSERT INTO notification_config (id, permission_alerts_enabled, budget_alerts_enabled, permission_cooldown_ms, budget_cooldown_ms, updated_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      permission_alerts_enabled = excluded.permission_alerts_enabled,
      budget_alerts_enabled = excluded.budget_alerts_enabled,
      permission_cooldown_ms = excluded.permission_cooldown_ms,
      budget_cooldown_ms = excluded.budget_cooldown_ms,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    merged.permissionAlertsEnabled ? 1 : 0,
    merged.budgetAlertsEnabled ? 1 : 0,
    merged.permissionCooldownMs,
    merged.budgetCooldownMs,
  );
}
```

### Pattern 3: NotificationConfig Shared Type

**What:** Add `NotificationConfig` type to `src/shared/types.ts` for use by both server (DatabaseConnection) and client (NotificationSettingsPanel).

**Example:**
```typescript
// Addition to src/shared/types.ts
export interface NotificationConfig {
  permissionAlertsEnabled: boolean;
  budgetAlertsEnabled: boolean;
  permissionCooldownMs: number;
  budgetCooldownMs: number;
}
```

### Pattern 4: Notification API Routes

**What:** New `notificationRoutes.ts` with GET and PUT endpoints. Follows the same pattern as `recordingRoutes.ts` for `rotation_config`.

**Example:**
```typescript
// src/server/routes/notificationRoutes.ts
import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';
import { telegramBotService } from '../services/TelegramBotService.js';

export const notificationRoutes = Router();

notificationRoutes.get('/api/notifications/config', (_request, response) => {
  const config = database.getNotificationConfig();
  response.json({
    ...config,
    botConnected: telegramBotService.isRunning(),
  });
});

notificationRoutes.put('/api/notifications/config', (request, response) => {
  const { permissionAlertsEnabled, budgetAlertsEnabled, permissionCooldownMs, budgetCooldownMs } =
    request.body as Partial<{
      permissionAlertsEnabled: unknown;
      budgetAlertsEnabled: unknown;
      permissionCooldownMs: unknown;
      budgetCooldownMs: unknown;
    }>;

  const patch: Record<string, unknown> = {};
  if (typeof permissionAlertsEnabled === 'boolean') patch.permissionAlertsEnabled = permissionAlertsEnabled;
  if (typeof budgetAlertsEnabled === 'boolean') patch.budgetAlertsEnabled = budgetAlertsEnabled;
  if (typeof permissionCooldownMs === 'number' && Number.isFinite(permissionCooldownMs) && permissionCooldownMs >= 0) {
    patch.permissionCooldownMs = permissionCooldownMs;
  }
  if (typeof budgetCooldownMs === 'number' && Number.isFinite(budgetCooldownMs) && budgetCooldownMs >= 0) {
    patch.budgetCooldownMs = budgetCooldownMs;
  }

  if (Object.keys(patch).length === 0) {
    response.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  database.setNotificationConfig(patch as Parameters<typeof database.setNotificationConfig>[0]);
  response.json({ status: 'ok' });
});
```

### Pattern 5: NotificationSettingsPanel React Component

**What:** New React component in `HistoryView` — accessible as a tab (alongside Sessions, Token Usage, Gateway Logs). Fetches config on mount, renders toggles and cooldown inputs, PUTs on change. Shows bot status indicator.

**When to use:** Rendered as `activeTab === 'notifications'` in `HistoryView.tsx`.

**Example (skeleton):**
```typescript
// src/client/components/NotificationSettingsPanel.tsx
import { useState, useEffect, useCallback } from 'react';
import type { NotificationConfig } from '@shared/types.js';

interface NotificationConfigWithStatus extends NotificationConfig {
  botConnected: boolean;
}

export function NotificationSettingsPanel() {
  const [config, setConfig] = useState<NotificationConfigWithStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const response = await fetch('/api/notifications/config');
    if (response.ok) {
      setConfig(await response.json() as NotificationConfigWithStatus);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveField = useCallback(async (patch: Partial<NotificationConfig>) => {
    setIsSaving(true);
    try {
      await fetch('/api/notifications/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setConfig((prev) => prev ? { ...prev, ...patch } : prev);
    } finally {
      setIsSaving(false);
    }
  }, []);

  if (!config) return <div className="p-4 text-warden-text-dim">Loading...</div>;

  return (
    <div className="p-4 space-y-6">
      {/* Bot connection status */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${config.botConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-warden-text-dim">
          Bot {config.botConnected ? 'connected' : 'disconnected (WARDEN_TELEGRAM_BOT_TOKEN not set)'}
        </span>
      </div>

      {/* Permission alerts toggle */}
      {/* Budget alerts toggle */}
      {/* Permission cooldown input (minutes) */}
      {/* Budget cooldown input (minutes) */}
    </div>
  );
}
```

### Pattern 6: Making NotificationPoller Config-Aware

**What:** `NotificationPoller` currently uses a hardcoded `PERMISSION_COOLDOWN_MS = 2 * 60 * 1000` constant in `NotificationDeduplicator`. To honor NSET-02 (configurable cooldown), the poller must read the `permissionCooldownMs` from the DB on each poll cycle and pass it to the deduplicator.

**The cleanest approach:** `NotificationDeduplicator.recordAndCheck()` already accepts the session state. Add a parameter for cooldown:

Option A: Pass cooldownMs as a parameter to `recordAndCheck()` — requires signature change.
Option B: Set cooldown on the deduplicator before each poll — requires a setter method.
Option C: Have `NotificationPoller.pollBudgets()` read config and pass it through — cleanest for NSET-02.

**Recommendation:** Remove `PERMISSION_COOLDOWN_MS` constant from `NotificationDeduplicator.ts`. Instead, pass it as a parameter to `recordAndCheck(sessionName, state, cooldownMs)`. `NotificationPoller.pollAllSessions()` reads `database.getNotificationConfig()` once per cycle and passes `config.permissionCooldownMs` to each `pollSession()` call.

This change also needs the `permissionAlertsEnabled` toggle: if `config.permissionAlertsEnabled === false`, `pollAllSessions()` returns early.

### Anti-Patterns to Avoid

- **Hardcoded cooldown constants in production code:** Both `NotificationDeduplicator` (PERMISSION_COOLDOWN_MS) and the new `BudgetAlertPoller` must read cooldown from DB config, not from module-level constants. Constants are fine as defaults in DB schema, not in polling logic.
- **Re-sending on every poll at the same level (BUDG-02 violation):** Once `warning` alert fires, the next poll sees `warning` again. Fire only on escalation (ok→warning, ok→exceeded, warning→exceeded) OR if cooldown has expired. Do NOT fire again on sustained `warning` state without cooldown expiry.
- **Comparing timestamps globally rather than per-agent:** Budget alert cooldown is per-agent (each agent has independent budget/threshold state).
- **Bot status from environment check:** `isRunning()` must use `TelegramBotService.isRunning()` (checks `bot?.isRunning()`), not a direct env var check. The env var can be set but the bot may have errored.
- **Mounting NotificationSettingsPanel outside HistoryView:** The settings panel fits naturally as a 4th tab in `HistoryView` ('Notifications'). Do not add a new top-level nav entry.
- **Blocking API response on notification config save:** PUT to `/api/notifications/config` updates SQLite (synchronous) and returns immediately. The next poll cycle picks up changes. No need to signal pollers directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram message sending | Custom fetch to Telegram API | `TelegramBotService.sendToTopic()` | Already handles auth, retry, error logging, bot-not-running no-op |
| Budget status computation | Custom SQL query in poller | `database.getBudgetAlertStatus()` | Already implemented and tested; returns `alertLevel` per agent |
| Topic routing | Custom config parsing | `openClawConfigReader.getTopicMappings()` | Already cached (30s), handles config parsing, returns `{agentId, groupId, topicId}` |
| Singleton-row upsert | Custom INSERT + UPDATE logic | `ON CONFLICT(id) DO UPDATE SET` pattern | Already used by `rotation_config` — copy exactly |

**Key insight:** Almost all infrastructure exists. This phase is primarily about: (1) wiring budget status → Telegram alerts, (2) persisting config, and (3) building the settings UI. No new libraries are needed.

---

## Common Pitfalls

### Pitfall 1: Budget Alert Fires on Every Poll at Sustained Threshold (BUDG-02 violation)
**What goes wrong:** Agent exceeds 80% budget. Every 10-second poll sees `warning`. Operator receives hundreds of Telegram messages.
**Why it happens:** Only checking `level !== 'ok'` without tracking previous level or cooldown expiry.
**How to avoid:** Track `{level, lastAlertedAt}` per agent in `BudgetAlertPoller`. Only fire on: (a) level escalation (ok→warning, ok→exceeded, warning→exceeded), OR (b) cooldown expiry. On return to 'ok', delete the record so the next breach fires fresh.
**Warning signs:** Multiple identical budget alert messages within the same hour.

### Pitfall 2: NotificationDeduplicator Cooldown Not Honoring NSET-02
**What goes wrong:** Operator changes permission cooldown from 2 min to 5 min in the UI. The poller continues using the hardcoded `PERMISSION_COOLDOWN_MS = 2 * 60 * 1000` constant.
**Why it happens:** `NotificationDeduplicator` reads a module-level constant at import time, not from the database.
**How to avoid:** Remove `PERMISSION_COOLDOWN_MS` from `NotificationDeduplicator.ts`. Pass cooldownMs as a parameter to `recordAndCheck(sessionName, state, cooldownMs)`. `NotificationPoller` reads `database.getNotificationConfig().permissionCooldownMs` once per `pollAllSessions()` call and passes it through.
**Warning signs:** Cooldown changes in UI have no observable effect.

### Pitfall 3: Settings Panel Shows Stale Bot Status
**What goes wrong:** UI shows "Bot connected" even after the bot has errored out. Or shows "disconnected" right after token is added and server restarted.
**Why it happens:** Bot status is fetched once on mount and never refreshed.
**How to avoid:** Either (a) re-fetch config on component mount with a short cache (30s polling like `useBudgetAlerts`), or (b) call the GET endpoint each time the panel is opened. The simplest approach: fetch on mount only (status changes require server restart anyway, so stale status is acceptable).
**Warning signs:** Bot status indicator shows wrong state consistently.

### Pitfall 4: Warning-to-Exceeded Transition Not Alerting
**What goes wrong:** Agent moves from 80% (warning) to 105% (exceeded) but no Telegram message is sent.
**Why it happens:** Logic only fires on `level !== previous` without ordering — `warning !== exceeded` is true, but if the check is inverted, it fires on return from exceeded (exceeded→warning), not escalation (warning→exceeded).
**How to avoid:** The `isLevelEscalation()` helper explicitly defines the direction: `warning→exceeded` is escalation; `exceeded→warning` is NOT. Implement as explicit conditions, not a simple inequality check.
**Warning signs:** Budget exceeded 100% but only one warning message was sent (no exceeded message).

### Pitfall 5: Cooldown Duration Input Allows Zero or Negative Values
**What goes wrong:** Operator sets cooldown to 0 minutes. Every poll cycle fires a Telegram message.
**Why it happens:** No validation on the PUT endpoint or UI input.
**How to avoid:** Server: `permissionCooldownMs >= 0` and `budgetCooldownMs >= 0` are checked on PUT. UI: use `min="1"` on number inputs (enforce at least 1 minute), but allow 0 server-side (operator may intentionally want no cooldown). Log a warning if `cooldownMs === 0` in the poller.
**Warning signs:** Every poll fires notifications — implies cooldown is effectively 0.

### Pitfall 6: `notification_config` Row Missing on First Startup
**What goes wrong:** `getNotificationConfig()` returns `undefined` (no row in table). `config.permissionCooldownMs` throws TypeError.
**Why it happens:** Migration creates the table but doesn't insert a default row. First call to `getNotificationConfig()` returns undefined from `.get()`.
**How to avoid:** `getNotificationConfig()` must use `?? defaults` pattern (as shown in Pattern 2 example). No default row insertion is needed — the method provides defaults when no row exists. This matches the `getRotationConfig()` pattern: `return { capBytes: row?.capBytes ?? 0 }`.
**Warning signs:** TypeError on first startup before any config is set via UI.

---

## Code Examples

Verified patterns from official sources (all derived from existing codebase):

### Budget Alert Deduplication Decision Logic
```typescript
// BUDG-01 + BUDG-02: when to fire, when to suppress
private async checkAgent(status: BudgetAlertStatus, cooldownMs: number): Promise<void> {
  if (status.alertLevel === 'ok') {
    this.records.delete(status.agentId); // Reset so next breach fires fresh
    return;
  }

  const record = this.records.get(status.agentId) ?? { level: 'ok' as BudgetLevel, lastAlertedAt: null };
  const now = Date.now();

  const isEscalation = this.isLevelEscalation(record.level, status.alertLevel);
  const cooldownExpired = record.lastAlertedAt === null || (now - record.lastAlertedAt >= cooldownMs);

  if (!isEscalation && !cooldownExpired) return; // Suppress

  record.level = status.alertLevel;
  record.lastAlertedAt = now;
  this.records.set(status.agentId, record);

  await this.sendBudgetAlert(status);
}

private isLevelEscalation(previous: BudgetLevel, current: BudgetLevel): boolean {
  const rank: Record<BudgetLevel, number> = { ok: 0, warning: 1, exceeded: 2 };
  return rank[current] > rank[previous];
}
```

### Singleton-row upsert (from rotation_config pattern in DatabaseConnection.ts)
```typescript
// Source: existing rotation_config pattern in DatabaseConnection.ts
setNotificationConfig(config: Partial<NotificationConfig>): void {
  const current = this.getNotificationConfig();
  const merged = { ...current, ...config };
  this.db.prepare(`
    INSERT INTO notification_config (id, permission_alerts_enabled, budget_alerts_enabled, permission_cooldown_ms, budget_cooldown_ms, updated_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      permission_alerts_enabled = excluded.permission_alerts_enabled,
      budget_alerts_enabled = excluded.budget_alerts_enabled,
      permission_cooldown_ms = excluded.permission_cooldown_ms,
      budget_cooldown_ms = excluded.budget_cooldown_ms,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    merged.permissionAlertsEnabled ? 1 : 0,
    merged.budgetAlertsEnabled ? 1 : 0,
    merged.permissionCooldownMs,
    merged.budgetCooldownMs,
  );
}
```

### NotificationDeduplicator signature change (NSET-02 support)
```typescript
// Modified recordAndCheck — cooldownMs from DB config instead of module constant
recordAndCheck(sessionName: string, state: AgentStateHint, cooldownMs: number): boolean {
  const record = this.records.get(sessionName) ?? { previousState: null, lastNotifiedAt: null };
  const now = Date.now();
  let shouldFire = false;

  if (state === 'permission_prompt') {
    const wasAlreadyInPermissionState = record.previousState === 'permission_prompt';
    const isWithinCooldown =
      record.lastNotifiedAt !== null && now - record.lastNotifiedAt < cooldownMs;

    if (!wasAlreadyInPermissionState && !isWithinCooldown) {
      shouldFire = true;
      record.lastNotifiedAt = now;
    }
  } else {
    if (record.previousState === 'permission_prompt') {
      record.lastNotifiedAt = null;
    }
  }

  record.previousState = state;
  this.records.set(sessionName, record);
  return shouldFire;
}
```

### NotificationPoller config-read per cycle
```typescript
// Modified pollAllSessions — reads config once, passes cooldown + enabled flag down
private async pollAllSessions(): Promise<void> {
  approvalStateTracker.pruneExpired();
  const config = database.getNotificationConfig(); // Synchronous SQLite read, ~1ms
  if (!config.permissionAlertsEnabled) return;

  const instances = instanceTracker.listActiveInstances();
  await Promise.allSettled(
    instances.map((instance) =>
      this.pollSession(instance.tmuxSessionName, instance.agentId, config.permissionCooldownMs)
    )
  );
}
```

### Telegram budget alert message formatting (amber vs red distinction — BUDG-01)
```typescript
// Distinct amber vs red formatting per BUDG-01 success criteria 1 and 2
const isExceeded = level === 'exceeded';
const emoji = isExceeded ? '🔴' : '🟡';
const urgency = isExceeded ? 'BUDGET EXCEEDED' : 'Budget Warning';
const text =
  `${emoji} *${urgency}* — ${agentId}\n\n` +
  `Today: \`$${todayCostUsd.toFixed(2)}\` / \`$${dailyBudgetUsd.toFixed(2)}\` (${budgetPct.toFixed(1)}%)`;
```

### Bot connection status in API response
```typescript
// GET /api/notifications/config includes bot status
// Source: TelegramBotService.isRunning() — checks bot?.isRunning() ?? false
response.json({
  ...config,
  botConnected: telegramBotService.isRunning(),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded cooldown constants | DB-persisted configurable cooldowns | Phase 35 | Settings UI effective without restart |
| Budget alerts only in browser (useBudgetAlerts hook) | Server-side budget alerts via Telegram | Phase 35 | Alerts fire even when browser is closed |
| No notification settings UI | Dashboard settings panel | Phase 35 | Operator controls notifications without code changes |

**Deprecated/outdated:**
- `PERMISSION_COOLDOWN_MS` module-level constant in `NotificationDeduplicator.ts`: replaced by DB-configured value passed as parameter

---

## Open Questions

1. **Should NotificationPoller cooldown change also affect the existing in-memory state?**
   - What we know: `NotificationDeduplicator` tracks `lastNotifiedAt` in memory; if cooldown is increased from 2→5 min and 3 min have passed, the alert should NOT re-fire
   - What's unclear: The comparison `now - lastNotifiedAt < cooldownMs` naturally handles this — if cooldown is 5 min and 3 min have passed, still suppressed. If cooldown is decreased to 1 min and 3 min have passed, it would fire again on next poll.
   - Recommendation: This behavior is correct and requires no special handling. Document it in code comments.

2. **Where should the Notification Settings tab live in the UI?**
   - What we know: `HistoryView` already has Sessions, Token Usage, Gateway Logs tabs. Adding a 4th "Notifications" tab fits.
   - What's unclear: Whether the operator expects to find notification settings under History or as a top-level nav item.
   - Recommendation: Add as 4th tab in `HistoryView` — keeps all "configuration & history" concerns grouped. Matches the existing `rotation_config` UI location (it's in `RecordingLibrary` under the Recordings view, not top-level). Consistent pattern.

3. **Should the cooldown input UI be in minutes or seconds?**
   - What we know: DB stores milliseconds; defaults are 120,000ms (2 min) and 600,000ms (10 min). Displaying ms to the operator is unfriendly.
   - What's unclear: Whether sub-minute granularity is ever useful.
   - Recommendation: Display and input in minutes. Convert to/from ms in the UI layer (`minutes * 60 * 1000`). Enforce minimum 1 minute in UI (minimum 0 ms on server).

4. **Should `BudgetAlertPoller` start independently of `NotificationPoller`, or should budget polling be folded into the existing `NotificationPoller`?**
   - What we know: `NotificationPoller` currently polls tmux pane output per session. Budget polling reads from SQLite, no tmux calls.
   - What's unclear: Whether one 10-second interval is sufficient, or if budget polling should run on a different cadence.
   - Recommendation: Keep them separate services (`BudgetAlertPoller` distinct from `NotificationPoller`). Single responsibility; simpler testing; independently configurable intervals if needed later.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` (exists at project root) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |
| Estimated runtime | ~5 seconds |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUDG-01 | `BudgetAlertPoller` fires Telegram when agent crosses 80%/100% | unit (mock DB + mock telegramBotService) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| BUDG-01 | Amber (warning) message has distinct yellow emoji; red (exceeded) has red emoji | unit (spy on sendToTopic, check message text) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| BUDG-02 | Sustained threshold → at most 2 messages per 10-min cooldown window | unit (fake timers, advance 20+ min, count sendToTopic calls) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| BUDG-02 | Return to 'ok' resets dedup state — next breach fires fresh | unit (record.delete on ok) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| NSET-01 | `permissionAlertsEnabled = false` → `NotificationPoller` skips polling | unit (mock getNotificationConfig, spy on pollSession) | `npm run test -- tests/unit/NotificationPoller.test.ts` | ❌ Wave 0 gap |
| NSET-01 | `budgetAlertsEnabled = false` → `BudgetAlertPoller` returns early | unit (mock getNotificationConfig, spy on sendBudgetAlert) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| NSET-02 | Custom `permissionCooldownMs` from config is passed to `recordAndCheck()` | unit (verify recordAndCheck call arg matches config value) | `npm run test -- tests/unit/NotificationPoller.test.ts` | ❌ Wave 0 gap |
| NSET-02 | Custom `budgetCooldownMs` from config controls alert suppression | unit (fake timers, verify cooldown respected) | `npm run test -- tests/unit/BudgetAlertPoller.test.ts` | No — Wave 0 gap |
| NSET-03 | `getNotificationConfig()` returns defaults when no row exists | unit (in-memory SQLite or mock) | `npm run test -- tests/unit/DatabaseConnection.test.ts` | No — Wave 0 gap |
| NSET-03 | `setNotificationConfig()` persists and `getNotificationConfig()` reads back | unit | `npm run test -- tests/unit/DatabaseConnection.test.ts` | No — Wave 0 gap |

> Note: `NotificationDeduplicator.test.ts` already exists (81 tests passing). The signature change to `recordAndCheck(sessionName, state, cooldownMs)` will require updating existing test calls to pass a `cooldownMs` argument.

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd:verify-work` runs
- **Estimated feedback latency per task:** ~5 seconds

### Wave 0 Gaps (must be created before implementation)

- [ ] `tests/unit/BudgetAlertPoller.test.ts` — covers BUDG-01, BUDG-02, NSET-01 (budget branch), NSET-02 (budget cooldown)
- [ ] `tests/unit/DatabaseConnection.test.ts` — covers NSET-03 (getNotificationConfig defaults + setNotificationConfig round-trip)
- [ ] Update `tests/unit/NotificationDeduplicator.test.ts` — `recordAndCheck()` signature changes from `(sessionName, state)` to `(sessionName, state, cooldownMs)` — update all existing test calls to pass cooldown arg
- [ ] Update `tests/unit/NotificationPoller.test.ts` (if exists) — needs mock for `database.getNotificationConfig()` and verification that cooldownMs is passed through

*(vitest infrastructure already in place — only test files need creation/updating)*

---

## Sources

### Primary (HIGH confidence)
- `src/server/services/NotificationPoller.ts` — polling pattern to replicate for BudgetAlertPoller
- `src/server/services/NotificationDeduplicator.ts` — deduplication logic; signature change needed for NSET-02
- `src/server/services/TelegramBotService.ts` — `sendToTopic()` and `isRunning()` confirmed
- `src/server/database/DatabaseConnection.ts` — `getBudgetAlertStatus()`, `getRotationConfig()` / `setRotationConfig()` patterns for notification_config migration
- `src/server/routes/historyRoutes.ts` — existing budget config endpoint patterns; `/api/history/budget-config/status` already returns `alertLevel`
- `src/client/hooks/useBudgetAlerts.ts` — confirmed `alertLevel: 'ok' | 'warning' | 'exceeded'` type in client
- `src/client/components/TokenUsageView.tsx` — fetch/PUT config pattern for NotificationSettingsPanel
- `.planning/STATE.md` — confirmed `notification_config` singleton-row pattern decision; `NotificationDeduplicator` in-memory only for Phase 33; Phase 35 adds persistent config

### Secondary (MEDIUM confidence)
- `src/client/components/HistoryView.tsx` — confirmed tab structure for adding 4th Notifications tab
- `src/client/App.tsx` — confirmed `useBudgetAlerts` usage pattern; budget alert level used for nav badge

### Tertiary (LOW confidence)
- None — all critical claims verified against codebase files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all required libraries already installed; no new dependencies
- Architecture: HIGH — all patterns derived from existing codebase (NotificationPoller, rotation_config, budget_config, TelegramBotService)
- Pitfalls: HIGH — derived from requirements analysis, existing code patterns, and Phase 33 research experience
- Budget deduplication logic: HIGH — derived directly from BUDG-01/BUDG-02 success criteria

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (all libraries are stable; patterns are internal codebase-derived)
