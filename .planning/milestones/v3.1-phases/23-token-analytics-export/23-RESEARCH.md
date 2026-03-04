# Phase 23: Token Analytics & Export — Research

**Researched:** 2026-03-04
**Domain:** SQLite schema extension, per-model JSONL aggregation, React data visualization, CSV file download
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOKN-12 | Model comparison view showing cost breakdown by model variant (sonnet/opus/haiku) per agent as bar chart or table | New `token_usage_by_model` SQLite table + extended scanner + ModelComparisonView component |
| TOKN-14 | Export button downloads full token usage dataset as CSV with columns: date, agent_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd | Express GET endpoint with Content-Disposition header + client-side blob download |
</phase_requirements>

---

## Summary

Phase 23 has two orthogonal deliverables: per-model cost analytics (TOKN-12) and CSV export (TOKN-14). They share the data source but are otherwise independent.

**TOKN-12 (Model Comparison):** The current `token_usage` table aggregates by `(agent_id, date)` with a `UNIQUE` constraint — there is no `model` column. Adding `model` to the existing table would require dropping the UNIQUE constraint and migrating all existing rows (which lack model info). The clean solution is a separate `token_usage_by_model` table with `UNIQUE(agent_id, date, model)`. The scanner already reads `message.model` from each JSONL line — it just discards it after pricing lookup. Extending the scanner to accumulate into a `Map<string, Map<string, Map<string, UsageAccumulator>>>` (agent → date → model) is straightforward. The UI component (ModelComparisonView) can be a pure CSS/Tailwind horizontal bar chart — no charting library needed for 3–5 model variants. This avoids adding recharts (which pulls in Redux Toolkit, D3 sub-packages, and ~12 direct deps) for a simple grouped bar display.

**TOKN-14 (CSV Export):** The cleanest implementation is a server-side Express GET endpoint that streams `text/csv` with proper `Content-Disposition: attachment; filename="token-usage.csv"`. On the client, a standard fetch → Blob → `URL.createObjectURL` → synthetic anchor click pattern works without any library. The Export button lives in `TokenUsageView`. The CSV must include a `model` column, which means it draws from `token_usage_by_model`, not the existing `token_usage` table.

**Primary recommendation:** Add a new `token_usage_by_model` table; extend the JSONL scanner; build ModelComparisonView as CSS bars (no recharts); add a plain Express CSV endpoint with Content-Disposition header; trigger download via synthetic anchor click.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.0.0 (already installed) | New table DDL + upsert for per-model aggregates | Already in project; synchronous, fast, zero friction |
| Node.js `readline` / `createReadStream` | Built-in (already used) | JSONL streaming in SessionUsageReader | Already the established pattern in this codebase |
| React 19 | ^19.0.0 (already installed) | ModelComparisonView component | Already in project |
| Tailwind CSS v4 | ^4.0.0 (already installed) | Bar chart via div widths + warden-* tokens | Already in project; no new dep needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| recharts | 3.7.0 (NOT recommended) | Bar chart rendering | Only if requirements escalate to complex interactivity — avoid for this phase; adds ~12 transitive deps including @reduxjs/toolkit, react-redux, victory-vendor/D3 |
| Node.js `stream` | Built-in | Stream CSV response from Express | If dataset is very large (>50k rows); for Phase 23 scale, `res.send(csvString)` is sufficient |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS div-width bars | recharts BarChart | recharts: richer tooltips, animations, responsive; adds ~12 transitive deps incl. Redux. CSS bars: zero deps, fits warden-* theme, sufficient for 3–5 model variants |
| Separate `token_usage_by_model` table | Add `model` column to existing `token_usage` | Adding to existing: UNIQUE constraint `(agent_id, date)` must change, existing rows lack model data, upsert logic breaks. New table: clean separation, no migration risk, existing burn-rate/budget queries unaffected |
| Server-side CSV endpoint | Client-side CSV generation from existing API data | Client-side: avoids new endpoint, re-uses already-fetched data; risk: data may not include all required columns. Server-side: single source of truth, easy to add date range params, clean separation |
| Synthetic anchor click (blob) | `window.open('/api/token-usage/export?format=csv')` | `window.open` is simpler for GET endpoint but opens a new tab on some browsers; blob approach is consistent with existing fetch patterns |

**Installation:** No new npm packages required for Phase 23.

---

## Architecture Patterns

### Recommended Project Structure

```
src/server/
├── database/DatabaseConnection.ts     # Add: upsertTokenUsageByModel(), getModelComparison()
├── routes/historyRoutes.ts            # Add: GET /api/history/model-comparison, GET /api/history/token-usage/export
├── services/SessionUsageReader.ts     # Extend: per-model accumulator, call upsertTokenUsageByModel()

src/client/
├── components/TokenUsageView.tsx      # Add: Export button, import ModelComparisonView
└── components/ModelComparisonView.tsx # New component: per-model cost bar chart
```

### Pattern 1: New `token_usage_by_model` Table + Migration

**What:** Separate table with `UNIQUE(agent_id, date, model)` — keeps existing `token_usage` rows intact.
**When to use:** Always when adding a new dimension to an existing unique-constrained table.

```typescript
// DatabaseConnection.ts — runMigrations() addition
this.db.exec(`
  CREATE TABLE IF NOT EXISTS token_usage_by_model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    date TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_creation_input_tokens INTEGER DEFAULT 0,
    cache_read_input_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    UNIQUE(agent_id, date, model)
  )
`);
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_token_usage_by_model_agent_date
  ON token_usage_by_model(agent_id, date)
`);
```

### Pattern 2: Extended JSONL Scanner — Per-Model Accumulation

**What:** Accumulate a `Map<date, Map<model, UsageAccumulator>>` alongside the existing per-date map.
**When to use:** Collecting a new grouping dimension without discarding the existing output.

```typescript
// SessionUsageReader.ts — scanProject() extension
// Existing: dailyUsage Map<date, UsageAccumulator>
// New:      modelDailyUsage Map<date, Map<model, UsageAccumulator>>
const modelDailyUsage = new Map<string, Map<string, UsageAccumulator>>();

// In processJsonlFile — after extracting model variable:
const modelKey = model || 'unknown';
let modelDateMap = modelDailyUsage.get(date);
if (!modelDateMap) {
  modelDateMap = new Map();
  modelDailyUsage.set(date, modelDateMap);
}
const modelAccumulator = modelDateMap.get(modelKey);
if (modelAccumulator) {
  modelAccumulator.inputTokens += inputTokens;
  // ... etc
} else {
  modelDateMap.set(modelKey, { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, costUsd });
}

// In scanProject() — after existing upsert loop:
for (const [date, modelMap] of modelDailyUsage.entries()) {
  for (const [model, accumulator] of modelMap.entries()) {
    database.upsertTokenUsageByModel({ agentId, date, model, ...accumulator });
  }
}
```

### Pattern 3: Model Comparison API Endpoint

**What:** GET `/api/history/model-comparison` returns per-model cost grouped by agent.
**When to use:** Separate from the existing `/api/history/token-usage` to avoid breaking existing consumers.

```typescript
// historyRoutes.ts addition
historyRoutes.get('/api/history/model-comparison', (request, response) => {
  const { agentId, dateFrom, dateTo } = request.query as Record<string, string | undefined>;
  const data = database.getModelComparison({ agentId, dateFrom, dateTo });
  response.json({ modelComparison: data });
});
```

```typescript
// DatabaseConnection.ts
getModelComparison(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): ModelComparisonRow[] {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.agentId) { conditions.push('agent_id = ?'); params.push(filters.agentId); }
  if (filters.dateFrom) { conditions.push('date >= ?'); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push('date <= ?'); params.push(filters.dateTo); }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return this.db.prepare(`
    SELECT agent_id AS agentId, model,
           SUM(cost_usd) AS totalCostUsd,
           SUM(input_tokens) AS totalInputTokens,
           SUM(output_tokens) AS totalOutputTokens
    FROM token_usage_by_model ${whereClause}
    GROUP BY agent_id, model
    ORDER BY agentId, totalCostUsd DESC
  `).all(...params) as ModelComparisonRow[];
}
```

### Pattern 4: CSV Export — Server-Side Endpoint + Client Blob Download

**What:** Express endpoint serializes rows to CSV; client fetches, wraps in Blob, triggers anchor download.
**When to use:** Standard pattern for any file download from a REST API.

```typescript
// historyRoutes.ts — CSV export endpoint
historyRoutes.get('/api/history/token-usage/export', (request, response) => {
  const { agentId, dateFrom, dateTo } = request.query as Record<string, string | undefined>;
  const rows = database.getTokenUsageForExport({ agentId, dateFrom, dateTo });

  const headers = ['date', 'agent_id', 'model', 'input_tokens', 'output_tokens',
                   'cache_creation_input_tokens', 'cache_read_input_tokens', 'cost_usd'];
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      [row.date, row.agentId, row.model, row.inputTokens, row.outputTokens,
       row.cacheCreationInputTokens, row.cacheReadInputTokens, row.costUsd.toFixed(6)].join(',')
    ),
  ];
  const csvContent = csvLines.join('\n');

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', 'attachment; filename="token-usage.csv"');
  response.send(csvContent);
});
```

```typescript
// Client: Export button handler in TokenUsageView
const handleExport = useCallback(async () => {
  const response = await fetch('/api/history/token-usage/export');
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'token-usage.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}, []);
```

### Pattern 5: CSS Bar Chart (No Library)

**What:** Horizontal bars using div widths relative to max value in the dataset. Three model variants (sonnet, opus, haiku) per agent.
**When to use:** Simple comparative display with a known small set of categories; avoids charting library dep.

```tsx
// ModelComparisonView.tsx — key pattern
const maxCost = Math.max(...data.map((row) => row.totalCostUsd), 0.000001);

// For each row:
<div className="flex items-center gap-2">
  <span className="w-32 text-xs text-warden-text-dim truncate">{row.model}</span>
  <div className="flex-1 bg-warden-border/30 rounded-full h-3 overflow-hidden">
    <div
      className="h-full bg-warden-accent/70 rounded-full transition-all"
      style={{ width: `${(row.totalCostUsd / maxCost) * 100}%` }}
    />
  </div>
  <span className="w-20 text-right text-xs font-mono text-warden-accent">
    ${row.totalCostUsd.toFixed(4)}
  </span>
</div>
```

### Anti-Patterns to Avoid

- **Altering existing `token_usage` UNIQUE constraint:** Would require migration + potential data loss for existing rows that lack model info. New table is cleaner.
- **Adding `model` to the existing upsert without a new table:** The current `upsertTokenUsage()` uses `ON CONFLICT(agent_id, date)` — adding a model dimension requires a different UNIQUE key.
- **Using `window.open(url)` for CSV download:** Opens a new browser tab or renders raw text on some configurations. Synthetic anchor click + blob is reliable across browsers.
- **Using recharts for 3–5 bars:** Adds @reduxjs/toolkit, react-redux, victory-vendor, immer, and several D3 sub-packages. Unnecessary for a simple horizontal bar display.
- **Streaming CSV with Node streams for small datasets:** The `token_usage_by_model` table will contain hundreds of rows at most. `res.send(string)` is sufficient; streaming adds complexity with no benefit at this scale.
- **Generating CSV client-side from model-comparison API:** The model-comparison endpoint returns aggregated sums, not per-row detail. The CSV export requires the full per-(date, agent, model) rows — use a dedicated DB query for export.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV special character escaping (quotes in values) | Custom escape logic | Standard CSV escaping: wrap in quotes if value contains comma/quote/newline | Edge case: agent IDs with dashes are safe; but future-proof by wrapping string fields in quotes |
| Blob URL memory leak | Manual tracking | Always call `URL.revokeObjectURL()` immediately after `anchor.click()` | Modern browsers free blob URLs on navigation, but explicit revoke is the safe pattern |
| Model name normalization | Custom regex | Use the model string directly from JSONL; it's already normalized by Claude Code | `message.model` is the canonical model ID from the API |

**Key insight:** For CSV generation at this scale (hundreds to low thousands of rows), hand-rolled CSV concatenation in the Express handler is the right approach. External CSV-serialization libraries (`csv-stringify`, `fast-csv`) are for streaming/transform pipelines and add unnecessary complexity.

---

## Common Pitfalls

### Pitfall 1: `token_usage_by_model` not populated at first load

**What goes wrong:** Operator opens the model comparison view and sees no data because the new table is empty — the scanner hasn't run yet since server restart.
**Why it happens:** `SessionUsageReader.startPeriodicScan()` runs an immediate scan on startup, but the table migration runs in the same constructor. If the server was running without this table, there's nothing in `token_usage_by_model` yet.
**How to avoid:** The scanner already runs immediately on startup via `scanAllProjects()`. After the Phase 23 deploy, the first server start will populate the table within seconds. No special backfill needed — the scanner is idempotent.
**Warning signs:** ModelComparisonView shows empty state on first load after deploy; refreshes after ~5s once scan completes.

### Pitfall 2: Double-counting tokens if scanner also accumulates to existing `token_usage`

**What goes wrong:** The total in model-comparison doesn't match the total in the per-agent summary because the two tables diverge (scanner bugs, timing differences).
**Why it happens:** If the two accumulation paths (daily totals vs. model daily totals) use different filtering or pricing logic.
**How to avoid:** Both accumulators must process the same records with the same pricing. The safest approach is to accumulate both maps in the same `processJsonlFile()` call — same loop iteration, same record, same cost calculation.
**Warning signs:** Sum of model costs for an agent ≠ total cost in `token_usage` for the same (agent, date).

### Pitfall 3: `model` field missing or empty in JSONL records

**What goes wrong:** Many records aggregate under `model: ""` or `model: "unknown"`, making the comparison useless.
**Why it happens:** Some JSONL records may have `message.model` as `null`, `undefined`, or `""`. The current code uses `String(message['model'] ?? '')`.
**How to avoid:** Use a fallback model key of `"unknown"` when model is empty. Display `"unknown"` distinctly in the UI. The data from actual Claude Code sessions should always have a model — this is a defensive measure.
**Warning signs:** Large cost percentage attributed to `"unknown"` in the comparison view.

### Pitfall 4: CSV filename with spaces or special chars

**What goes wrong:** Browser saves file with unexpected encoding or strips the filename.
**Why it happens:** RFC 6266 has complex rules for non-ASCII filenames. `Content-Disposition: attachment; filename="token-usage.csv"` (ASCII only, no spaces in the quoted token) works universally.
**How to avoid:** Keep the filename simple: `token-usage.csv`. If adding a timestamp, use `token-usage-2026-03-04.csv` (ISO date, no spaces).
**Warning signs:** Downloaded file named `download` or `token-usage%20export.csv`.

### Pitfall 5: Export endpoint conflicts with existing `/api/history/token-usage` route

**What goes wrong:** Express matches `/api/history/token-usage/export` against the base `/api/history/token-usage` handler if routes are declared in wrong order, or query param handling breaks.
**Why it happens:** The existing route is `GET /api/history/token-usage` (query params); the new route is `GET /api/history/token-usage/export` (path segment). These are unambiguous in Express — Express matches by path literally before params. No shadowing risk as long as `/export` is registered BEFORE `:format` if a param route ever exists.
**How to avoid:** Register `/api/history/token-usage/export` route before any route with path params on the same base. In current code, there are no such params — safe.
**Warning signs:** Export endpoint returns token usage JSON instead of CSV.

---

## Code Examples

### SQLite Upsert for Per-Model Row

```typescript
// DatabaseConnection.ts
upsertTokenUsageByModel(row: TokenUsageByModelRow): void {
  this.db.prepare(`
    INSERT INTO token_usage_by_model
      (agent_id, date, model, input_tokens, output_tokens,
       cache_creation_input_tokens, cache_read_input_tokens, cost_usd)
    VALUES
      (@agentId, @date, @model, @inputTokens, @outputTokens,
       @cacheCreationInputTokens, @cacheReadInputTokens, @costUsd)
    ON CONFLICT(agent_id, date, model) DO UPDATE SET
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_creation_input_tokens = excluded.cache_creation_input_tokens,
      cache_read_input_tokens = excluded.cache_read_input_tokens,
      cost_usd = excluded.cost_usd
  `).run({
    agentId: row.agentId,
    date: row.date,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheCreationInputTokens: row.cacheCreationInputTokens,
    cacheReadInputTokens: row.cacheReadInputTokens,
    costUsd: row.costUsd,
  });
}
```

### CSV Export DB Query (full per-row data for TOKN-14 columns)

```typescript
// DatabaseConnection.ts
getTokenUsageForExport(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): TokenUsageExportRow[] {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.agentId) { conditions.push('agent_id = ?'); params.push(filters.agentId); }
  if (filters.dateFrom) { conditions.push('date >= ?'); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push('date <= ?'); params.push(filters.dateTo); }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return this.db.prepare(`
    SELECT
      date,
      agent_id AS agentId,
      model,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      cache_creation_input_tokens AS cacheCreationInputTokens,
      cache_read_input_tokens AS cacheReadInputTokens,
      cost_usd AS costUsd
    FROM token_usage_by_model ${whereClause}
    ORDER BY date DESC, agentId, model
  `).all(...params) as TokenUsageExportRow[];
}
```

### Shared Type Additions

```typescript
// src/shared/types.ts
export interface TokenUsageByModelRow {
  agentId: string;
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

export interface ModelComparisonRow {
  agentId: string;
  model: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface TokenUsageExportRow extends TokenUsageByModelRow {}
```

### ModelComparisonView Component Structure

```tsx
// src/client/components/ModelComparisonView.tsx
interface ModelComparisonViewProps {
  agentFilter?: string;
}

export function ModelComparisonView({ agentFilter }: ModelComparisonViewProps) {
  const [data, setData] = useState<ModelComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (agentFilter) params.set('agentId', agentFilter);
      const response = await fetch(`/api/history/model-comparison?${params}`);
      if (response.ok) {
        const json = await response.json();
        setData(json.modelComparison ?? []);
      }
      setIsLoading(false);
    };
    fetchData();
  }, [agentFilter]);

  // Group by agentId
  const byAgent = data.reduce<Record<string, ModelComparisonRow[]>>((acc, row) => {
    if (!acc[row.agentId]) acc[row.agentId] = [];
    acc[row.agentId].push(row);
    return acc;
  }, {});

  const maxCost = Math.max(...data.map((row) => row.totalCostUsd), 0.000001);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-warden-text">Model Cost Comparison</h3>
      {/* Per-agent sections with horizontal bars */}
      {Object.entries(byAgent).map(([agentId, rows]) => (
        <div key={agentId} className="bg-warden-border/20 rounded-lg p-3 space-y-2">
          <span className="text-sm font-medium text-warden-text">{formatAgentId(agentId)}</span>
          {rows.map((row) => (
            <div key={row.model} className="flex items-center gap-2">
              <span className="w-40 text-xs text-warden-text-dim truncate" title={row.model}>
                {row.model}
              </span>
              <div className="flex-1 bg-warden-border/30 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-warden-accent/70 rounded-full transition-all duration-300"
                  style={{ width: `${(row.totalCostUsd / maxCost) * 100}%` }}
                />
              </div>
              <span className="w-20 text-right text-xs font-mono text-warden-accent">
                ${row.totalCostUsd.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      ))}
      {!isLoading && data.length === 0 && (
        <p className="text-warden-text-dim text-sm text-center py-4">
          No model comparison data yet — run a scan first
        </p>
      )}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| D3 for all chart rendering | Recharts (D3-backed) or CSS bars | 2020+ | For small static comparisons, CSS width tricks are sufficient; no JS charting needed |
| `res.download(filePath)` from a temp file | `res.send(csvString)` with Content-Disposition | Express 4+ | No temp file cleanup needed for in-memory small CSVs |
| `FileSaver.js` for client downloads | Native `URL.createObjectURL` + anchor | Modern browsers (2022+) | No library needed; all major browsers support this API |
| ALTER TABLE to add dimension | New table with composite UNIQUE | Best practice always | Avoids migration complexity and preserves existing row semantics |

**Deprecated/outdated:**
- `res.attachment()` then pipe: Still valid for streaming, but `res.setHeader` + `res.send(string)` is simpler at this data scale.
- `FileSaver.js`: No longer needed for basic CSV downloads — native browser APIs are sufficient.

---

## Open Questions

1. **Bar chart scale: per-agent-local vs global max**
   - What we know: Each agent's bars could be scaled relative to the global max across all agents, or relative to that agent's max cost model.
   - What's unclear: Which is more useful for operator decision-making — global scale (shows which agent/model pair dominates overall) or per-agent scale (shows model distribution within each agent)?
   - Recommendation: Use global max scale (more useful for cross-agent comparison). Add total cost label on each agent section as context.

2. **Export scope: full history or current filter?**
   - What we know: TOKN-14 spec says "full token usage dataset" — no mention of filters.
   - What's unclear: Should the agentId filter from TokenUsageView apply to the export?
   - Recommendation: Export the full unfiltered dataset by default. Optionally pass the current agentFilter as a query param if it's set, with a note in the UI ("Exporting filtered data for: [agent]").

3. **`token_usage_by_model` backfill for data before Phase 23**
   - What we know: The scanner is idempotent; it re-reads all JSONL files on each scan cycle. After Phase 23 deploys, the first scan will populate `token_usage_by_model` with all historical data.
   - What's unclear: Nothing — this is handled automatically by the existing scan-on-startup behavior.
   - Recommendation: No special backfill code needed. Document in implementation notes.

---

## Sources

### Primary (HIGH confidence)
- Live codebase inspection — `src/server/database/DatabaseConnection.ts`, `src/server/services/SessionUsageReader.ts`, `src/server/routes/historyRoutes.ts`, `src/client/components/TokenUsageView.tsx` — confirmed current schema and patterns
- Live SQLite DB query — confirmed `token_usage` table has `UNIQUE(agent_id, date)`, no `model` column
- `npm info recharts@3.7.0` — confirmed version 3.7.0, peer deps include `react: '^19.0.0'`, runtime deps include @reduxjs/toolkit, victory-vendor
- `npm install recharts --dry-run` — confirmed recharts adds D3 sub-packages (d3-path, d3-scale, d3-shape, etc.) as transitive deps

### Secondary (MEDIUM confidence)
- Express.js Content-Disposition pattern — multiple sources agree on `res.setHeader('Content-Disposition', 'attachment; filename="file.csv"')` + `res.send(string)`
- Browser blob download pattern — MDN Web Docs via WebSearch — `URL.createObjectURL` + synthetic anchor click is the standard pattern for fetch-based downloads
- CSS horizontal bar chart pattern — no library needed; width-percentage div approach is well-established for 3–5 category comparisons

### Tertiary (LOW confidence)
- recharts bundle size on bundlephobia not directly verified (page content not returned); tarball size is 1.4MB which indicates substantial bundle weight; combined with 11 runtime dependencies, the "avoid recharts" recommendation stands

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from live codebase and npm registry
- Architecture: HIGH — patterns derived from existing codebase code, not speculation; new table pattern follows existing migration style
- Pitfalls: HIGH — pitfalls derived from direct schema inspection (live DB confirms no model column) and known SQLite constraints

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain — Express, SQLite, browser APIs change rarely)
