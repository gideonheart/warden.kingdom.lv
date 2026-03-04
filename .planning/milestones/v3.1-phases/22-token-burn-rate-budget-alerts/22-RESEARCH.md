# Phase 22: Token Burn Rate & Budget Alerts - Research

**Researched:** 2026-03-04
**Domain:** SQLite time-windowed aggregation, React polling hooks, budget threshold UI
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOKN-10 | Burn rate (cost/hour) displayed per agent with sliding window selector (1h/4h/24h), updating on each scan cycle | Server-side SQL windowed aggregation confirmed working; client hook polling pattern established |
| TOKN-11 | Per-agent daily budget threshold stored in SQLite with visual warning at 80% (amber badge) and alert at 100% (red badge), visible on History nav tab | budget_config table schema + LEFT JOIN query verified; badge placement pattern identified in App.tsx |
| TOKN-13 | Cost projection showing estimated daily/weekly spend at current burn rate, updating when burn rate window changes | Projection formula verified: burnRatePerHour * 24 and * 168; client-side recalc on window change |
</phase_requirements>

---

## Summary

Phase 22 extends the existing `token_usage` table (daily aggregates per agent) with burn rate calculation and a new `budget_config` table. The core technical challenge is that `token_usage` stores data at **daily granularity** — one row per `(agent_id, date)`. This means the 1h/4h/24h window selector cannot be a true sub-day sliding window; instead, each window maps to a different number of historical days, and the hourly rate is derived by dividing the sum by the total hours in that span.

The burn rate API endpoint computes the aggregate server-side using a parameterized SQLite query (`WHERE date >= date('now', '-N days')`), returns `(windowCostUsd, windowHours, burnRatePerHour, projectedDailyUsd, projectedWeeklyUsd)` per agent, and the client re-requests this endpoint when the window selector changes. Budget alert status is a separate endpoint that JOINs `token_usage` (today's row only) against `budget_config` to compute `budget_pct` and `alert_level` (`ok`/`warning`/`exceeded`). The History nav button in `App.tsx` receives a badge prop derived from this data.

No new npm dependencies are needed. All logic is pure SQLite + existing better-sqlite3 + React hooks following the established polling pattern (`useActiveInstances`, `useAgentLiveStatus`).

**Primary recommendation:** Add `budget_config` table via inline migration, implement two new API endpoints (`GET /api/history/burn-rate` and `GET|PUT /api/history/budget-config`), add a `useBudgetAlerts` hook polling at 30s intervals lifted to `App.tsx`, and extend `TokenUsageView` with the window selector and projection card.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 11.10.0 (installed) | Synchronous SQLite queries for burn rate aggregation and budget config | Already in project; WAL mode; all token_usage queries use it |
| React 19 | installed | Window selector state, burn rate display, badge rendering | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | No additional libraries needed | Everything required is already in the project stack |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite date window math | Application-layer date filtering | SQL window is one round-trip; app-side filtering requires fetching all rows then filtering — worse at scale |
| Polling (setInterval) | Socket.IO push for budget alerts | Socket.IO push would require server-side threshold detection; polling at 30s is simple and sufficient for budget alerts which are not time-critical |
| Inline migration in `runMigrations()` | Separate migration runner | Project consistently uses inline try/catch ADD COLUMN pattern — maintain consistency |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── server/
│   ├── database/
│   │   └── DatabaseConnection.ts    # Add: upsertBudgetConfig(), getBudgetConfig(), getBurnRate(), getBudgetAlertStatus()
│   └── routes/
│       └── historyRoutes.ts         # Add: GET /api/history/burn-rate, GET /api/history/budget-config, PUT /api/history/budget-config/:agentId
├── client/
│   ├── hooks/
│   │   └── useBudgetAlerts.ts       # New: polls /api/history/budget-config at 30s, returns alertLevel
│   └── components/
│       ├── TokenUsageView.tsx        # Extend: add window selector, burn rate cards, projection card, budget editor
│       └── App.tsx                  # Extend: lift useBudgetAlerts, pass badge prop to History nav button
└── shared/
    └── types.ts                     # Add: BurnRateEntry, BudgetConfig, BudgetAlertStatus types
```

### Pattern 1: SQLite Window Query for Burn Rate

**What:** Map window selector (1h/4h/24h) to a day lookback count; query `token_usage` for that span; return aggregated cost and hours.

**When to use:** Any burn rate calculation from daily-granular data.

**Window mapping (verified with better-sqlite3 11.10.0):**
- `1h` → lookback 1 day, divide by 24h → shows today's average hourly rate
- `4h` → lookback 2 days, divide by 48h → shows 2-day smoothed hourly rate
- `24h` → lookback 7 days, divide by 168h → shows 7-day rolling average hourly rate

**Example:**
```typescript
// Source: verified against better-sqlite3 11.10.0 in this project
function getWindowMapping(windowHours: 1 | 4 | 24): { dayLookback: number; hours: number } {
  if (windowHours === 1) return { dayLookback: 1, hours: 24 };
  if (windowHours === 4) return { dayLookback: 2, hours: 48 };
  return { dayLookback: 7, hours: 168 };
}

getBurnRate(windowHours: 1 | 4 | 24): BurnRateEntry[] {
  const { dayLookback, hours } = getWindowMapping(windowHours);
  return this.db.prepare(`
    SELECT
      agent_id as agentId,
      SUM(cost_usd) as windowCostUsd,
      ? as windowHours,
      ROUND(SUM(cost_usd) / ?, 6) as burnRatePerHour,
      ROUND(SUM(cost_usd) / ? * 24, 4) as projectedDailyUsd,
      ROUND(SUM(cost_usd) / ? * 168, 4) as projectedWeeklyUsd
    FROM token_usage
    WHERE date >= date('now', '-' || ? || ' days')
    GROUP BY agent_id
    ORDER BY burnRatePerHour DESC
  `).all(hours, hours, hours, hours, dayLookback) as BurnRateEntry[];
}
```

### Pattern 2: Budget Config Table (inline migration)

**What:** New `budget_config` table with `agent_id` as PRIMARY KEY. Migrated inline using try/catch `ADD COLUMN` pattern consistent with existing migrations.

**Example:**
```typescript
// In runMigrations() — added after existing table creation
this.db.exec(`
  CREATE TABLE IF NOT EXISTS budget_config (
    agent_id TEXT PRIMARY KEY,
    daily_budget_usd REAL NOT NULL DEFAULT 10.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### Pattern 3: Budget Alert Status JOIN

**What:** LEFT JOIN today's `token_usage` row against `budget_config` to compute percentage and alert level. Returns one row per agent that has a budget configured.

**Example:**
```typescript
// Source: verified query returning alert_level: 'ok' | 'warning' | 'exceeded'
getBudgetAlertStatus(): BudgetAlertStatus[] {
  return this.db.prepare(`
    SELECT
      bc.agent_id as agentId,
      COALESCE(tu.cost_usd, 0) as todayCostUsd,
      bc.daily_budget_usd as dailyBudgetUsd,
      CASE WHEN bc.daily_budget_usd > 0
           THEN ROUND(COALESCE(tu.cost_usd, 0) / bc.daily_budget_usd * 100, 1)
           ELSE 0 END as budgetPct,
      CASE
        WHEN bc.daily_budget_usd > 0 AND COALESCE(tu.cost_usd, 0) >= bc.daily_budget_usd THEN 'exceeded'
        WHEN bc.daily_budget_usd > 0 AND COALESCE(tu.cost_usd, 0) >= bc.daily_budget_usd * 0.8 THEN 'warning'
        ELSE 'ok'
      END as alertLevel
    FROM budget_config bc
    LEFT JOIN token_usage tu ON bc.agent_id = tu.agent_id AND tu.date = date('now')
    ORDER BY budgetPct DESC
  `).all() as BudgetAlertStatus[];
}
```

### Pattern 4: useBudgetAlerts Hook (lifted to App.tsx)

**What:** Polls `/api/history/budget-config/status` every 30s. Returns `alertLevel: 'ok' | 'warning' | 'exceeded'` which App.tsx uses to render the History nav badge. Follows the stable-reference pattern used in `useAgentLiveStatus`.

**Example:**
```typescript
// Follows exact pattern of useAgentLiveStatus (src/client/hooks/useAgentLiveStatus.ts)
export function useBudgetAlerts(): 'ok' | 'warning' | 'exceeded' {
  const [alertLevel, setAlertLevel] = useState<'ok' | 'warning' | 'exceeded'>('ok');
  const previousRef = useRef<string>('ok');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/history/budget-config/status');
        if (!response.ok) return;
        const data = await response.json();
        const level = data.alertLevel as 'ok' | 'warning' | 'exceeded';
        if (level === previousRef.current) return;
        previousRef.current = level;
        setAlertLevel(level);
      } catch { /* leave previous value */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  return alertLevel;
}
```

### Pattern 5: History Nav Badge in App.tsx

**What:** The History nav button in `App.tsx` currently renders plain text. Add a relative-positioned dot badge whose color depends on `alertLevel`. The badge must appear on both desktop nav buttons and mobile dropdown menu items.

**Example:**
```tsx
// In App.tsx — wrap "History" text with relative container
<button onClick={() => handleViewChange('history')} className="...">
  <span className="relative">
    History
    {historyBadgeLevel !== 'ok' && (
      <span className={`absolute -top-1 -right-2 w-2 h-2 rounded-full ${
        historyBadgeLevel === 'exceeded' ? 'bg-warden-error' : 'bg-warden-warning animate-pulse'
      }`} />
    )}
  </span>
</button>
```

### Pattern 6: Budget Threshold Editor in TokenUsageView

**What:** Inline number input per agent card. On blur or Enter, PUT `/api/history/budget-config/:agentId` with `{ dailyBudgetUsd: number }`. Follows the inline-confirmation pattern already in the codebase (no modal).

**Example:**
```tsx
// Per-agent budget input within the summary card
const [editingBudget, setEditingBudget] = useState<Record<string, string>>({});

const handleBudgetSave = async (agentId: string) => {
  const value = parseFloat(editingBudget[agentId] ?? '');
  if (isNaN(value) || value < 0) return;
  await fetch(`/api/history/budget-config/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyBudgetUsd: value }),
  });
  // refetch to update budget_pct display
};
```

### Anti-Patterns to Avoid

- **True sub-hourly windowing:** `token_usage` stores daily aggregates. Do NOT attempt to derive 1h burn rate from minute-level scanning — the data does not exist. Use the day-window approximation.
- **Storing burn rate in the DB:** Burn rate is a derived metric. Compute on request, never persist it. Only persist `budget_config.daily_budget_usd`.
- **Global budget alert state via Context API:** The badge alert level is simple string state. useRef + useState in a hook lifted to App.tsx is sufficient — no Context needed.
- **Blocking the main thread with budget calculation:** better-sqlite3 is synchronous but the query is a single aggregation JOIN on indexed columns. No async workaround needed.
- **Separate migration file:** Project uses inline `this.db.exec()` in `runMigrations()` with try/catch for ADD COLUMN. Follow this pattern for `budget_config` table creation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date arithmetic for window boundaries | Custom date math in TypeScript | SQLite `date('now', '-N days')` | SQLite handles timezone-naive date arithmetic correctly; verified in tests |
| Budget persistence | localStorage or in-memory Map | `budget_config` SQLite table | Survives server restarts; consistent with existing data layer |
| Alert level aggregation | Client-side join/calculation | Server-side LEFT JOIN query | One SQL round-trip returns all agents' status; no N+1 fetching |
| Polling deduplication | Custom debounce/throttle | useRef equality check pattern | Already proven in `useAgentLiveStatus`; prevents unnecessary React re-renders |

**Key insight:** The entire burn rate and budget system is computable from data already in `token_usage`. The only new persistent data is `daily_budget_usd` per agent. Everything else is derived.

---

## Common Pitfalls

### Pitfall 1: Window Selector and Data Granularity Mismatch

**What goes wrong:** Operator selects "1h" window expecting to see only the last 60 minutes of spending. Since `token_usage` is daily, the 1h window shows the same data as 24h (today's total). Operator is confused.

**Why it happens:** The requirements say "sliding window selector" but the underlying data is daily-granular.

**How to avoid:** Label the windows clearly in the UI. Instead of "1h / 4h / 24h", use labels that communicate the lookback period: "Today (1d)", "2-day avg", "7-day avg". Alternatively label them as "Recent / Medium / Long" with a tooltip explaining the lookback. The burn rate card should show both the window label and the actual date range being used (e.g. "Last 2 days").

**Warning signs:** If the 1h and 4h rates are identical, the data is working correctly but the labeling is misleading.

### Pitfall 2: Budget Config for Agents Without Token Data

**What goes wrong:** An agent has a budget configured in `budget_config` but has no rows in `token_usage` for today (hasn't run yet). The LEFT JOIN in `getBudgetAlertStatus` returns `todayCostUsd = NULL / 0`, which is correct, but `budgetPct = 0` — the status reads "ok" when the agent hasn't run.

**Why it happens:** COALESCE handles the NULL but shows 0% which is technically accurate.

**How to avoid:** This is correct behavior. Budget is only violated by spending, not by absence of spending. No special handling needed.

### Pitfall 3: Badge Flicker on Scan Completion

**What goes wrong:** `SessionUsageReader` scans every 5 minutes and upserts token_usage. If a scan completes just as the budget status is being polled, there is a brief moment where data is being written. better-sqlite3 WAL mode handles concurrent reads safely — no action needed.

**Why it happens:** WAL mode in SQLite allows readers to continue reading the last committed state while a write is in progress.

**How to avoid:** Already handled by WAL mode (`PRAGMA journal_mode = WAL` in `DatabaseConnection.ts`). Do not add any locking.

### Pitfall 4: `date('now')` Timezone Mismatch

**What goes wrong:** `date('now')` in SQLite returns UTC date. The operator's browser is in a different timezone. Spending from 11 PM local time appears on "tomorrow" in the database. Budget for "today" does not match what the operator expects.

**Why it happens:** SQLite `date('now')` is UTC. The `SessionUsageReader` derives dates from JSONL timestamps using `timestamp.slice(0, 10)`. Claude Code timestamps are ISO 8601 with UTC offset, so the date is UTC.

**How to avoid:** This is an existing behavior from Phase 21 — not introduced by Phase 22. Document it in the UI as "UTC dates". Do not attempt to fix it in Phase 22 (would require changing how `SessionUsageReader` stores dates — scope creep).

### Pitfall 5: Budget Editor Input Validation

**What goes wrong:** Operator enters a non-numeric value or negative number for the budget. The PUT endpoint receives `NaN` or a negative value and stores it.

**Why it happens:** HTML `<input type="number">` allows empty strings and some browsers accept `e` (scientific notation).

**How to avoid:** Server-side validation: reject requests where `dailyBudgetUsd` is not a finite positive number. Client-side: use `type="number"` with `min="0"` attribute; parse with `parseFloat` and check `isFinite(value) && value >= 0`.

### Pitfall 6: Alert Level Computation Race in App.tsx

**What goes wrong:** `useBudgetAlerts` polls at 30s and `SessionUsageReader` scans at 5 minutes. The badge may lag behind by up to 30s after a scan completes. This is acceptable given budget alerts are not time-critical.

**Why it happens:** Polling interval and scan interval are independent.

**How to avoid:** 30s poll is intentional and appropriate. Do not tighten to 5s — budget alert checks are cheap but unnecessary at high frequency.

---

## Code Examples

Verified patterns from project codebase and tested queries:

### Burn Rate SQL Query (verified with better-sqlite3 11.10.0)

```typescript
// Source: verified locally against production better-sqlite3 11.10.0
// Window mapping: 1h->1day/24h, 4h->2days/48h, 24h->7days/168h
getBurnRate(windowHours: 1 | 4 | 24): BurnRateEntry[] {
  const windowMapping = { 1: { days: 1, hours: 24 }, 4: { days: 2, hours: 48 }, 24: { days: 7, hours: 168 } };
  const { days, hours } = windowMapping[windowHours];
  return this.db.prepare(`
    SELECT
      agent_id        as agentId,
      SUM(cost_usd)   as windowCostUsd,
      SUM(cost_usd) / ${hours} as burnRatePerHour,
      SUM(cost_usd) / ${hours} * 24  as projectedDailyUsd,
      SUM(cost_usd) / ${hours} * 168 as projectedWeeklyUsd
    FROM token_usage
    WHERE date >= date('now', '-${days} days')
    GROUP BY agent_id
    ORDER BY burnRatePerHour DESC
  `).all() as BurnRateEntry[];
}
```

Note: `days` and `hours` are numeric constants interpolated into SQL (not user-supplied strings) — SQL injection is not a risk here.

### Budget Config Upsert (verified)

```typescript
// Source: verified locally - upsert with conflict resolution
upsertBudgetConfig(agentId: string, dailyBudgetUsd: number): void {
  this.db.prepare(`
    INSERT INTO budget_config (agent_id, daily_budget_usd, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(agent_id) DO UPDATE SET
      daily_budget_usd = excluded.daily_budget_usd,
      updated_at = CURRENT_TIMESTAMP
  `).run(agentId, dailyBudgetUsd);
}
```

### New API Endpoints for historyRoutes.ts

```typescript
// GET /api/history/burn-rate?windowHours=1|4|24
historyRoutes.get('/api/history/burn-rate', (request, response) => {
  const windowHours = parseInt(String(request.query['windowHours'] ?? '24'), 10);
  const validWindows = [1, 4, 24] as const;
  const window = validWindows.includes(windowHours as 1 | 4 | 24)
    ? (windowHours as 1 | 4 | 24) : 24;
  response.json({ burnRates: database.getBurnRate(window), windowHours: window });
});

// GET /api/history/budget-config
historyRoutes.get('/api/history/budget-config', (_request, response) => {
  response.json({ configs: database.getAllBudgetConfigs() });
});

// PUT /api/history/budget-config/:agentId
historyRoutes.put('/api/history/budget-config/:agentId', (request, response) => {
  const { agentId } = request.params;
  const { dailyBudgetUsd } = request.body as { dailyBudgetUsd: unknown };
  const value = Number(dailyBudgetUsd);
  if (!isFinite(value) || value < 0) {
    return response.status(400).json({ error: 'dailyBudgetUsd must be a non-negative number' });
  }
  database.upsertBudgetConfig(agentId, value);
  response.json({ status: 'ok' });
});

// GET /api/history/budget-config/status  (used by useBudgetAlerts hook)
historyRoutes.get('/api/history/budget-config/status', (_request, response) => {
  const statuses = database.getBudgetAlertStatus();
  const alertLevel = statuses.some(s => s.alertLevel === 'exceeded')
    ? 'exceeded'
    : statuses.some(s => s.alertLevel === 'warning')
    ? 'warning'
    : 'ok';
  response.json({ alertLevel, statuses });
});
```

### Shared Types to Add in types.ts

```typescript
// Add to src/shared/types.ts
export interface BurnRateEntry {
  agentId: string;
  windowCostUsd: number;
  burnRatePerHour: number;
  projectedDailyUsd: number;
  projectedWeeklyUsd: number;
}

export interface BudgetConfig {
  agentId: string;
  dailyBudgetUsd: number;
}

export interface BudgetAlertStatus {
  agentId: string;
  todayCostUsd: number;
  dailyBudgetUsd: number;
  budgetPct: number;
  alertLevel: 'ok' | 'warning' | 'exceeded';
}
```

### Window Selector UI Component

```tsx
// Within TokenUsageView or a sub-component BurnRateCard
type BurnWindow = 1 | 4 | 24;

const WINDOW_LABELS: Record<BurnWindow, string> = {
  1: 'Today (1d)',
  4: '2-day avg',
  24: '7-day avg',
};

const [burnWindow, setBurnWindow] = useState<BurnWindow>(24);

<div className="flex items-center gap-1 rounded bg-warden-border/30 p-0.5">
  {([1, 4, 24] as BurnWindow[]).map((w) => (
    <button
      key={w}
      onClick={() => setBurnWindow(w)}
      className={`px-2 py-0.5 rounded text-xs transition-colors ${
        burnWindow === w
          ? 'bg-warden-accent/20 text-warden-accent'
          : 'text-warden-text-dim hover:text-warden-text'
      }`}
    >
      {WINDOW_LABELS[w]}
    </button>
  ))}
</div>
```

### Projection Card Pattern

```tsx
// Projection card within TokenUsageView
// Recalculates purely from the burn rate data returned for the current window
{selectedBurnRate && (
  <div className="bg-warden-border/20 rounded-lg p-3 space-y-2">
    <div className="text-xs font-medium text-warden-text-dim">
      Cost Projection ({WINDOW_LABELS[burnWindow]})
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <span className="text-xs text-warden-text-dim">Est. Daily</span>
        <p className="text-sm font-mono text-warden-accent">
          ${selectedBurnRate.projectedDailyUsd.toFixed(2)}
        </p>
      </div>
      <div>
        <span className="text-xs text-warden-text-dim">Est. Weekly</span>
        <p className="text-sm font-mono text-warden-accent">
          ${selectedBurnRate.projectedWeeklyUsd.toFixed(2)}
        </p>
      </div>
    </div>
    <div className="text-xs text-warden-text-dim">
      at ${selectedBurnRate.burnRatePerHour.toFixed(4)}/hr
    </div>
  </div>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual date range filtering in application layer | SQLite `date('now', '-N days')` | Always available in SQLite 3.x | Single query instead of fetch-all-then-filter |
| Separate migrations table (knex, prisma) | Inline `CREATE TABLE IF NOT EXISTS` + try/catch `ADD COLUMN` | Established in this project | No migration runner dependency; idempotent |
| React Context for cross-component state | Lift state to App.tsx and pass as props | v3.0 refactor of this project | Avoids context re-render storms; follows project pattern |

**Deprecated/outdated:**
- No deprecated patterns identified for this phase.

---

## Open Questions

1. **Window selector labeling**
   - What we know: The data is daily-granular; 1h/4h/24h windows cannot be true sub-day windows
   - What's unclear: Whether to label buttons "1h/4h/24h" (matching requirements literally) or "Today/2-day/7-day" (accurate description of data window)
   - Recommendation: Use "1h / 4h / 24h" labels as required by TOKN-10, but show the actual date range in a tooltip or subtitle ("based on last 1/2/7 days of data"). The `burnRatePerHour` value will differ across windows, giving meaningful differentiation.

2. **Budget config DELETE endpoint**
   - What we know: TOKN-11 requires setting a threshold; requirements don't mention removing one
   - What's unclear: Should operator be able to clear/remove a budget config (going back to "no limit")?
   - Recommendation: Implement `dailyBudgetUsd = 0` as "no budget set" (skip alert computation when value is 0). No DELETE endpoint needed for Phase 22.

3. **Budget config for agents not yet in token_usage**
   - What we know: Budgets are stored by `agent_id` which comes from the Claude Code project directory path
   - What's unclear: How does the operator set a budget for an agent that hasn't run yet (no entries in token_usage summary)?
   - Recommendation: In the budget editor UI within `TokenUsageView`, only show budget inputs for agents that have appeared in the `token_usage` summary. New agents appear after their first scan. This is acceptable for Phase 22.

---

## Sources

### Primary (HIGH confidence)
- better-sqlite3 11.10.0 — tested directly in project environment; `date('now', '-N days')` queries verified with real output
- Project source code — `DatabaseConnection.ts`, `SessionUsageReader.ts`, `historyRoutes.ts`, `TokenUsageView.tsx`, `App.tsx`, `useAgentLiveStatus.ts`, `useActiveInstances.ts` all read directly

### Secondary (MEDIUM confidence)
- SQLite date/time functions — `date('now', '-N days')` is documented SQLite core; verified working in better-sqlite3 context

### Tertiary (LOW confidence)
- None identified — all claims are based on direct code inspection and local testing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing libraries verified working
- Architecture: HIGH — SQL queries tested locally; hook patterns copied from proven existing hooks
- Pitfalls: HIGH — data granularity limitation discovered through actual query testing, not assumption
- Window semantics: MEDIUM — reasonable approximation given daily-granular data; the 1h/4h/24h labeling is an acknowledged simplification

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack; better-sqlite3 and React APIs change slowly)
