# Phase 10: Mobile-First UI Restructure - Research

**Completed:** 2026-02-17

## Current Mobile State Audit

### Already Working (from Quick Tasks #3, #4)
- Mobile overlay sidebar with backdrop (App.tsx: `fixed inset-0 z-50 lg:hidden`)
- Touch scrolling on terminal via custom touchstart/touchmove handlers (TerminalView.tsx)
- Mobile key toolbar with Copy, Paste, Esc, Tab, Ctrl+C, arrows, PgUp/PgDn
- iOS keyboard handling via `--visual-viewport-height` CSS variable
- Responsive font size: 11px on mobile (<640px), 14px on desktop
- `overflow-x-auto touch-scroll` on InstanceTabBar (already horizontally scrollable)
- Some 44px touch targets: Agents button, tab bar items, copy mode close button
- `app-height` class using `100dvh` with visual viewport fallback

### Gaps to Address (MOBI requirements)
1. **MOBI-01 (Responsive 375-1920px):** Header nav has 5 buttons (Terminals, History, Plugins, Agents, Refresh) that overflow on 375px. Need hamburger menu. SessionHistory and TokenUsageView have fixed-width columns that don't reflow on mobile.
2. **MOBI-02 (Accordion panels):** History sub-views (sessions, tokens, logs) use tab buttons. Need accordion pattern on mobile. Agent details in sidebar are always expanded.
3. **MOBI-03 (Bottom sheet prompt):** PromptPanel lives in sidebar. Need independent bottom sheet on mobile.
4. **MOBI-04 (Touch scroll + tab swipe):** Touch scroll exists. Tab swipe needs CSS scroll-snap on InstanceTabBar.
5. **MOBI-05 (Mobile-first CSS):** Current CSS is desktop-first (base styles are desktop, `lg:` overrides). Need to invert.
6. **MOBI-06 (Swipe tabs + zoom):** Swipe tabs via scroll-snap. Pinch-to-zoom not feasible -- use font size toggle instead.
7. **MOBI-07 (44px targets + safe areas):** Missing on: nav buttons (px-2 py-1 = ~24px), sidebar agent items (~28px), history filter inputs, history tab buttons, pagination buttons. No safe-area-inset CSS anywhere.

## Component-by-Component Analysis

### App.tsx Header
- **Problem:** 5 nav buttons + active count badge = too wide for 375px
- **Solution:** On mobile, show only active view button + hamburger. Hamburger opens a dropdown/popover with all nav options.
- **Implementation:** Use `hidden sm:inline` to hide nav text on mobile, show icon-only buttons. Or collapse to hamburger below a breakpoint.

### InstanceTabBar.tsx
- **Problem:** Already has `overflow-x-auto touch-scroll` but no scroll-snap
- **Solution:** Add `scroll-snap-type: x mandatory` and `scroll-snap-align: start` on each tab for crisp swipe-to-tab
- **LOC impact:** ~3 lines of CSS/classes

### PromptPanel.tsx
- **Problem:** Lives inside sidebar div, not accessible without opening sidebar on mobile
- **Solution:** Create MobilePromptSheet wrapper that renders as fixed bottom sheet on <lg, uses existing PromptPanel internally
- **Bottom sheet states:** Collapsed (just textarea peek), expanded (full panel with dropdown)
- **LOC impact:** ~40-60 lines for wrapper component

### AgentSidebar.tsx
- **Problem:** Agent buttons are ~28px tall (px-2 py-1.5). Details section always expanded.
- **Solution:** Add min-h-[44px] to agent buttons. Details section collapsible on mobile.
- **LOC impact:** ~10 lines

### HistoryView.tsx
- **Problem:** Tab buttons are ~32px tall. Sub-views don't stack on mobile.
- **Solution:** Replace tabs with `<details>`/`<summary>` accordion on mobile. Keep tabs on desktop.
- **LOC impact:** ~30 lines for responsive switch

### SessionHistory.tsx
- **Problem:** Fixed-width columns (`w-24`, `w-20`, `w-40`) cause horizontal overflow on mobile
- **Solution:** On mobile, switch from horizontal row layout to stacked card layout
- **LOC impact:** ~20 lines for responsive card view

### TokenUsageView.tsx
- **Problem:** Daily breakdown table has 5 fixed-width columns that overflow
- **Solution:** On mobile, hide daily breakdown or collapse to card view. Summary grid already responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- **LOC impact:** ~15 lines

### styles.css
- **Problem:** No safe-area-inset CSS
- **Solution:** Add `padding-bottom: env(safe-area-inset-bottom)` to bottom sheet and mobile key toolbar
- **LOC impact:** ~5 lines

## Technical Patterns

### Mobile-First CSS with Tailwind
Current pattern (desktop-first):
```
hidden lg:flex     → visible only on desktop
lg:hidden          → visible only on mobile
```

Mobile-first equivalent:
```
flex lg:hidden     → visible on mobile, hidden on desktop
hidden lg:flex     → hidden on mobile, visible on desktop
```

The existing code already uses this pattern correctly in App.tsx for the sidebar. The main work is applying it consistently to all components.

### Scroll Snap for Tab Swiping
```css
.tab-container { scroll-snap-type: x mandatory; }
.tab-item { scroll-snap-align: start; }
```
This gives native-feeling tab swiping with zero JS.

### Safe Area Insets
```css
padding-bottom: env(safe-area-inset-bottom, 0px);
padding-left: env(safe-area-inset-left, 0px);
padding-right: env(safe-area-inset-right, 0px);
```
Needed on: bottom sheet, mobile key toolbar, main content area.

### Font Size Toggle
Store preference in localStorage under `warden:terminal-font-size`. Values: `small` (10px), `medium` (13px), `large` (16px). Apply via `terminal.options.fontSize` and refit.

## Risk Assessment

### Low Risk
- Touch target sizing (CSS-only changes)
- Safe area insets (CSS-only)
- Scroll snap on tab bar (CSS-only)
- Font size toggle (small state + localStorage)

### Medium Risk
- Bottom sheet prompt panel (new component, positioning)
- Accordion history view (responsive pattern switch)
- Header hamburger menu (state management for dropdown)

### Low Priority / Can Skip
- Pinch-to-zoom (xterm.js canvas limitation, font toggle is better alternative)
- Full CSS mobile-first inversion (existing desktop-first patterns work fine, just need mobile overrides)

## Estimated LOC Budget

| Component | New/Modified | LOC |
|-----------|-------------|-----|
| MobilePromptSheet | New | ~50 |
| Header hamburger | Modified App.tsx | ~30 |
| InstanceTabBar snap | Modified | ~5 |
| HistoryView accordion | Modified | ~30 |
| SessionHistory cards | Modified | ~25 |
| TokenUsageView mobile | Modified | ~15 |
| Safe area CSS | Modified styles.css | ~10 |
| Touch target audit | Modified various | ~20 |
| Font size toggle | Modified TerminalView | ~25 |
| **Total** | | **~210** |

## Recommendation

Split into 2 plans:
1. **Wave 1: Core responsive restructure** — Header hamburger, mobile-first CSS fixes, touch targets, safe areas, scroll-snap tabs, font size toggle (MOBI-01, MOBI-04, MOBI-05, MOBI-06, MOBI-07)
2. **Wave 2: Mobile panels** — Bottom sheet prompt panel, accordion history view (MOBI-02, MOBI-03)

Wave 1 is all CSS/class modifications with minimal new components. Wave 2 adds new responsive patterns that depend on the mobile layout from Wave 1.
