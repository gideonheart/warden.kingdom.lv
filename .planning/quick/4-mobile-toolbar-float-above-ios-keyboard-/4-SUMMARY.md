---
phase: quick-4
plan: 01
subsystem: mobile-ux
tags: [ios, keyboard, viewport, mobile, toolbar, scroll]
dependency_graph:
  requires: [xterm.js, touch-scroll, mobile-key-toolbar]
  provides: [ios-keyboard-aware-layout, fast-scroll-down]
  affects: [terminal-view, app-layout]
tech_stack:
  added: [VisualViewport API]
  patterns: [CSS custom properties, dynamic viewport units]
key_files:
  created: []
  modified:
    - index.html
    - src/client/styles.css
    - src/client/App.tsx
    - src/client/components/TerminalView.tsx
decisions:
  - context: "iOS Safari keyboard obscures MobileKeyToolbar"
    options: ["Fixed positioning", "Sticky positioning", "VisualViewport height tracking"]
    selected: "VisualViewport height tracking + sticky positioning (belt-and-suspenders)"
    outcome: "App container shrinks to visible viewport, toolbar stays at bottom with sticky as safety net"
  - context: "Users get stuck in tmux copy-mode scrollback"
    options: ["Add exit button", "Auto-detect mode", "Faster scroll-down", "Scroll position tracking"]
    selected: "3x scroll-down multiplier + Esc button hint"
    outcome: "Scrolling down is 3x faster than up, Esc button shows 'Exit scroll/copy mode' tooltip"
metrics:
  duration_seconds: 151
  tasks_completed: 2
  files_modified: 4
  commits: 2
  completed_date: "2026-02-16"
---

# Quick Task 4: iOS Keyboard Toolbar Visibility & Scroll Escape

**One-liner:** VisualViewport-aware layout shrinks app above iOS keyboard, sticky toolbar positioning, and 3x scroll-down multiplier to escape tmux copy-mode scrollback.

## Summary

Fixed two critical mobile UX issues: (1) MobileKeyToolbar being hidden behind the iOS Safari virtual keyboard, and (2) users getting stuck in tmux copy-mode after scrolling up with no easy way to return to the bottom.

The solution uses the `window.visualViewport` API to track the actual visible viewport height on iOS Safari (which shrinks when the keyboard opens), sets a CSS custom property `--visual-viewport-height`, and updates the `.app-height` class to use this value. This causes the entire flex layout to shrink to the visible area above the keyboard, naturally pushing the MobileKeyToolbar into view.

As a belt-and-suspenders approach, the toolbar also has `position: sticky; bottom: 0; flex-shrink: 0` to ensure it stays visible even if the flex height calculation has edge cases.

For the scroll issue, touch scrolling down (finger moving down, seeing newer content) is now 3x faster than scrolling up, making it much easier to escape long scrollback buffers. The Esc button now has a `title="Exit scroll/copy mode"` hint for discoverability.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | VisualViewport-based app height and viewport meta update | `c76d031` | index.html viewport meta, App.tsx useEffect, styles.css custom property |
| 2 | Toolbar sticky positioning and tmux scroll-down escape hatch | `c2d7756` | Sticky toolbar, 3x scroll-down multiplier, Esc button hint |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### VisualViewport API Integration

The `window.visualViewport` API provides the actual visible viewport dimensions, accounting for browser chrome, mobile keyboards, and pinch-zoom. On iOS Safari, when the keyboard opens, `visualViewport.height` shrinks to the visible area above the keyboard (while `window.innerHeight` stays the same).

The implementation:
1. Listens to `visualViewport.resize` and `visualViewport.scroll` events
2. Sets `--visual-viewport-height` CSS custom property on `<html>`
3. `.app-height` class uses this value with fallbacks: `var(--visual-viewport-height, 100dvh)`
4. On desktop browsers where `visualViewport.height === window.innerHeight`, behavior is unchanged

### Sticky Toolbar Positioning

The MobileKeyToolbar wrapper now has:
- `position: sticky` — stays at the bottom of the scroll container
- `bottom: 0` — sticks to the bottom edge
- `flex-shrink: 0` — prevents being squished by the flex layout

This is a safety net in case the VisualViewport approach has edge cases on older browsers.

### Accelerated Scroll-Down

The touch scroll handler now multiplies downward scrolling by 3x:
```typescript
const adjustedLines = linesToScroll > 0 ? linesToScroll : linesToScroll * 3;
```

This is asymmetric by design: scrolling up into history is 1x (precise), scrolling down toward the bottom is 3x (fast escape hatch). This helps users who accidentally scroll up into a 5000-line buffer and can't easily get back to the live prompt.

### Browser Compatibility

- **VisualViewport API:** Supported in Chrome 61+, Safari 13+, Firefox 91+. Graceful fallback (no-op) on older browsers.
- **interactive-widget=resizes-content:** Chrome 108+, Safari ignores it harmlessly (Safari already has good keyboard resize behavior).
- **Sticky positioning:** Supported in all modern browsers (Safari 13+, Chrome 56+, Firefox 59+).

## Verification

All success criteria met:
- [x] MobileKeyToolbar has sticky positioning with `bottom-0` and `flex-shrink-0` classes
- [x] App height tracks `window.visualViewport.height` via CSS custom property
- [x] Viewport meta tag includes `interactive-widget=resizes-content`
- [x] Touch scroll-down multiplier is applied only for downward scrolling (3x)
- [x] Esc button has `title="Exit scroll/copy mode"` hint
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [x] Desktop browser behavior is unchanged (no regressions)

## Files Modified

**index.html**
- Added `interactive-widget=resizes-content` to viewport meta tag

**src/client/styles.css**
- Added `height: var(--visual-viewport-height, 100dvh)` to `.app-height` class

**src/client/App.tsx**
- Added `useEffect` to track `window.visualViewport` resize/scroll events
- Sets `--visual-viewport-height` CSS custom property on `documentElement`

**src/client/components/TerminalView.tsx**
- Changed MobileKeyToolbar wrapper from `relative z-40` to `sticky bottom-0 z-40 flex-shrink-0`
- Multiplied touch scroll-down by 3x: `linesToScroll > 0 ? linesToScroll : linesToScroll * 3`
- Added `title="Exit scroll/copy mode"` to Esc button

## Self-Check

### Created Files
(None)

### Modified Files
```bash
[ -f "index.html" ] && echo "FOUND: index.html" || echo "MISSING: index.html"
[ -f "src/client/styles.css" ] && echo "FOUND: src/client/styles.css" || echo "MISSING: src/client/styles.css"
[ -f "src/client/App.tsx" ] && echo "FOUND: src/client/App.tsx" || echo "MISSING: src/client/App.tsx"
[ -f "src/client/components/TerminalView.tsx" ] && echo "FOUND: src/client/components/TerminalView.tsx" || echo "MISSING: src/client/components/TerminalView.tsx"
```

### Commits
```bash
git log --oneline --all | grep -q "c76d031" && echo "FOUND: c76d031" || echo "MISSING: c76d031"
git log --oneline --all | grep -q "c2d7756" && echo "FOUND: c2d7756" || echo "MISSING: c2d7756"
```

**Result:** PASSED

All modified files and commits verified successfully:
- FOUND: index.html
- FOUND: src/client/styles.css
- FOUND: src/client/App.tsx
- FOUND: src/client/components/TerminalView.tsx
- FOUND: c76d031 (Task 1 commit)
- FOUND: c2d7756 (Task 2 commit)
