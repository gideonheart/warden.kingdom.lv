# Phase 20: Terminal Search & Browser Notifications - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Two capabilities: (1) Full terminal scrollback search via Ctrl+F with match highlighting, navigation, count display, scrollbar gutter markers, and debounced input; (2) Browser notification opt-in for permission prompts when the tab is unfocused, with state-transition-only firing (no repeats while same agent stays in permission state). Phase 19 already provides the Ctrl+F key handler stub, permission detection infrastructure, and browser notification permission detection.

</domain>

<decisions>
## Implementation Decisions

### Search overlay design
- Top-right floating bar pinned inside the terminal pane (VS Code / Chrome DevTools style)
- Does not push terminal content down — floats above it
- Plain text search only — no regex toggle, no case-sensitivity toggle
- Subtle slide-in animation (~150ms) from the top-right corner on open; reverse on close
- Search query persists when overlay is closed and reopened within the same session; clears on session switch

### Match highlighting & navigation
- All matches: yellow background highlight
- Active (navigated-to) match: orange/amber background to distinguish from other matches
- Scrollbar gutter markers: thin 2-3px yellow ticks on the right edge of the scrollbar track showing match positions in the buffer
- Navigating to a match (Enter / Shift+Enter / Next / Previous buttons) centers the match in the viewport
- Match count updates only when user types a new query — does not live-update as terminal output streams in (stable, no flicker)

### Search + terminal interaction
- Terminal content is NOT dimmed while search is open — full brightness, matches stand out by highlight color alone
- Terminal remains fully scrollable (mouse + keyboard scroll) while search overlay is open
- Search overlay closes when switching to a different session tab (search is session-specific)
- While search overlay is open, all keyboard input goes to the search field; Enter/Shift+Enter navigate matches; Escape closes overlay and returns focus to the terminal canvas

### Notification behavior
- Notification content: Title "Warden — Permission Required", Body "[agent-session-name] needs operator approval"
- One notification per agent (each agent in permission state fires its own notification independently)
- State-transition only: notification fires once when agent enters permission state; does not repeat while agent stays in that state
- Clicking the notification: focuses the Warden browser tab AND switches to the alerting agent's session tab
- Opt-in toggle: bell icon in the terminal header bar, positioned near existing controls (state chip, pressure, font button)
- Toggle state persisted in localStorage

### Claude's Discretion
- Exact animation easing/timing details
- Gutter marker rendering approach (CSS overlay vs canvas vs xterm decoration API)
- Notification icon/badge
- Bell icon design and active/inactive visual states
- How to handle the case where xterm-addon-search doesn't natively support all highlight features (decoration API vs custom overlay)

</decisions>

<specifics>
## Specific Ideas

- Search bar should feel like VS Code's Ctrl+F — compact floating bar in the top-right, not intrusive
- Gutter markers like VS Code's minimap match indicators
- Notification click should take you directly to the problem — focus tab AND switch session, no extra steps

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-terminal-search-browser-notifications*
*Context gathered: 2026-03-03*
