---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/services/SessionUsageReader.ts
autonomous: true
requirements: [STREAM-JSONL, SCAN-OVERLAP-GUARD]

must_haves:
  truths:
    - "JSONL files are read line-by-line via Node.js streams, never loaded whole into memory"
    - "Concurrent scans are prevented — only one scanAllProjects runs at a time"
    - "Manual POST scan and periodic interval scan share the same overlap guard"
    - "Token usage data is still correctly aggregated and upserted into SQLite"
  artifacts:
    - path: "src/server/services/SessionUsageReader.ts"
      provides: "Streaming JSONL reader with scan overlap guard"
      contains: "createReadStream"
  key_links:
    - from: "src/server/services/SessionUsageReader.ts"
      to: "node:readline"
      via: "createInterface wrapping createReadStream"
      pattern: "createInterface.*createReadStream"
    - from: "src/server/services/SessionUsageReader.ts"
      to: "database.upsertTokenUsage"
      via: "upsert call after daily aggregation"
      pattern: "database\\.upsertTokenUsage"
---

<objective>
Refactor SessionUsageReader to stream JSONL files line-by-line instead of loading entire files into memory, and add a scan overlap guard so concurrent scans (periodic timer + manual POST endpoint) never run simultaneously.

Purpose: The current approach calls readFile on every JSONL file (230+ files, largest 5MB), buffering the entire file contents into memory strings before splitting by newline. With ~100MB total JSONL data, this creates significant memory pressure during each 5-minute scan cycle. Streaming via readline+createReadStream processes one line at a time with constant memory. The overlap guard prevents a manual "Scan Now" from colliding with a periodic scan already in progress.

Output: Refactored SessionUsageReader.ts with streaming reads and a mutex-style scanning flag.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/server/services/SessionUsageReader.ts
@src/server/routes/historyRoutes.ts
@src/server/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace readFile with readline stream in processJsonlFile</name>
  <files>src/server/services/SessionUsageReader.ts</files>
  <action>
Replace the `processJsonlFile` method to use Node.js built-in streaming instead of whole-file `readFile`:

1. Add imports at the top of the file:
   - `import { createReadStream } from 'fs';`
   - `import { createInterface } from 'readline';`
   Remove `readFile` from the existing `fs/promises` import (keep `readdir`).

2. Rewrite `processJsonlFile` to:
   - Create a read stream: `createReadStream(filePath, { encoding: 'utf-8' })`
   - Wrap it with readline: `createInterface({ input: readStream, crlfDelay: Infinity })`
   - Use `for await (const line of rl)` to iterate lines one at a time
   - Keep ALL existing line-processing logic UNCHANGED (the JSON.parse, type check, usage extraction, cost computation, accumulator logic). Move it line-for-line into the async iterator body.
   - Wrap the entire method body in a try/catch. On error (file unreadable, stream error), return silently — matching current skip-without-logging behavior.
   - Ensure the readline interface and read stream are properly closed in all paths. Use a try/finally to call `rl.close()` and `readStream.destroy()` in the finally block.

The method signature stays identical: `private async processJsonlFile(filePath: string, dailyUsage: Map<string, UsageAccumulator>): Promise<void>`

Do NOT change any other methods (scanAllProjects, scanProject, startPeriodicScan, stopPeriodicScan). Do NOT change the MODEL_PRICING map, interfaces, or the exported singleton.
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && npm run typecheck</automated>
    <manual>Verify the file no longer imports readFile and instead uses createReadStream + createInterface</manual>
  </verify>
  <done>processJsonlFile uses readline createInterface over createReadStream for line-by-line processing; readFile is no longer imported; all existing line parsing logic is preserved unchanged; typecheck passes</done>
</task>

<task type="auto">
  <name>Task 2: Add scan overlap guard to prevent concurrent scans</name>
  <files>src/server/services/SessionUsageReader.ts</files>
  <action>
Add a mutex-style guard so that only one `scanAllProjects` call runs at a time:

1. Add a private instance field: `private scanInProgress = false;`

2. At the top of `scanAllProjects()`, check the guard:
   ```
   if (this.scanInProgress) {
     console.log('[SessionUsageReader] Scan already in progress, skipping');
     return;
   }
   ```

3. Set `this.scanInProgress = true;` immediately after the guard check.

4. Wrap the entire scan body (the readdir + for-loop over projects) in a `try { ... } finally { this.scanInProgress = false; }` block so the flag is always cleared, even on error.

This ensures:
- If the periodic 5-minute interval fires while a manual scan is running, the interval scan is skipped.
- If the user clicks "Scan Now" while a periodic scan is running, the manual scan returns immediately without error (the POST endpoint gets a fast response).
- The flag always resets even if the scan throws.

Do NOT change the method signature. `scanAllProjects` remains `async scanAllProjects(): Promise<void>`.
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && npm run typecheck && npm run build</automated>
    <manual>Read SessionUsageReader.ts and confirm scanInProgress flag is set before scan, checked at method entry, and cleared in finally block</manual>
  </verify>
  <done>scanAllProjects has a scanInProgress boolean guard that prevents concurrent execution; the guard is cleared in a finally block; typecheck and build both pass; the POST /api/history/token-usage/scan endpoint works correctly because scanAllProjects returns early (not throws) when a scan is already running</done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with no errors
- `npm run build` succeeds (production build required per CLAUDE.md memory note)
- SessionUsageReader.ts no longer imports `readFile` from `fs/promises`
- SessionUsageReader.ts imports `createReadStream` from `fs` and `createInterface` from `readline`
- `scanInProgress` field exists and is checked at the top of `scanAllProjects`
- `processJsonlFile` uses `for await (const line of rl)` pattern
</verification>

<success_criteria>
- JSONL files are processed via streaming readline (no whole-file buffering)
- Concurrent scan attempts are harmlessly skipped (not queued, not errored)
- All existing token aggregation and upsert logic unchanged
- Production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/16-refactor-sessionusagereader-to-stream-js/16-SUMMARY.md`
</output>
