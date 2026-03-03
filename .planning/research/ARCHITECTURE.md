# Architecture Research: v3.0 Operator Awareness & Terminal Power Tools

**Domain:** Warden Dashboard — feature integration for milestone v3.0
**Researched:** 2026-03-03
**Confidence:** HIGH (direct codebase inspection + npm registry verification)

---

## System Overview

The four v3.0 feature areas map cleanly onto the existing two-tier architecture. No new
namespaces, services, or infrastructure are required. The diagram below shows where each
feature lands, with v3.0 additions marked `[NEW]`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT (React 19 SPA)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  App.tsx                                                                      │
│  ├── header                (nav, [NEW] useGlobalHotkeys hook)                 │
│  ├── InstanceTabBar        [MODIFIED: permission badge per tab]                │
│  └── TerminalView          [MODIFIED: search overlay, context pressure        │
│       ├── header bar         badge, agent state chip, Ctrl+F handler]        │
│       ├── xterm.js canvas                                                     │
│       │    └── @xterm/addon-search [NEW dependency, loaded once at init]     │
│       └── TerminalSearchOverlay [NEW component, conditionally rendered]       │
│                                                                               │
│  useTerminalSocket         [MODIFIED: handle terminal:permission_prompt]      │
│  useAgentLiveStatus        [EXISTING: already has contextPressure data]       │
│  useGlobalHotkeys          [NEW hook: document-level keydown handler]         │
│                                                                               │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │  Socket.IO /terminal namespace
                                 │  (existing — new event types added)
┌────────────────────────────────▼────────────────────────────────────────────┐
│                       EXPRESS 5 SERVER (src/server/)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  TerminalStreamService     [MODIFIED: PTY output tap → permission detection] │
│  ├── ptyProcess.onData()   taps each chunk before fan-out to subscribers     │
│  ├── permissionPromptState Map<sessionName, boolean> tracks per-session flag  │
│  └── emits terminal:permission_prompt  /  clears on terminal:input           │
│                                                                               │
│  gsdRoutes.ts              [EXISTING: /api/gsd/agents/live-status]           │
│  └── extractContextPressure() already running every 5s poll from client      │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │ node-pty / tmux attach-session
         ▼
  [tmux sessions with agent prefixes]
```

---

## Component Responsibilities

### New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `TerminalSearchOverlay` | `src/client/components/TerminalSearchOverlay.tsx` | Search input, Prev/Next/Close buttons, match counter display. Receives `SearchAddon` ref and renders over terminal canvas. |
| `useGlobalHotkeys` | `src/client/hooks/useGlobalHotkeys.ts` | Single `document` keydown listener for Ctrl+1-9 tab switching, Alt+Left/Right cycling, Ctrl+B sidebar toggle. Scope-guarded against text inputs. |

### Modified Components

| Component | File | What Changes |
|-----------|------|--------------|
| `TerminalStreamService` | `src/server/services/TerminalStreamService.ts` | Add permission prompt detection in `ptyProcess.onData()` tap. Track per-session boolean flag. Emit `terminal:permission_prompt` event. Clear on `terminal:input`. |
| `TerminalView` | `src/client/components/TerminalView.tsx` | Load `@xterm/addon-search`. Render `TerminalSearchOverlay` conditionally. Accept `contextPressure` and `agentState` props. Display context pressure badge and agent state chip in header bar. Wire Ctrl+F keydown. |
| `InstanceTabBar` | `src/client/components/InstanceTabBar.tsx` | Accept `permissionBadgeSessions: Set<string>` prop. Render red badge dot on tabs in this set. |
| `useTerminalSocket` | `src/client/hooks/useTerminalSocket.ts` | Handle new `terminal:permission_prompt` event from server. Expose `hasPermissionPrompt` boolean in return value. |
| `App.tsx` | `src/client/App.tsx` | Mount `useGlobalHotkeys`. Pass `permissionBadgeSessions` to `InstanceTabBar`. Pass `contextPressure` and `agentState` from `useAgentLiveStatus` to `TerminalView`. Request browser `Notification` permission on first permission prompt (Phase 20). |

---

## Detailed Integration Points

### 1. Permission Prompt Detection (PTY Tap)

**Where it lives:** `TerminalStreamService.attachSocketToSession()` in the `ptyProcess.onData()` handler.

The existing broadcast loop already iterates over all subscribers per data chunk. The tap inserts a regex test before (or alongside) the fan-out, with no change to the fan-out logic itself.

```typescript
// Inside TerminalStreamService — ptyProcess.onData callback
ptyProcess.onData((terminalOutput: string) => {
  // [NEW] Permission prompt detection tap
  if (PERMISSION_PROMPT_PATTERN.test(terminalOutput) && !session.hasPermissionPrompt) {
    session.hasPermissionPrompt = true;
    for (const subscriberId of session.subscribers) {
      const subscriberSocket = this.findSocketById(subscriberId);
      subscriberSocket?.emit('terminal:permission_prompt', { sessionName, detected: true });
    }
  }

  // [EXISTING] Fan-out to all subscribers unchanged
  for (const subscriberId of session.subscribers) {
    const subscriberSocket = this.findSocketById(subscriberId);
    subscriberSocket?.emit('terminal:output', terminalOutput);
  }
});
```

The `hasPermissionPrompt` boolean is added to `SharedPtySession`. It is cleared in `setupSocketInputHandlers` when `terminal:input` is received.

**Pattern used:** `session.hasPermissionPrompt` lives on the existing `SharedPtySession` interface — no new Map or service. The emit is the same `socket.emit()` call pattern already used for `terminal:reset` and `terminal:exit`.

**Regex patterns to detect (Phase 19 baseline):**

```typescript
const PERMISSION_PROMPT_PATTERN =
  /Do you want to|Allow|Press Enter to continue|\(y\/N\)|Overwrite\?|permission|bypass/i;
```

These patterns should be refined by inspecting actual Claude Code permission prompt output. The regex is intentionally broad for Phase 19 and can be tightened in Phase 20 after real-world observation.

---

### 2. Context Pressure Surfacing (useAgentLiveStatus → TerminalView)

**Data is already computed.** `extractContextPressure()` runs server-side on every `GET /api/gsd/agents/live-status` call, which `useAgentLiveStatus` polls every 5 seconds. The data reaches the client as `{ contextPressure: number | null, contextPressureLevel: PressureLevel | null }` per agent.

**The missing link:** `TerminalView` does not currently consume `useAgentLiveStatus`. The hook is called in `AgentsTab.tsx` (GSD view) and not wired into the terminal header.

**Integration path (Option B from v3.0-SCOPE.md — preferred):**

`App.tsx` already calls `useAgentLiveStatus` (or can be made to). It derives `selectedInstance` from `activeInstances`. The mapping from `selectedInstance.agentId` to a live status entry is a Map lookup:

```typescript
// In App.tsx
const liveStatusMap = useAgentLiveStatus();
const selectedLiveStatus = selectedInstance
  ? liveStatusMap.get(selectedInstance.agentId) ?? null
  : null;

// Pass to TerminalView:
<TerminalView
  tmuxSessionName={selectedSessionName}
  onSessionExit={handleSessionExit}
  contextPressure={selectedLiveStatus?.contextPressure ?? null}
  contextPressureLevel={selectedLiveStatus?.contextPressureLevel ?? null}
  agentState={selectedLiveStatus?.state ?? null}     // Phase 20
/>
```

`TerminalView` receives these as props and renders them in the existing header bar `<div>`. No new API endpoint required — this reuses the existing polling infrastructure.

**Context pressure badge color rules:**

| Threshold | Color token | Label |
|-----------|-------------|-------|
| No data (null) | hidden | — |
| < 70% | `text-warden-success` | `{n}%` |
| 70–89% | `text-warden-warning` | `{n}%` |
| >= 90% | `text-warden-error` animate-pulse | `{n}%` |

---

### 3. xterm-addon-search Integration

**Package:** `@xterm/addon-search@0.16.0`

This is the official scoped package. The project already uses `@xterm/addon-fit` and `@xterm/addon-web-links` from the same `@xterm` namespace — the pattern is identical.

**Compatibility:** `@xterm/addon-search` requires `xterm.js v4+`. The project uses `xterm@^5.3.0`. Confirmed compatible.

**Installation:**

```bash
npm install -D @xterm/addon-search
```

Note: existing addons (`@xterm/addon-fit`, `@xterm/addon-web-links`) are devDependencies in this project's `package.json` even though they are used at runtime in the client bundle. Vite bundles them into the client output, so devDependency placement is correct here.

**Loading pattern** (matches how `FitAddon` and `WebLinksAddon` are loaded in `TerminalView.tsx`):

```typescript
import { SearchAddon } from '@xterm/addon-search';

// Inside TerminalView useEffect (terminal init block)
const searchAddon = new SearchAddon();
terminal.loadAddon(searchAddon);
terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());

searchAddonRef.current = searchAddon;
```

**Key API:**

```typescript
// Forward search
searchAddon.findNext(term, {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  incremental: true,         // re-search from start on each keypress
  decorations: {
    matchBackground: '#4f46e5',          // warden-accent
    matchBorder: '#6366f1',
    matchOverviewRuler: '#6366f1',
    activeMatchBackground: '#f59e0b',    // warden-warning
    activeMatchBorder: '#f59e0b',
    activeMatchColorOverviewRuler: '#f59e0b',
  },
});

// Backward search
searchAddon.findPrevious(term, { /* same options */ });
```

The `decorations.matchOverviewRuler` option renders markers in xterm.js's built-in overview ruler (the thin scrollbar on the right edge of the terminal). This gives Phase 19 basic scrollbar markers without custom canvas work — the "scrollbar gutter markers" Phase 20 feature may be satisfied by this built-in behavior.

**Addon lifecycle:** `SearchAddon` is loaded once when the terminal is created and lives for the duration of the `TerminalView` mount. It is not reloaded on search term changes. The terminal `dispose()` in the cleanup function implicitly disposes all loaded addons.

---

### 4. TerminalSearchOverlay Component

A new component rendered conditionally inside `TerminalView`'s terminal content area:

```typescript
// Positioning: overlaid at top of terminal canvas, z-index above terminal content
// (similar to the existing connecting overlay, but at the top)
{isSearchOpen && (
  <TerminalSearchOverlay
    searchAddon={searchAddonRef.current}
    onClose={() => setIsSearchOpen(false)}
  />
)}
```

**Props interface:**

```typescript
interface TerminalSearchOverlayProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}
```

The overlay is self-contained: it manages its own search term state, calls `searchAddon.findNext()` / `searchAddon.findPrevious()` directly, and handles its own Escape key. Match count display (Phase 20) requires the `ISearchDecorations` callback API — verify availability in `@xterm/addon-search@0.16.0` before Phase 20 implementation.

**Ctrl+F handling:** The `Ctrl+F` keypress must open the overlay. xterm.js captures keypresses when the terminal has focus, so the handler must be registered at the `document` level (same approach as `useGlobalHotkeys`). Alternatively, it can be registered in `TerminalView`'s `useEffect` on `terminalContainerRef.current` — but document-level is simpler and consistent with the hotkeys pattern.

```typescript
// Inside TerminalView useEffect or useGlobalHotkeys
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === 'f') {
    // Only intercept when terminal is the active view
    event.preventDefault();
    setIsSearchOpen(true);
  }
};
document.addEventListener('keydown', handleKeyDown);
```

---

### 5. Keyboard Navigation Shortcuts (useGlobalHotkeys)

A single document-level keydown listener handles all global shortcuts. This is the established pattern for browser apps where a canvas (xterm.js) captures keyboard events.

**Focus guard:** Do not intercept shortcuts when focus is in a text input, textarea, or select (except the terminal canvas itself). xterm.js terminal canvas is a `<div>` or `<canvas>`, not an input, so `event.target instanceof HTMLInputElement` etc. is a sufficient guard.

```typescript
// src/client/hooks/useGlobalHotkeys.ts
export interface UseGlobalHotkeysParams {
  sessions: string[];                          // ordered list of tmux session names
  onSelectSession: (sessionName: string) => void;
  onCycleSessionForward: () => void;
  onCycleSessionBackward: () => void;
  onToggleSidebar: () => void;
}

export function useGlobalHotkeys({
  sessions,
  onSelectSession,
  onCycleSessionForward,
  onCycleSessionBackward,
  onToggleSidebar,
}: UseGlobalHotkeysParams): void {
  // Stable ref for callbacks — avoids listener churn on re-render
  const callbacksRef = useRef({ sessions, onSelectSession, onCycleSessionForward, onCycleSessionBackward, onToggleSidebar });
  callbacksRef.current = { sessions, onSelectSession, onCycleSessionForward, onCycleSessionBackward, onToggleSidebar };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Focus guard: ignore when in text input
      if (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement) {
        return;
      }

      const { sessions, onSelectSession, onCycleSessionForward, onCycleSessionBackward, onToggleSidebar } = callbacksRef.current;

      // Ctrl+1 through Ctrl+9 — select session by index
      if (event.ctrlKey && !event.shiftKey && !event.altKey) {
        const digit = parseInt(event.key, 10);
        if (digit >= 1 && digit <= 9) {
          const targetSession = sessions[digit - 1];
          if (targetSession) {
            event.preventDefault();
            onSelectSession(targetSession);
          }
          return;
        }
        // Ctrl+B — toggle sidebar
        if (event.key === 'b') {
          event.preventDefault();
          onToggleSidebar();
          return;
        }
      }

      // Alt+Left / Alt+Right — cycle tabs
      if (event.altKey && !event.ctrlKey && !event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onCycleSessionBackward();
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onCycleSessionForward();
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // Empty deps — callbacks accessed via ref
}
```

**Mounting in App.tsx:**

```typescript
useGlobalHotkeys({
  sessions: activeInstances.map((i) => i.tmuxSessionName),
  onSelectSession: handleSelectSession,
  onCycleSessionForward: () => {
    const idx = activeInstances.findIndex((i) => i.tmuxSessionName === selectedSessionName);
    const next = activeInstances[(idx + 1) % activeInstances.length];
    if (next) handleSelectSession(next.tmuxSessionName);
  },
  onCycleSessionBackward: () => {
    const idx = activeInstances.findIndex((i) => i.tmuxSessionName === selectedSessionName);
    const prev = activeInstances[(idx - 1 + activeInstances.length) % activeInstances.length];
    if (prev) handleSelectSession(prev.tmuxSessionName);
  },
  onToggleSidebar: () => setShowSidebar((v) => !v),
});
```

---

## File Change Map

### New Files

```
src/
├── client/
│   ├── components/
│   │   └── TerminalSearchOverlay.tsx     # Search input + Prev/Next/Close + match counter (Phase 20)
│   └── hooks/
│       └── useGlobalHotkeys.ts           # document keydown handler for all global shortcuts
```

### Modified Files

```
src/
├── server/
│   └── services/
│       └── TerminalStreamService.ts      # SharedPtySession: add hasPermissionPrompt boolean
│                                         # ptyProcess.onData: permission regex tap
│                                         # setupSocketInputHandlers: clear flag on terminal:input
│                                         # emit terminal:permission_prompt event
├── client/
│   ├── App.tsx                           # Mount useGlobalHotkeys
│                                         # Call useAgentLiveStatus
│                                         # Derive selectedLiveStatus from selectedInstance
│                                         # Pass contextPressure+contextPressureLevel+agentState to TerminalView
│                                         # Collect hasPermissionPrompt from useTerminalSocket (via tab state)
│                                         # Pass permissionBadgeSessions to InstanceTabBar
│   ├── components/
│   │   ├── TerminalView.tsx              # import @xterm/addon-search
│                                         # Add searchAddonRef, isSearchOpen state
│                                         # Load SearchAddon in terminal init useEffect
│                                         # Add props: contextPressure, contextPressureLevel, agentState
│                                         # Render: context pressure badge + agent state chip in header
│                                         # Render: <TerminalSearchOverlay> when isSearchOpen
│                                         # document keydown handler for Ctrl+F
│   │   └── InstanceTabBar.tsx            # Accept permissionBadgeSessions prop
│                                         # Render red badge dot on matching tabs
│   └── hooks/
│       └── useTerminalSocket.ts          # Handle terminal:permission_prompt event
│                                         # Expose hasPermissionPrompt in return value
```

**No changes needed to:**
- `src/server/index.ts` — no new namespace or service initialization
- `src/server/routes/gsdRoutes.ts` — `extractContextPressure()` and live-status endpoint unchanged
- `src/shared/gsdTypes.ts` — existing `AgentStateHint` and `PressureLevel` types are already correct
- `src/client/hooks/useAgentLiveStatus.ts` — already returns the needed data

---

## Data Flow Diagrams

### Permission Prompt Detection Flow

```
PTY output arrives at TerminalStreamService
    |
    ├── PERMISSION_PROMPT_PATTERN.test(chunk)
    │     |
    │     true and !session.hasPermissionPrompt
    │     |
    │     ├── session.hasPermissionPrompt = true
    │     └── socket.emit('terminal:permission_prompt', { sessionName, detected: true })
    │           |
    │           v
    │     useTerminalSocket receives event
    │           |
    │           v
    │     setHasPermissionPrompt(true) (per-session local state)
    │           |
    │           v
    │     App.tsx collects into permissionBadgeSessions Set
    │           |
    │           v
    │     InstanceTabBar renders red badge dot on tab
    │           |
    │     [browser tab not focused? → Phase 20 Notification API]
    │
    └── Fan-out terminal:output to all subscribers (UNCHANGED)

Operator presses key in terminal
    |
    v
terminal:input event → TerminalStreamService.setupSocketInputHandlers
    |
    └── session.hasPermissionPrompt = false
         └── socket.emit('terminal:permission_prompt', { sessionName, detected: false })
              |
              v
         useTerminalSocket → setHasPermissionPrompt(false)
              |
              v
         Badge removed from InstanceTabBar tab
```

### Context Pressure Surfacing Flow

```
[EXISTING — runs every 5s]
useAgentLiveStatus polls GET /api/gsd/agents/live-status
    |
    v
Server: execFileAsync('tmux', ['capture-pane', ...])
    → extractContextPressure(stdout)
    → { contextPressure: 73, contextPressureLevel: 'warning' }
    |
    v
useAgentLiveStatus returns Map<agentId, AgentLiveStatus>

[NEW wiring in App.tsx]
selectedInstance = activeInstances.find(i => i.tmuxSessionName === selectedSessionName)
selectedLiveStatus = liveStatusMap.get(selectedInstance?.agentId)
    |
    v
<TerminalView contextPressure={73} contextPressureLevel="warning" />
    |
    v
TerminalView header renders: [73% ctx] with amber color
```

### Terminal Search Flow

```
Operator presses Ctrl+F
    |
    v
document keydown handler in TerminalView (or useGlobalHotkeys)
    → event.preventDefault()
    → setIsSearchOpen(true)
    |
    v
<TerminalSearchOverlay searchAddon={searchAddonRef.current} />
renders at top of terminal canvas

Operator types search term
    |
    v
TerminalSearchOverlay onChange → searchAddon.findNext(term, { incremental: true })
    |
    v
@xterm/addon-search highlights matches in xterm.js buffer
Overview ruler markers appear in right-side scrollbar gutter (built-in)

Operator presses Escape
    |
    v
TerminalSearchOverlay onClose → setIsSearchOpen(false)
    → terminal.focus() (restore focus to terminal canvas)
```

---

## Build Order

Build order respects dependencies: shared types first, server modifications second (backend testable independently), then client additions.

### Step 1: TerminalStreamService modification (backend only)

Add `hasPermissionPrompt: boolean` to `SharedPtySession`. Add regex tap in `onData`. Add `terminal:permission_prompt` emit. Add clear on `terminal:input`.

**Verify:** `npm run dev` starts without TypeScript errors. Test with a manual tmux session that echoes permission-like text; confirm event fires via browser DevTools Network/Socket panel.

### Step 2: useTerminalSocket modification (client, depends on Step 1)

Add `terminal:permission_prompt` event handler. Expose `hasPermissionPrompt` in return value.

**Verify:** Browser console logs permission prompt events when test pattern is triggered.

### Step 3: InstanceTabBar + App.tsx badge wiring (client, depends on Step 2)

Add `permissionBadgeSessions` prop to `InstanceTabBar`. Wire collection in `App.tsx`. Render badge dot.

**Verify:** Badge appears on tab when permission prompt event fires. Badge disappears on next keypress.

### Step 4: Context pressure badge + agent state chip in TerminalView (client)

Add `contextPressure`, `contextPressureLevel`, `agentState` props to `TerminalView`. Render in header bar. Wire `useAgentLiveStatus` in `App.tsx`.

**Verify:** Terminal header shows percentage with correct color. Updates every 5s as GSD live-status polls.

### Step 5: @xterm/addon-search installation + TerminalSearchOverlay (client)

```bash
npm install -D @xterm/addon-search
```

Create `TerminalSearchOverlay.tsx`. Load `SearchAddon` in `TerminalView` init block. Wire Ctrl+F keydown. Render overlay conditionally.

**Verify:** Ctrl+F opens overlay. Typing highlights matches. Next/Prev navigate. Escape closes and refocuses terminal.

### Step 6: useGlobalHotkeys + App.tsx wiring (client, depends on nothing)

Create `useGlobalHotkeys.ts`. Mount in `App.tsx` with session list and callbacks.

**Verify:** Ctrl+1 navigates to first session tab. Alt+Right cycles forward. Ctrl+B toggles sidebar. None of these fire when typing in text inputs.

---

## Architectural Patterns

### Pattern 1: PTY Tap via onData Callback

**What:** Inspect PTY output chunks inside `TerminalStreamService.ptyProcess.onData()` before or alongside the existing fan-out to subscribers.

**When to use:** Any server-side detection that needs to react to raw terminal byte streams. Already established by the `setImmediate` tap in earlier phases.

**Trade-offs:** Detection runs on every PTY data chunk (potentially high-frequency). Keep the regex test cheap — avoid stateful parsers. The `!session.hasPermissionPrompt` guard prevents repeated events on subsequent matching chunks.

**Example:**
```typescript
ptyProcess.onData((chunk: string) => {
  if (PERMISSION_PROMPT_PATTERN.test(chunk) && !session.hasPermissionPrompt) {
    session.hasPermissionPrompt = true;
    // emit to subscribers
  }
  // existing fan-out unchanged
});
```

### Pattern 2: Callback Ref Stability in Hooks

**What:** Store callbacks in a `useRef` and assign `ref.current = callback` in the render body. The `useEffect` only references the ref, not the callback directly, so callbacks can change without triggering effect re-runs.

**When to use:** Any hook that sets up a long-lived listener (event listener, Socket.IO subscription) where the callback may change identity between renders. Already used in `useTerminalSocket` for `onTerminalOutput`, `onTerminalReset`, `onSessionExit`.

**Apply to:** `useGlobalHotkeys` (callbacks ref pattern keeps the `document` event listener from being torn down and re-added on every render).

### Pattern 3: Props-Down for Cross-Component Data

**What:** Data computed in `App.tsx` (from hooks) is passed down as props to child components (`TerminalView`, `InstanceTabBar`). No shared state store, no context.

**When to use:** Data flows from one parent to specific children. The project's existing approach — `App.tsx` orchestrates all state, components receive props.

**Apply to:** `contextPressure` / `agentState` passed into `TerminalView`, `permissionBadgeSessions` passed into `InstanceTabBar`.

**Avoid:** Adding React Context or a state manager for this data — it is not shared across multiple unrelated component trees.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Detecting Permission Prompts with tmux capture-pane Poll

**What people do:** Poll `GET /api/gsd/agents/live-status` and add permission-prompt detection to `detectAgentState()` server-side, surfacing it via the live-status response.

**Why it's wrong:** `detectAgentState()` already does this (it matches `permission|allow|dangerous` and returns `'permission_prompt'`), but it runs on a 5-second polling cycle. Permission prompt detection must be near-real-time (within 5 seconds per spec). The PTY `onData` tap fires within milliseconds of the output arriving. Using the poll-based path would require the badge to wait up to 5 seconds and would fire unreliably depending on poll timing.

**Do this instead:** Detect via PTY tap in `TerminalStreamService.onData()` and emit a Socket.IO event. The live-status `state` field can still show `'permission_prompt'` for the GSD Agents tab — it is a separate signal for a different consumer.

### Anti-Pattern 2: Loading SearchAddon Outside the Terminal Init useEffect

**What people do:** Create `new SearchAddon()` at module scope or in a separate `useEffect`, then try to call `terminal.loadAddon(searchAddon)` after the terminal has been created.

**Why it's wrong:** `terminal.loadAddon()` must be called before `terminal.open()`, or the addon's decorations may not be properly registered. `TerminalView` initializes the terminal in a single `useEffect` — all addons must be loaded within that same effect.

**Do this instead:** Create `SearchAddon` inside the terminal init `useEffect`, call `terminal.loadAddon(searchAddon)` alongside `FitAddon` and `WebLinksAddon`, and store the instance in a `searchAddonRef`.

### Anti-Pattern 3: Intercepting Ctrl+F Before Checking Terminal Focus

**What people do:** Add `document.addEventListener('keydown', ...)` that captures `Ctrl+F` globally without checking whether the search overlay is already open or whether focus is in another input.

**Why it's wrong:** If `isSearchOpen` is already true, toggling it closed on a second Ctrl+F is unexpected behavior. If focus is in `PromptPanel`'s textarea, Ctrl+F should open the browser's built-in find dialog (or do nothing for the textarea), not open the terminal search overlay.

**Do this instead:** Check `isSearchOpen` before acting on Ctrl+F. Check `event.target` for input elements before handling any shortcut. The terminal canvas is a `<div>`, not an `<input>`, so the focus guard naturally excludes the prompt textarea and other inputs.

### Anti-Pattern 4: Forgetting to Refocus Terminal After Search Close

**What people do:** Close the search overlay but leave focus on the overlay's input field, which is about to be unmounted.

**Why it's wrong:** After unmounting a focused DOM element, focus is lost entirely (goes to `document.body`). The operator then has to click on the terminal to resume typing.

**Do this instead:** In `TerminalSearchOverlay.onClose()` and the Escape keydown handler, call `terminalInstanceRef.current?.focus()` after setting `isSearchOpen(false)`. A `requestAnimationFrame` delay ensures the overlay is unmounted before focus is moved.

### Anti-Pattern 5: Passing Session Index to useGlobalHotkeys as State

**What people do:** Compute `selectedIndex` in `App.tsx` and pass it to `useGlobalHotkeys` as a dependency, causing the hook's effect to re-run (and the event listener to be torn down and re-added) on every tab switch.

**Why it's wrong:** The event listener should be registered once. Adding it as a dep causes churn.

**Do this instead:** Use the callback ref pattern. `sessions` and all callbacks are stored in a `useRef` inside `useGlobalHotkeys` and updated on every render without triggering the effect. The event listener is registered once in `useEffect` with empty deps `[]`.

---

## Scaling Considerations

This is a single-operator dashboard. Scaling concerns are minimal.

| Concern | Approach |
|---------|----------|
| PTY tap performance | Regex test per chunk is O(n) on chunk length, ~microseconds. Negligible at < 10 concurrent sessions. |
| Permission prompt false positives | Broad initial regex is acceptable for Phase 19. Tighten in Phase 20 after observing real Claude Code output. |
| Multiple browser tabs with search open | Each tab has its own xterm.js instance and `SearchAddon` — fully independent. No coordination needed. |
| useAgentLiveStatus poll frequency | Already 5s. Context pressure badge updates at this cadence — acceptable. No change needed. |
| Notification API permission request | Request is shown at most once (browser remembers the answer). No server-side component. |

---

## Sources

All findings from direct codebase inspection (HIGH confidence) and npm registry (HIGH confidence):

- `src/server/services/TerminalStreamService.ts` — `SharedPtySession` interface, `onData` broadcast loop, `setupSocketInputHandlers` pattern
- `src/client/components/TerminalView.tsx` — addon loading in init `useEffect`, existing header bar structure, `FitAddon`/`WebLinksAddon` loading pattern
- `src/client/hooks/useTerminalSocket.ts` — callback ref stability pattern, `terminal:reset`/`terminal:exit` event handling
- `src/client/hooks/useAgentLiveStatus.ts` — existing data shape `{ contextPressure, contextPressureLevel, state }`
- `src/server/routes/gsdRoutes.ts` — `extractContextPressure()` implementation, live-status endpoint
- `src/shared/gsdTypes.ts` — `AgentStateHint`, `PressureLevel` types already defined and correct
- `src/client/App.tsx` — `useSessionSelection`, `activeInstances` derivation, `selectedInstance` lookup pattern, `showSidebar` state
- `src/client/components/InstanceTabBar.tsx` — tab rendering structure, badge insertion point
- `package.json` — confirmed `@xterm/addon-fit@^0.10.0`, `@xterm/addon-web-links@^0.11.0` as devDependencies
- npm registry: `@xterm/addon-search@0.16.0` — latest stable, requires xterm.js v4+, compatible with v5.3.0 [MEDIUM confidence — verified via `npm info` but not installed and integration-tested]
- `.planning/milestones/v3.0-SCOPE.md` — feature specifications and technical notes

---

*Architecture research for: Warden v3.0 Operator Awareness & Terminal Power Tools*
*Researched: 2026-03-03*
