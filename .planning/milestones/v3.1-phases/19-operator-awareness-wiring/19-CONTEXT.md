# Phase 19: Operator Awareness Wiring - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface agent state at a glance for every session — permission prompts as pulsing amber tab badges, context pressure as a color-coded percentage in the terminal header, agent state as a labeled chip, and keyboard shortcuts for mouseless navigation. Ctrl+F stub prevents browser find to prepare for Phase 20 search overlay. No browser notifications (Phase 20), no search UI (Phase 20).

</domain>

<decisions>
## Implementation Decisions

### Permission badge on tabs
- Subtle ~8px amber dot in the tab corner, gentle pulse animation
- Similar to a Slack unread indicator — visible but not aggressive
- Dot disappears when the agent leaves permission state (polling-driven)
- Single-operator dashboard context: the operator is watching, so subtlety works

### Context pressure display
- Percentage text only (e.g., "72%"), no progress bar or icon
- Color-coded by threshold: green (<70%), amber (70-89%), pulsing red (>=90%)
- Show "—" em-dash when pressure data is unavailable (not "0%", not hidden)
- Matches terminal aesthetic — clean, data-dense

### Agent state chip
- Pill badge style with colored background (not plain text, not icon+text)
- States: working / idle / permission / error
- Color per state determined by Claude (should be distinct and readable on dark theme)
- Text label inside the pill — no separate icon needed

### Terminal header layout
- New indicators grouped on the right side of the header bar
- Session name stays on the left — clean left-to-right hierarchy: identity → status
- Order within right group: state chip first, then context pressure
- State chip is more actionable (scanned first), pressure is monitoring info

### Keyboard shortcuts
- Ctrl+1 through Ctrl+9 switch to tab by index; out-of-range numbers silently ignored (no-op)
- Ctrl+[ and Ctrl+] cycle tabs with wrap-around (last→first, first→last)
- Ctrl+B toggles AgentSidebar
- Escape focuses terminal canvas (when search overlay not open)
- Ctrl+F prevents browser native find bar, does nothing else (stub for Phase 20)
- No visual feedback on shortcut activation — the action is the feedback
- Focus guard: shortcuts don't fire when cursor is in text input or textarea

### State detection
- Poll ALL sessions, not just the active one (background tab badges are the core value)
- Unknown/unavailable pressure displays "—" em-dash

### Claude's Discretion
- Pulse animation style (opacity, scale, duration, easing)
- Polling interval for state detection (balance responsiveness vs resources)
- Permission badge clearing strategy (immediate on input vs next poll cycle)
- Responsive behavior at narrow widths (collapse, hide, or adapt indicators)
- Tooltip presence and content on header indicators
- Exact colors for each agent state (working, idle, permission, error)

</decisions>

<specifics>
## Specific Ideas

- Permission dot should feel like a Slack unread indicator — present but not alarming
- The header should read left-to-right as: "what session is this" → "what's it doing" → "how full is the context"
- Keyboard shortcuts are for a power-operator workflow — zero chrome, action-is-feedback

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-operator-awareness-wiring*
*Context gathered: 2026-03-03*
