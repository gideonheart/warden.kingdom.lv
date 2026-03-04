---
phase: 22-token-burn-rate-budget-alerts
plan: 02
subsystem: client
tags: [react, tailwind, burn-rate, budget-alerts, token-usage, hooks]

# Dependency graph
requires:
  - phase: 22-01
    provides: BurnWindow/BurnRateEntry/BudgetConfig/BudgetAlertStatus types, burn-rate and budget-config API endpoints
provides:
  - useBudgetAlerts React hook (polls /api/history/budget-config/status every 30s)
  - TokenUsageView window selector, burn rate cards, budget inline editor, projection card
  - History nav badge (amber/red dot) in App.tsx
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - previousRef guard pattern for stable hook return values (mirrors useAgentLiveStatus)
    - Inline edit with editingBudget Record<string,string> for draft state isolation
    - Delete-on-zero semantics surfaced in UI (empty input or 0 removes budget via API)
    - Segmented button group for window selector with warden theme tokens

key-files:
  created:
    - src/client/hooks/useBudgetAlerts.ts
  modified:
    - src/client/App.tsx
    - src/client/components/TokenUsageView.tsx

key-decisions:
  - "useBudgetAlerts uses previousRef pattern — only calls setAlertLevel when value changes, preventing re-renders every 30s"
  - "editingBudget Record<string,string> isolates draft input per agent — avoids controlled/uncontrolled input issues"
  - "getBudgetDisplayValue returns editingBudget draft when in edit mode, otherwise stored config value"
  - "Amber dot animate-pulse; red dot static — per plan spec, visual distinction between warning and exceeded"
  - "Projection card only renders when burnRates.length > 0 — no misleading $0.00 projections when no data"

patterns-established:
  - "Budget progress bar: getBudgetProgressColor helper maps pct thresholds to Tailwind bg- classes"
  - "Window selector: BURN_WINDOWS array + BURN_WINDOW_LABELS Record for DRY label mapping"

requirements-completed: [TOKN-10, TOKN-11, TOKN-13]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 22 Plan 02: Client-Side Burn Rate UI, Budget Editor, and History Nav Badge Summary

**useBudgetAlerts hook polling budget status every 30s, TokenUsageView extended with window selector, per-agent burn rate cards with inline budget editor and progress bars, cost projection card, and History nav badge in App.tsx**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T07:07:34Z
- **Completed:** 2026-03-04T07:10:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `useBudgetAlerts` hook following the `useAgentLiveStatus` polling pattern with 30s interval and previousRef optimization
- Added amber/red badge dot to both desktop and mobile History nav buttons in App.tsx
- Extended `TokenUsageView` with: window selector (Today/2-day/7-day), per-agent burn rate cards, inline budget editor with blur/Enter save, budget progress bars (green/amber/red), aggregate "All Agents" card, and cost projection card

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useBudgetAlerts hook and add History nav badge** - `a32716f` (feat)
2. **Task 2: Extend TokenUsageView with window selector, burn rate, budget editor, projections** - `1a71a43` (feat)

## Files Created/Modified

- `src/client/hooks/useBudgetAlerts.ts` - New hook: polls /api/history/budget-config/status every 30s, returns 'ok'|'warning'|'exceeded' with previousRef optimization
- `src/client/App.tsx` - Import and call useBudgetAlerts, add badge dot to both desktop and mobile History nav buttons
- `src/client/components/TokenUsageView.tsx` - Window selector, burn rate cards, inline budget editor with progress bars, aggregate card, projection card; all existing UI preserved

## Decisions Made

- `useBudgetAlerts` uses `previousRef` guard pattern — only calls `setAlertLevel` when value changes, preventing unnecessary re-renders every 30s (mirrors `useAgentLiveStatus`)
- `editingBudget` as `Record<string, string>` per agent — isolates draft state so other agents' cards don't re-render during typing
- Amber badge `animate-pulse`, red badge static — visual distinction between "approaching limit" vs "exceeded"
- Projection card conditionally rendered (`burnRates.length > 0`) — avoids misleading $0.00 projections when no burn rate data exists
- `getBudgetDisplayValue` returns draft from `editingBudget` while in edit mode, otherwise stored config value — prevents flicker on re-render

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - all API endpoints were ready from Plan 01.

## Next Phase Readiness

- Phase 22 is now complete — both server layer (Plan 01) and client UI (Plan 02) are done
- Phase 23 (model comparison / cost breakdown by model) can build on the same token_usage table and budget_config patterns established in Phase 22

## Self-Check: PASSED

- src/client/hooks/useBudgetAlerts.ts: FOUND
- src/client/App.tsx: FOUND (contains useBudgetAlerts import and budgetAlertLevel call)
- src/client/components/TokenUsageView.tsx: FOUND (contains BurnWindow, burnRates, editingBudget, projection card)
- 22-02-SUMMARY.md: FOUND
- commit a32716f: FOUND
- commit 1a71a43: FOUND
- Production build: PASSED (npm run build succeeded)

---
*Phase: 22-token-burn-rate-budget-alerts*
*Completed: 2026-03-04*
