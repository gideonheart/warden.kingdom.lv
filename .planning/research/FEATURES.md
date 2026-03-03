# Feature Research: Operator Awareness & Terminal Power Tools

**Domain:** Browser-based terminal multiplexer operator workstation — passive monitoring alerts + active investigation tools
**Researched:** 2026-03-03
**Milestone:** v3.0 Operator Awareness & Terminal Power Tools
**Confidence:** HIGH (all core libraries verified against official docs/type definitions)

---

## Context

This research is scoped to the NEW features for v3.0 only. It does NOT re-document
features already built in v1.x / v2.x. Existing capabilities that v3.0 builds on:

- `useAgentLiveStatus` — polls `/api/gsd/agents/live-status` every 5s, returns `Map<agentId, { state, contextPressure, contextPressureLevel }>`
- `detectAgentState()` in `gsdRoutes.ts` — regex heuristics on `tmux capture-pane` output: `permission|allow|dangerous` → `permission_prompt`
- `AgentStateHint` type: `'working' | 'idle' | 'menu' | 'permission_prompt' | 'error'`
- `StateBadge` + `PressureIndicator` components exist in `gsdShared.tsx` (GSD Agents tab only)
- `TerminalStreamService` — PTY tap with `onData` callback; all terminal output flows through here
- `TerminalView.tsx` — xterm.js 5 terminal with `@xterm/addon-fit` + `@xterm/addon-web-links` loaded
- `InstanceTabBar.tsx` — session tabs with status dot + agent name + stop button
- xterm package in use: `xterm@5.3.0` (legacy) + `@xterm/xterm@5.5.0` (monorepo), `@xterm/addon-fit@0.10.0`
- `@xterm/addon-search` is NOT yet installed — needs to be added

---

## Feature Landscape

### Table Stakes (Operator Expects These)

Features the operator assumes exist in a terminal monitoring workstation. Missing any of these means the product feels like a passive viewer only, not a workstation.

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| Permission prompt badge on tab | Operator monitors 5+ agents; needs visual interruption signal without watching every terminal | MEDIUM | `useAgentLiveStatus` already detects `permission_prompt` state; needs tab badge layer in `InstanceTabBar` |
| Agent state chip in terminal header | At a glance: is this agent working, waiting, stuck? Current terminal header only shows session name + connection dot | LOW | `useAgentLiveStatus` provides state; wire into `TerminalView` header bar |
| Terminal text search (Ctrl+F) | Every terminal tool supports in-buffer search; absence is jarring | MEDIUM | `@xterm/addon-search` (not yet installed); needs UI overlay in `TerminalView` |
| Keyboard navigation between tabs | Using mouse to switch between 5+ agent sessions is slow for an operator workstation | LOW-MEDIUM | `useSessionSelection` manages selection; need global keydown listener |
| Context pressure badge in terminal header | Operator needs to know when to intervene before a session hits context limit | LOW | `useAgentLiveStatus` provides `contextPressure` + `contextPressureLevel`; wire into `TerminalView` header |

### Differentiators (What Makes This a Power Tool)

Features that go beyond a passive viewer and make Warden a genuine operator workstation.

| Feature | Value Proposition | Complexity | Dependencies on Existing |
|---------|-------------------|------------|--------------------------|
| Browser notifications for permission prompts | Operator may be in another tab or window; permission prompts block agent progress until answered — notification allows immediate response | MEDIUM | Requires `Notification.requestPermission()` opt-in UI; notification logic triggered when `useAgentLiveStatus` state transitions to `permission_prompt` |
| Search match count display | "3 of 47 matches" — operator searching for an error pattern needs to know scope of problem | LOW | Part of `@xterm/addon-search` — `onDidChangeResults` event fires `ISearchResultChangeEvent { resultIndex, resultCount }` |
| Scrollbar gutter markers for search results | Visual density map of where matches appear in buffer; critical for long terminal sessions | LOW | Part of `@xterm/addon-search` — `ISearchDecorationOptions.matchOverviewRuler` sets gutter color automatically; requires xterm `overviewRulerWidth` option to be set |
| Search highlight persistence on nav | Operator switches tabs; highlights should survive and be ready when returning | MEDIUM | Requires per-session search state management; SearchAddon instance must persist with terminal lifecycle |
| Sidebar toggle shortcut | Single key to expand/collapse agent sidebar without losing terminal focus | LOW | `setShowSidebar` callback exists in `App.tsx`; just needs a keyboard binding |

### Anti-Features (Requested, But Wrong for This Context)

| Anti-Feature | Surface Appeal | Why Problematic | Better Approach |
|--------------|----------------|-----------------|-----------------|
| Always-on browser notifications (no opt-in) | "Keep me informed" | Browsers block auto-permission requests not triggered by user gesture — would silently fail or get denied; also violates best practice and user trust | Settings toggle in UI that calls `Notification.requestPermission()` on click |
| Search across all sessions simultaneously | "Find which agent has the error" | xterm.js search operates on in-memory terminal buffer; cross-session search would require keeping all PTY buffers live — contradicts the existing PTY keepalive/cleanup design | Operator switches to relevant tab first, then searches |
| Real-time permission prompt auto-answer | "Automate the approval" | Permission prompts require operator judgment — auto-approval removes the safety check that permission prompts provide | Notification + focus-jump to relevant tab so operator can manually respond |
| Replacing polling with WebSocket push for live-status | "Eliminate latency" | `tmux capture-pane` is already called every 5s; push would require server-side event loop managing all sessions, adding complexity for marginal gain | Keep 5s poll; add visual flash/animation when state changes to `permission_prompt` |
| External hotkeys library (react-hotkeys-hook) | "More robust shortcut management" | xterm.js captures keyboard events in its canvas element — a global hotkey library cannot intercept those without complex focus tracking; custom `useEffect` on `document` with focus-awareness is simpler and more predictable | Custom `useKeyboardNav` hook with `document.addEventListener('keydown', ...)` + enabled check |

---

## Feature Dependencies

```
Permission prompt tab badge
    └──requires──> useAgentLiveStatus (exists, polls /api/gsd/agents/live-status)
    └──requires──> InstanceTabBar badge slot (new: red dot overlay on tab button)

Agent state chip in terminal header
    └──requires──> useAgentLiveStatus (exists)
    └──requires──> TerminalView header accepts agentId prop (new prop)
    └──requires──> StateBadge component (exists in gsdShared.tsx)

Context pressure badge in terminal header
    └──requires──> useAgentLiveStatus (exists)
    └──requires──> TerminalView header accepts agentId prop (same new prop as state chip)
    └──requires──> PressureIndicator component (exists in gsdShared.tsx)

Browser notification for permission prompts
    └──requires──> useAgentLiveStatus (exists)
    └──requires──> Notification.requestPermission() opt-in (new settings UI)
    └──requires──> State transition detection: previous state !== 'permission_prompt', new === 'permission_prompt'

Terminal text search (Ctrl+F)
    └──requires──> @xterm/addon-search package (NOT YET INSTALLED — npm install needed)
    └──requires──> SearchAddon loaded in TerminalView useEffect alongside FitAddon
    └──requires──> Search overlay UI (input, prev/next buttons, match count display, close)
    └──requires──> Ctrl+F keydown intercepted BEFORE xterm (via terminal.attachCustomKeyEventHandler)

Search match count display
    └──requires──> Terminal text search (above)
    └──enhances──> Search overlay UI

Scrollbar gutter markers for search results
    └──requires──> Terminal text search (above)
    └──requires──> xterm Terminal options: overviewRulerWidth: 15 (new config)
    └──enhances──> Terminal text search (automatic via ISearchDecorationOptions.matchOverviewRuler)

Keyboard tab navigation shortcuts
    └──requires──> useSessionSelection.selectSession() callback (exists)
    └──requires──> activeInstances list (exists via useActiveInstances)
    └──no external library needed

Sidebar toggle shortcut
    └──requires──> setShowSidebar callback (exists in App.tsx)
    └──enhances──> Keyboard tab navigation shortcuts (same hook/listener)
```

### Dependency Notes

- **State chip + pressure badge both require agentId in TerminalView:** `TerminalView` currently only receives `tmuxSessionName`. The parent `App.tsx` has `selectedInstance` which contains `agentId`. Adding `agentId?: string` prop to `TerminalView` unlocks both features without architecture changes.
- **Search requires `terminal.attachCustomKeyEventHandler`:** xterm.js 5 provides `terminal.attachCustomKeyEventHandler(handler)` which returns `true` to allow the event to propagate to the terminal, or `false` to swallow it. Ctrl+F must return `false` so the browser's find dialog doesn't open alongside the custom overlay.
- **Browser notifications require prior state knowledge:** The notification must only fire when state *transitions* to `permission_prompt`, not every 5s while already in that state. This requires storing previous state in a ref inside `useAgentLiveStatus` or a wrapper hook.
- **Scrollbar gutter markers are automatic:** Setting `matchOverviewRuler` (required field in `ISearchDecorationOptions`) + `overviewRulerWidth` on the Terminal instance is all that is needed. No separate implementation beyond the color value.

---

## MVP Definition

### Launch With (v3.0)

Minimum viable operator workstation additions — what makes the milestone meaningful.

- [ ] **Agent state chip + context pressure badge in terminal header** — Wires `useAgentLiveStatus` data (already polling) into the terminal header bar. Minimal UI change, high daily value. Requires new `agentId` prop on TerminalView.
- [ ] **Permission prompt tab badge** — Red dot overlay on the tab button when `state === 'permission_prompt'`. Operator sees it immediately without watching every terminal.
- [ ] **Terminal text search (Ctrl+F)** — Install `@xterm/addon-search`, add SearchAddon to TerminalView, build search overlay with input + prev/next + match count.
- [ ] **Keyboard tab navigation** — `Alt+]` / `Alt+[` (or `Ctrl+Tab` / `Ctrl+Shift+Tab`) to cycle tabs; `Alt+S` to toggle sidebar. Custom hook, no library.

### Add After Core Is Working (v3.0.x)

- [ ] **Browser notifications for permission prompts** — Depends on opt-in UI being placed somewhere logical (settings toggle); add after tab badge is confirmed working (same data source, lower urgency).
- [ ] **Scrollbar gutter markers** — Trivial addition once search is working; just set `overviewRulerWidth: 15` in Terminal options and add `matchOverviewRuler` color to search decorations.

### Future Consideration (v3.1+)

- [ ] **Search highlight persistence across tab switches** — Requires storing search term per session in React state or localStorage; SearchAddon must be re-initialized with stored term on tab return. Adds complexity to terminal lifecycle.
- [ ] **Keyboard shortcut help overlay** — `?` key shows all shortcuts. Nice UX polish, not critical for single operator who configured the system.

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|---------------|---------------------|----------|
| Agent state chip in terminal header | HIGH — immediate situational awareness | LOW — existing data + existing component | P1 |
| Context pressure badge in terminal header | HIGH — prevents context overflow surprises | LOW — same data, same component | P1 |
| Permission prompt tab badge | HIGH — unblocks stuck agents immediately | MEDIUM — badge slot in InstanceTabBar | P1 |
| Terminal text search (Ctrl+F) | HIGH — investigating agent output is core workflow | MEDIUM — new package + overlay UI | P1 |
| Keyboard tab navigation | MEDIUM — convenience, not critical path | LOW — simple keydown handler | P1 |
| Browser notifications | MEDIUM — useful when away from tab | MEDIUM — opt-in flow + transition detection | P2 |
| Scrollbar gutter markers | MEDIUM — visual density for long sessions | LOW — config flag once search exists | P2 |
| Search match count | MEDIUM — scope awareness during investigation | LOW — onDidChangeResults event | P2 |
| Search highlight persistence | LOW — current flow is tab → search | MEDIUM — per-session state management | P3 |
| Keyboard shortcut help overlay | LOW — single operator knows shortcuts | LOW — static overlay | P3 |

**Priority key:**
- P1: Must have for v3.0 milestone to feel complete
- P2: Should have — add in same milestone if time allows
- P3: Nice to have — defer to v3.1

---

## Implementation Notes by Feature

### @xterm/addon-search Integration

**Package:** `@xterm/addon-search` (monorepo package — matches the `@xterm/addon-fit` pattern already in use)
**Install:** `npm install --save-dev @xterm/addon-search`
**Version:** 0.15.0 (latest stable as of research date)
**Peer dep:** xterm.js v4+ (project uses v5.3.0 / @xterm/xterm@5.5.0 — compatible)

**Key API (HIGH confidence — verified from type definitions):**
```typescript
import { SearchAddon } from '@xterm/addon-search';

const searchAddon = new SearchAddon({ highlightLimit: 1000 });
terminal.loadAddon(searchAddon);

// Search
searchAddon.findNext(term, {
  regex: false,
  caseSensitive: false,
  wholeWord: false,
  decorations: {
    matchBackground: '#ffff0033',
    matchBorder: '#ffff00',
    matchOverviewRuler: '#ffff00',         // Required — enables gutter markers
    activeMatchBackground: '#ff6a0099',
    activeMatchBorder: '#ff6a00',
    activeMatchColorOverviewRuler: '#ff6a00', // Required
  },
});
searchAddon.findPrevious(term, { ... });
searchAddon.clearDecorations();

// Match count (fires after each search)
searchAddon.onDidChangeResults((event) => {
  // event.resultIndex: 0-based index of active match (-1 if > threshold)
  // event.resultCount: total matches
});
```

**Gutter markers:** Requires `Terminal` options to include `overviewRulerWidth: 15`. This renders the colored ruler on the right edge of the terminal canvas. The `matchOverviewRuler` color in `ISearchDecorationOptions` is a required field — it must be set.

**Ctrl+F interception:** Use `terminal.attachCustomKeyEventHandler` BEFORE `terminal.open()`:
```typescript
terminal.attachCustomKeyEventHandler((ev) => {
  if (ev.ctrlKey && ev.key === 'f' && ev.type === 'keydown') {
    setSearchVisible(true);
    return false; // Swallow — prevents browser find dialog
  }
  return true; // Pass through all other keys
});
```

**Escape to close:** Also intercept `Escape` when search overlay is open:
```typescript
if (ev.key === 'Escape' && searchVisible) {
  setSearchVisible(false);
  searchAddon.clearDecorations();
  return false;
}
```

### Permission Prompt Tab Badge

**Signal source:** `useAgentLiveStatus` already exposes `state: AgentStateHint | null` per agent. The `InstanceTabBar` needs to receive this data.

**Data flow options:**
1. Call `useAgentLiveStatus()` inside `App.tsx` (already available via `useAgentLiveStatus` hook) and pass relevant state down to `InstanceTabBar` as a prop: `permissionAlertSessions: Set<string>`
2. Call `useAgentLiveStatus()` directly in `InstanceTabBar` — simpler, self-contained

Option 2 is recommended to keep `InstanceTabBar` self-contained. The hook already deduplicates via JSON comparison so double-calling has no polling cost.

**Badge UI:** Small red dot overlay positioned top-right of tab button. Pulse animation (`animate-ping`) to draw attention. Accessible: `title="Permission prompt waiting"` on the badge element.

**Tab indicator pattern (standard UX):**
- Dot badge: colored circle overlay in tab corner — low footprint, high visibility
- Color: `warden-warning` (amber/yellow) — permission prompts are attention-needed, not errors
- Animation: `animate-ping` pulse while state is active; stops when resolved

### Browser Notifications

**Permission flow (MEDIUM confidence — verified against MDN):**
1. Notification.permission states: `'default'`, `'granted'`, `'denied'`
2. Must call `Notification.requestPermission()` inside a user gesture handler
3. Pattern: settings toggle → user clicks → `requestPermission()` → OS prompt appears
4. Never auto-prompt on page load — browsers will block and users will deny

**State transition detection (needed to avoid repeated notifications):**
```typescript
const previousStatesRef = useRef<Map<string, AgentStateHint | null>>(new Map());

// Inside useEffect watching liveStatusMap:
for (const [agentId, status] of liveStatusMap) {
  const prev = previousStatesRef.current.get(agentId);
  if (prev !== 'permission_prompt' && status.state === 'permission_prompt') {
    // Only fires on transition, not on each 5s poll while state persists
    new Notification(`Agent ${agentId} needs permission`, { body: '...' });
  }
}
previousStatesRef.current = new Map(liveStatusMap.entries().map(...));
```

### Keyboard Navigation

**Approach:** Custom `useKeyboardNav` hook with `document.addEventListener('keydown', ...)`.

**Why not react-hotkeys-hook:** The xterm.js canvas captures keyboard events. When terminal is focused, `document` events still fire (xterm uses `document.addEventListener` internally), but a global hotkey library may conflict with xterm's own key handler registration. A custom `useEffect` on `document` is more predictable and requires zero additional dependencies.

**Key bindings (chosen to avoid common conflicts):**
- `Alt+]` → next tab (no browser conflict, no tmux conflict)
- `Alt+[` → previous tab (symmetric)
- `Alt+S` → toggle sidebar
- `Ctrl+F` → open terminal search (intercepted at xterm level via `attachCustomKeyEventHandler`, not document)

**Focus-aware enabling:** The keydown handler should check if the active element is a text input (`INPUT`, `TEXTAREA`, `[contenteditable]`) and skip navigation in that case — operator may be typing in the prompt panel.

```typescript
document.addEventListener('keydown', (ev) => {
  const target = document.activeElement;
  const isTyping = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target as HTMLElement)?.contentEditable === 'true';
  if (isTyping) return; // Don't navigate while typing a prompt

  if (ev.altKey && ev.key === ']') {
    // next tab
  }
});
```

### Agent State Chip + Context Pressure in Terminal Header

**Current header structure in `TerminalView.tsx`:**
```
[connection dot] [session name]           [font size button] [hint text]
```

**New header structure:**
```
[connection dot] [session name]   [state chip] [pressure %]   [font size button]
```

**Prop change needed:** `TerminalView` receives `tmuxSessionName`. Parent `App.tsx` has `selectedInstance` which has `agentId`. Add `agentId?: string` prop.

**Inside `TerminalView`:** Call `useAgentLiveStatus()` directly (same self-contained pattern as InstanceTabBar badge recommendation), look up by `agentId`. Render `StateBadge` + `PressureIndicator` from `gsdShared.tsx`.

**Warning:** Both components already exist — this is a wiring task, not a build task. LOW implementation risk.

---

## Ecosystem Comparison: Terminal Search Approaches

| Approach | Match Count | Gutter Markers | Search Highlight | Implementation |
|----------|-------------|----------------|------------------|----------------|
| `@xterm/addon-search` | YES (`onDidChangeResults`) | YES (`matchOverviewRuler`) | YES (decorations) | Install package, load addon |
| Manual buffer scan + mark | NO (DIY) | NO | Fragile (ANSI codes) | Major custom work |
| Browser Find (Ctrl+F) | YES (browser UI) | NO | YES | Zero work, but only finds rendered text |

**Recommendation:** `@xterm/addon-search` is the only viable option. Browser Find does not work reliably on xterm.js canvas rendering. Manual scan is prohibitive. The addon is maintained by the xterm.js core team and ships as `@xterm/addon-search` matching the monorepo package pattern already used (`@xterm/addon-fit`, `@xterm/addon-web-links`).

---

## Sources

- [@xterm/addon-search type definitions](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-search/typings/addon-search.d.ts) — HIGH confidence (official source, complete API)
- [@xterm/addon-search npm page](https://www.npmjs.com/package/@xterm/addon-search) — HIGH confidence
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) — HIGH confidence (official MDN)
- [MDN Notification.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static) — HIGH confidence
- [web.dev Push Notifications Permission UX](https://web.dev/articles/push-notifications-permissions-ux) — MEDIUM confidence (Google official but prescriptive)
- [react-hotkeys-hook useHotkeys API](https://react-hotkeys-hook.vercel.app/docs/api/use-hotkeys) — MEDIUM confidence (referenced to inform the anti-feature recommendation)
- Existing codebase: `src/server/routes/gsdRoutes.ts`, `src/client/hooks/useAgentLiveStatus.ts`, `src/client/components/TerminalView.tsx`, `src/client/components/InstanceTabBar.tsx`, `src/client/components/gsdShared.tsx` — HIGH confidence (direct code inspection)

---

*Feature research for: Warden Dashboard v3.0 Operator Awareness & Terminal Power Tools*
*Researched: 2026-03-03*
