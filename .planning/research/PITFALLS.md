# Pitfalls Research: Operator Awareness & Terminal Power Tools (v3.0)

**Domain:** Adding permission prompt detection, context pressure badges, terminal text search, keyboard navigation shortcuts, agent state chips, browser notifications, and search enhancements to an existing xterm.js 5 + Socket.IO 4 terminal dashboard
**Researched:** 2026-03-03
**Confidence:** HIGH — verified against xterm.js source, MDN, project source code, and GitHub issues

---

## Critical Pitfalls

### Pitfall 1: xterm.js onData Fires Even After attachCustomKeyEventHandler Returns False

**What goes wrong:**
`terminal.attachCustomKeyEventHandler(handler)` is the documented way to intercept keys before xterm.js processes them. When the handler returns `false`, xterm.js is supposed to suppress the event. However, there is a documented edge case (xterm.js issue #2293) where `keyup` events are still processed even when the custom handler returned `false` for the corresponding `keydown`. More importantly: the `onData` event fires based on the OS-level character input, not purely on `attachCustomKeyEventHandler` — so returning `false` suppresses xterm.js default handling (sending the character to the PTY via `terminal.onData`) but does NOT prevent browser default behavior unless you also call `event.preventDefault()`.

The practical consequence for the Ctrl+F search overlay: if the handler returns `false` but does not call `event.preventDefault()`, the browser may open its own native find bar simultaneously with the custom search overlay.

**Why it happens:**
Developers read "returns whether the event should be processed by xterm.js" and assume `false` is sufficient. The xterm.js docs do not prominently state that browser default behavior is a separate concern requiring `event.preventDefault()`.

**How to avoid:**
In `attachCustomKeyEventHandler`, for every key you intercept:
1. Call `event.preventDefault()` on the KeyboardEvent object (prevents browser default)
2. Return `false` (prevents xterm.js default — stops sending the character to PTY via onData)

```typescript
terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  if (event.type === 'keydown') {
    // Ctrl+F → open search overlay
    if (event.ctrlKey && event.key === 'f') {
      event.preventDefault();
      openSearchOverlay();
      return false; // stop xterm.js from sending ^F to PTY
    }
    // Escape when search is open → close overlay, restore terminal focus
    if (event.key === 'Escape' && searchOverlayOpen) {
      event.preventDefault();
      closeSearchOverlay();
      return false;
    }
  }
  return true; // let all other keys pass through to terminal
});
```

**Warning signs:**
- Browser native find bar opens when pressing Ctrl+F in the terminal
- The Ctrl+F character (`\x06`) appears in the terminal output when search should have been triggered
- Tab navigation shortcuts (e.g., Alt+1 through Alt+5) are typed into the PTY as escape sequences

**Phase to address:**
Phase 1 (keyboard shortcuts and Ctrl+F handler) — register the key handler at terminal initialization time in `TerminalView.tsx`'s `useEffect`. Must be established before any shortcut is wired.

---

### Pitfall 2: Global document.addEventListener('keydown') Fires Even When Terminal Has Focus

**What goes wrong:**
Adding keyboard shortcuts (tab switching, sidebar toggle) via `document.addEventListener('keydown', handler)` in a React `useEffect` in `App.tsx` or a high-level component creates a conflict: the same event fires through two paths when the xterm.js terminal has focus. xterm.js captures keyboard input through its own canvas-level listeners and routes it to the PTY via `terminal.onData`. Then the `document.addEventListener` handler also fires, potentially triggering a tab switch mid-keystroke.

The sequence: user presses `Alt+2` to jump to the second tab. The terminal's `onData` fires and sends the alt-sequence escape code `\x1b2` to the PTY. Then the global handler fires and switches tabs. Claude Code running in the terminal receives a spurious `\x1b2` escape.

**Why it happens:**
Keyboard events on the terminal canvas bubble up to `document`. The `attachCustomKeyEventHandler` only intercepts within xterm.js — it doesn't suppress bubbling. Without `event.stopPropagation()` in the xterm.js custom handler, global listeners see every key pressed in the terminal.

**How to avoid:**
Two-part solution:

1. In `attachCustomKeyEventHandler`, for shortcuts that should be handled globally (tab switch, sidebar), also call `event.stopPropagation()`:
```typescript
terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  if (event.type === 'keydown' && event.altKey && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    event.stopPropagation(); // prevent bubbling to document.addEventListener
    selectTabByIndex(parseInt(event.key, 10) - 1);
    return false;
  }
  return true;
});
```

2. In the global `document.addEventListener('keydown', handler)`, check if the active element is inside the xterm.js container before acting:
```typescript
document.addEventListener('keydown', (event) => {
  const activeEl = document.activeElement;
  const isInsideTerminal = terminalContainerRef.current?.contains(activeEl);
  if (isInsideTerminal) return; // terminal's attachCustomKeyEventHandler handles it
  // ... handle shortcut
});
```

Both guards must be in place. Either alone is insufficient because `document.activeElement` during canvas focus may point to `body`, not the canvas.

**Warning signs:**
- Tab switching shortcut also sends an escape sequence to the running process in the terminal
- `Alt+number` in vim or htop triggers both a key action in the app AND a tab switch
- Pressing Escape when search is open also sends ESC to the PTY

**Phase to address:**
Phase 1 (keyboard shortcuts) — the interaction between xterm.js key handling and document-level listeners is a design decision that must be established upfront. Retrofitting is messy.

---

### Pitfall 3: Terminal Focus Lost When Search Overlay Input Field is Focused

**What goes wrong:**
When the search overlay appears with an `<input>` field and auto-focuses it, xterm.js loses focus. When the user closes the search overlay and expects to type in the terminal, the terminal may not have focus — meaning keystrokes either go nowhere or to the last-focused browser element. This is especially problematic if `terminal.focus()` is called inside a `setTimeout` or `requestAnimationFrame` that races with React re-renders.

The existing `TerminalView.tsx` already has a working pattern for this: `requestAnimationFrame(() => terminalInstanceRef.current?.focus())` after copy mode toggle. The same pattern must be used when closing the search overlay.

**Why it happens:**
React renders the search overlay and browser native focus management gives focus to the `<input>` automatically (via `autoFocus` prop or explicit `.focus()` in `useEffect`). When the overlay unmounts, the browser returns focus to `body` — not to the xterm.js terminal. The developer must explicitly restore it.

Additionally, xterm.js has an internal helper `textarea` element (class `xterm-helper-textarea`) that holds focus for xterm.js. If this element is positioned off-screen during a resize or layout transition when the search overlay opens, xterm.js may exhibit a rendering artifact (tracked in xterm.js issue #3065).

**How to avoid:**
```typescript
const closeSearchOverlay = useCallback(() => {
  setSearchOpen(false);
  // Restore terminal focus after React finishes the re-render cycle
  requestAnimationFrame(() => {
    terminalInstanceRef.current?.focus();
  });
}, []);
```

Also ensure the search input's `onKeyDown` handles `Escape` to close the overlay AND restore focus in one handler:
```typescript
<input
  autoFocus
  onKeyDown={(e) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // don't bubble to document
      closeSearchOverlay();
    }
  }}
/>
```

**Warning signs:**
- After closing the search overlay, keyboard input is silently dropped (no PTY output)
- `document.activeElement` is `body` after closing the overlay instead of the xterm canvas/textarea
- Developers discover the bug only during UI testing because it requires focus state observation

**Phase to address:**
Phase 1 (search overlay UI) — include focus restoration in the initial implementation. Easy to overlook during development (testing always starts with keyboard focus in the terminal).

---

### Pitfall 4: SearchAddon Highlight Performance Degrades Severely with Large PTY Buffers

**What goes wrong:**
`@xterm/addon-search` with decorations enabled (`ISearchDecorationOptions`) limits highlights to 1,000 matches by default. Exceeding this limit is silent — `onDidChangeResults` reports `resultIndex: -1` and `resultCount` shows the capped count. When you attempt to raise `highlightLimit` above 1,000, the profiling data from xterm.js issue #5176 shows catastrophic performance regression:

- 72,960 matches → ~470ms blocking decoration time from marker creation alone
- Event emitter creates 360,000 function allocations for 10,000 matches
- GC pressure creates ~190ms pauses from anonymous arrow function churn
- Deprecated `setTimeout`/`clearTimeout` calls add ~6.3 seconds overhead

In Warden's context, agent terminals accumulate 50,000 lines of scrollback. A search for a common word like "error" or "the" could match thousands of times. With decorations enabled, the first search call blocks the browser's main thread.

**Why it happens:**
The decoration system uses a linear marker-registration loop with synchronous event emitter notifications per match. This was designed for interactive editors where searches return dozens of results, not terminal scrollback buffers with arbitrarily large match counts.

**How to avoid:**
1. Use a two-step approach: `findNext`/`findPrevious` work without decorations and are fast (navigate only)
2. Enable decorations only with a conservative `highlightLimit` (keep the default 1,000 or lower it to 500)
3. Show match count via `onDidChangeResults` but clearly indicate "showing first 1,000 highlights" if count exceeds the limit
4. For overview ruler markers (scrollbar gutter marks), leave decorations enabled at 1,000 — the performance at that count is acceptable

```typescript
const searchAddon = new SearchAddon();
terminal.loadAddon(searchAddon);

// Configure: highlight up to 1000 matches in overview ruler
const searchOptions: ISearchOptions = {
  decorations: {
    matchBackground: '#3d3d00',
    matchBorder: undefined,
    matchOverviewRuler: '#ffff00',
    activeMatchBackground: '#ffff00',
    activeMatchBorder: undefined,
    activeMatchColorOverviewRuler: '#ff6600',
  },
};

// Always call findNext/findPrevious for navigation — fast regardless of count
searchAddon.findNext(query, searchOptions);
```

**Warning signs:**
- First search in a long-running session freezes the browser tab for >500ms
- `onDidChangeResults` always returns `resultIndex: -1` for common search terms
- User types in the search box and the UI stutters with each keystroke (if searching on every input change without debouncing)

**Phase to address:**
Phase 1 (search implementation) — configure highlight limits from the start. Add 300ms debounce to search input before calling `findNext`. Do not raise `highlightLimit` beyond default without profiling.

---

### Pitfall 5: Permission Prompt Detection Regex Has High False Positive Rate from ANSI-Contaminated Output

**What goes wrong:**
The existing `detectAgentState()` in `gsdRoutes.ts` uses `/permission|allow|dangerous/i` on raw `tmux capture-pane` output. This works today because it runs against recent lines of pane content. Expanding detection to the PTY output stream (via `TerminalStreamService.onData`) for real-time alerting introduces a new problem: the PTY stream includes ANSI escape codes, cursor positioning sequences, partial lines from in-progress renders, and re-draws.

The pattern `/permission|allow|dangerous/i` against raw PTY bytes will false-positive on:
- Log output from npm scripts like "allowing node_modules access..."
- Claude Code rendering ANSI sequences that happen to spell "permission" mid-sequence
- Truncated lines where "permission" is split across chunk boundaries
- Shell prompts containing "allow" in a custom PS1 theme

Conversely, false negatives occur when Claude Code's permission prompt is spread across multiple data chunks (the prompt renders progressively), and the detection runs against an incomplete chunk.

**Why it happens:**
PTY output is a byte stream, not a line-oriented text stream. `tmux capture-pane` already strips ANSI and provides clean rendered text — which is why the existing server-side detection works. Moving detection to the raw PTY stream bypasses this sanitization. Searching across chunk boundaries requires buffering state.

**How to avoid:**
Keep permission prompt detection on the server side using `tmux capture-pane` (the existing approach). Do NOT add regex scanning to the `TerminalStreamService.onData` callback. The current 5-second polling via `/api/gsd/agents/live-status` is sufficient latency for operator alerting:

1. `detectAgentState()` already returns `'permission_prompt'` — use this as the signal
2. To surface it in the terminal tab bar, pass the state from `useAgentLiveStatus()` to `InstanceTabBar`
3. To trigger browser notifications, watch for `state === 'permission_prompt'` transitions in `useAgentLiveStatus`

If lower-latency detection (<5 seconds) is needed, reduce the `/api/gsd/agents/live-status` poll interval to 2-3 seconds, not add PTY-stream regex.

The existing regex also needs strengthening to avoid false positives. Current pattern: `/permission|allow|dangerous/i`. Stronger pattern anchored to Claude Code's actual prompt format:
```typescript
// Claude Code permission prompt includes numbered options + "Do you want to proceed?"
const PERMISSION_PROMPT_RE = /Do you want to proceed\?|❯\s+1\.\s+Yes/i;
// Backup: detect the numbered list pattern that appears only in permission prompts
const NUMBERED_OPTIONS_RE = /^\s+1\. Yes\s*$/m;
```

**Warning signs:**
- Permission badge fires on `npm install` output containing "allowing optional peer deps"
- Badge fires on shell history containing commands with "dangerous" in the name
- Badge never fires during actual Claude Code permission prompts (false negative due to ANSI stripping gap)
- PTY onData callback CPU usage spikes above 10% during heavy terminal output

**Phase to address:**
Phase 1 (permission badge detection) — use `tmux capture-pane` path exclusively. Strengthen the regex before exposing as badge/notification.

---

### Pitfall 6: Browser Notification Permission Denied State Cannot Be Re-Requested Programmatically

**What goes wrong:**
`Notification.requestPermission()` returns `'denied'` if the user clicked "Block" in the browser prompt. Once denied, no code can re-prompt — `Notification.requestPermission()` immediately returns `'denied'` without showing any prompt. The only user path to undo this is through browser settings (`chrome://settings/content/notifications`), which is invisible to a typical user.

If the operator dismisses the notification permission dialog hastily (clicks "Block" instead of "Allow"), the opt-in is silently broken forever for that browser profile. The UI may show "Enable notifications" button but clicking it does nothing and shows no error.

Additionally: `Notification.requestPermission()` must be called in response to a user gesture (click, key press). Calling it on page load or in a `useEffect` without user interaction causes silent failure in modern browsers.

**Why it happens:**
The Notification API's permission model is intentionally one-shot to prevent harassment. Developers accustomed to other opt-in patterns assume they can re-prompt or show a fallback.

**How to avoid:**
1. Always check `Notification.permission` before showing the opt-in button:
   - `'default'` → show button (user hasn't decided)
   - `'granted'` → show active status, no button needed
   - `'denied'` → show message: "Notifications blocked in browser settings" with link to instructions, hide button

2. Request permission only on explicit button click:
```typescript
const handleEnableNotifications = async () => {
  const result = await Notification.requestPermission();
  if (result === 'denied') {
    // Show: "To enable, click the lock icon in the address bar and allow notifications"
  }
};
```

3. Persist the preference in `localStorage` so the UI doesn't re-prompt after the user already granted permission:
```typescript
const NOTIFICATION_OPT_IN_KEY = 'warden:notifications-enabled';
```

4. Test the denied path explicitly: Chrome DevTools → Application → Notifications → block the origin and verify the UI degrades gracefully.

**Warning signs:**
- Opt-in button visible and clickable when `Notification.permission === 'denied'`
- No messaging explaining how to recover from denied state
- `Notification.requestPermission()` called inside `useEffect` without user gesture guard
- Console shows "Notification permission denied" but UI shows no feedback to the user

**Phase to address:**
Phase 2 (browser notifications) — design the permission UX state machine (default/granted/denied) before writing any notification code. All three states must be handled.

---

### Pitfall 7: Notification Click Handler Cannot Focus the Tab Reliably Cross-Browser

**What goes wrong:**
Clicking a browser notification should focus the Warden tab. The `notification.onclick` handler that calls `window.focus()` works in Chrome on most platforms but has documented failures:
- Firefox has a long-standing bug (Bugzilla #874050) where `window.focus()` in `onclick` is blocked by the browser
- macOS + Chrome focuses the Chrome application but not the specific tab
- Mobile browsers (Safari iOS, Chrome Android) do not support the Notifications API at all

Additionally: `window.focus()` only works on pages that are in the same origin. Warden is served from a single origin so this is not a problem, but cross-tab focus requires using the `clients.openWindow()` API from a Service Worker context — which Warden does not use (no Service Worker).

**Why it happens:**
The Notification API was designed for Progressive Web Apps with Service Workers. The `notification.onclick` path for basic (non-persistent) notifications has inconsistent focus behavior because browsers apply different security policies to `window.focus()` calls outside user-gesture context.

**How to avoid:**
For Warden's use case (single tab, always-open dashboard), use the simplest fallback:
```typescript
const notification = new Notification('Permission Prompt Detected', {
  body: `${agentId} is waiting for approval`,
  tag: agentId, // dedup: only one notification per agent at a time
  requireInteraction: false, // auto-dismiss after a few seconds
});

notification.onclick = () => {
  window.focus();
  notification.close();
};
```

Accept that `window.focus()` may not work on all platforms. Document the limitation: "Notifications require an Always-on tab; click the notification to attempt to focus it." This is acceptable for the single-operator model.

Do NOT build the browser notification feature as a multi-window or Service Worker solution — the complexity is not warranted for this use case.

**Warning signs:**
- Notification click works in developer testing (Chrome on Linux) but fails for the operator (macOS Chrome)
- No check for `'serviceWorker' in navigator` before attempting SW-based notifications
- Notification appears but `window.focus()` has no visible effect

**Phase to address:**
Phase 2 (browser notifications) — document the limitation explicitly. Do not attempt to make focus reliable cross-browser; it is not possible without a Service Worker.

---

### Pitfall 8: @xterm/addon-search Package vs. Legacy xterm-addon-search Package Conflict

**What goes wrong:**
The project already uses the scoped `@xterm/*` package pattern (confirmed in `package.json`: `@xterm/addon-fit`, `@xterm/addon-web-links`). The search addon must also use the scoped package: `@xterm/addon-search`. Installing the legacy `xterm-addon-search` package alongside `xterm@5.x` will fail at TypeScript compilation because the old package's types reference `ITerminal` from `xterm` v4, which has a different interface shape than `xterm@5`.

**Why it happens:**
The xterm.js team migrated all addons from individual scoped packages (`xterm-addon-*`) to the main repo under the `@xterm/*` namespace with xterm.js v5 (Issue #4859). The npm package `xterm-addon-search` still exists but has not received updates — its latest version (0.15.0) was published before the v5 migration and has incompatible types.

**How to avoid:**
Use the scoped package exclusively:
```bash
npm install --save-dev @xterm/addon-search
```

Import path:
```typescript
import { SearchAddon } from '@xterm/addon-search';
```

The current `package.json` has `xterm: ^5.3.0` as the base package. The search addon must be at a compatible version. At time of research, `@xterm/addon-search@0.15.0` is the current release. Pin it alongside `@xterm/addon-fit@^0.10.0` (already in devDependencies) to keep addon versions in sync.

The overview ruler (scrollbar gutter markers) requires `overviewRulerWidth` set in `Terminal` options AND `allowProposedApi: true` — which is already set in `TerminalView.tsx`. The overview ruler color in `ISearchDecorationOptions` (`matchOverviewRuler`, `activeMatchColorOverviewRuler`) will not appear without `overviewRulerWidth > 0` in the terminal constructor options.

**Warning signs:**
- TypeScript errors on `SearchAddon` import referencing `ITerminalAddon` interface mismatch
- `npm ls xterm-addon-search` shows the legacy package installed alongside `xterm@5`
- Search highlights appear but overview ruler markers are invisible (missing `overviewRulerWidth`)

**Phase to address:**
Phase 1 (search addon installation) — add to `package.json` devDependencies in the same commit that wires the addon. Check `npm ls @xterm/` to confirm all addons share the same major version.

---

### Pitfall 9: Socket.IO Event Name Collision When Adding permission:detected to /terminal Namespace

**What goes wrong:**
The `/terminal` Socket.IO namespace already uses events: `terminal:input`, `terminal:output`, `terminal:reset`, `terminal:resize`, `terminal:exit`, `terminal:error`. Adding new events like `agent:state` or `permission:detected` to the same namespace with ambiguous prefixes risks collision with future xterm.js or Socket.IO internal events, and more practically, it breaks the existing client-side event handling if any intermediate event processing (e.g., logging middleware) captures all events matching a wildcard pattern.

More importantly: the current architecture emits from the shared PTY session's subscriber loop in `TerminalStreamService`. Adding state-related events to this path means state events are emitted to ALL subscribers of a session, not per-agent — which is correct behavior but requires careful implementation.

**Why it happens:**
Adding new events to an existing namespace is low-friction — it "just works" in Socket.IO. Developers add events without reviewing the existing event namespace design, leading to inconsistent prefixes and potential future conflicts.

**How to avoid:**
The recommended approach for v3.0 is to NOT add permission/state events to the `/terminal` Socket.IO namespace. Instead, use the existing HTTP polling approach:

- `useAgentLiveStatus()` already polls `/api/gsd/agents/live-status` every 5 seconds and returns `state: 'permission_prompt'`
- Pass this state down to `InstanceTabBar` via props for the badge
- No new Socket.IO events needed for permission detection

If real-time push is eventually needed, create a separate `/events` namespace with a clear event taxonomy, not extending `/terminal`.

If events ARE added to `/terminal`, use a consistent `warden:` prefix distinct from `terminal:`:
```
warden:agent-state  ← not terminal:state (too generic)
warden:permission   ← not permission:detected (ambiguous prefix)
```

**Warning signs:**
- New events in the `/terminal` namespace use inconsistent prefixes (some `terminal:`, some `agent:`)
- Client event handler catches events it didn't subscribe to (wildcard listeners)
- State events emitted per PTY data chunk instead of batched on poll

**Phase to address:**
Phase 1 (agent state badge) — decision to use polling vs. push must be made before implementation. Polling via the existing `/api/gsd/agents/live-status` route is the correct choice for this milestone.

---

### Pitfall 10: Context Pressure Detection Breaks When Claude Code Changes Its Status Bar Format

**What goes wrong:**
The existing `extractContextPressure()` function uses a heuristic regex: `/(?:[\u2580-\u259F]|context).*?(\d{1,3})%/i` against the last 5 lines of `tmux capture-pane` output. This regex relies on Claude Code rendering context pressure via Unicode block characters (█, ▓, ▒, ░) or the word "context" preceding a percentage. This is a best-effort heuristic — Claude Code's status bar format is not publicly documented and changes across releases.

Confirmed failure mode: Claude Code v0.2.76+ changes its ANSI color scheme or status bar format (documented in GitHub issue #5428: ANSI sequences from status line contamination). A status line format change renders the existing regex blind — `contextPressure` returns `null` indefinitely while the agent's context silently fills.

**Why it happens:**
There is no official API for context pressure data. The only available signal is the visual status bar rendered in the terminal, which is subject to unannounced format changes.

**How to avoid:**
1. The regex is already annotated "fragile heuristics" in `PROJECT.md` — the planned mitigation is correct: treat context pressure as best-effort display, never as a reliable trigger
2. When `contextPressure` is `null`, show a neutral "?%" badge, not an error state
3. Test the regex against actual tmux pane captures from the running system periodically — a Playwright test that captures pane output and asserts regex matches would catch regressions before the operator notices

For the badge display in the terminal header:
```typescript
// Graceful degradation
const pressureLabel = contextPressure !== null ? `${contextPressure}%` : '—';
```

4. Do not gate any critical functionality on context pressure detection — it is display-only

**Warning signs:**
- `contextPressure` always returns null despite active agent sessions
- Context pressure badge shows "—" across all agents simultaneously (suggests regex failed)
- tmux capture-pane output format visibly changed from previous working state

**Phase to address:**
Phase 1 (context pressure badge in terminal header) — implement as best-effort display-only. No critical logic gated on this value.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using document-level keydown listener without terminal focus check | Simple implementation | Shortcuts fire AND send to PTY simultaneously | Never — double-action is always wrong |
| Calling findNext on every keystroke (no debounce) | Immediate feedback | Main thread blocked for 100ms+ per keystroke on large buffers | Never — always debounce at 200-300ms |
| Raising highlightLimit above 1000 in SearchAddon | More visible highlights | Blocking 500ms+ freeze per search in long sessions | Never — keep default 1000 |
| Requesting Notification.permission on page load | Zero friction for operator | Silent failure in all modern browsers (requires user gesture) | Never |
| Adding state events to /terminal namespace | Simple implementation | Namespace pollution, future event name conflicts | Acceptable only if prefixed with `warden:` consistently |
| Raw PTY stream regex for permission detection | Lower latency (<100ms) | High false positive rate, CPU overhead per data chunk | Never — use tmux capture-pane instead |
| Not restoring terminal focus after search overlay closes | Simpler overlay implementation | User must click terminal to resume typing | Never — focus restoration is 3 lines of code |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `@xterm/addon-search` installation | Installing legacy `xterm-addon-search` | Use `@xterm/addon-search` (scoped package, v5 compatible) |
| `overviewRulerWidth` for gutter markers | Decorations set but rulers invisible | Set `overviewRulerWidth: 15` in `Terminal` options at construction |
| `attachCustomKeyEventHandler` | Returning `false` without `preventDefault()` | Call both `event.preventDefault()` AND `return false` |
| Global keyboard shortcuts | `document.addEventListener` capturing terminal keys | Guard with `event.stopPropagation()` in xterm custom handler |
| `Notification.requestPermission()` | Calling outside user gesture | Call only inside click/keypress event handler |
| `Notification.permission === 'denied'` | Showing re-prompt button | Show "unblock in browser settings" message instead |
| Search addon + xterm.css version | Old CSS causes gray blocks on search results | Import current `xterm/css/xterm.css` — already correct in project |
| `onDidChangeResults` result count | Expecting accurate count beyond highlight limit | `resultIndex: -1` means count exceeded limit, not "no results" |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SearchAddon findNext on every keypress | 100-500ms UI freeze per character typed in search box | Debounce search input at 300ms | First search in a session with >1000 matches |
| SearchAddon highlightLimit >1000 with decorations | 500ms+ blocking per search | Keep default 1000 or lower | Any search returning >1000 matches |
| Regex scanning in TerminalStreamService.onData | CPU spike during high-throughput terminal output | Use tmux capture-pane polling instead | npm install or build output (hundreds of lines/sec) |
| Polling `/api/gsd/agents/live-status` faster than 2 seconds | N concurrent `tmux capture-pane` calls × M agents | Keep 5s interval; lower to 2-3s maximum if needed | >5 active agents at 2s interval = 10+ tmux calls/tick |
| Re-creating SearchAddon on every tab switch | Flicker + lost search state when switching sessions | Attach addon to terminal instance; dispose with terminal | Every tab switch if not handled |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Permission badge clears before operator responds | Operator sees badge, switches tabs, badge gone — was it real? | Use a latching badge: clear only when state transitions away from `permission_prompt` for 2+ polls |
| Search overlay does not show match count | Operator must press Enter repeatedly to count matches | Show "3 / 47" format via `onDidChangeResults` |
| Notification fires repeatedly for same permission prompt | Browser fills up with duplicate notifications | Use `tag: agentId` on `Notification` constructor to deduplicate |
| Keyboard shortcut list not discoverable | Operator doesn't know Alt+1 switches tabs | Show shortcut hints in InstanceTabBar header or tooltip |
| Context pressure badge shows on non-active sessions | Operator confused about which terminal the badge refers to | Badge scoped to active terminal's header only, not in tab bar |
| Search box takes focus, Escape exits search but terminal doesn't respond | Operator must click terminal to resume | Always call `terminal.focus()` after closing search overlay |

---

## "Looks Done But Isn't" Checklist

- [ ] **Ctrl+F search:** Often missing `event.preventDefault()` — verify the browser's native find bar does NOT open when pressing Ctrl+F inside the terminal
- [ ] **Tab switch shortcuts:** Often sends escape codes to PTY — verify pressing Alt+1 in a running vim session switches tabs AND does not inject `\x1b1` into vim
- [ ] **Search focus restoration:** Often missing — verify that after closing search with Escape, the next keystroke appears in the terminal (not silently discarded)
- [ ] **Overview ruler:** Often invisible — verify `overviewRulerWidth` is set in Terminal constructor and search result marks appear in scrollbar gutter
- [ ] **Notification denied state:** Often missing — verify clicking "Enable notifications" when already denied shows explanation text, not silent failure
- [ ] **Permission badge latching:** Often transient — verify the badge stays visible across polling intervals, not just for the single poll that detected the prompt
- [ ] **Search result count at limit:** Often wrong — verify `onDidChangeResults` returning `resultIndex: -1` is shown as "1000+" or "many" not "-1 results"
- [ ] **@xterm/addon-search version:** Often wrong package — verify `npm ls xterm-addon-search` shows nothing (legacy), `npm ls @xterm/addon-search` shows the scoped version

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Keyboard shortcut sends to PTY | LOW | Add `event.stopPropagation()` + `event.preventDefault()` in `attachCustomKeyEventHandler`; no data loss |
| Search freeze on large buffer | LOW | Reduce `highlightLimit`; add debounce to search input; re-test |
| Notification permission denied by operator | LOW | Document recovery path (browser settings); no code change needed |
| SearchAddon wrong package version | MEDIUM | `npm uninstall xterm-addon-search && npm install --save-dev @xterm/addon-search`; update imports |
| Permission false positives flooding notifications | MEDIUM | Strengthen regex anchors; add minimum-confidence threshold; clear existing notifications with `tag` dedup |
| Context pressure regex broken by Claude Code update | LOW | Update regex; regex is isolated in `extractContextPressure()` in `gsdRoutes.ts`; no rebuild of other features |
| Terminal focus lost on search close | LOW | Add `requestAnimationFrame(() => terminal.focus())` after overlay close; 3-line fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `attachCustomKeyEventHandler` missing `preventDefault` | Phase 1: Ctrl+F handler | Press Ctrl+F in terminal; verify browser find bar does not open |
| Global keydown conflict with terminal input | Phase 1: keyboard shortcuts | Press Alt+1 in running vim; verify tab switches AND vim is unaffected |
| Search overlay focus loss | Phase 1: search overlay UI | Close search with Escape; type a character; verify it appears in terminal |
| SearchAddon performance with large buffer | Phase 1: search implementation | Search for "e" in a 50,000-line session; verify no freeze |
| Permission regex false positives | Phase 1: badge logic | Run `npm install` in a terminal; verify no permission badge fires |
| Notification denied state UX | Phase 2: notifications | Block notifications in browser; click opt-in button; verify explanation text appears |
| Notification click cross-browser focus | Phase 2: notifications | Test on macOS Chrome; document behavior if focus doesn't work |
| Wrong search package version | Phase 1: addon installation | Verify with `npm ls @xterm/addon-search` |
| Socket.IO namespace collision | Phase 1: architecture decision | Decision: use polling, not Socket.IO push for state events |
| Context pressure regex fragility | Phase 1: badge display | Test against live tmux pane output; verify null case renders gracefully |

---

## Sources

**Confidence: HIGH** — Verified against xterm.js GitHub issues, MDN Web Docs, and Warden project source code (TerminalView.tsx, useTerminalSocket.ts, gsdRoutes.ts read in full).

### xterm.js Keyboard Handling
- [xterm.js Terminal API: attachCustomKeyEventHandler](https://xtermjs.org/docs/api/terminal/classes/terminal/) — official API reference
- [CustomKeyEventHandler does not override xterm default keybindings · Issue #3880](https://github.com/xtermjs/xterm.js/issues/3880) — confirmed edge cases
- [keyup still handled when custom key handler returns false · Issue #2293](https://github.com/xtermjs/xterm.js/issues/2293) — documented keyup gap

### xterm.js Search Addon
- [xterm.js Search is too slow · Issue #5176](https://github.com/xtermjs/xterm.js/issues/5176) — performance profiling data (470ms for 72k matches)
- [@xterm/addon-search typings](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-search/typings/addon-search.d.ts) — `onDidChangeResults`, `highlightLimit`, `ISearchDecorationOptions`
- [Migrate to @xterm org on npm · Issue #4859](https://github.com/xtermjs/xterm.js/issues/4859) — v5 scoped package migration
- [xterm selection conflict with search addon · Issue #3915](https://github.com/xtermjs/xterm.js/issues/3915) — CSS version dependency

### xterm.js Focus Management
- [Terminal focus class lost under certain conditions · Issue #789](https://github.com/xtermjs/xterm.js/issues/789)
- [Rendering issue from xterm-helper-textarea off-screen · Issue #3065](https://github.com/xtermjs/xterm.js/issues/3065)

### Browser Notification API
- [MDN: Notification.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static) — permission states and user gesture requirement
- [MDN: Notification.permission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/permission_static) — denied state is permanent without user action
- [Reset denied notification permission guide](https://pushpad.xyz/blog/reset-the-denied-permission-for-notifications) — recovery path for denied state
- [Firefox bug #874050: window.focus() blocked in notification onclick](https://bugzilla.mozilla.org/show_bug.cgi?id=874050) — cross-browser limitation

### Permission Prompt Detection
- [cc-hook: regex pattern for Claude Code permission prompts](https://github.com/nahco314/cc-hook) — `"Do you want to proceed?"` as detection anchor
- [Claude Code ANSI escape contamination · Issue #5428](https://github.com/anthropics/claude-code/issues/5428) — status bar format fragility
- [ANSI escape codes regex pitfalls — ansi-regex](https://github.com/chalk/ansi-regex) — false positive risks with non-standard sequences

### Node.js PTY Performance
- [node-pty onData callback overhead discussion](https://github.com/microsoft/node-pty/issues/387) — per-chunk callback pressure
- [How a RegEx can bring your Node.js service down — Liran Tal](https://lirantal.medium.com/node-js-pitfalls-how-a-regex-can-bring-your-system-down-cbf1dc6c4e02) — ReDoS risk in onData path

---
*Pitfalls research for: Warden v3.0 — Operator Awareness & Terminal Power Tools*
*Researched: 2026-03-03*
*Confidence: HIGH (verified against xterm.js source, MDN, and Warden project code)*
