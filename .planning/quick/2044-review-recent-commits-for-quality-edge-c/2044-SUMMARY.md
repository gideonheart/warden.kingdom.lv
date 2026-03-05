---
phase: quick
plan: 2044
subsystem: planning
tags: [code-review, milestone-planning, tech-debt, telegram, notifications]
key-files:
  created:
    - .planning/quick/2044-review-recent-commits-for-quality-edge-c/CODE-REVIEW.md
    - .planning/quick/2044-review-recent-commits-for-quality-edge-c/MILESTONE-OPTIONS.md
  modified: []
decisions:
  - "Three medium-severity edge cases in Telegram pipeline: EC-02 (Markdown escaping), EC-03 (topicId NaN), EC-04 (BudgetAlertPoller restart re-alerts)"
  - "detectAgentState() needs unit tests before next milestone adds complexity on top (TD-01)"
  - "Recommend v4.1 Smart Session Lifecycle: crash auto-restart + idle timeout + session templates"
  - "EC-02/03/04 should be fixed as inline commits before starting v4.1, not wrapped in their own milestone"
metrics:
  duration: ~25 minutes
  completed: 2026-03-05
---

# Phase quick Plan 2044: Code Review and Milestone Proposals Summary

**One-liner:** Reviewed v3.3 Telegram pipeline for edge cases (found Markdown escaping risk, topicId NaN, restart re-alerts, missing detectAgentState tests), then proposed three new v4.x milestones: Agent Analytics Dashboard, Smart Session Lifecycle (recommended), and Codebase Quality Foundation.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Code quality review of recent commits | 9646707 | CODE-REVIEW.md |
| 2 | Propose 3 fresh milestone directions and recommend one | cb0fd37 | MILESTONE-OPTIONS.md |

---

## Output Files

### CODE-REVIEW.md

Covers 14 findings across 5 categories:

**Edge Cases (4 findings):**
- EC-01 (Low): `detectAgentState("")` returns `'working'` on empty pane — intentional but undocumented
- EC-02 (Medium): Unescaped Markdown in `editMessageText` — approval edit fails silently when excerpt contains unmatched backticks
- EC-03 (Medium): `parseInt(topicId)` returns `NaN` for non-numeric topicId — all sends fail silently with misleading log
- EC-04 (Medium): `BudgetAlertPoller` in-memory state lost on restart — re-fires all budget alerts after every server restart

**Database (2 findings):**
- DB-01 (Info): Division safety in `getBudgetAlertStatus` confirmed safe — `WHERE daily_budget_usd > 0` prevents division by zero
- DB-02 (Info): `getNotificationConfig()` without prior row confirmed safe — hardcoded defaults work correctly before first `setNotificationConfig` call

**Client-side (3 findings):**
- CS-01 (Info): `defaultValue` + `key` pattern in cooldown inputs is correct React behavior
- CS-02 (Info): `parseInt` truncates decimal input — acceptable behavior for cooldown settings
- CS-03 (Low): Silent revert on save failure provides no user feedback — acceptable UX given low-stakes config

**JSON5 fix (1 finding):**
- JS5-01 (Info): `2fd1d6e` regex fix verified correct for all realistic edge cases (empty strings, escaped quotes, `\/\/` inside strings, nested block comments as non-issue)

**Tech Debt (4 findings):**
- TD-01 (Medium): `detectAgentState()` has zero unit tests — core notification pipeline has no regression protection
- TD-02 (Low): `DatabaseConnection.ts` at 736 lines, growing toward unmanageable monolith
- TD-03 (Low): 673KB JS bundle — Vite warning threshold exceeded, no code splitting
- TD-04 (Low): Missing `void` on `syncWithTmux()` call in `startPeriodicSync()`

### MILESTONE-OPTIONS.md

Three proposals distinct from all 6 previously proposed options:

**Option A — v4.1: Agent Session Analytics Dashboard**
- Requirements: ANLX-01 through ANLX-06 (cost time-series chart, efficiency metrics, anomaly detection, trend indicators, model impact panel, analytics tab)
- Phases: 3 (data layer, charts + efficiency table, trends + model impact + E2E)
- Impact: High. Converts existing SQLite data into actionable intelligence
- Effort: Low-Medium (read-path only, no new infrastructure)
- Distinct from prior options: yes — Analytics was not proposed in 2042 or 2043

**Option B — v4.1: Smart Session Lifecycle** (Recommended)
- Requirements: SLFC-01 through SLFC-06 (crash detection, auto-restart policy, auto-restart execution, idle timeout, session templates, lifecycle history)
- Phases: 4 (crash detection backend, auto-restart engine, idle timeout + templates, lifecycle history + E2E)
- Impact: High. Auto-restart and crash notifications close the last major invisible failure mode
- Effort: Medium-High (new lifecycle state machine, policy persistence, rate limiter)
- Distinct from prior options: yes — Session Lifecycle was not proposed in 2042 or 2043

**Option C — v4.1: Codebase Quality Foundation**
- Requirements: QUAL-01 through QUAL-06 (Markdown escaping, topicId validation, BudgetAlertPoller persistence, detectAgentState tests, DatabaseConnection decomposition, bundle code splitting)
- Phases: 3 (bug fixes + validation, test coverage, structural improvements)
- Impact: Medium. Reduces risk surface, improves maintainability
- Effort: Medium (fixes are small; repository extraction is the largest effort)
- Distinct from prior options: yes — Quality Foundation was not proposed in 2042 or 2043

**Recommendation:** Option B (Smart Session Lifecycle), with EC-02/EC-03/EC-04 fixed as direct commits before starting v4.1.

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check

**Files created:**
- [x] `.planning/quick/2044-review-recent-commits-for-quality-edge-c/CODE-REVIEW.md` — exists
- [x] `.planning/quick/2044-review-recent-commits-for-quality-edge-c/MILESTONE-OPTIONS.md` — exists

**Commits:**
- [x] 9646707 — CODE-REVIEW.md commit
- [x] cb0fd37 — MILESTONE-OPTIONS.md commit

**Build:** Passes (no code changes made — documentation-only task)

**Success criteria verification:**
- [x] Quality review identifies at least 3 actionable findings with severity ratings — 14 findings, 4 with Medium severity
- [x] All 3 milestone proposals are genuinely distinct from the 6 previously proposed — confirmed (Analytics, Session Lifecycle, Quality Foundation)
- [x] Each proposal has at least 4 named requirements with IDs — ANLX-01 through 06, SLFC-01 through 06, QUAL-01 through 06
- [x] Recommendation section provides clear reasoning — Option B recommended with 4-point rationale

## Self-Check: PASSED
