---
phase: quick-2039
plan: 1
subsystem: planning
tags: [review, phase-21, lifecycle, milestone, tech-debt]
dependency_graph:
  requires:
    - .planning/phases/21-agent-lifecycle-controls/21-01-SUMMARY.md
    - .planning/phases/21-agent-lifecycle-controls/21-02-SUMMARY.md
    - .planning/phases/21-agent-lifecycle-controls/21-03-SUMMARY.md
    - .planning/phases/21-agent-lifecycle-controls/21-VERIFICATION.md
  provides:
    - Phase 21 review document with analysis and milestone recommendation
  affects:
    - src/server/routes/instanceRoutes.ts (unused import removed)
    - .planning/ROADMAP.md (21-03 checkbox + progress table row fixed)
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/2039-review-phase-21-commits-and-confirm-mile/2039-SUMMARY.md
  modified:
    - src/server/routes/instanceRoutes.ts
    - .planning/ROADMAP.md
decisions:
  - "Do NOT run /gsd:complete-milestone — v3.1 has 4 remaining phases (22-25); only Phase 21 of 5 is done"
  - "Next step is /gsd:research-phase 22 for Token Burn Rate & Budget Alerts"
metrics:
  duration_seconds: 180
  completed_date: "2026-03-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Quick Task 2039: Phase 21 Review & Milestone Confirmation

**One-liner:** Phase 21 (Agent Lifecycle Controls) completed cleanly across 3 plans — unused import removed, ROADMAP corrected, v3.1 milestone is 1 of 5 phases done; next step is Phase 22.

---

## Phase 21 Review

### What Went Well

**1. Clean 3-plan structure with incremental delivery**
Each plan delivered a discrete, shippable increment:
- 21-01: Server-side lifecycle API (endpoints, state machine, InstanceTracker reconciliation)
- 21-02: Client-side lifecycle UI (badges, dialogs, overlays, Start/Stop/Restart/Force Kill)
- 21-03: Gap closure (stopped session 30-minute visibility window)

This incremental approach allowed verification to catch a real gap (stopped sessions disappearing from API) between plans 2 and 3, rather than discovering it post-ship.

**2. Fire-and-forget 202 pattern reused from Phase 12**
The non-blocking start pattern (`POST /api/instances/start` returns 202 immediately, session appears via InstanceTracker within 10s) was a proven Phase 12 pattern applied correctly. No event loop blocking concerns, no need for spawn detach complexity.

**3. Verification caught a real gap — and closed it**
Initial verification (21-VERIFICATION.md, first pass) found 4/5 success criteria satisfied. The gap — stopped sessions disappearing from API, breaking Restart flow — was isolated to a single SQL query missing an OR clause. Plan 21-03 fixed it in one commit (`93b4f4a`). Re-verification confirmed 5/5. This is the verification workflow working as designed.

**4. All 5 ORCH requirements satisfied**
ORCH-01 through ORCH-05 are all verified as satisfied per 21-VERIFICATION.md. No requirements left open or deferred.

**5. Build passes cleanly throughout all 3 plans**
Zero TypeScript errors at every stage. The 633 kB JS bundle warning is pre-existing and not introduced by Phase 21.

**6. Total code change: ~1,950 lines across 11 source files**
- 5 server files modified (21-01): `types.ts`, `instanceRoutes.ts`, `TmuxSessionManager.ts`, `InstanceTracker.ts`, `DatabaseConnection.ts`
- 5 client files modified (21-02): `gsdShared.tsx`, `AgentSidebar.tsx`, `InstanceTabBar.tsx`, `TerminalView.tsx`, `App.tsx`
- 1 additional file modified (21-03): `DatabaseConnection.ts` (gap closure OR clause)

**7. Execution speed**
- 21-01: 161 seconds (2.7 minutes)
- 21-02: <5 minutes
- 21-03: ~5 minutes
Total active implementation time: under 15 minutes for a complete lifecycle control system.

---

### Edge Cases and Known Limitations

**1. 30-minute stopped session retention is hardcoded**
The `datetime('now', '-30 minutes')` window in `listActiveInstances()` is a constant, not a user-configurable setting. Fine for v3.1, but Phase 22+ could expose this as an operator preference if tab bar clutter becomes a complaint.

**2. InstanceTracker reconciliation thresholds are hardcoded**
Three thresholds baked into `InstanceTracker.ts`:
- 15 seconds: `starting` → `active` promotion after tmux session appears
- 30 seconds: `starting` → `error` timeout if session never appears
- 15 seconds: `stopping` force-kill if session doesn't exit

These values were chosen for tmux + Claude Code workloads and work well. They are not configurable. Any agent or workload with slower startup would need a code change.

**3. `detectAgentState()` regex heuristics remain fragile**
This is a carry-over known limitation from Phase 19/20, documented in STATE.md. Phase 21 does not improve or worsen heuristic reliability. Phase 25 (stretch goal) depends on its accuracy for auto-record triggers.

**4. 633 kB JS bundle (pre-existing)**
The chunk size warning appeared before Phase 21 and is not addressed here. Phase 23 or a future housekeeping phase is the right time to evaluate code splitting.

---

### Tech Debt Fixed in This Review

**1. Removed unused `openSync`/`closeSync` import from `instanceRoutes.ts`**
- **File:** `src/server/routes/instanceRoutes.ts` line 3 (removed)
- **Issue:** Dead code carry-over from 21-01 development. The `START_LOG_DIR` constant and `spawnLogPath` string construction reference the log path for error messages but do not actually open the file with `openSync`/`closeSync`.
- **Fix:** Removed the `import { openSync, closeSync } from 'fs';` line. No functional impact.
- **Commit:** `0adb236`

**2. Fixed ROADMAP.md 21-03 checkbox**
- The `21-03-PLAN.md` checkbox was `[ ]` (unchecked) even though the plan was fully executed (commits `93b4f4a` + `584f5ff`).
- Fixed to `[x]`.
- **Commit:** `0adb236`

**3. Fixed ROADMAP.md Phase 21 progress table row**
- Row was: `| 21. Agent Lifecycle Controls | 3/3 | Complete    | 2026-03-04 | - |` (missing Milestone column, trailing `- |`)
- Fixed to: `| 21. Agent Lifecycle Controls | v3.1 | 3/3 | Complete | 2026-03-04 |`
- **Commit:** `0adb236`

---

### Remaining Tech Debt (Minor)

No new tech debt introduced by Phase 21 beyond items already tracked in STATE.md.

The three known items remain:
1. Hardcoded InstanceTracker thresholds (out of scope until a workload needs tuning)
2. Hardcoded 30-minute retention window (out of scope until operator feedback)
3. `detectAgentState()` regex heuristics (tracked in STATE.md blockers for Phase 25)

---

## Milestone Status

**Milestone:** v3.1 — Agent Control & Deep Insights (Phases 21-25)

### Phase Completion Status

| Phase | Name | Status |
|-------|------|--------|
| 21 | Agent Lifecycle Controls | Complete (3/3 plans) |
| 22 | Token Burn Rate & Budget Alerts | Not started |
| 23 | Token Analytics & Export | Not started |
| 24 | Session Recording & Replay | Not started |
| 25 | Recording Automation (stretch) | Not started |

**v3.1 completion: 1 of 5 phases done (20%)**

### Recommendation

**Do NOT run `/gsd:complete-milestone` now.**

Phase 21 is the first phase of v3.1, not the last. Running `/gsd:complete-milestone` would be incorrect — the milestone is only 20% complete.

**Next step: `/gsd:research-phase 22`**

Phase 22 is Token Burn Rate & Budget Alerts. The token_usage SQLite table is populated (Phase 18), the database infrastructure is solid, and the Phase 22 plans are already stubbed in ROADMAP.md:
- 22-01: Server-side burn rate — time-windowed SQL aggregation, budget_config table, cost projection
- 22-02: Client-side burn rate & alerts — window selector UI, burn rate display, budget threshold editor, amber/red History badge

Research phase should confirm the SQL aggregation approach (sliding window vs. pre-aggregated) and validate that the existing `token_usage` schema has sufficient timestamp resolution for 1h/4h/24h windows.

---

## Self-Check

- `src/server/routes/instanceRoutes.ts` — unused import removed: VERIFIED (commit 0adb236, build passes)
- `.planning/ROADMAP.md` — 21-03 checkbox marked `[x]`: VERIFIED
- `.planning/ROADMAP.md` — progress table row has v3.1 milestone column: VERIFIED
- `2039-SUMMARY.md` — covers what went well, edge cases, tech debt, milestone recommendation: VERIFIED

## Self-Check: PASSED
