# Phase 20: Terminal Search & Browser Notifications - Research

**Researched:** 2026-03-03
**Domain:** xterm.js SearchAddon + Web Notifications API + React overlay
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search overlay design**
- Top-right floating bar pinned inside the terminal pane (VS Code / Chrome DevTools style)
- Does not push terminal content down — floats above it
- Plain text search only — no regex toggle, no case-sensitivity toggle
- Subtle slide-in animation (~150ms) from the top-right corner on open; reverse on close
- Search query persists when overlay is closed and reopened within the same session; clears on session switch

**Match highlighting & navigation**
- All matches: yellow background highlight
- Active (navigated-to) match: orange/amber background to distinguish from other matches
- Scrollbar gutter markers: thin 2-3px yellow ticks on the right edge of the scrollbar track showing match positions in the buffer
- Navigating to a match (Enter / Shift+Enter / Next / Previous buttons) centers the match in the viewport
- Match count updates only when user types a new query — does not live-update as terminal output streams in (stable, no flicker)

**Search + terminal interaction**
- Terminal content is NOT dimmed while search is open — full brightness, matches stand out by highlight color alone
- Terminal remains fully scrollable (mouse + keyboard scroll) while search overlay is open
- Search overlay closes when switching to a different session tab (search is session-specific)
- While search overlay is open, all keyboard input goes to the search field; Enter/Shift+Enter navigate matches; Escape closes overlay and returns focus to the terminal canvas

**Notification behavior**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 20 has two independent capabilities: (1) terminal search using `xterm-addon-search@0.13.0`, the non-scoped addon that is peer-compatible with the project's installed `xterm@5.3.0`; and (2) browser notifications using the plain Web Notifications API (no service worker). Both capabilities are well-matched to the project stack and require no new heavyweight dependencies.

The critical compatibility constraint — confirmed by `npm show xterm-addon-search@0.13.0 peerDependencies` returning `{ xterm: '^5.0.0' }` — resolves the blocker documented in STATE.md. The non-scoped `xterm-addon-search` package is correct; the scoped `@xterm/addon-search` requires `@xterm/xterm` (scoped), which is incompatible with this project's non-scoped `xterm@5.3.0` installation.

The search implementation needs one prerequisite change to the Terminal constructor: `overviewRulerWidth: 15` must be added before the SearchAddon can render gutter markers on the scrollbar track. Without this option, the overview ruler canvas is never created and decoration markers are silently ignored. The `onDidChangeResults` event delivers `{ resultIndex, resultCount }` on every search change; because `highlightLimit` defaults to 1000, `resultCount` never exceeds 1000 even when the buffer has more matches — the UI must display "1000+" when `resultCount === 1000` (the cap is hit at exactly 1000, not exceeded).

Browser notifications use `new Notification(title, options)` directly in the page context. The `tag` option provides natural deduplication: a notification with the same tag silently replaces the previous one rather than creating a second popup. State-transition-only firing is implemented by tracking which agentIds are already in `permission_prompt` state in a `useRef` set inside a new `useBrowserNotifications` hook that reads `liveStatus` from App.tsx.

**Primary recommendation:** Install `xterm-addon-search@0.13.0`, add `overviewRulerWidth: 15` to the Terminal constructor, extract a `TerminalSearchOverlay` React component, wire Ctrl+F in `useGlobalHotkeys`, and implement `useBrowserNotifications` as a standalone hook consuming the existing `sessionStatusMap` from App.tsx.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Operator can open a search overlay with Ctrl+F in the terminal view | `useGlobalHotkeys` already has a Ctrl+F stub that calls `preventDefault` + `stopPropagation`; replace the stub with `setSearchOpen(true)` callback |
| SRCH-02 | Search finds and highlights matching text in the full terminal scrollback buffer | `SearchAddon.findNext(term, { decorations: {...} })` searches full scrollback; `scrollback: 5000` is already set in Terminal constructor |
| SRCH-03 | Operator can navigate between matches with Next/Previous buttons or Enter/Shift+Enter | `searchAddon.findNext(term)` / `searchAddon.findPrevious(term)` in response to button clicks and keyboard events in the overlay |
| SRCH-04 | Search overlay shows match count ("3 / 47" or "1000+" for large result sets) | `onDidChangeResults` event fires `{ resultIndex, resultCount }`; show "1000+" when `resultCount >= 1000` (highlightLimit default) |
| SRCH-05 | Scrollbar gutter markers indicate where matches appear in the buffer | Requires `overviewRulerWidth: 15` in Terminal constructor + `matchOverviewRuler` color in `ISearchDecorationOptions` |
| SRCH-06 | Escape closes the search overlay and returns focus to the terminal | `onKeyDown` in overlay input: `if (event.key === 'Escape') { setSearchOpen(false); requestAnimationFrame(() => terminal.focus()); }` |
| SRCH-07 | Search input debounces at 300ms to prevent UI blocking on large buffers | `useEffect` with `setTimeout(300)` on query state; cancel on cleanup |
| AWARE-06 | Operator can opt in to browser notifications for permission prompts via a settings toggle | Bell icon button in TerminalView header; toggle state in `localStorage`; `Notification.requestPermission()` triggered on first toggle-on |
| AWARE-07 | Browser notification fires when permission prompt is detected and the browser tab is not focused | `useBrowserNotifications` hook; check `document.visibilityState === 'hidden'` before firing |
| AWARE-08 | Browser notification does not fire repeatedly while same permission state persists | `useRef<Set<string>>` of agentIds currently in permission state; only fire on transition into the set |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xterm-addon-search | 0.13.0 | Full scrollback search with decoration-based highlighting and overview ruler gutter markers | Non-scoped; peer-compatible with project's `xterm@5.3.0`; provides `onDidChangeResults` event for match count |
| Web Notifications API | Browser built-in | Desktop OS notifications when tab is not focused | No install needed; `Notification` global is available in all Chromium/Firefox/Safari desktop browsers; no service worker required for simple desktop-only use case |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React useState + useEffect + useRef | Built-in (React 19) | Search overlay state, debounce timer, searchAddon ref | Already used throughout; no new dependency |
| localStorage | Browser built-in | Persist notification opt-in toggle | Already used for font size preference in TerminalView |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| xterm-addon-search@0.13.0 | @xterm/addon-search | @xterm/addon-search requires @xterm/xterm (scoped) — incompatible with project's non-scoped xterm@5.3.0 |
| xterm-addon-search@0.13.0 | Custom regex highlight | The addon handles full scrollback search, decoration management, active-match tracking, and overview ruler markers — would take 500+ LOC to replicate |
| Web Notifications API | Service Worker Push | Operator is always on the same desktop; no push subscription needed; plain Notification API is simpler and sufficient |
| Notification tag deduplication | Custom "already-shown" ref | Tag-based deduplication is browser-native; combining with a `useRef` set handles the state-transition requirement precisely |

**Installation:**
```bash
npm install xterm-addon-search@0.13.0
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/client/
├── components/
│   ├── TerminalView.tsx          # Add searchAddon ref + overviewRulerWidth; pass openSearch callback
│   └── TerminalSearchOverlay.tsx # NEW: floating search UI component
├── hooks/
│   ├── useGlobalHotkeys.ts       # Extend Ctrl+F stub to call openSearch callback
│   └── useBrowserNotifications.ts # NEW: notification opt-in + state-transition firing
```

### Pattern 1: SearchAddon Lifecycle in TerminalView
**What:** The SearchAddon must be created and loaded into the Terminal instance inside the same `useEffect` that creates the Terminal. The addon ref is stored in a `useRef` so the overlay component can call `findNext`/`findPrevious`.
**When to use:** Any time xterm.js addons need to communicate with overlay React components.

```typescript
// Source: xterm-addon-search@0.13.0 typings/xterm-addon-search.d.ts
import { SearchAddon } from 'xterm-addon-search';

// In TerminalView useEffect (same effect that creates Terminal):
const searchAddon = new SearchAddon({ highlightLimit: 1000 });
terminal.loadAddon(searchAddon);
searchAddonRef.current = searchAddon;

// Terminal constructor must include overviewRulerWidth — without it,
// matchOverviewRuler color is silently ignored:
const terminal = new Terminal({
  // ... existing options ...
  overviewRulerWidth: 15,
  allowProposedApi: true, // already set
});
```

### Pattern 2: TerminalSearchOverlay Component Structure
**What:** Floating `<div>` absolutely positioned top-right inside the terminal pane's `relative` wrapper. Uses CSS `transition` for slide-in. Input is auto-focused on open via `useEffect`.

```typescript
// Source: project pattern from TerminalView.tsx existing overlays
// The terminal pane already has `<div className="relative flex-1 min-h-0 min-w-0">`
// Overlay positions inside that container:

function TerminalSearchOverlay({ searchAddonRef, onClose, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [matchIndex, setMatchIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus input when overlay opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search execution
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (!query) {
        searchAddonRef.current?.clearDecorations();
        return;
      }
      searchAddonRef.current?.findNext(query, {
        decorations: {
          matchBackground: '#f59e0b33',          // yellow, semi-transparent
          matchBorder: '#f59e0b',
          matchOverviewRuler: '#f59e0b',
          activeMatchBackground: '#f97316',      // orange/amber
          activeMatchBorder: '#f97316',
          activeMatchColorOverviewRuler: '#f97316',
        },
      });
    }, 300);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [query, searchAddonRef]);

  // Subscribe to match count changes
  useEffect(() => {
    const addon = searchAddonRef.current;
    if (!addon) return;
    const disposable = addon.onDidChangeResults(({ resultIndex, resultCount }) => {
      setMatchIndex(resultIndex);
      setMatchCount(resultCount);
    });
    return () => disposable.dispose();
  }, [searchAddonRef]);
}
```

### Pattern 3: Match Count Display
**What:** The `highlightLimit` is 1000 (default). When `resultCount` reaches 1000, it means the limit was hit, not that there are exactly 1000 matches. Display "1000+" in this case.

```typescript
// Source: xterm.js issue #5176 — highlightLimit default is 1000; resultCount caps there
const countDisplay = matchCount === 0
  ? 'No results'
  : matchCount >= 1000
    ? `${matchIndex + 1} / 1000+`
    : `${matchIndex + 1} / ${matchCount}`;
```

### Pattern 4: Ctrl+F Wiring in useGlobalHotkeys
**What:** The existing Ctrl+F stub in `useGlobalHotkeys.ts` calls `preventDefault` + `stopPropagation` and returns. Phase 20 replaces the return with `onOpenSearch?.()`.

```typescript
// Source: src/client/hooks/useGlobalHotkeys.ts (existing stub, lines 61-66)
// Change: add onOpenSearch to interface + call it in Ctrl+F handler
if (event.key === 'f' || event.key === 'F') {
  event.preventDefault();
  event.stopPropagation();
  if (currentView === 'terminals') {
    onOpenSearch?.();
  }
  return;
}
```

### Pattern 5: useBrowserNotifications Hook
**What:** Reads `sessionStatusMap` (already computed in App.tsx), tracks which agents are in `permission_prompt`, fires a `Notification` on state-transition only. Opted-in toggle persisted in `localStorage`.

```typescript
// Source: Web Notifications API MDN + project pattern
const NOTIFICATION_STORAGE_KEY = 'warden:notifications-enabled';

export function useBrowserNotifications({
  sessionStatusMap,
  instances,
  onSelectSession,
}: UseBrowserNotificationsParams): {
  notificationsEnabled: boolean;
  toggleNotifications: () => void;
} {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try { return localStorage.getItem(NOTIFICATION_STORAGE_KEY) === 'true'; }
    catch { return false; }
  });
  // Set of agentIds currently tracked as in permission_prompt state
  // (used to detect state transitions, not re-fire on sustained state)
  const permissionStateAgentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    const currentPermissionAgents = new Set<string>();
    for (const [sessionName, status] of sessionStatusMap) {
      if (status.state !== 'permission_prompt') continue;
      const instance = instances.find(i => i.tmuxSessionName === sessionName);
      if (!instance) continue;
      currentPermissionAgents.add(instance.agentId);
      // Only fire if this is a NEW entry (state transition)
      if (!permissionStateAgentsRef.current.has(instance.agentId)) {
        if (document.visibilityState === 'hidden') {
          const notification = new Notification('Warden — Permission Required', {
            body: `${sessionName} needs operator approval`,
            tag: `warden-permission-${instance.agentId}`,
          });
          notification.onclick = () => {
            window.focus();
            onSelectSession(sessionName);
            notification.close();
          };
        }
      }
    }
    permissionStateAgentsRef.current = currentPermissionAgents;
  }, [sessionStatusMap, instances, notificationsEnabled, onSelectSession]);

  const toggleNotifications = useCallback(() => {
    if (!notificationsEnabled && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'true'); } catch {}
        }
      });
    } else {
      const next = !notificationsEnabled;
      setNotificationsEnabled(next);
      try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, String(next)); } catch {}
    }
  }, [notificationsEnabled]);

  return { notificationsEnabled, toggleNotifications };
}
```

### Anti-Patterns to Avoid

- **Loading SearchAddon after Terminal mount:** The addon must be loaded in the same `useEffect` that creates the Terminal. If loaded later, the Terminal won't have `overviewRulerWidth` canvas initialized.
- **Calling `findNext` without debounce:** Each call to `findNext` on a 5000-line buffer with many matches takes ~50-100ms. Calling on every keystroke will block the UI. Use 300ms debounce.
- **Calling `Notification.requestPermission()` on page load:** Browsers block the permission prompt unless triggered by a user gesture. The toggle button click is the correct trigger.
- **Using `window.focus()` alone in `notification.onclick`:** `window.focus()` is unreliable on macOS Chrome and blocked in Firefox. It still should be called (it works in some contexts), but do not rely on it — the click handler must also call `onSelectSession` to switch to the correct session tab, which is the primary user value.
- **Animating the search overlay with `display: none` toggle:** CSS transitions don't work when toggling `display`. Use `opacity` + `transform` + `pointer-events: none` for the hidden state, controlled by a React boolean state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Searching terminal scrollback | Custom regex over buffer lines | `xterm-addon-search@0.13.0` | The addon handles ANSI escape stripping, Unicode normalization, all scrollback rows, decoration management, and active-match tracking — ~700 LOC source |
| Overview ruler gutter markers | CSS absolute-positioned dots over scrollbar | `matchOverviewRuler` option in SearchAddon + `overviewRulerWidth: 15` in Terminal constructor | Native xterm.js mechanism draws on the overview ruler canvas at the correct proportional positions for the full buffer |
| Notification deduplication while in same state | Custom "last notified" timestamp tracking | `Notification tag` + `useRef<Set<string>>` | `tag` replaces rather than creates a second OS notification; `useRef` Set tracks which agents are already counted as in-state, preventing refires on each 5s poll cycle |

**Key insight:** `xterm-addon-search` is purpose-built for exactly this use case; the alternative (custom search) requires ANSI stripping, handling wide characters, and managing decorations manually.

---

## Common Pitfalls

### Pitfall 1: Missing `overviewRulerWidth` in Terminal Constructor
**What goes wrong:** Gutter markers (SRCH-05) never appear even though `matchOverviewRuler` is set on the SearchAddon decorations.
**Why it happens:** xterm.js only creates the overview ruler canvas when `overviewRulerWidth` is set at construction time. Setting it later via `terminal.options.overviewRulerWidth = 15` after mount does not work.
**How to avoid:** Add `overviewRulerWidth: 15` to the `new Terminal({ ... })` call in the `useEffect` in `TerminalView.tsx` **before** `terminal.loadAddon(searchAddon)`.
**Warning signs:** `matchOverviewRuler` color set, `findNext` returns `true`, but no tick marks visible on scrollbar track.

### Pitfall 2: SearchAddon Ref Stale After Session Switch
**What goes wrong:** Clicking Next/Previous after switching sessions calls `findNext` on the old session's SearchAddon (which may be disposed).
**Why it happens:** The `useEffect` cleanup in TerminalView calls `terminal.dispose()` which also disposes loaded addons. If `searchAddonRef.current` is not cleared in cleanup, stale calls throw.
**How to avoid:** In the Terminal `useEffect` cleanup: `searchAddonRef.current = null;` alongside `terminal.dispose()`.
**Warning signs:** Console errors about calling methods on a disposed object after switching sessions.

### Pitfall 3: `onDidChangeResults` Subscription Before Addon Loaded
**What goes wrong:** The TerminalSearchOverlay subscribes to `addon.onDidChangeResults` in a `useEffect`, but the addon might not exist yet (timing race between overlay render and Terminal init effect).
**Why it happens:** The overlay is rendered by React before the Terminal `useEffect` runs, so `searchAddonRef.current` is null when the overlay's subscription effect runs.
**How to avoid:** Guard the subscription: `if (!addon) return;`. Also note that the match count display will remain at 0/no-results until the first `findNext` call fires the event — this is acceptable UX (count shows after the debounce resolves).

### Pitfall 4: Browser Notification Permission State on Toggle
**What goes wrong:** User clicks the bell toggle but no permission dialog appears; notifications silently don't work.
**Why it happens:** `Notification.permission` can be `'denied'` — once denied, `requestPermission()` returns `'denied'` without showing a dialog (browser security model).
**How to avoid:** Check `Notification.permission` before showing the toggle as actionable. If `'denied'`, show a tooltip: "Enable notifications in browser settings". If `'default'`, call `requestPermission()` on the user click.

### Pitfall 5: `resultCount` Caps at Exactly 1000
**What goes wrong:** Buffer has 5,000 matches, `onDidChangeResults` reports `resultCount: 1000`. Displaying "1000 / 1000" is misleading — it implies the last of 1000, not "limit reached".
**Why it happens:** `DEFAULT_HIGHLIGHT_LIMIT = 1000` stops decoration creation at 1000 exactly.
**How to avoid:** Display "1000+" when `resultCount >= 1000`. From xterm.js issue #5176 analysis, there is no way to get the true count beyond the limit without a custom implementation.

### Pitfall 6: Escape Key Conflict with Terminal TUI Apps
**What goes wrong:** Pressing Escape to close search overlay also sends Escape to the terminal PTY (if the event propagates), disrupting vim/less sessions.
**Why it happens:** The overlay `onKeyDown` handler must call `event.stopPropagation()` on Escape, but if focus is returned to the terminal canvas before the PTY receives the event, some sequences may still propagate.
**How to avoid:** In the overlay `onKeyDown` for Escape: `event.preventDefault(); event.stopPropagation(); onClose(); requestAnimationFrame(() => terminal.focus());`. The `stopPropagation()` prevents the capture-phase `useGlobalHotkeys` from also responding to Escape.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Minimal SearchAddon Setup
```typescript
// Source: xterm-addon-search@0.13.0 typings + src/client/components/TerminalView.tsx pattern
import { SearchAddon } from 'xterm-addon-search';

const searchAddonRef = useRef<SearchAddon | null>(null);

// Inside the Terminal-creating useEffect:
const terminal = new Terminal({
  // ... all existing options ...
  overviewRulerWidth: 15,   // REQUIRED for gutter markers; must be at construction time
  allowProposedApi: true,    // already present
});
const searchAddon = new SearchAddon({ highlightLimit: 1000 });
terminal.loadAddon(searchAddon);
searchAddonRef.current = searchAddon;

// In cleanup:
terminal.dispose(); // also disposes loaded addons
searchAddonRef.current = null;
```

### findNext with Decorations
```typescript
// Source: xterm-addon-search@0.13.0 typings/xterm-addon-search.d.ts
searchAddon.findNext(term, {
  decorations: {
    matchBackground: '#f59e0b33',          // warden-warning at ~20% opacity (yellow)
    matchBorder: '#f59e0b',                // warden-warning (solid yellow border)
    matchOverviewRuler: '#f59e0b',         // gutter tick color
    activeMatchBackground: '#f97316',      // orange-500 (distinct from yellow)
    activeMatchBorder: '#f97316',
    activeMatchColorOverviewRuler: '#f97316',
  },
});
```

### Match Count from onDidChangeResults
```typescript
// Source: xterm-addon-search@0.13.0 src/SearchAddon.ts
// Returns: { resultIndex: number, resultCount: number }
// resultIndex is 0-based; -1 when no result selected
// resultCount caps at highlightLimit (1000) — report "1000+" when hit

const disposable = searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
  setMatchIndex(resultIndex);  // 0-based, -1 if none
  setMatchCount(resultCount);
});
// Cleanup:
disposable.dispose();
```

### Notification with Tag Deduplication
```typescript
// Source: MDN Web API Notification + Web Notifications Standard
// tag: same tag replaces existing notification (browser-native dedup)
// renotify: false (default) — no sound/vibration on replace

if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
  const notification = new Notification('Warden — Permission Required', {
    body: `${sessionName} needs operator approval`,
    tag: `warden-permission-${agentId}`,  // per-agent dedup key
  });
  notification.onclick = () => {
    window.focus();           // unreliable on macOS Chrome/Firefox, but attempt it
    onSelectSession(sessionName);
    notification.close();
  };
}
```

### Requesting Notification Permission on User Gesture
```typescript
// Source: MDN Notification.requestPermission()
// MUST be called within a user gesture handler (button click), not on page load

const toggleNotifications = useCallback(() => {
  if (!notificationsEnabled && Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      }
      // If 'denied', do nothing — browser won't ask again
    });
  } else if (Notification.permission !== 'denied') {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
  }
}, [notificationsEnabled]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom terminal search (regex over visible lines) | xterm-addon-search (full scrollback, decoration API) | xterm.js v4+ | Full scrollback coverage, native gutter markers |
| Service Worker for notifications | Direct `new Notification()` in page context | Always valid for desktop apps | Simpler, no SW overhead, sufficient for single-tab operator tool |
| `@xterm/addon-search` (scoped) | `xterm-addon-search@0.13.0` (non-scoped) | Migration ongoing in xterm.js repo | Non-scoped works with non-scoped `xterm@5.3.0` used in this project |

**Deprecated/outdated:**
- Using `@xterm/addon-search` with non-scoped `xterm`: incompatible peer dep — do not use
- `Notification.requestPermission()` with callback (not Promise): deprecated pattern — use Promise form

---

## Open Questions

1. **`window.focus()` reliability in notification.onclick**
   - What we know: `window.focus()` is documented as unreliable on macOS Chrome and blocked in Firefox (security model prevents cross-origin focus)
   - What's unclear: On this project's specific deployment (same-origin, desktop Chrome/Chromium), it may work more reliably
   - Recommendation: Call it anyway (it works in some cases), but document the limitation. The `onSelectSession` call is the primary value — it switches the session tab regardless of whether focus transfer succeeds.

2. **Slide-in animation with React conditional render**
   - What we know: CSS `transition` doesn't animate from `display: none`. Options are: (a) keep overlay mounted with `visibility: hidden` + opacity/transform when closed; (b) mount only when open and use CSS animation class on mount
   - What's unclear: Which approach the planner will prefer
   - Recommendation: Use approach (a) — keep overlay mounted, toggle `opacity-0 pointer-events-none translate-x-4` classes when closed vs `opacity-100 pointer-events-auto translate-x-0` when open. Tailwind's `transition` classes will animate the change.

3. **Session-specific search state: where to store it**
   - What we know: Decisions say search query persists within a session, clears on session switch; overlay closes on session switch
   - What's unclear: Whether search state (query + addon ref) should live in TerminalView (co-located) or be lifted to App.tsx
   - Recommendation: Keep in TerminalView — each session has its own TerminalView instance (lazy-mounted, keyed by `tmuxSessionName`). Search state naturally resets when the component remounts on session switch, satisfying the "clears on session switch" requirement without any additional logic.

---

## Validation Architecture

> `workflow.nyquist_validation` is false in `.planning/config.json` — section omitted per instructions.

---

## Sources

### Primary (HIGH confidence)
- `npm show xterm-addon-search@0.13.0 peerDependencies` — confirmed `{ xterm: '^5.0.0' }` (non-scoped, compatible with project)
- `https://unpkg.com/xterm-addon-search@0.13.0/typings/xterm-addon-search.d.ts` — full TypeScript API including `ISearchOptions`, `ISearchDecorationOptions`, `ISearchAddonOptions`, `onDidChangeResults`
- `https://unpkg.com/xterm-addon-search@0.13.0/src/SearchAddon.ts` — implementation: `DEFAULT_HIGHLIGHT_LIMIT = 1000`, `onDidChangeResults` event data shape, decoration management
- `https://unpkg.com/xterm@5.3.0/typings/xterm.d.ts` — `overviewRulerWidth` in `ITerminalOptions`: "The width, in pixels, of the canvas for the overview ruler. The overview ruler will be hidden when not set."
- MDN `https://developer.mozilla.org/en-US/docs/Web/API/Notification/click_event` — onclick handler, default focus behavior
- MDN Notifications API — `tag` deduplication, `requestPermission()` Promise API, `Notification.permission` states

### Secondary (MEDIUM confidence)
- GitHub xterm.js issue #5176 — `Search is too slow`: confirms `highlightLimit` default 1000, performance characteristics at 72k matches, `resultCount` caps at 1000
- WebSearch results confirming `overviewRulerWidth` controls overview ruler visibility (xtermjs.org docs)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `npm show` confirmed peer dependency compatibility; package contents verified via `npm pack --dry-run`; API verified from unpkg typings source
- Architecture: HIGH — patterns derived directly from existing codebase (TerminalView.tsx, useGlobalHotkeys.ts, App.tsx) and verified addon API
- Pitfalls: HIGH — overviewRulerWidth pitfall verified from xterm.js API docs; notification pitfalls from MDN; others from codebase analysis

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (stable libraries; Notifications API is long-stable)
