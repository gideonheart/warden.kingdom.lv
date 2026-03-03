# Project Research Summary

**Project:** Warden Dashboard v3.0 — Operator Awareness & Terminal Power Tools
**Domain:** Browser-based terminal multiplexer operator workstation (additive milestone)
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

Warden v3.0 is a tightly scoped additive milestone on top of a validated production stack (Express 5, Socket.IO 4, React 19, xterm.js 5.3.0, better-sqlite3). The milestone adds operator situational awareness features — permission prompt detection, context pressure surfacing, terminal text search, and keyboard navigation shortcuts — without introducing new infrastructure, namespaces, or architectural patterns. All data signals required for awareness features already exist in the running system: `useAgentLiveStatus` polls `/api/gsd/agents/live-status` every 5 seconds and delivers `{ state, contextPressure, contextPressureLevel }` per agent; the only missing piece is wiring this data into the terminals view UI and `InstanceTabBar`. Existing `StateBadge` and `PressureIndicator` components in `gsdShared.tsx` can be reused directly, making most of the "build" work a wiring exercise.

The recommended implementation approach phases from lowest-risk infrastructure first: permission badge and context pressure wiring (pure prop-plumbing on existing data), then keyboard shortcuts (`useGlobalHotkeys` hook with `document.addEventListener`), then terminal text search (one new npm dependency), and finally browser notifications (Web Notification API, opt-in only). The architecture is strictly additive throughout: two new files (`TerminalSearchOverlay.tsx`, `useGlobalHotkeys.ts`), five modified files (`TerminalView`, `InstanceTabBar`, `useTerminalSocket`, `App.tsx`, `TerminalStreamService`), and one new devDependency.

The most significant risks are keyboard event handling correctness (xterm.js `attachCustomKeyEventHandler` requires both `event.preventDefault()` AND `return false` to fully suppress a key), search addon performance on large terminal buffers (keep `highlightLimit` at 1000 and debounce search input at 300ms), and permission prompt detection accuracy (use `tmux capture-pane` polling via the existing `detectAgentState()` path — not raw PTY stream regex, which false-positives on ANSI-contaminated output). A critical cross-researcher package conflict also exists: STACK.md verified that the project must use `xterm-addon-search@0.13.0` (non-scoped), NOT `@xterm/addon-search`, because the project's client code imports from `'xterm'` (non-scoped v5.3.0). This package decision must be resolved before Phase 2 implementation begins.

## Key Findings

### Recommended Stack

The existing stack needs exactly one new npm dependency for this entire milestone. All other capabilities are implemented using React, DOM APIs, and infrastructure already in the project.

**Core technologies for new capabilities:**

- `xterm-addon-search@0.13.0` (non-scoped): Terminal buffer search with decorations, match count events, and scrollbar gutter markers. This is the only correct version given the project imports `from 'xterm'` (non-scoped v5.3.0). The scoped `@xterm/addon-search` has a peer dependency on `@xterm/xterm` (scoped package), not `xterm` (non-scoped), creating a TypeScript interface incompatibility. Install as `devDependency` matching existing addon pattern.
- `window.Notification` (Web API): Browser notifications for permission prompts — zero library, no service worker required. Fully supported on desktop Chrome/Firefox/Edge/Safari 16.4+. The `tag` option deduplicates notifications per session automatically.
- `document.addEventListener('keydown')` in `useEffect`: Global keyboard shortcut handling — zero library. The established project pattern; handles global shortcuts (tab switch, sidebar toggle) where `attachCustomKeyEventHandler` is insufficient because it only fires when the terminal canvas has focus.
- Existing `useAgentLiveStatus` hook + `AgentStateHint` / `PressureLevel` types: Already delivers all awareness data every 5 seconds; no new endpoint or data model needed.
- Existing `StateBadge` + `PressureIndicator` from `gsdShared.tsx`: Reuse in terminal header — the "build" task becomes a wiring task for state chip and context pressure badge.

**Critical non-obvious requirement:** `overviewRulerWidth: 15` must be added to the `Terminal` constructor options in `TerminalView.tsx` to enable scrollbar gutter markers. Without this option, `matchOverviewRuler` color settings are silently ignored by xterm.js.

**Installation:**
```bash
npm install --save-dev xterm-addon-search@0.13.0
```

### Expected Features

**Must have (P1 — milestone feels incomplete without these):**

- Agent state chip in terminal header — exposes `detectAgentState()` output (working/idle/perm/etc.) in the terminal header where the operator spends most time. Existing `StateBadge` component, new `agentState` prop on `TerminalView`. LOW implementation cost, HIGH daily value.
- Context pressure badge in terminal header — exposes `contextPressure` percentage with color thresholds (green <70%, amber 70-89%, pulsing red >=90%). Same prop wiring path as state chip. Must handle `null` gracefully (show "—") since the detection heuristic is fragile.
- Permission prompt tab badge — pulsing amber dot overlay on `InstanceTabBar` tab when `state === 'permission_prompt'`. Operator sees it across all agent tabs without watching every terminal. MEDIUM implementation cost.
- Terminal text search (Ctrl+F) — in-buffer search with match highlighting, scrollbar gutter markers, Prev/Next navigation, match count display. One new dependency. MEDIUM implementation cost.
- Keyboard tab navigation — Ctrl+1-9, Ctrl+[/] cycle, Ctrl+B sidebar toggle. `useGlobalHotkeys` hook, no library. LOW implementation cost.

**Should have (P2 — add in same milestone if time allows):**

- Browser notifications for permission prompts — requires opt-in UI and transition detection logic. MEDIUM cost. Add after tab badge is confirmed working (same data source, lower urgency).
- Search match count display ("3 / 12") — `onDidChangeResults` event, minimal code once search is working. LOW cost.
- Scrollbar gutter markers — requires `overviewRulerWidth: 15` in Terminal constructor + `matchOverviewRuler` color in search options. LOW cost once search addon is loaded.

**Defer (P3 — v3.1+):**

- Search highlight persistence across tab switches — requires per-session search state management and SearchAddon re-initialization on tab return. MEDIUM complexity.
- Keyboard shortcut help overlay — nice UX polish for a single operator who configured the system.

**Anti-features to reject:**

- Cross-session search (all buffers simultaneously) — contradicts PTY keepalive design.
- Auto-answering permission prompts — removes the safety check that prompts provide.
- `react-hotkeys-hook` or other keyboard libraries — unnecessary dependency; custom `useEffect` is <50 LOC.
- Raw PTY stream regex for permission detection — high false positive rate from ANSI-contaminated output; use `tmux capture-pane` polling.
- `Notification.requestPermission()` on page load — browsers silently block it; must be user-gesture triggered.

### Architecture Approach

All v3.0 features integrate into the existing two-tier architecture (Express 5 server + React 19 SPA) without new namespaces, services, or database tables. The client architecture follows a props-down pattern: `App.tsx` calls `useAgentLiveStatus()`, derives per-session status from `selectedInstance.agentId`, and passes it to `InstanceTabBar` (badge) and `TerminalView` (header chips). The server contribution is limited to a single architectural decision: whether to use PTY stream tap or `tmux capture-pane` polling for permission detection. Research is clear — use `tmux capture-pane` (existing `detectAgentState()` path) to avoid ANSI false positives.

**Major components:**

1. `useGlobalHotkeys` (new hook, `src/client/hooks/useGlobalHotkeys.ts`) — document-level keydown listener for Ctrl+1-9 tab selection, Ctrl+[/] cycling, Ctrl+B sidebar toggle. Uses callback-ref stability pattern (store callbacks in `useRef`, update each render, empty `useEffect` deps) to prevent listener churn.
2. `TerminalSearchOverlay` (new component, `src/client/components/TerminalSearchOverlay.tsx`) — search input, Prev/Next/Close buttons, match count display. Rendered conditionally inside `TerminalView`. Receives `SearchAddon` ref. Restores terminal focus on close via `requestAnimationFrame(() => terminal.focus())`.
3. `TerminalView` (modified) — loads `SearchAddon` in terminal init `useEffect` alongside existing addons, adds `overviewRulerWidth: 15` to Terminal constructor, renders context pressure badge and agent state chip in header bar, conditionally renders `TerminalSearchOverlay`, handles Ctrl+F via `terminal.attachCustomKeyEventHandler`.
4. `InstanceTabBar` (modified) — accepts `permissionBadgeSessions: Set<string>` prop, renders pulsing amber badge dot on matching tabs.
5. `App.tsx` (modified) — orchestrates new state: calls `useAgentLiveStatus()`, derives `selectedLiveStatus`, passes pressure/state props to `TerminalView`, mounts `useGlobalHotkeys`, collects `permissionBadgeSessions`.

**No changes needed to:** `src/server/index.ts`, `gsdRoutes.ts`, `src/shared/gsdTypes.ts`, `useAgentLiveStatus.ts`.

### Critical Pitfalls

1. **xterm.js key suppression requires both `event.preventDefault()` AND `return false`** — `attachCustomKeyEventHandler` returning `false` stops xterm.js from sending the character to the PTY, but does NOT stop browser default behavior. For Ctrl+F, call `event.preventDefault()` (prevents browser find bar) AND `return false` (prevents PTY injection). Missing either causes the browser's native find bar to open alongside the custom overlay.

2. **Global `document.addEventListener` fires even when terminal has focus** — keyboard events on the xterm.js canvas bubble to `document`. Without `event.stopPropagation()` in `attachCustomKeyEventHandler` for global shortcuts, tab-switch shortcuts send escape sequences to the PTY AND switch tabs simultaneously. Two-part defense required: `stopPropagation()` in the xterm handler + input-element focus guard in the document handler.

3. **Search overlay steals focus; terminal must be explicitly refocused on close** — when `TerminalSearchOverlay` unmounts, browser returns focus to `document.body`, not the terminal. Call `requestAnimationFrame(() => terminalInstanceRef.current?.focus())` in the close handler. Easy to miss during development since testing always starts with keyboard focus in the terminal.

4. **SearchAddon highlight performance degrades catastrophically above default `highlightLimit`** — searching a common term in a 50,000-line session can yield 72,000+ matches. Decoration creation at that scale blocks the main thread for ~470ms (verified from xterm.js issue #5176 profiling). Keep `highlightLimit` at the default (1,000), debounce search input at 300ms minimum, and display "1000+" when `resultIndex === -1` from `onDidChangeResults`.

5. **Permission prompt detection via raw PTY stream regex causes false positives** — PTY output includes ANSI escape codes, partial lines, and mid-render sequences. The pattern `/permission|allow|dangerous/i` false-positives on `npm install` output and custom shell prompts. Use `detectAgentState()` via `tmux capture-pane` (existing, already returns `'permission_prompt'`). Stronger anchor if tightening is needed: `/Do you want to proceed\?|❯\s+1\.\s+Yes/i`.

6. **Wrong search package version** — ARCHITECTURE.md and PITFALLS.md recommend `@xterm/addon-search` (scoped). STACK.md researcher verified this is incorrect for this project. Use `xterm-addon-search@0.13.0` (non-scoped, peer `xterm@^5.0.0`). Verify with `npm ls xterm-addon-search` after install.

## Implications for Roadmap

Based on research, the milestone maps to two phases with a clear dependency order. Phase 1 establishes the data flow and keyboard infrastructure (no new dependencies). Phase 2 adds the search UI and browser notifications (one new dependency, more complex interaction patterns).

### Phase 1: Operator Awareness Wiring

**Rationale:** All data already exists in `useAgentLiveStatus`. This phase is pure prop-threading with zero new dependencies and zero integration risk. Permission badge and context pressure are immediately useful, and building them first validates the data flow before Phase 2 adds the more complex `SearchAddon` lifecycle. The `useGlobalHotkeys` hook belongs here because the Ctrl+F handler must be established before Phase 2 wires the terminal search response.

**Delivers:**
- Agent state chip + context pressure badge in `TerminalView` header
- Permission prompt pulsing badge on `InstanceTabBar` tabs
- Keyboard navigation shortcuts (`useGlobalHotkeys` hook: Ctrl+1-9, Ctrl+[/], Ctrl+B)
- Ctrl+F handler stub (opens search, which Phase 2 implements)

**Addresses:** All P1 features except terminal text search

**Avoids:**
- PTY stream regex for permission detection (use `detectAgentState()` polling — Pitfall 5)
- `event.stopPropagation()` omission in global key handling (Pitfall 2)
- Socket.IO namespace pollution (decision: polling only, no new socket events)
- Strengthened permission regex applied to `detectAgentState()` in `gsdRoutes.ts` to reduce badge noise

**No new npm dependencies for this phase.**

### Phase 2: Terminal Search + Browser Notifications

**Rationale:** Depends on Phase 1's `useGlobalHotkeys` Ctrl+F handler and permission detection infrastructure. `xterm-addon-search@0.13.0` is the one new dependency for the entire milestone. Browser notifications depend on the same `useAgentLiveStatus` state transition data surfaced in Phase 1.

**Delivers:**
- `TerminalSearchOverlay` component with Prev/Next/Close
- Match count display ("3 / 47")
- Scrollbar gutter markers (`overviewRulerWidth: 15` + `matchOverviewRuler`)
- Browser notifications for permission prompts (opt-in, state-transition-triggered)
- `usePermissionNotifications` hook with `Notification.permission` state machine (default/granted/denied)

**Uses:** `xterm-addon-search@0.13.0` (non-scoped), Web Notification API

**Avoids:**
- `highlightLimit` above default 1000 — debounce search input at 300ms (Pitfall 4)
- Missing `event.preventDefault()` in Ctrl+F handler (Pitfall 1)
- Missing terminal focus restoration after overlay close (Pitfall 3)
- Wrong package install (`@xterm/addon-search` instead of `xterm-addon-search`) (Pitfall 6)
- `Notification.requestPermission()` outside user gesture (browser policy)
- Notification `denied` state without recovery UX — show "unblock in browser settings" message (Pitfall: browser notification denied state is permanent until user takes manual action in browser settings)

### Phase Ordering Rationale

- Phase 1 before Phase 2 because awareness wiring (pure prop-passing) has zero integration risk and validates the data flow before adding `SearchAddon` lifecycle management.
- Keyboard shortcuts belong in Phase 1 because the Ctrl+F global handler must be in place before Phase 2 wires the search response; establishing `useGlobalHotkeys` also defines the focus guard approach used throughout.
- Browser notifications belong in Phase 2 because they depend on permission detection working correctly (Phase 1), and the opt-in UI placement is informed by Phase 1 UI additions.
- Search and notifications grouped in Phase 2 because both require new code infrastructure and share the same risk profile — they can be tested together.

### Research Flags

**Standard patterns — no additional research needed:**

- **Phase 1:** All implementations are pure prop-threading on existing hooks and components. `useAgentLiveStatus`, `StateBadge`, `PressureIndicator`, `InstanceTabBar`, and `App.tsx` patterns are all direct-read from codebase. The `useGlobalHotkeys` hook is <50 LOC using established `document.addEventListener` + callback-ref pattern already in `useTerminalSocket`.

- **Phase 2 (notifications):** MDN Notification API is fully documented. Three-state machine (default/granted/denied) is straightforward.

**Needs careful verification during implementation:**

- **Phase 2 (search addon package):** Verify with `npm show xterm-addon-search@0.13.0 peerDependencies` and `npm show @xterm/addon-search peerDependencies` before installing. STACK.md finding (non-scoped package) is authoritative but contradicts two other research files — confirm before committing.

- **Phase 2 (keyboard event handling):** The `attachCustomKeyEventHandler` + `document.addEventListener` interaction has multiple edge cases (Pitfalls 1, 2, 3). Execute the "Looks Done But Isn't" checklist from PITFALLS.md before marking Phase 2 complete: browser find bar test, PTY escape injection test, focus restoration test, overview ruler visibility test.

- **Phase 1 (useAgentLiveStatus call location):** Currently called in `AgentsTab.tsx`. Must also be called in `App.tsx` for terminal view features. Calling in `App.tsx` and passing as props is architecturally cleaner than calling in both places. Confirm the hook deduplicates internally (it uses JSON comparison — confirmed) so the additional call is safe.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | STACK.md researcher read npm pack output directly, checked peer dependency declarations, read `TerminalView.tsx` source. Package conflict finding is verified against actual npm metadata. |
| Features | HIGH | Feature list derives directly from existing `useAgentLiveStatus` data structure and existing `gsdShared.tsx` components. All P1 features are wiring existing data, not building new data sources. |
| Architecture | HIGH | All component interfaces read directly from source files. Props-down pattern is established in codebase. File change map is precise. |
| Pitfalls | HIGH | Verified against xterm.js GitHub issues (issue numbers cited), MDN, and running project source. Performance figures from actual profiling data (issue #5176, 470ms for 72k matches). |

**Overall confidence:** HIGH

### Gaps to Address

- **Package conflict resolution (critical):** STACK.md says `xterm-addon-search@0.13.0` (non-scoped); ARCHITECTURE.md and PITFALLS.md say `@xterm/addon-search`. This contradiction between research files must be verified at Phase 2 start. Run `npm show xterm-addon-search@0.13.0 peerDependencies` and `npm show @xterm/addon-search@latest peerDependencies` and compare against the project's `from 'xterm'` import.

- **Context pressure regex reliability:** `extractContextPressure()` is documented as a fragile heuristic — Claude Code's status bar format is unversioned and changes across releases. The badge must handle `null` gracefully (display "—"). This is display-only and not a blocker; confirm the null path is rendered correctly in Phase 1.

- **Permission prompt regex strength:** Current `detectAgentState()` pattern `/permission|allow|dangerous/i` has known false positives. PITFALLS.md provides a stronger anchor: `/Do you want to proceed\?|❯\s+1\.\s+Yes/i`. Apply this as part of Phase 1 badge work to reduce noise before the badge ships.

- **Notification click focus cross-browser:** `notification.onclick → window.focus()` is unreliable on macOS Chrome and blocked in Firefox (bug #874050). Accept and document the limitation; do not attempt Service Worker solution for this use case.

## Sources

### Primary (HIGH confidence — direct source inspection)

- `src/client/components/TerminalView.tsx` — addon loading pattern, header structure, existing props interface
- `src/client/hooks/useAgentLiveStatus.ts` — confirmed data shape `{ state, contextPressure, contextPressureLevel }`
- `src/client/components/gsdShared.tsx` — `StateBadge`, `PressureIndicator`, `STATE_BADGE_COLORS`, `STATE_BADGE_LABELS` confirmed present and reusable
- `src/client/components/InstanceTabBar.tsx` — tab rendering structure, badge insertion point
- `src/client/App.tsx` — `useSessionSelection`, `activeInstances`, `selectedInstance`, `showSidebar` state
- `src/server/services/TerminalStreamService.ts` — `SharedPtySession` interface, `onData` broadcast loop pattern
- `src/server/routes/gsdRoutes.ts` — `detectAgentState()` regex, `extractContextPressure()`, live-status endpoint
- `src/shared/gsdTypes.ts` — `AgentStateHint`, `PressureLevel` types confirmed correct for v3.0
- `node_modules/xterm/typings/xterm.d.ts` — confirmed `overviewRulerWidth` option existence
- npm pack output for `xterm-addon-search@0.13.0` — full API confirmed: `ISearchOptions`, `ISearchDecorationOptions.matchOverviewRuler`, `onDidChangeResults`, `clearDecorations()`, `highlightLimit`
- `npm show xterm-addon-search@0.13.0 peerDependencies` → `{ "xterm": "^5.0.0" }` (compatible)
- `npm show @xterm/addon-search@0.16.0 peerDependencies` → `{ "@xterm/xterm": "^5.0.0" }` (incompatible with project)

### Secondary (HIGH confidence — official docs and verified GitHub issues)

- xterm.js issue #5176 — search addon performance profiling data (470ms blocking for 72,960 matches)
- xterm.js issue #2293 — `attachCustomKeyEventHandler` keyup event gap
- xterm.js issue #4859 — v5 scoped package migration documentation
- MDN Notification API — `requestPermission()` user gesture requirement, three permission states
- Firefox bug #874050 — `window.focus()` blocked in notification onclick
- cc-hook GitHub — `"Do you want to proceed?"` as Claude Code permission prompt detection anchor

### Tertiary (MEDIUM confidence — MDN prescriptive guidance and inferred)

- Claude Code issue #5428 — ANSI status bar format fragility (confirms context pressure regex is inherently fragile)
- web.dev Push Notifications Permission UX — opt-in pattern guidance

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
