---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/services/TerminalStreamService.ts
  - src/client/App.tsx
  - src/client/components/AgentSidebar.tsx
  - src/client/components/InstanceTabBar.tsx
  - src/client/components/TerminalView.tsx
  - src/client/components/PromptPanel.tsx
  - src/client/components/HistoryView.tsx
  - src/client/styles.css
autonomous: true
must_haves:
  truths:
    - "On mobile (360px), sidebar is hidden by default and togglable via hamburger"
    - "Tab bar scrolls horizontally on mobile and tabs are touch-friendly"
    - "Terminal font scales down on mobile for more content visibility"
    - "PromptPanel stacks vertically on mobile with full-width textarea"
    - "Reconnecting to same tmux session reuses or kills the old PTY before spawning new one"
    - "URL hash reflects selected session and view, surviving page refresh"
    - "Alt+click in terminal sends cursor position to tmux instead of selecting text"
    - "Long-press on mobile terminal shows a text selection overlay for copy"
  artifacts:
    - path: "src/server/services/TerminalStreamService.ts"
      provides: "Deduplicated PTY per session name"
    - path: "src/client/App.tsx"
      provides: "URL hash routing, mobile-responsive layout"
    - path: "src/client/components/AgentSidebar.tsx"
      provides: "Mobile overlay sidebar"
    - path: "src/client/components/TerminalView.tsx"
      provides: "Mobile font scaling, Alt+click positioning, long-press copy overlay"
  key_links:
    - from: "src/client/App.tsx"
      to: "window.location.hash"
      via: "hashchange listener + effect"
      pattern: "window\\.location\\.hash"
    - from: "src/server/services/TerminalStreamService.ts"
      to: "activeStreams"
      via: "session-keyed dedup map"
      pattern: "sessionName.*activeStreams"
---

<objective>
Fix five UX issues in Warden Dashboard: mobile responsiveness, tmux PTY duplication on reconnect, native copy/paste on mobile, URL-based tab routing for refresh persistence, and cursor click positioning via Alt+click.

Purpose: Make Warden usable on mobile devices and fix server-side resource leaks from duplicate PTY processes.
Output: Updated client components with responsive layouts, server dedup logic, and URL hash routing.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/server/services/TerminalStreamService.ts
@src/client/App.tsx
@src/client/components/AgentSidebar.tsx
@src/client/components/InstanceTabBar.tsx
@src/client/components/TerminalView.tsx
@src/client/components/PromptPanel.tsx
@src/client/components/HistoryView.tsx
@src/client/hooks/useTerminalSocket.ts
@src/client/styles.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tmux PTY duplication on reconnect</name>
  <files>src/server/services/TerminalStreamService.ts</files>
  <action>
    The root cause: `activeStreams` is keyed by `socket.id`, so when Socket.IO reconnects (new socket.id), a NEW `pty.spawn('tmux', ['attach-session', ...])` is created while the old one may still be alive (async disconnect cleanup race).

    Fix by adding a secondary index `sessionStreams: Map<string, Set<string>>` that maps `sessionName -> Set<socketId>`. In `attachSocketToSession`:

    1. Before spawning a new PTY, check if there are existing streams for this `sessionName` in `sessionStreams`.
    2. For each existing socketId in that set, call `detachSocket(existingSocketId)` to kill the old PTY and clean up.
    3. Then proceed to spawn the new PTY as normal.
    4. Update `sessionStreams` on both attach (add socketId to session set) and detach (remove socketId from session set, delete set if empty).

    In `detachSocket`:
    5. After deleting from `activeStreams`, also remove the socketId from the corresponding `sessionStreams` set.

    In `killAllPtyProcesses`:
    6. Also clear `sessionStreams`.

    This ensures at most ONE PTY attachment per tmux session at any time, preventing the duplicate status bar issue.

    Also add a log line: `[TerminalStream] Killing existing PTY for session ${sessionName} (was socket ${existingSocketId})` when dedup triggers.
  </action>
  <verify>
    Run `npm run typecheck` to ensure no type errors. Manually verify: connect to a session, then disconnect and reconnect -- the server log should show the dedup kill message and only one PTY should remain.
  </verify>
  <done>Reconnecting to the same tmux session kills the previous PTY before spawning a new one. No duplicate tmux status bars appear.</done>
</task>

<task type="auto">
  <name>Task 2: Add URL hash routing for session and view persistence</name>
  <files>src/client/App.tsx</files>
  <action>
    Implement lightweight hash-based routing so that the selected session and view survive page refresh. No router library needed.

    Hash format: `#view={terminals|history}&session={tmuxSessionName}`

    1. Create a helper `parseHash(): { view: AppView; session: string | null }` that reads `window.location.hash`, parses the key=value pairs, and returns defaults (`terminals`, `null`) for missing/invalid values.

    2. Create a helper `updateHash(view: AppView, session: string | null)` that sets `window.location.hash` without triggering a page reload. Use `history.replaceState` to avoid polluting history stack with every tab click. Format: `#view=terminals&session=warden-dashboard-abc123`.

    3. Initialize `currentView` and `selectedSessionName` from `parseHash()` instead of hardcoded defaults. Use `useState(() => parseHash())` with lazy initializer pattern -- or use two separate lazy initializers for each state.

    4. In `handleSelectSession`, call `updateHash('terminals', sessionName)` after setting state.

    5. When `setCurrentView` is called (the two header buttons), also call `updateHash(newView, selectedSessionName)`.

    6. Add a `hashchange` event listener (in a useEffect) that calls `parseHash()` and updates state if the hash was changed externally (e.g., back button). Clean up the listener on unmount.

    7. When auto-selecting the first session (the `if (!selectedSessionName && activeInstances.length > 0)` block), also update the hash.

    8. When a selected session disappears and falls back, also update the hash.

    Keep the existing state management logic intact -- hash is a sync layer on top, not a replacement.
  </action>
  <verify>
    Run `npm run typecheck`. Test: select a session tab, note the URL hash changes. Refresh the page -- the same session and view should be restored. Switch to History view, refresh -- History view persists.
  </verify>
  <done>URL hash reflects current view and selected session. Page refresh restores the exact view and tab selection. Browser back/forward navigates between previous selections.</done>
</task>

<task type="auto">
  <name>Task 3: Make layout mobile-responsive</name>
  <files>
    src/client/App.tsx
    src/client/components/AgentSidebar.tsx
    src/client/components/InstanceTabBar.tsx
    src/client/components/PromptPanel.tsx
    src/client/styles.css
  </files>
  <action>
    The current layout assumes desktop-width screens. The sidebar is a fixed 288px (w-72) which is ~80% of a 360px mobile screen.

    **App.tsx changes:**

    1. Change `showSidebar` default to be responsive: `useState(window.innerWidth >= 1024)` so sidebar starts hidden on mobile.

    2. On mobile (<1024px / lg breakpoint), the sidebar should render as a full-screen overlay with a backdrop, not a side panel. Wrap the AgentSidebar render condition:
       - On `lg:` screens: render as-is (inline flex child).
       - Below `lg:`: render as a fixed overlay (`fixed inset-0 z-50`) with a semi-transparent backdrop div that closes the sidebar on click. The sidebar itself slides in from the right.

    3. Add a hamburger/menu icon for the "Agents" toggle button on mobile. The existing text button is fine, just ensure it's visible and tappable (min 44px touch target on mobile).

    **AgentSidebar.tsx changes:**

    4. Change from `w-72` to `w-72 lg:w-72` and on mobile (when rendered as overlay) use `w-[85vw] max-w-sm`. Add `h-full` to ensure it fills the overlay container.

    5. Add an `onClose` prop that gets called when user taps the backdrop or a close button inside the sidebar header. The parent (App.tsx) passes `() => setShowSidebar(false)`.

    **InstanceTabBar.tsx changes:**

    6. The tab bar already has `overflow-x-auto` which is good for horizontal scroll. Add `-webkit-overflow-scrolling: touch` via style prop for smooth momentum scrolling on iOS.

    7. Make tab touch targets larger on mobile: add `min-h-[44px]` to each tab div for touch accessibility.

    8. On small screens, hide the project path segment entirely (it already has `hidden lg:inline` -- good, no change needed there).

    **PromptPanel.tsx changes:**

    9. The textarea + send button row (`flex gap-2`) should stack on mobile. Change to `flex flex-col sm:flex-row gap-2`. On mobile the send button should be full-width.

    10. The agent selector row should also wrap on very small screens. Add `flex-wrap` to the container.

    **styles.css changes:**

    11. Add a utility class for the sidebar overlay backdrop: `.sidebar-backdrop { background: rgba(0, 0, 0, 0.5); }`.

    12. Add smooth scrolling for tab bar on touch devices:
    ```css
    .touch-scroll {
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .touch-scroll::-webkit-scrollbar {
      display: none;
    }
    ```
  </action>
  <verify>
    Run `npm run typecheck`. Open browser dev tools, toggle device toolbar to iPhone SE (375px) and iPad (768px). Verify: sidebar hidden by default on mobile, opens as overlay, tab bar scrolls horizontally, prompt panel stacks vertically, no horizontal page overflow.
  </verify>
  <done>Dashboard is fully usable on 360px-width mobile screens. Sidebar is an overlay on mobile. Tab bar scrolls horizontally. PromptPanel stacks vertically. No content overflow or cut-off elements.</done>
</task>

<task type="auto">
  <name>Task 4: Add Alt+click cursor positioning and mobile long-press copy</name>
  <files>src/client/components/TerminalView.tsx</files>
  <action>
    Two features in TerminalView: (A) Alt+click sends cursor position to tmux, (B) mobile long-press shows selectable text overlay.

    **A) Alt+click cursor positioning:**

    Mouse tracking sequences are stripped so browser handles clicks for text selection. But users sometimes need to click-to-position the cursor in tmux (e.g., to edit a command). Use Alt+click as the modifier.

    1. After the terminal is created and opened, attach a DOM event listener to `terminalContainerRef.current` for `click` events.

    2. In the click handler, check `event.altKey`. If not Alt+click, return (let normal selection happen).

    3. If Alt+click: prevent default, calculate the terminal cell coordinates from the click position:
       - Get the terminal's character dimensions: `const cellWidth = terminalContainerRef.current.querySelector('.xterm-rows')?.clientWidth / terminal.cols` and similarly for height using `rows`.
       - Calculate `col = Math.floor((event.offsetX) / cellWidth)` and `row = Math.floor((event.offsetY) / cellHeight)`.
       - Clamp col to [0, terminal.cols-1] and row to [0, terminal.rows-1].

    4. Send the cursor position to tmux by emitting the appropriate escape sequence via `sendInput`. The simplest approach: use CSI cursor position reporting. Actually, the most reliable way is to use tmux's own mouse handling. Since we stripped mouse-tracking, we need to temporarily send the click as a mouse event.

       Better approach: Use arrow keys relative to current cursor position. But we don't know the current position.

       Simplest reliable approach: Send a mouse click escape sequence directly. The format for SGR mouse mode (1006): `\x1b[<0;{col+1};{row+1}M` for press and `\x1b[<0;{col+1};{row+1}m` for release.

       But since mouse tracking is stripped on OUTPUT only (server->client), the INPUT path (client->server) still works. So send the mouse press+release sequence:
       ```
       sendInput(`\x1b[<0;${col + 1};${row + 1}M`);
       sendInput(`\x1b[<0;${col + 1};${row + 1}m`);
       ```

    5. Show a brief visual indicator where the click landed (a small dot or flash at the click position) that fades after 300ms.

    6. Add a tooltip/hint in the terminal status bar: "Alt+click to position cursor" -- add this as a small text next to the session name in the terminal header bar.

    **B) Mobile long-press copy overlay:**

    On mobile, xterm.js touch events go to the terminal (no native selection handles). Provide a "select mode" via long-press.

    7. Add state: `const [selectMode, setSelectMode] = useState(false)` and `const [terminalText, setTerminalText] = useState('')`.

    8. Detect long-press (touchstart held for 500ms without touchmove) on the terminal container. On long-press trigger:
       - Extract all visible terminal text: iterate `terminal.buffer.active` from `viewportY` to `viewportY + rows`, calling `line.translateToString()` for each line.
       - Set `terminalText` to the joined lines.
       - Set `selectMode` to true.

    9. When `selectMode` is true, render an overlay div on top of the terminal:
       - `absolute inset-0 z-30 bg-warden-bg/95 overflow-auto p-3`
       - Contains a `<pre>` with the terminal text, styled with `select-all` CSS so the user can natively long-press and use OS copy handles.
       - A "Close" button at the top-right to exit select mode (`setSelectMode(false)`).
       - The `<pre>` should use the same font as the terminal (`JetBrains Mono`) and a reasonable mobile size (12px).

    10. Only show the long-press behavior on touch devices. Detect via: `const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0`. Gate the touchstart listener behind this check.

    11. Clean up touch event listeners in the useEffect return.
  </action>
  <verify>
    Run `npm run typecheck`. Test Alt+click: hold Alt, click in terminal area -- cursor should jump to that position in tmux. Test on mobile (Chrome DevTools device mode with touch simulation): long-press on terminal should show the text overlay with selectable text and a Close button.
  </verify>
  <done>Alt+click positions cursor in tmux at the clicked cell. Mobile long-press opens a text overlay with natively selectable terminal content for copy/paste. Both features coexist with normal text selection.</done>
</task>

<task type="auto">
  <name>Task 5: Mobile terminal font scaling and final polish</name>
  <files>
    src/client/components/TerminalView.tsx
    src/client/components/HistoryView.tsx
  </files>
  <action>
    **Terminal font scaling:**

    1. In the Terminal constructor options, make fontSize responsive:
       ```
       const isMobile = window.innerWidth < 640;
       fontSize: isMobile ? 11 : 14,
       ```
       This gives more columns on mobile (360px / ~6.6px per char at 11px = ~54 cols vs ~36 cols at 14px).

    2. Also listen for `orientationchange` event (or the resize handler already there) and if the terminal exists, update font size via `terminal.options.fontSize = newSize` and re-fit. Only change if the breakpoint threshold crossed (don't resize font on every pixel change).

    **HistoryView mobile tweaks:**

    3. The HistoryView tab buttons are fine but could wrap on very narrow screens. Add `flex-wrap` to the tab container.

    **Final typecheck and verification:**

    4. Run `npm run typecheck` to ensure all changes across all files compile cleanly.

    5. Run `npm run build` to ensure production build succeeds.
  </action>
  <verify>
    `npm run typecheck` passes. `npm run build` succeeds. On mobile viewport (360px), terminal shows ~50+ columns with smaller font. Orientation change triggers font resize and re-fit.
  </verify>
  <done>Terminal is readable on mobile with appropriate font scaling. Production build succeeds with all changes.</done>
</task>

</tasks>

<verification>
1. `npm run typecheck` passes with zero errors
2. `npm run build` produces clean production build
3. On desktop (1440px): layout unchanged, sidebar visible by default, Alt+click positions cursor
4. On mobile (360px): sidebar hidden by default, opens as overlay, tab bar scrolls, prompt panel stacks, terminal font smaller
5. URL hash updates on session/view change; page refresh restores state
6. Server log shows PTY dedup on reconnect (no duplicate tmux status bars)
7. Mobile long-press opens selectable text overlay
</verification>

<success_criteria>
- All five issues addressed: mobile responsive, tmux dedup, mobile copy, URL routing, cursor positioning
- Zero TypeScript errors
- Production build succeeds
- No regressions to existing desktop functionality
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-mobile-responsiveness-tmux-duplicati/3-SUMMARY.md`
</output>
