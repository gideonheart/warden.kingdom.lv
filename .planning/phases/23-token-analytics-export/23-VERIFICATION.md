---
phase: 23-token-analytics-export
verified: 2026-03-04T08:30:00Z
status: passed
score: 8/8 must-haves verified
gaps: []
note: "Initial verification found json.data vs json.modelComparison key mismatch in ModelComparisonView.tsx. Fixed in commit e6325f0."
---

# Phase 23: Token Analytics Export Verification Report

**Phase Goal:** Operator can compare model costs across agents for spend optimization and export the full dataset for external analysis.
**Verified:** 2026-03-04T08:30:00Z
**Status:** passed
**Re-verification:** Gap fixed inline (commit e6325f0), re-verified

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/history/model-comparison returns per-model cost grouped by agent with date range filtering | VERIFIED | historyRoutes.ts line 33–37: endpoint registered, calls database.getModelComparison({agentId,dateFrom,dateTo}), returns {modelComparison:data} |
| 2 | GET /api/history/token-usage/export returns a valid CSV with headers date,agent_id,model,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens,cost_usd and Content-Disposition attachment header | VERIFIED | historyRoutes.ts lines 39–57: all 8 headers present, Content-Type text/csv, Content-Disposition attachment with date-stamped filename |
| 3 | The JSONL scanner populates token_usage_by_model with per-model daily aggregates on each scan cycle | VERIFIED | SessionUsageReader.ts lines 171, 174, 196–214: modelDailyUsage Map initialized, passed to processJsonlFile(), upsertTokenUsageByModel() called for each (date,model) pair |
| 4 | Existing burn rate and budget alert endpoints continue to work unchanged | VERIFIED | historyRoutes.ts lines 80–122: /api/history/burn-rate, /api/history/budget-config/status, /api/history/budget-config, /api/history/budget-config/:agentId all present and unchanged |
| 5 | Operator can see a Model Costs tab in the token usage section and click it to view per-model cost breakdown by agent | FAILED | Tab UI exists and is correctly wired (TokenUsageView.tsx lines 57,67,268-275,291-293), BUT ModelComparisonView always renders empty because line 87 reads json.data (undefined) instead of json.modelComparison |
| 6 | Each agent section shows grouped horizontal bars with model-specific colors — purple for Opus, blue for Sonnet, green for Haiku | FAILED | Bar rendering code is correct (ModelComparisonView.tsx lines 179-239, getModelColorClass() lines 23-29) but never executes because data is always [] due to the key mismatch above |
| 7 | Operator can switch time range with preset buttons (24h / 7d / 30d / All) and the bar chart updates | FAILED | Time range state and buttons implemented correctly (lines 8-17, 70, 74-97) and useEffect dependency on timeRange is correct, but chart still stays empty because data never loads |
| 8 | An auto-generated insight headline summarizes the biggest cost driver | FAILED | Insight logic is correct (lines 104-124) but always shows "No usage data yet" because data is [] |
| 9 | Operator can click an Export button in the token usage section header and a CSV file downloads with filename warden-token-usage-YYYY-MM-DD.csv | VERIFIED | TokenUsageView.tsx lines 206-223: handleExport fetches /api/history/token-usage/export, creates blob, creates anchor with correct filename, clicks it |
| 10 | A brief toast notification appears after export for 2-3 seconds confirming download | VERIFIED | TokenUsageView.tsx lines 69-70, 218-219, 591-595: exportToast state, setExportToast(true) after download, setTimeout 3000ms to dismiss, fixed-position toast renders "Export downloaded" |

**Score:** 7/8 plan truths verified (Truths 5-8 fail from single root cause; grouped as one gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/types.ts` | TokenUsageByModelRow, ModelComparisonRow, TokenUsageExportRow types | VERIFIED | Lines 74-93: all three types defined after BudgetAlertStatus |
| `src/server/database/DatabaseConnection.ts` | token_usage_by_model table migration, upsertTokenUsageByModel(), getModelComparison(), getTokenUsageForExport() | VERIFIED | Lines 385-402 (migration), 405-425 (upsert), 427-457 (getModelComparison), 459-491 (getTokenUsageForExport) |
| `src/server/services/SessionUsageReader.ts` | Per-model accumulator in scanProject(), calls upsertTokenUsageByModel() | VERIFIED | Lines 171 (modelDailyUsage Map), 174 (passed to processJsonlFile), 196-214 (upsert loop), 308-330 (accumulation in processJsonlFile) |
| `src/server/routes/historyRoutes.ts` | GET /api/history/model-comparison and GET /api/history/token-usage/export endpoints | VERIFIED | Lines 33-37 (model-comparison), 39-57 (export) |
| `src/client/components/ModelComparisonView.tsx` | ModelComparisonView component with grouped bar chart, time range buttons, insight headline | STUB (wiring) | Component exists with full implementation but is functionally empty at runtime due to JSON key mismatch at line 87 |
| `src/client/components/TokenUsageView.tsx` | Model Costs tab, Export button with toast notification | VERIFIED | Lines 57-67 (tab state), 254-293 (tab bar + Model Costs tab), 206-223 (handleExport), 591-595 (toast) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SessionUsageReader.ts` | `DatabaseConnection.ts` | `database.upsertTokenUsageByModel()` | WIRED | Line 209: `database.upsertTokenUsageByModel(row)` called inside model accumulation loop |
| `historyRoutes.ts` | `DatabaseConnection.ts` | `database.getModelComparison()` and `database.getTokenUsageForExport()` | WIRED | Lines 35, 40: both calls present |
| `ModelComparisonView.tsx` | `/api/history/model-comparison` | `fetch` in useEffect | PARTIAL | Line 84: fetch URL correct, but line 87 reads `json.data` instead of `json.modelComparison` — response key mismatch breaks data flow |
| `TokenUsageView.tsx` | `/api/history/token-usage/export` | `fetch` + blob download in `handleExport` | WIRED | Lines 208-218: correct fetch, blob, createObjectURL, anchor.download, anchor.click() |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TOKN-12 | 23-01, 23-02 | Model comparison view showing cost breakdown by model variant per agent as bar chart or table | BLOCKED | Data layer complete; client component renders but always shows empty due to json.data vs json.modelComparison mismatch |
| TOKN-14 | 23-01, 23-02 | Export button downloads full token usage dataset as CSV with all 8 required columns | SATISFIED | Server endpoint returns correct CSV, client downloads correctly, filename matches spec |

Both requirements are claimed complete in REQUIREMENTS.md (marked [x]) and in both SUMMARY files. TOKN-12 is not satisfied — the model comparison chart cannot display data.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/client/components/ModelComparisonView.tsx` | 87 | `setData(json.data ?? [])` — wrong key, API returns `json.modelComparison` | Blocker | Bar chart always empty; insight headline always "No usage data yet"; time range selector has no visible effect |

No placeholder returns, TODOs, or stub implementations found in any of the five modified files.

### Human Verification Required

#### 1. Verify Export CSV column ordering in downloaded file

**Test:** Click Export CSV button in the History tab. Open the downloaded `warden-token-usage-YYYY-MM-DD.csv` in a text editor or spreadsheet.
**Expected:** First row is `date,agent_id,model,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens,cost_usd`. Data rows follow with real values.
**Why human:** Cannot verify file download behavior or actual file contents programmatically without running the server.

#### 2. Verify toast notification visibility and timing

**Test:** Click Export CSV. Observe the bottom-right corner of the UI.
**Expected:** "Export downloaded" notification appears for approximately 3 seconds then fades away.
**Why human:** Visual behavior and timing cannot be verified from static code analysis alone.

### Gaps Summary

**One root-cause gap blocks TOKN-12 (model comparison view):**

`ModelComparisonView.tsx` at line 87 reads `json.data` but the API at `/api/history/model-comparison` returns `{ modelComparison: [...] }`. This single character-level key mismatch means:

- `json.data` is always `undefined`
- `setData(json.data ?? [])` always sets data to `[]`
- The bar chart section never renders (condition `agentGroups.size > 0` is always false)
- The insight headline always shows "No usage data yet"
- Time range selector re-fetches but the result is still discarded

**Fix required:** Change line 87 from `setData(json.data ?? [])` to `setData(json.modelComparison ?? [])`.

This is the only gap. All server-side infrastructure (database table, scanner accumulation, API endpoints) is fully correct. The CSV export path (TOKN-14) is fully functional. The tab navigation and time range buttons are correctly wired — only the response key name is wrong.

---

_Verified: 2026-03-04T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
