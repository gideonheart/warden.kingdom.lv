---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - index.html
  - src/client/styles.css
  - src/client/components/TerminalView.tsx
autonomous: true
must_haves:
  truths:
    - "MobileKeyToolbar is visible above the iOS keyboard when virtual keyboard is open"
    - "App container height adjusts to the visual viewport on iOS Safari"
    - "User can exit tmux copy-mode by pressing Esc in the toolbar or by scrolling to bottom"
  artifacts:
    - path: "src/client/components/TerminalView.tsx"
      provides: "VisualViewport-aware toolbar positioning and improved scroll-down behavior"
    - path: "src/client/styles.css"
      provides: "CSS custom property --visual-viewport-height for dynamic height"
    - path: "index.html"
      provides: "Updated viewport meta tag with interactive-widget hint"
  key_links:
    - from: "src/client/components/TerminalView.tsx"
      to: "window.visualViewport"
      via: "useEffect resize listener setting CSS variable"
      pattern: "visualViewport.*resize"
---

<objective>
Fix two mobile UX issues: (1) MobileKeyToolbar is hidden behind the iOS Safari virtual keyboard, and (2) users get stuck in tmux copy-mode after scrolling up with no obvious way to return.

Purpose: Make the mobile terminal experience functional on iOS where the keyboard obscures critical toolbar controls.
Output: Updated TerminalView.tsx, styles.css, and index.html with VisualViewport-based height management and scroll escape hatch.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@index.html
@src/client/styles.css
@src/client/components/TerminalView.tsx
@src/client/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: VisualViewport-based app height and viewport meta update</name>
  <files>index.html, src/client/styles.css, src/client/App.tsx</files>
  <action>
1. In `index.html`, update the viewport meta tag to:
   `<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />`
   This tells Chrome 108+ to resize the layout viewport when the keyboard opens. Safari ignores it harmlessly.

2. In `src/client/App.tsx`, add a `useEffect` at the top of the `App` component that listens to `window.visualViewport` resize and scroll events. On each event, set a CSS custom property `--visual-viewport-height` on `document.documentElement` to `${window.visualViewport.height}px`. Also set it on initial mount. If `window.visualViewport` is undefined (older browsers), fall back to not setting the variable at all. Clean up the listener on unmount.

   ```typescript
   useEffect(() => {
     const viewport = window.visualViewport;
     if (!viewport) return;

     const updateHeight = () => {
       document.documentElement.style.setProperty(
         '--visual-viewport-height',
         `${viewport.height}px`
       );
     };

     updateHeight();
     viewport.addEventListener('resize', updateHeight);
     viewport.addEventListener('scroll', updateHeight);
     return () => {
       viewport.removeEventListener('resize', updateHeight);
       viewport.removeEventListener('scroll', updateHeight);
     };
   }, []);
   ```

3. In `src/client/styles.css`, update the `.app-height` class to use the visual viewport variable as highest priority, with dvh and vh as fallbacks:
   ```css
   .app-height {
     height: 100vh;
     height: 100dvh;
     height: var(--visual-viewport-height, 100dvh);
   }
   ```

This ensures that on iOS Safari, the app container shrinks to the visible area above the keyboard, which naturally pushes the MobileKeyToolbar (at flex column bottom) into view.
  </action>
  <verify>
Run `npm run typecheck` to confirm no TypeScript errors. Run `npm run build` to confirm production build succeeds. Manually verify on iOS Safari (or responsive mode) that opening the keyboard causes the app to shrink to the visible viewport height.
  </verify>
  <done>
The app container height tracks the visual viewport on iOS Safari. When the keyboard opens, the entire flex layout (including toolbar at bottom) fits within the visible area above the keyboard. On desktop browsers, behavior is unchanged (visualViewport.height equals window.innerHeight).
  </done>
</task>

<task type="auto">
  <name>Task 2: Toolbar sticky positioning and tmux scroll-down escape hatch</name>
  <files>src/client/components/TerminalView.tsx</files>
  <action>
**Part A: Toolbar positioning safety net**

As a belt-and-suspenders approach alongside Task 1's viewport height fix, add `position: sticky; bottom: 0` styling to the MobileKeyToolbar wrapper div. This ensures the toolbar sticks to the bottom of the visible scroll area even if the flex height calculation has edge cases. Update the toolbar's outer div className in `MobileKeyToolbar` from:
```
className="relative z-40 flex flex-col bg-warden-panel border-t border-warden-border"
```
to:
```
className="sticky bottom-0 z-40 flex flex-col bg-warden-panel border-t border-warden-border"
```

Also add `shrink-0` to prevent the toolbar from being squished by the flex layout when the terminal takes all available space:
```
className="sticky bottom-0 z-40 flex-shrink-0 flex flex-col bg-warden-panel border-t border-warden-border"
```

**Part B: Faster scroll-down and auto-exit copy mode**

In the `handleTouchMove` function inside the terminal setup `useEffect`, when scrolling DOWN (finger moving down, seeing newer content), multiply the scroll count by 3x to make it faster to reach the bottom of scrollback. This addresses the issue where users scroll up into a long buffer and can't easily get back.

Change the touch scroll section where `sendScrollToTmux(-linesToScroll)` is called. Before the call, if `linesToScroll < 0` (scrolling down / toward bottom), multiply by 3:
```typescript
if (linesToScroll !== 0) {
  // Scroll down faster (3x) to help escape long scrollback buffers
  const adjustedLines = linesToScroll > 0 ? linesToScroll : linesToScroll * 3;
  sendScrollToTmux(-adjustedLines);
  touchAccumulator -= linesToScroll * cellHeight;
}
```

**Part C: Add "scroll mode" indicator when Esc might be needed**

This is intentionally minimal — do NOT add new state tracking for whether tmux is in copy mode (we can't know that from the client side). Instead, add a small hint text to the Esc button in the toolbar. Change the Esc button label from just `Esc` to show a tooltip-style hint. Update the Esc button in MobileKeyToolbar to have a `title` attribute:
```
title="Exit scroll/copy mode"
```

This gives users a hint when they long-press or hover that Esc exits copy mode.
  </action>
  <verify>
Run `npm run typecheck` to confirm no TypeScript errors. Run `npm run build` to confirm production build succeeds. Verify the toolbar has `sticky bottom-0 flex-shrink-0` classes. Verify the scroll-down multiplier is applied only for downward scrolling.
  </verify>
  <done>
MobileKeyToolbar has sticky+shrink-0 positioning as a safety net. Scrolling down in the terminal is 3x faster than scrolling up, helping users escape long scrollback buffers. The Esc button has a title hint about exiting scroll mode.
  </done>
</task>

</tasks>

<verification>
1. `npm run typecheck` passes with no errors
2. `npm run build` completes successfully
3. On iOS Safari (or mobile emulator): opening the keyboard shrinks the app to visual viewport height, toolbar is visible above keyboard
4. Touch-scrolling down in the terminal is noticeably faster than scrolling up
5. Desktop browser behavior is unchanged
</verification>

<success_criteria>
- MobileKeyToolbar is visible above the iOS virtual keyboard when it opens
- App height dynamically tracks `window.visualViewport.height` via CSS custom property
- The viewport meta tag includes `interactive-widget=resizes-content`
- Touch scroll-down is 3x multiplied to help escape tmux copy-mode scrollback
- All existing functionality (desktop wheel scroll, touch scroll up, alt+click, copy mode) continues to work
</success_criteria>

<output>
After completion, create `.planning/quick/4-mobile-toolbar-float-above-ios-keyboard-/4-SUMMARY.md`
</output>
