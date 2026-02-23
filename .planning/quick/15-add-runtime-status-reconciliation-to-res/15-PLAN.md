---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/reconcile-deployment-gaps.ts
  - .planning/phases/18-fix-token-usage-jsonl-session-reader-and-database-population/18-VERIFICATION.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
autonomous: true
requirements: [RECONCILE-01]
must_haves:
  truths:
    - "Running `npx tsx scripts/reconcile-deployment-gaps.ts` against a live Warden server probes /api/health, /api/history/token-usage, and /api/history/token-usage/scan to detect whether deployment gaps have been resolved"
    - "If all runtime probes pass, the script updates VERIFICATION.md status from gaps_found to verified and clears the gaps list"
    - "ROADMAP.md Phase 18 plan checkboxes are marked complete and STATE.md reflects the reconciled state"
  artifacts:
    - path: "scripts/reconcile-deployment-gaps.ts"
      provides: "Runtime reconciliation script that probes live server and updates stale verification/planning docs"
      min_lines: 80
  key_links:
    - from: "scripts/reconcile-deployment-gaps.ts"
      to: "http://127.0.0.1:3001/api/health"
      via: "fetch GET"
      pattern: "fetch.*api/health"
    - from: "scripts/reconcile-deployment-gaps.ts"
      to: "http://127.0.0.1:3001/api/history/token-usage"
      via: "fetch GET"
      pattern: "fetch.*api/history/token-usage"
    - from: "scripts/reconcile-deployment-gaps.ts"
      to: ".planning/phases/18-*/18-VERIFICATION.md"
      via: "fs.readFileSync + fs.writeFileSync"
      pattern: "writeFileSync.*VERIFICATION"
---

<objective>
Create a runtime status reconciliation script that probes the live Warden server to detect whether deployment-gap warnings in VERIFICATION.md are stale. If the server is running the new build and data is present, automatically clear the gaps and update planning docs to reflect actual deployment state.

Purpose: Prevent `/gsd:resume-work` from surfacing stale "server not restarted" warnings when the server has already been restarted and Phase 18 is fully deployed.
Output: `scripts/reconcile-deployment-gaps.ts` script + updated VERIFICATION.md, ROADMAP.md, and STATE.md
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/18-fix-token-usage-jsonl-session-reader-and-database-population/18-VERIFICATION.md
@src/server/index.ts
@src/server/routes/historyRoutes.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create runtime reconciliation script</name>
  <files>scripts/reconcile-deployment-gaps.ts</files>
  <action>
Create `scripts/reconcile-deployment-gaps.ts` — a standalone Node.js script (run via `npx tsx`) that:

1. **Probe /api/health** — `GET http://127.0.0.1:3001/api/health`
   - Verify response is 200 with `status: 'ok'`
   - Extract `uptime` (seconds) — compute approximate server start time
   - If server is unreachable, print "Server not running at :3001 — gaps cannot be reconciled" and exit 1

2. **Probe /api/history/token-usage** — `GET http://127.0.0.1:3001/api/history/token-usage`
   - Verify response contains `usage` array with length > 0
   - Verify response contains `summary` array with length > 0
   - This confirms the JSONL scanner has run and populated the database
   - If usage is empty, print "Token usage data not yet populated — gap still present" and exit 1

3. **Probe /api/history/token-usage/scan** — `POST http://127.0.0.1:3001/api/history/token-usage/scan`
   - Verify response is `{ status: 'ok' }`
   - This confirms the scan endpoint is wired and functional
   - If scan fails, print "Scan endpoint not functional — gap still present" and exit 1

4. **If all 3 probes pass**, update `.planning/phases/18-fix-token-usage-jsonl-session-reader-and-database-population/18-VERIFICATION.md`:
   - Change frontmatter `status: gaps_found` to `status: verified`
   - Change `score: 8/10 must-haves verified` to `score: 10/10 must-haves verified`
   - Change `re_verification: false` to `re_verification: true`
   - Empty the `gaps:` array in frontmatter (set to `gaps: []`)
   - In the markdown body, update the 3 FAILED truths (#4, #6, #9) to VERIFIED with evidence note: "Reconciled {date} — runtime probe confirmed server running (uptime {N}s), token_usage table populated ({M} rows), scan endpoint functional"
   - Update the "Running server process" key link from NOT_WIRED to VERIFIED
   - Update the TOKN-02 and TOKN-04 requirement status from "BLOCKED (runtime)" / "BLOCKED (live DB)" to "SATISFIED"
   - Update the "Gaps Summary" section to: "All gaps resolved. Runtime reconciliation on {date} confirmed server is running the Phase 18 build."
   - Update the data/warden.db artifact from FAILED to VERIFIED

5. **Update ROADMAP.md**:
   - Change Phase 18 plan checkboxes from `- [ ]` to `- [x]` for both 18-01-PLAN.md and 18-02-PLAN.md
   - Add Phase 18 to the Progress table at the bottom with status Complete

6. **Update STATE.md**:
   - Confirm "Phase 18 complete" status is already reflected (it should be from the plan execution)
   - No changes needed if already showing Phase 18 complete

Print a summary of all changes made. Use `node:fs` and `node:path` for file operations. Use global `fetch` (Node.js 22 built-in). No external dependencies.

Script should be idempotent — running it again when VERIFICATION.md already says `verified` should print "Already reconciled" and exit 0.
  </action>
  <verify>
    <automated>npx tsx scripts/reconcile-deployment-gaps.ts</automated>
    <manual>Check that 18-VERIFICATION.md frontmatter now shows status: verified and all FAILED truths are VERIFIED</manual>
  </verify>
  <done>Script runs against live server, all 3 probes pass, VERIFICATION.md updated from gaps_found to verified with all truths marked VERIFIED, ROADMAP.md Phase 18 checkboxes marked [x], script exits 0</done>
</task>

<task type="auto">
  <name>Task 2: Build production and verify end-to-end</name>
  <files></files>
  <action>
Run `npm run build` to ensure the production build is current (per CLAUDE.md requirement — user runs production mode).

Then verify the reconciliation script produced valid output:
1. Confirm 18-VERIFICATION.md has `status: verified` in frontmatter
2. Confirm no FAILED entries remain in the truths table
3. Confirm ROADMAP.md has `[x]` for both Phase 18 plans
4. Confirm the script is idempotent by running it a second time — should print "Already reconciled" and exit 0
  </action>
  <verify>
    <automated>npx tsx scripts/reconcile-deployment-gaps.ts && echo "EXIT CODE: $?"</automated>
    <manual>Open 18-VERIFICATION.md and confirm all truths show VERIFIED</manual>
  </verify>
  <done>Production build succeeds, reconciliation script is idempotent (second run exits 0 with "Already reconciled"), all planning docs reflect Phase 18 as fully verified and deployed</done>
</task>

</tasks>

<verification>
- `npx tsx scripts/reconcile-deployment-gaps.ts` exits 0 with summary of reconciled gaps
- 18-VERIFICATION.md frontmatter: `status: verified`, `score: 10/10`, `gaps: []`
- 18-VERIFICATION.md body: no FAILED truths, no NOT_WIRED key links
- ROADMAP.md: Phase 18 plans marked `[x]`
- Second run of script prints "Already reconciled" and exits 0
- `npm run build` passes
</verification>

<success_criteria>
Deployment gaps from Phase 18 are reconciled by probing the live runtime. The VERIFICATION.md, ROADMAP.md, and STATE.md accurately reflect the actual deployed state of Phase 18. The reconciliation script is reusable and idempotent.
</success_criteria>

<output>
After completion, create `.planning/quick/15-add-runtime-status-reconciliation-to-res/15-SUMMARY.md`
</output>
