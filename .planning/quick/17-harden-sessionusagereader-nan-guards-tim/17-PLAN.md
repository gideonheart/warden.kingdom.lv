---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/services/SessionUsageReader.ts
autonomous: true
requirements: [NAN-GUARD, TIMESTAMP-VALIDATE, MODEL-WARN]
must_haves:
  truths:
    - "Non-numeric token fields produce 0, not NaN, and the record is skipped with a warning"
    - "Non-ISO timestamps cause the record to be skipped instead of producing garbage date keys"
    - "Unknown model names trigger a console.warn the first time they appear per scan, not silently every time"
  artifacts:
    - path: "src/server/services/SessionUsageReader.ts"
      provides: "Hardened JSONL token usage scanner"
      contains: "isNaN"
    - path: "src/server/services/SessionUsageReader.ts"
      provides: "Timestamp validation guard"
      contains: "ISO_DATE_REGEX"
    - path: "src/server/services/SessionUsageReader.ts"
      provides: "Unknown model warn-once logic"
      contains: "warnedModels"
  key_links:
    - from: "src/server/services/SessionUsageReader.ts"
      to: "database.upsertTokenUsage"
      via: "NaN-guarded accumulator values"
      pattern: "isNaN"
---

<objective>
Add three defensive guards to SessionUsageReader.processJsonlFile to prevent silent data corruption:
1. NaN guard on Number() conversions for token counts — skip record if any value is NaN
2. Timestamp validation — skip record if timestamp does not match YYYY-MM-DD prefix pattern
3. Unknown model warn-once — log a warning the first time an unknown model is seen per scan cycle

Purpose: Prevent garbage data from reaching the SQLite token_usage table and surface pricing drift via logs.
Output: Hardened SessionUsageReader.ts with all three guards.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/server/services/SessionUsageReader.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add NaN guards, timestamp validation, and unknown model warn-once</name>
  <files>src/server/services/SessionUsageReader.ts</files>
  <action>
All changes are in `processJsonlFile()` and at module/class scope. No structural refactoring — only add guards around existing code.

**1. Timestamp validation (line ~228 area, after extracting `timestamp`):**
Add a regex constant at module scope:
```typescript
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;
```
After `const date = timestamp.slice(0, 10);`, add:
```typescript
if (!ISO_DATE_REGEX.test(date)) {
  continue; // Skip records with non-ISO timestamps
}
```

**2. NaN guard on token counts (lines ~231-234 area):**
After the four `Number()` conversions (`inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`), add:
```typescript
if (isNaN(inputTokens) || isNaN(outputTokens) || isNaN(cacheCreationInputTokens) || isNaN(cacheReadInputTokens)) {
  console.warn('[SessionUsageReader] Skipping record with non-numeric token value in', filePath);
  continue;
}
```
This prevents NaN from propagating through the cost calculation and into the DB upsert.

**3. Unknown model warn-once (line ~238 area):**
Add a `Set<string>` field to the class:
```typescript
private warnedModels = new Set<string>();
```
After `const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;`, add:
```typescript
if (!MODEL_PRICING[model] && model && !this.warnedModels.has(model)) {
  this.warnedModels.add(model);
  console.warn(`[SessionUsageReader] Unknown model "${model}", using fallback pricing`);
}
```
Clear the set at the start of `scanAllProjects()` (after the `scanInProgress` check, before the try block):
```typescript
this.warnedModels.clear();
```
This logs each unknown model exactly once per scan cycle, preventing log spam while still surfacing pricing drift.

**Important:** Do NOT change any other logic. Do not restructure the class, rename variables, or modify the accumulation/upsert logic.
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Review the diff to confirm only guards were added, no structural changes</manual>
  </verify>
  <done>
    - ISO_DATE_REGEX constant exists and is tested against `date` before accumulation
    - isNaN check on all four token Number() conversions with continue + console.warn on failure
    - warnedModels Set on class, checked after MODEL_PRICING fallback, cleared per scan cycle
    - TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Build production bundle and verify</name>
  <files>dist/server/services/SessionUsageReader.js</files>
  <action>
Run `npm run build` to produce the production bundle. The user runs production mode, so this is required.
Verify the build succeeds and the output file contains the new guards (grep for `isNaN` and `ISO_DATE_REGEX` and `warnedModels` in the built JS).
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>
    - `npm run build` exits 0
    - `dist/server/services/SessionUsageReader.js` contains isNaN guard, ISO_DATE_REGEX, and warnedModels logic
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds
- `git diff` shows only additions (no deletions or structural changes) in SessionUsageReader.ts
</verification>

<success_criteria>
- Non-numeric token fields trigger NaN guard and skip the record with a warning
- Non-ISO timestamps are rejected before reaching the accumulator
- Unknown models are warned once per scan cycle, not silently or on every occurrence
- Production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/17-harden-sessionusagereader-nan-guards-tim/17-SUMMARY.md`
</output>
