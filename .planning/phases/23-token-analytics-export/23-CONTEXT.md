# Phase 23: Token Analytics & Export - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator can compare model costs across agents for spend optimization and export the full token usage dataset as CSV. This phase adds a model comparison view to the existing token usage section and an export action. It does NOT add new data collection, alerting, or budget features.

Depends on Phase 22 (burn rate infrastructure, per-model daily aggregates from SessionUsageReader).

</domain>

<decisions>
## Implementation Decisions

### Comparison layout
- Bar chart visualization for model cost comparison
- Grouped by agent — each agent gets a cluster of bars (one per model: sonnet/opus/haiku)
- Lightweight hand-rolled SVG — no charting library; simple bar rectangles + Tailwind styling
- Model-specific colors for bars (e.g., purple for Opus, blue for Sonnet, green for Haiku) to make each model instantly distinguishable

### Cost detail level
- Show total USD cost per agent per model — not per-token-type breakdowns
- Default time scope: last 7 days
- Preset time range buttons: 24h / 7d / 30d / All — simple toggles, no date picker
- Show a total-across-all-models summary alongside per-model breakdown so operator doesn't have to mentally sum

### Export scope & UX
- CSV export always includes the full dataset regardless of current view filters
- Export button placed top-right of the token usage section, near section header
- Filename format: `warden-token-usage-YYYY-MM-DD.csv` with export date
- Brief toast notification after export ("Export downloaded") for 2-3 seconds
- CSV columns per success criteria: date, agent_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd

### View placement
- New tab alongside existing Token Usage (e.g., "Model Costs" tab)
- Existing token usage view remains the default — model comparison is one click away
- Auto-generated key insight headline at top (e.g., "Opus is 73% of total spend") — actionable at a glance
- No model pricing reference displayed — just computed costs; avoids maintenance burden of tracking price changes

### Claude's Discretion
- Exact SVG bar chart dimensions, spacing, and responsive behavior
- Toast notification implementation (existing pattern or new)
- Tab component styling and transition
- Insight headline algorithm (most expensive model, biggest agent, etc.)
- Error/loading states for the comparison view
- How to handle agents with zero usage in a model

</decisions>

<specifics>
## Specific Ideas

- Chart should use the existing `warden-*` theme tokens for background/text/borders, with model-specific accent colors for the bars themselves
- The insight headline should dynamically highlight the most actionable finding (biggest cost driver)
- Export should work as a simple GET endpoint with Content-Disposition header for browser download — no client-side CSV generation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-token-analytics-export*
*Context gathered: 2026-03-04*
