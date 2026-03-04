# Phase 22: Token Burn Rate & Budget Alerts - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator sees real-time cost velocity per agent and receives visual warnings before daily budget is exceeded. This phase adds burn rate calculation with window selection, budget thresholds with alert badges, and cost projection display. Creating new token data sources, model comparison views, or export functionality are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Window selector labeling
- Use honest labels: "Today", "2-day", "7-day" — NOT "1h/4h/24h" (data is daily-granular, labels must reflect actual lookback)
- No subtitle or date range explanation needed — button labels are self-explanatory
- One shared selector at the top of the token usage section, controlling all agents' burn rates
- Default window on view open: Today (1-day)

### Burn rate display
- Show per-agent burn rates AND an aggregate total across all agents
- Projections show daily + weekly estimated spend at current burn rate
- Burn rate formatting (precision, layout structure): Claude's discretion based on existing TokenUsageView patterns

### Budget threshold editing
- Inline number input per agent — edit in place, save on blur or Enter
- No default budget — agents start with no budget ($0 / empty = no budget configured)
- Operator opts in per agent; unconfigured agents never trigger alerts
- Remove budget by clearing to $0 or empty
- Budget progress bar per agent: green → amber at 80% → red at 100%

### Alert badge on History nav
- Small colored dot badge next to "History" text (not a count badge)
- Amber dot at 80% threshold, red dot at 100% threshold
- The badge reflects the worst alert level across all agents

### Cross-view alerting
- Badge on History nav is the only cross-view indicator
- No toast notifications, no sound, no popups
- Operator clicks through to History to see details

### Claude's Discretion
- Badge animation (pulse vs static for amber/red states)
- Burn rate card layout (dedicated section above table vs integrated into agent rows)
- Inline warning styling within TokenUsageView (row coloring vs relying on progress bar alone)
- Exact burn rate number formatting (decimal places, $/hr display)
- Exact spacing, typography, and card styling

</decisions>

<specifics>
## Specific Ideas

- Window labels should communicate the actual data window honestly — operator trust over requirement literalism
- Progress bar is the primary per-agent budget feedback mechanism; the nav badge is the cross-view attention-getter
- Budget is opt-in per agent: no surprises from auto-configured thresholds

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-token-burn-rate-budget-alerts*
*Context gathered: 2026-03-04*
