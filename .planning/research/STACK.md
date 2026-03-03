# Stack Research

**Domain:** Warden Dashboard v3.0 — Operator Awareness & Terminal Power Tools (additive milestone)
**Researched:** 2026-03-03
**Confidence:** HIGH

---

## Context: Milestone v3.0 — Additive Only

This file covers ONLY the new technical capabilities needed for v3.0. The following are validated production stack — do not re-research:

| Already Present | Version | Notes |
|-----------------|---------|-------|
| Express 5 | ^5.0.0 | Stable, no changes needed |
| Socket.IO 4 | ^4.8.0 | `/terminal` and `/gsd` namespaces active |
| React 19 | ^19.0.0 | SPA, hook-based state |
| xterm.js | 5.3.0 | `import { Terminal } from 'xterm'` — the non-scoped package |
| @xterm/addon-fit | 0.10.0 | Loaded in TerminalView.tsx |
| @xterm/addon-web-links | 0.11.0 | Loaded in TerminalView.tsx |
| better-sqlite3 | ^11.0.0 | WAL-mode SQLite |
| node-pty | ^1.0.0 | PTY bridge for tmux |
| Tailwind CSS 4 | ^4.0.0 | `warden-*` tokens established |
| TypeScript 5 | ^5.7.0 | Strict ESM |
| socket.io-client | ^4.8.0 | Client-side Socket.IO |
| useAgentLiveStatus | (hook) | Polls `/api/gsd/agents/live-status` every 5s |
| detectAgentState() | (server fn) | Returns `AgentStateHint` incl. `permission_prompt` |
| extractContextPressure() | (server fn) | Returns `{contextPressure, contextPressureLevel}` |
| AgentStateHint | (shared type) | `'working' | 'idle' | 'menu' | 'permission_prompt' | 'error'` |
| PressureLevel | (shared type) | `'ok' | 'warning' | 'critical'` |

---

## New Capability Analysis

### Capability 1: Terminal Text Search (xterm-addon-search)

**Requirement:** Ctrl+F opens a search bar in the terminal header. User types a term, matches highlight, navigation with Enter/Shift+Enter, match count shown (e.g. "3/12"), scrollbar gutter markers show match positions.

**Decision: `xterm-addon-search@0.13.0` — ONE new npm dependency.**

This is the only npm addition required for the entire milestone.

**Why `xterm-addon-search` (non-scoped) not `@xterm/addon-search`:**

The codebase imports `import { Terminal } from 'xterm'` (non-scoped, v5.3.0). `xterm-addon-search@0.13.0` has `peerDependency: { "xterm": "^5.0.0" }` — compatible. `@xterm/addon-search@0.16.0` has `peerDependency: { "@xterm/xterm": "^5.0.0" }` — the *scoped* package, which is a *separate* package that happens to also be installed as a transitive dependency of `@xterm/addon-fit`. Using `@xterm/addon-search` with `xterm@5.3.0` would require migrating all imports to `@xterm/xterm` first, which is out of scope.

Verified: `xterm-addon-search@0.13.0` is the latest stable on npm as of 2026-03-03 (last published ~2 years ago; the library is maintained via the monorepo at `@xterm/addon-search` for xterm@6+ users).

**API confirmed by reading typings directly:**

```typescript
import { SearchAddon, ISearchOptions, ISearchDecorationOptions } from 'xterm-addon-search';

// Instantiate with highlight limit
const searchAddon = new SearchAddon({ highlightLimit: 1000 });
terminal.loadAddon(searchAddon);

// Search options with decorations for highlighting + scrollbar gutter
const searchOptions: ISearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  incremental: true,   // expands selection as user types
  decorations: {
    matchBackground: '#f59e0b33',       // amber tint for all matches
    matchBorder: '#f59e0b80',
    matchOverviewRuler: '#f59e0b',      // scrollbar gutter markers
    activeMatchBackground: '#f59e0b',   // solid amber for active match
    activeMatchBorder: '#f59e0bff',
    activeMatchColorOverviewRuler: '#ef4444',  // red for active in ruler
  },
};

searchAddon.findNext(term, searchOptions);    // returns boolean (found or not)
searchAddon.findPrevious(term, searchOptions);
searchAddon.clearDecorations();              // call on search close
searchAddon.clearActiveDecoration();         // call on search blur

// Match count for display
searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
  // e.g. resultIndex=2, resultCount=12 → show "3 / 12"
  // resultIndex is -1 when count exceeds highlightLimit
  setMatchInfo({ current: resultIndex + 1, total: resultCount });
});
```

**Scrollbar gutter markers require `overviewRulerWidth` in Terminal constructor:**

```typescript
const terminal = new Terminal({
  overviewRulerWidth: 15,   // ADD THIS — hidden when not set
  // ... existing options
});
```

This is a non-breaking addition to the existing `Terminal` instantiation in `TerminalView.tsx`.

**Integration point:** `TerminalView.tsx` — add `searchAddonRef`, expose `searchAddon.findNext`/`findPrevious` via a `ref` handle or through a new `onSearch` prop. The search bar UI is a new component rendered in the terminal header area (conditionally shown when Ctrl+F pressed).

---

### Capability 2: Keyboard Navigation Shortcuts

**Requirement:** Ctrl+1/2/3... switches tabs, Ctrl+[ / Ctrl+] navigates prev/next tab, Ctrl+B toggles sidebar, Ctrl+F opens terminal search.

**Decision: Native `document.addEventListener('keydown', ...)` in a `useEffect` in App.tsx — zero new dependency.**

This is the established project pattern. No keyboard shortcut library (hotkeys-js, mousetrap, react-hotkeys-hook) is needed. The pattern is safe with xterm.js: xterm.js only intercepts keyboard events when its canvas has focus. `document`-level listeners still fire for global shortcuts when the terminal has focus, but Ctrl+F/1/2/3 are NOT forwarded to the PTY — xterm.js forwards `event.key` characters, not control sequences from blocked events.

**Ctrl+F conflict avoidance:** xterm.js does not capture `Ctrl+F` by default (it's not a standard terminal control sequence). The keydown handler must call `event.preventDefault()` on Ctrl+F to suppress the browser's native find dialog.

```typescript
// In App.tsx or a new useKeyboardShortcuts hook:
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === 'f') {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault();
      setShowSidebar((prev) => !prev);
      return;
    }
    if (event.ctrlKey && event.key === ']') {
      event.preventDefault();
      selectNextTab();
      return;
    }
    if (event.ctrlKey && event.key === '[') {
      event.preventDefault();
      selectPreviousTab();
      return;
    }
    if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const index = parseInt(event.key, 10) - 1;
      selectTabAtIndex(index);
      return;
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [selectNextTab, selectPreviousTab, selectTabAtIndex]);
```

**Scope:** Global shortcuts belong in `App.tsx` (or a `useKeyboardShortcuts` hook called from App). Search-specific shortcuts (Escape to close, Enter/Shift+Enter to navigate) belong in the search bar component's own `onKeyDown`.

---

### Capability 3: Browser Notifications for Permission Prompts

**Requirement:** When `detectAgentState()` returns `permission_prompt`, fire an opt-in browser notification so the operator sees it even if the browser tab is in the background.

**Decision: Native `Notification` Web API — zero new dependency, zero service worker.**

The Notification API is available directly in the browser at `window.Notification`. No service worker, no push server, no Web Push subscription required. This is the correct approach for a single-operator local monitoring tool.

**Browser support:** Fully supported in Chrome, Firefox, Edge, Safari 16.4+. Since Warden is IP-whitelisted and single-operator (desktop browser on server LAN), compatibility is not a concern.

**Implementation pattern (no library needed):**

```typescript
// In a new usePermissionNotifications hook:

function requestNotificationPermission(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();  // prompts user once
  }
}

function firePermissionPromptNotification(agentId: string, sessionName: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(`${agentId} needs permission`, {
    body: `Session ${sessionName} is waiting for approval`,
    tag: `warden-perm-${sessionName}`,  // deduplicates: one notif per session
    icon: '/favicon.ico',
  });
}
```

**Deduplication:** The `tag` option on `Notification` causes a new notification with the same tag to replace the previous one rather than stacking. Use `warden-perm-${sessionName}` as the tag — one notification per session at most.

**Opt-in flow:** Add a "Enable notifications" button to the terminal header or a settings area. Call `requestNotificationPermission()` only on explicit user gesture (button click) — browsers block `requestPermission()` calls not triggered by user interaction.

**Integration point:** `useAgentLiveStatus` already returns `state` per agent. A new `usePermissionNotifications` hook consumes the status map and fires notifications when any agent transitions to `permission_prompt` state. Track previous states to fire only on transition (not on every 5-second poll).

```typescript
// Transition detection — fire once per state entry, not on every poll:
const previousStatesRef = useRef<Map<string, AgentStateHint | null>>(new Map());

useEffect(() => {
  for (const [agentId, status] of liveStatusMap) {
    const previous = previousStatesRef.current.get(agentId) ?? null;
    if (status.state === 'permission_prompt' && previous !== 'permission_prompt') {
      firePermissionPromptNotification(agentId, ...);
    }
    previousStatesRef.current.set(agentId, status.state);
  }
}, [liveStatusMap]);
```

---

### Capability 4: Permission Prompt Tab Badges

**Requirement:** When an agent's state is `permission_prompt`, show a visual badge on its `InstanceTabBar` tab.

**Decision: Wire `useAgentLiveStatus` into `InstanceTabBar` — zero new dependency, pure React state.**

`useAgentLiveStatus` is already called in `AgentsTab.tsx`. For the terminal view, `App.tsx` needs to call `useAgentLiveStatus()` and pass the resulting map to `InstanceTabBar` as a new `agentLiveStatus` prop. The badge is a `<span>` with the `warden-warning` color token.

`InstanceTabBar` currently matches agents to instances by `tmuxSessionName`. The `useAgentLiveStatus` map is keyed by `agentId`. The join requires parsing `agentId` from `tmuxSessionName` (first segment before `-`), which is already the established pattern in the codebase (see `detectAgentState` caller).

**Concern:** `useAgentLiveStatus` polls `/api/gsd/agents/live-status` which calls `tmux capture-pane` for each agent. This adds per-poll overhead to the terminals view (previously only active in AgentsTab). Verify the endpoint's 5s poll interval is acceptable when the terminals view is active. Based on Phase 14 research, the endpoint was designed to be called from the agents tab; adding it to the terminals view is fine as the underlying tmux calls are fast (<100ms each).

---

### Capability 5: Agent State Chip and Context Pressure Badge in Terminal Header

**Requirement:** Show a small state chip (e.g. "working", "perm") and context pressure percentage (e.g. "72% ctx") in the `TerminalView` header area alongside the session name.

**Decision: Props passed from `App.tsx` → `TerminalView` — zero new dependency.**

`TerminalView` currently receives only `tmuxSessionName` and `onSessionExit`. Add `agentState?: AgentStateHint | null` and `contextPressure?: number | null` props. The parent (`App.tsx`) derives these from `useAgentLiveStatus()` by looking up the agentId extracted from `selectedSessionName`.

Style guidance: use `gsdShared.tsx`'s existing `STATE_BADGE_COLORS` map and `STATE_BADGE_LABELS` map — these are already defined for the same `AgentStateHint` type. Import and reuse them in the terminal header to avoid duplicating color definitions.

---

### Capability 6: Search Match Count and Highlight Persistence

**Requirement:** Show "3 / 12" match count in the search UI. Highlights persist while the search bar is open (navigating between matches keeps all highlights visible).

**Decision: React state driven by `onDidChangeResults` event — zero new dependency.**

`SearchAddon.onDidChangeResults` fires on every term change or navigation with `{resultIndex, resultCount}`. Feed this into local component state. Highlights persist automatically while `decorations` is set in the search options (the addon manages decoration lifecycle). Calling `clearDecorations()` only on search bar close removes all highlights — correct behavior.

```typescript
const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null);

searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
  if (resultCount === 0) {
    setMatchInfo(null);
  } else {
    setMatchInfo({
      current: resultIndex === -1 ? resultCount : resultIndex + 1,  // -1 = exceeds limit
      total: resultCount,
    });
  }
});
```

---

## Recommended Stack Summary

### One New Dependency

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `xterm-addon-search` | `0.13.0` | Terminal buffer search with decorations and match count | Official xterm.js search addon; peers with `xterm@^5.0.0` (matches project's `xterm@5.3.0`); provides `ISearchDecorationOptions.matchOverviewRuler` for scrollbar gutter markers |

### All Other Capabilities: Zero New Dependencies

| Capability | Implementation | Uses |
|------------|---------------|------|
| Keyboard shortcuts | `document.addEventListener('keydown')` in `useEffect` | React + DOM built-ins |
| Browser notifications | `window.Notification` constructor | Web API built-in |
| Permission prompt badges | `useAgentLiveStatus` map → `InstanceTabBar` props | Existing hook + React |
| Agent state chip | Props from `App.tsx` → `TerminalView` | Existing types + React |
| Context pressure badge | Props from `App.tsx` → `TerminalView` | Existing data + React |
| Match count display | `searchAddon.onDidChangeResults` + `useState` | React + xterm-addon-search event |
| Highlight persistence | `decorations` option in `ISearchOptions` | xterm-addon-search built-in behavior |
| Scrollbar gutter markers | `overviewRulerWidth: 15` + `matchOverviewRuler` color | xterm.js built-in + addon |
| Notification dedup | `tag` option on `new Notification()` | Web API built-in |
| State transition detection | `useRef` for previous state map | React built-in |

---

## Installation

```bash
# One new dependency
npm install --save-dev xterm-addon-search@0.13.0
```

Note: `--save-dev` is correct — it matches the project's pattern of keeping `xterm`, `@xterm/addon-fit`, and `@xterm/addon-web-links` in devDependencies (they are bundled by Vite, not required at runtime on the server).

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `xterm-addon-search@0.13.0` | `@xterm/addon-search@0.16.0` | Scoped package peers with `@xterm/xterm`, not `xterm`; migration to scoped imports is a separate refactor out of scope for v3.0 |
| `xterm-addon-search@0.13.0` | Build custom search via `terminal.buffer.active` iteration | Terminal buffer has no text search API; character-by-character iteration is complex and slow; the addon is purpose-built and battle-tested |
| `window.Notification` | `react-toastify` / `notistack` for in-app alerts | In-app notifications miss the "tab in background" use case entirely; native browser notifications work across tabs and browser minimize |
| `window.Notification` | Web Push API | Requires service worker, push subscription, backend push server; massively overengineered for a single-operator LAN tool |
| `document.addEventListener('keydown')` | `hotkeys-js` / `react-hotkeys-hook` | Unnecessary abstraction; project already uses raw event listeners; single hook file is <50 LOC |
| `document.addEventListener('keydown')` | xterm.js `terminal.attachCustomKeyEventHandler` | Only fires for keys when terminal has focus; global shortcuts (tab switch, sidebar toggle) must work regardless of focus |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@xterm/addon-search@0.16.0` | Peer dependency mismatch — requires `@xterm/xterm` (scoped package), but project imports `xterm` (non-scoped 5.3.0) | `xterm-addon-search@0.13.0` which peers with `xterm@^5.0.0` |
| Service workers for notifications | Requires registration, install events, cache strategy — overkill for local alerts | `new Notification()` directly via Web API |
| `hotkeys-js` / `mousetrap` | Adds a dependency for functionality achievable in <50 LOC of vanilla JS | `document.addEventListener('keydown')` in a `useEffect` |
| `react-hotkeys-hook` | External dependency; its `useHotkeys` API has React strict-mode edge cases | Plain `useEffect` + `document.addEventListener` — already used in project |
| `chokidar` / `fs.watch` for notifications | Permission prompts are detected via tmux pane capture, not file system events | Poll `/api/gsd/agents/live-status` (already exists) |
| A new `/api/permissions` endpoint | Permission state is already computed in live-status | Consume existing `useAgentLiveStatus` hook data |

---

## Version Compatibility

| Package | Version | Peer Requirement | Status |
|---------|---------|-----------------|--------|
| `xterm-addon-search` | 0.13.0 | `xterm@^5.0.0` | Compatible — project has `xterm@5.3.0` |
| `@xterm/addon-fit` | 0.10.0 | `@xterm/xterm@^5.0.0` | Already working — `@xterm/xterm@5.5.0` installed as transitive dep |
| `xterm` | 5.3.0 | — | Client code imports from `'xterm'`, not `'@xterm/xterm'` |
| `overviewRulerWidth` | xterm 5.x | xterm >= 4 | Confirmed in `node_modules/xterm/typings/xterm.d.ts` |
| `Notification` Web API | — | HTTPS or localhost | Warden runs behind Nginx with SSL — satisfied |
| `document.addEventListener` | — | All browsers | No compatibility concern |

**Critical note on xterm package split:** xterm.js v6+ migrated to `@xterm/xterm` (scoped). The project currently uses v5.3.0 (non-scoped `xterm`). The scoped addons `@xterm/addon-fit` and `@xterm/addon-web-links` happen to work because they also install `@xterm/xterm@5.5.0` as their own dep, but the client code still imports from `'xterm'`. For v3.0, stay on the non-scoped `xterm` ecosystem. Do not mix scoped `@xterm/*` addons with `xterm-addon-search`.

---

## Integration Points with Existing Code

### `TerminalView.tsx`
- Add `searchAddonRef` alongside `fitAddonRef`
- Add `overviewRulerWidth: 15` to Terminal constructor options
- Load `SearchAddon` after `FitAddon` and `WebLinksAddon`
- Add `agentState?: AgentStateHint | null` and `contextPressure?: number | null` props for header display
- Add `searchOpen` state + search bar UI in the header (conditionally rendered)
- Ctrl+F opens search: handled by global keydown listener, passed to TerminalView via ref or prop callback

### `InstanceTabBar.tsx`
- Add `agentLiveStatus?: Map<string, AgentLiveStatus>` prop
- Derive `agentId` from `instance.tmuxSessionName.split('-')[0]` (established project pattern)
- Show badge `span` when `liveStatus?.state === 'permission_prompt'`

### `App.tsx`
- Call `useAgentLiveStatus()` (currently only called in AgentsTab — move to App level or duplicate call)
- Pass live status map to `InstanceTabBar` and `TerminalView`
- Add global `useEffect` for keyboard shortcut handler
- Add `usePermissionNotifications` hook invocation

### New files
- `src/client/hooks/usePermissionNotifications.ts` — wraps `window.Notification` with transition detection and opt-in management
- `src/client/components/TerminalSearchBar.tsx` — search input, nav buttons, match count display
- `src/client/hooks/useKeyboardShortcuts.ts` (optional) — extract global keydown logic from App.tsx for testability

---

## Sources

- `/home/forge/warden.kingdom.lv/node_modules/xterm/typings/xterm.d.ts` — confirmed `overviewRulerWidth` option, `IDecorationOverviewRulerOptions` (HIGH confidence, read directly)
- `/tmp/package/typings/xterm-addon-search.d.ts` — extracted from `xterm-addon-search@0.13.0.tgz` via npm pack; confirmed full API: `ISearchOptions`, `ISearchDecorationOptions.matchOverviewRuler`, `onDidChangeResults`, `clearDecorations()`, `clearActiveDecoration()` (HIGH confidence, read directly)
- `npm show @xterm/addon-search@0.16.0 peerDependencies` → `{ "@xterm/xterm": "^5.0.0" }` (HIGH confidence, executed)
- `npm show xterm-addon-search@0.13.0 peerDependencies` → `{ "xterm": "^5.0.0" }` (HIGH confidence, executed)
- `npm ls @xterm/xterm` → `@xterm/xterm@5.5.0` installed as transitive dep of addon-fit/addon-web-links (HIGH confidence, executed)
- `/home/forge/warden.kingdom.lv/src/client/components/TerminalView.tsx` — confirmed import is `from 'xterm'` (non-scoped), FitAddon/WebLinksAddon loaded via `terminal.loadAddon()` (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/routes/gsdRoutes.ts` — `detectAgentState()` returns `'permission_prompt'`, `extractContextPressure()` returns `{contextPressure, contextPressureLevel}` already implemented (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/client/hooks/useAgentLiveStatus.ts` — confirmed polls `/api/gsd/agents/live-status` every 5s, returns `Map<string, AgentLiveStatus>` (HIGH confidence, read directly)
- MDN Notifications API — `new Notification(title, options)` works without service worker on desktop; `tag` deduplicates; `Notification.requestPermission()` must be called from user gesture (MEDIUM confidence, WebSearch + MDN docs)
- `window.Notification` browser support — Chrome, Firefox, Edge, Safari 16.4+ (HIGH confidence for desktop operator use case)

---

*Stack research for: Warden Dashboard v3.0 — Operator Awareness & Terminal Power Tools*
*Researched: 2026-03-03*
