# Phase 10: Mobile-First UI Restructure - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator can use the full Warden dashboard experience on mobile devices (375px+) with responsive layout, collapsible panels, and touch-optimized controls. This phase restructures existing UI components for mobile-first CSS, not building new features.

Key constraint: xterm.js has a well-documented 5+ year mobile touch support problem. Terminal interaction on mobile will be read-only viewing with scroll, not full interactive input.

</domain>

<decisions>
## Implementation Decisions

### Responsive layout strategy
- Mobile-first CSS: base styles target mobile (375px), progressive enhancement via `min-width` breakpoints (`sm:`, `md:`, `lg:`)
- Three breakpoint tiers: mobile (<640px), tablet (640-1023px), desktop (1024px+)
- Existing `lg:` breakpoint (1024px) for desktop sidebar is kept as-is
- No horizontal scrolling at any viewport width -- all content reflows or truncates
- Header nav buttons collapse into a hamburger/overflow menu on mobile to save horizontal space

### Collapsible panels (accordion)
- Agent details, session logs, and token usage in History view render as collapsible accordion panels on mobile
- Accordion panels: single tap to expand/collapse, with smooth height transition
- Only one accordion section open at a time on mobile (saves screen real estate)
- Desktop keeps current side-by-side layout unchanged
- Use native HTML `<details>`/`<summary>` elements for accordion behavior (zero JS, accessible)

### Prompt panel on mobile
- Prompt panel renders as a fixed bottom sheet on mobile, always visible at bottom of screen
- Bottom sheet has a compact collapsed state (just the textarea row) and expanded state (textarea + agent dropdown + send button)
- Tap textarea to expand, tap outside or send to collapse
- Thumb-reachable from bottom of screen -- no reaching to top nav
- On desktop, prompt panel stays in sidebar (current behavior)

### Terminal on mobile
- Terminal is read-only on mobile: operator can scroll and view output but not type
- Touch scrolling enabled via existing `-webkit-overflow-scrolling: touch` CSS
- Swipe left/right between session tabs (tab bar becomes horizontally scrollable with snap points)
- No pinch-to-zoom on terminal (xterm.js canvas doesn't support it meaningfully) -- instead, font size toggle button (small/medium/large)
- Terminal takes full viewport height minus header and bottom sheet on mobile

### Touch targets and safe areas
- All interactive elements meet 44x44px minimum touch target (some already do from Quick Task #3/#4)
- Audit and fix: nav buttons, tab bar items, sidebar agent items, toggle buttons, history list items
- Add `env(safe-area-inset-*)` padding for notched devices (iPhone)
- Bottom sheet respects `safe-area-inset-bottom` to stay above home indicator

### Claude's Discretion
- Exact hamburger menu icon and animation
- Accordion transition timing and easing
- Bottom sheet drag-to-dismiss gesture (optional enhancement)
- Tablet-specific layout optimizations (if any beyond responsive reflow)
- Loading skeleton designs for mobile

</decisions>

<specifics>
## Specific Ideas

- Existing mobile overlay sidebar (App.tsx) works well -- keep that pattern, just improve the trigger area
- The `app-height` CSS class with `--visual-viewport-height` already handles iOS keyboard -- preserve this
- Tab bar horizontal scroll should feel like iOS tab switching -- snap to nearest tab
- Font size toggle for terminal: small (10px), medium (13px), large (16px) -- stored in localStorage
- InstanceTabBar already has 44px min-height -- extend this pattern to all interactive elements

</specifics>

<deferred>
## Deferred Ideas

- Full interactive terminal input on mobile -- blocked by xterm.js upstream issues, revisit when xterm.js 6.x ships mobile improvements
- Native mobile app (React Native) -- out of scope per REQUIREMENTS.md, 3x dev cost
- Predictive touch input (Mosh-style) -- conflicts with Socket.IO transport

</deferred>

---

*Phase: 10-mobile-first-ui-restructure*
*Context gathered: 2026-02-17*
