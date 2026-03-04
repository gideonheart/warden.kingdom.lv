---
phase: 23-token-analytics-export
plan: 02
subsystem: client-ui
tags: [react, tailwind, bar-chart, csv-export, token-analytics, model-comparison]

# Dependency graph
requires:
  - phase: 23-01
    provides: GET /api/history/model-comparison and GET /api/history/token-usage/export endpoints

provides:
  - ModelComparisonView component with grouped bar chart, time range selector, insight headline
  - Model Costs tab in TokenUsageView via tab navigation
  - Export CSV button with blob download and toast confirmation

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS div width bars with global max scaling — no charting library, pure Tailwind"
    - "Model color by substring match: opus→purple, sonnet→blue, haiku→green"
    - "Tab navigation with border-b-2 active indicator — warden-accent color"
    - "Blob download via URL.createObjectURL + anchor.click() — no library needed"
    - "Auto-dismiss toast via setTimeout + exportToast boolean state"

key-files:
  created:
    - src/client/components/ModelComparisonView.tsx
  modified:
    - src/client/components/TokenUsageView.tsx

key-decisions:
  - "ModelComparisonView defines formatAgentId() locally — avoids cross-component import coupling while keeping DRY within each component"
  - "Global max scaling for bars (not per-agent) — allows visual comparison of cost magnitude across all agents"
  - "agentFilter passed as undefined (not empty string) when blank — prevents empty agentId query param"
  - "Toast uses fixed positioning at bottom-right — visible regardless of scroll position"

patterns-established:
  - "Time range presets calculate dateFrom in component: 24h = today, 7d/30d = N days back, all = omit param"
  - "useEffect with [timeRange, agentFilter] deps re-fetches on filter or range change"

requirements-completed: [TOKN-12, TOKN-14]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 23 Plan 02: Token Analytics Export Client UI Summary

**ModelComparisonView bar chart with time range selector and insight headline, plus Model Costs tab and Export CSV button in TokenUsageView**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T07:54:31Z
- **Completed:** 2026-03-04T07:57:06Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- New `ModelComparisonView` component fetches `/api/history/model-comparison` with time range params, renders per-agent grouped horizontal bar charts with model-specific colors (purple/blue/green/fallback), and shows an auto-generated insight headline identifying the top cost driver
- Time range selector (24h/7d/30d/All) re-fetches data on change, using same segmented button group styling as existing BURN_WINDOWS selector
- `TokenUsageView` now has two tabs: "Token Usage" (all existing content preserved) and "Model Costs" (renders ModelComparisonView)
- Export CSV button in the header row downloads `/api/history/token-usage/export` as `warden-token-usage-YYYY-MM-DD.csv` using blob download pattern
- "Export downloaded" toast auto-dismisses after 3 seconds

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ModelComparisonView component with bar chart and time range selector** - `ef139bc` (feat)
2. **Task 2: Add Model Costs tab and Export button to TokenUsageView** - `5407146` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/client/components/ModelComparisonView.tsx` (created) — Time range selector, grouped bar chart by agent, model color mapping, insight headline, empty/loading states
- `src/client/components/TokenUsageView.tsx` (modified) — Tab navigation (Token Usage / Model Costs), Export CSV button, blob download handler, toast notification

## Decisions Made

- ModelComparisonView defines `formatAgentId()` locally to avoid coupling — consistent with SRP principle
- Global max scaling for bar widths allows cross-agent cost comparison at a glance (not per-agent relative)
- `agentFilter || undefined` prevents empty string from becoming a query param that filters incorrectly
- Toast uses `fixed` positioning so it appears over content regardless of scroll position

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All files verified:
- `src/client/components/ModelComparisonView.tsx` - FOUND
- `src/client/components/TokenUsageView.tsx` - FOUND (modified)
- Commit `ef139bc` - FOUND (Task 1)
- Commit `5407146` - FOUND (Task 2)
- `npm run build` - PASSED (clean, no errors)

---
*Phase: 23-token-analytics-export*
*Completed: 2026-03-04*
