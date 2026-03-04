# Phase 19: Operator Awareness Wiring - Research

**Researched:** 2026-03-03
**Domain:** React UI wiring — tab badges, terminal header indicators, global keyboard shortcuts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Permission badge on tabs**
- Subtle ~8px amber dot in the tab corner, gentle pulse animation
- Similar to a Slack unread indicator — visible but not aggressive
- Dot disappears when the agent leaves permission state (polling-driven)
- Single-operator dashboard context: the operator is watching, so subtlety works

**Context pressure display**
- Percentage text only (e.g., "72%"), no progress bar or icon
- Color-coded by threshold: green (<70%), amber (70-89%), pulsing red (>=90%)
- Show "—" em-dash when pressure data is unavailable (not "0%", not hidden)
- Matches terminal aesthetic — clean, data-dense

**Agent state chip**
- Pill badge style with colored background (not plain text, not icon+text)
- States: working / idle / permission / error
- Color per state determined by Claude (should be distinct and readable on dark theme)
- Text label inside the pill — no separate icon needed

**Terminal header layout**
- New indicators grouped on the right side of the header bar
- Session name stays on the left — clean left-to-right hierarchy: identity → status
- Order within right group: state chip first, then context pressure
- State chip is more actionable (scanned first), pressure is monitoring info

**Keyboard shortcuts**
- Ctrl+1 through Ctrl+9 switch to tab by index; out-of-range numbers silently ignored (no-op)
- Ctrl+[ and Ctrl+] cycle tabs with wrap-around (last→first, first→last)
- Ctrl+B toggles AgentSidebar
- Escape focuses terminal canvas (when search overlay not open)
- Ctrl+F prevents browser native find bar, does nothing else (stub for Phase 20)
- No visual feedback on shortcut activation — the action is the feedback
- Focus guard: shortcuts don't fire when cursor is in text input or textarea

**State detection**
- Poll ALL sessions, not just the active one (background tab badges are the core value)
- Unknown/unavailable pressure displays "—" em-dash

### Claude's Discretion
- Pulse animation style (opacity, scale, duration, easing)
- Polling interval for state detection (balance responsiveness vs resources)
- Permission badge clearing strategy (immediate on input vs next poll cycle)
- Responsive behavior at narrow widths (collapse, hide, or adapt indicators)
- Tooltip presence and content on header indicators
- Exact colors for each agent state (working, idle, permission, error)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 19 is **prop-wiring**, not new data infrastructure. The `useAgentLiveStatus` hook already exists and polls `/api/gsd/agents/live-status` every 5 seconds, returning a `Map<agentId, { state, contextPressure, contextPressureLevel }>`. The `StateBadge` and `PressureIndicator` components already exist in `gsdShared.tsx`. The only real work is: (1) calling `useAgentLiveStatus` at `App.tsx` level and threading props down to `InstanceTabBar` and `TerminalView`; (2) adding a permission badge dot to the tab bar; (3) adding state chip and pressure text to the terminal view header; (4) building a `useGlobalHotkeys` hook with focus guard; and (5) tightening the permission detection regex.

The critical architectural constraint is that `useAgentLiveStatus` keys by **agentId** but `InstanceTabBar` and `TerminalView` work with **tmuxSessionName**. The instances list in `App.tsx` provides the bridge: `instance.agentId → instance.tmuxSessionName`. The simplest wiring is to pass a `Map<tmuxSessionName, AgentLiveStatus>` as a prop, constructed by joining on `instances`.

For keyboard shortcuts, the pattern is a single `useGlobalHotkeys` hook in `App.tsx` with `document.addEventListener('keydown', ...)` + a focus guard (`event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement`). This is explicitly called out as acceptable in the Out of Scope section (no external library — custom useEffect is <50 LOC).

**Primary recommendation:** Call `useAgentLiveStatus()` in `App.tsx` (one call), build a `sessionStatusMap` by joining on `instances`, pass it as a prop to `InstanceTabBar` and `TerminalView`, then build `useGlobalHotkeys` as a self-contained hook consuming App-level state setters.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 (installed) | UI rendering | Already in project |
| Tailwind CSS v4 | ^4.0.0 (installed) | Utility classes + @theme tokens | Already in project — use `warden-*` tokens |
| xterm.js | ^5.3.0 (installed) | Terminal canvas (focus target for Escape shortcut) | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None (new) | — | No new npm deps needed | All capabilities from installed packages |

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure

Phase 19 touches these files:

```
src/client/
├── App.tsx                        # ADD: useAgentLiveStatus() call + sessionStatusMap + useGlobalHotkeys wiring
├── hooks/
│   └── useGlobalHotkeys.ts        # NEW: keyboard shortcut hook with focus guard
├── components/
│   ├── InstanceTabBar.tsx         # MODIFY: accept sessionStatusMap prop, render permission badge dot
│   └── TerminalView.tsx           # MODIFY: accept AgentLiveStatus prop, render state chip + pressure
```

### Pattern 1: useAgentLiveStatus Lift-and-Join

**What:** Call `useAgentLiveStatus()` once in `App.tsx`, join with `activeInstances` to produce `Map<tmuxSessionName, AgentLiveStatus>`, pass as props.

**Why:** The hook currently lives inside `AgentsTab` which is only rendered when the GSD view is open. For permission badges on terminal tabs to work on ALL sessions (including background ones), the hook must run at the top level regardless of which view is active.

**Proof from STATE.md:**
> [v3.0 Research]: Call useAgentLiveStatus in App.tsx (not only in AgentsTab) — props-down to TerminalView and InstanceTabBar; safe because hook uses JSON comparison dedup

**Example:**
```typescript
// In App.tsx
import { useAgentLiveStatus } from './hooks/useAgentLiveStatus.js';

// Inside App():
const liveStatus = useAgentLiveStatus();  // Map<agentId, AgentLiveStatus>

// Build session-keyed map for components that work with session names
const sessionStatusMap = useMemo(() => {
  const map = new Map<string, AgentLiveStatus>();
  for (const instance of activeInstances) {
    const status = liveStatus.get(instance.agentId);
    if (status) {
      map.set(instance.tmuxSessionName, status);
    }
  }
  return map;
}, [liveStatus, activeInstances]);

// Pass to consumers
<InstanceTabBar
  instances={activeInstances}
  selectedSessionName={selectedSessionName}
  onSelectSession={handleSelectSession}
  onSessionStopped={handleSessionStopped}
  sessionStatusMap={sessionStatusMap}   // NEW prop
/>
<TerminalView
  tmuxSessionName={selectedSessionName}
  onSessionExit={handleSessionExit}
  agentLiveStatus={sessionStatusMap.get(selectedSessionName ?? '') ?? null}  // NEW prop
/>
```

**Note on dedup:** `useAgentLiveStatus` already uses JSON.stringify comparison to avoid re-renders when data is unchanged. Lifting to App.tsx does not increase render frequency.

### Pattern 2: Permission Dot in InstanceTabBar

**What:** Render a small absolute-positioned amber dot on the tab when the session's agent state is `'permission_prompt'`.

**Implementation:** The tab container div needs `relative` positioning (already has it via className composition). The dot is an absolutely positioned element in the top-right corner of the tab div.

**Example:**
```typescript
// In InstanceTabBar.tsx
interface InstanceTabBarProps {
  // ...existing props...
  sessionStatusMap?: Map<string, AgentLiveStatus>;
}

// Inside the instance.map() loop:
const agentStatus = sessionStatusMap?.get(instance.tmuxSessionName);
const hasPermissionBadge = agentStatus?.state === 'permission_prompt';

// In JSX — on the outer tab div, add relative positioning and the dot:
<div className="relative flex items-center gap-2 px-3 py-1.5 ...">
  {hasPermissionBadge && (
    <span
      className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warden-warning animate-pulse"
      title="Waiting for permission input"
    />
  )}
  {/* existing tab content */}
</div>
```

**Note on clearing:** The dot disappears automatically on the next poll cycle when `detectAgentState()` no longer returns `'permission_prompt'`. The user context says "dot disappears when the agent leaves permission state (polling-driven)" — no immediate clearing on input needed.

**Note on tab layout:** The outer tab `<div>` already has `relative` implied; verify with `position: relative` explicitly, or add `relative` to className. The Stop button sits inside this div, so the absolute dot must use a small enough offset to not overlap interactive elements.

### Pattern 3: Terminal Header State Chip + Pressure

**What:** Extend the existing terminal header `<div>` in `TerminalView.tsx` to show state chip and context pressure on the right side.

**Current header structure (lines 510-525 of TerminalView.tsx):**
```tsx
<div className="flex items-center justify-between px-3 py-1.5 bg-warden-panel border-b border-warden-border">
  <div className="flex items-center gap-2">
    {/* connection dot + session name */}
  </div>
  <div className="flex items-center gap-2">
    {/* Aa font size button + hint text */}
  </div>
</div>
```

**Extension:** Add state chip and pressure text between existing right-side elements:
```typescript
// TerminalView.tsx prop
import type { AgentLiveStatus } from '../hooks/useAgentLiveStatus.js';

interface TerminalViewProps {
  tmuxSessionName: string;
  onSessionExit: (sessionName: string, exitCode: number) => void;
  agentLiveStatus?: AgentLiveStatus | null;   // NEW optional prop
}

// In the right-side flex group, insert before the font-size button:
{agentLiveStatus && (
  <>
    <StateBadge state={agentLiveStatus.state} />
    <PressureIndicator
      percentage={agentLiveStatus.contextPressure}
      level={agentLiveStatus.contextPressureLevel}
    />
    <span className="w-px h-3 bg-warden-border/50" />  {/* divider */}
  </>
)}
```

**Reuse gsdShared.tsx:** `StateBadge` and `PressureIndicator` are already exported from `src/client/components/gsdShared.tsx`. Import them directly — no duplication.

**Pulsing red for >=90% critical pressure:** `PressureIndicator` currently returns `text-warden-error` for `critical`. The user decision requires pulsing red at >=90%. Two options:
1. Add `animate-pulse` to `PressureIndicator` when level === 'critical'
2. Extend `PRESSURE_COLORS` to include the animate class

**Important:** The `extractContextPressure` function in `gsdRoutes.ts` currently maps `>= 80%` to `critical` and `>= 50%` to `warning`. The user requirement says `>= 90%` should be pulsing red and `70-89%` should be amber. The thresholds in `extractContextPressure` need adjustment:
- ok: < 70%
- warning: 70-89%
- critical: >= 90%

This is a one-line change in `gsdRoutes.ts`.

### Pattern 4: useGlobalHotkeys Hook

**What:** A React hook that registers a `keydown` listener on `document`, fires action callbacks for specific Ctrl+ combinations, and includes a focus guard to skip when cursor is in a text input.

**Out of Scope confirmation (REQUIREMENTS.md):**
> react-hotkeys-hook or external keyboard library — Custom useEffect is <50 LOC; no dependency justified

**Focus guard pattern (HIGH confidence — standard DOM API):**
```typescript
function isInTextInput(target: EventTarget | null): boolean {
  if (!target) return false;
  const tag = (target as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (target as HTMLElement).isContentEditable;
}
```

**Key detection for Ctrl+[, Ctrl+]:**
- `event.key === '[' && event.ctrlKey` → previous tab
- `event.key === ']' && event.ctrlKey` → next tab
- Note: On some keyboard layouts, these may not fire as expected; use `event.code` if needed (`BracketLeft`, `BracketRight`)

**Ctrl+F stub:**
```typescript
// Prevent browser find bar; do nothing (Phase 20 will attach search overlay)
if (event.ctrlKey && event.key === 'f') {
  event.preventDefault();
  return;
}
```

**Hook signature:**
```typescript
// src/client/hooks/useGlobalHotkeys.ts
interface UseGlobalHotkeysParams {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  terminalRef: React.RefObject<Terminal | null>;  // for Escape focus
  currentView: AppView;
}
```

**Complete hook skeleton:**
```typescript
import { useEffect } from 'react';
import type { AgentInstance } from '@shared/types.js';
import type { AppView } from '../App.js';  // export this type

function isInTextInput(target: EventTarget | null): boolean {
  if (!target) return false;
  const element = target as HTMLElement;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

export function useGlobalHotkeys({
  instances,
  selectedSessionName,
  onSelectSession,
  onToggleSidebar,
  terminalRef,
  currentView,
}: UseGlobalHotkeysParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Focus guard: never intercept when typing in a text input
      if (isInTextInput(event.target)) return;

      if (!event.ctrlKey) return;

      if (event.key === 'f') {
        event.preventDefault();
        return;  // Phase 20 stub
      }

      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        onToggleSidebar();
        return;
      }

      if (currentView === 'terminals') {
        // Ctrl+1..9 — switch to tab by 1-based index
        const digit = parseInt(event.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= 9) {
          event.preventDefault();
          const target = instances[digit - 1];
          if (target) {
            onSelectSession(target.tmuxSessionName);
          }
          return;
        }

        // Ctrl+[ — previous tab
        if (event.key === '[') {
          event.preventDefault();
          const currentIndex = instances.findIndex(
            (i) => i.tmuxSessionName === selectedSessionName
          );
          if (currentIndex > 0) {
            onSelectSession(instances[currentIndex - 1].tmuxSessionName);
          } else if (instances.length > 0) {
            onSelectSession(instances[instances.length - 1].tmuxSessionName);  // wrap
          }
          return;
        }

        // Ctrl+] — next tab
        if (event.key === ']') {
          event.preventDefault();
          const currentIndex = instances.findIndex(
            (i) => i.tmuxSessionName === selectedSessionName
          );
          if (currentIndex < instances.length - 1) {
            onSelectSession(instances[currentIndex + 1].tmuxSessionName);
          } else if (instances.length > 0) {
            onSelectSession(instances[0].tmuxSessionName);  // wrap
          }
          return;
        }

        // Escape — focus terminal canvas
        // Note: Escape key does not trigger ctrlKey, handle outside ctrlKey block
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isInTextInput(event.target)) return;
      if (currentView !== 'terminals') return;
      // Phase 20 condition: if search overlay is not open (always true in Phase 19)
      event.preventDefault();
      terminalRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [instances, selectedSessionName, onSelectSession, onToggleSidebar, terminalRef, currentView]);
}
```

**Important:** The two listeners can be merged into one; shown separately for clarity. Merge for cleaner implementation.

**Terminal ref challenge:** `terminalInstanceRef` is a `useRef<Terminal | null>` that lives inside `TerminalView`. To call `terminal.focus()` from `App.tsx`, you need to either: (a) pass a `focusTerminal` callback prop out of `TerminalView`, or (b) pass the `terminalRef` directly (ref forwarding). Option (a) via `onFocusRequest` callback prop on `TerminalView` is cleaner and avoids ref forwarding complexity. `App.tsx` calls `useGlobalHotkeys` with `onFocusTerminal` callback; `TerminalView` accepts `onFocusRequest` prop and wires it to `terminal.focus()` internally.

### Pattern 5: xterm.js Keyboard Event Interaction

**Critical pitfall from STATE.md:**
> [v3.0 Research]: document.addEventListener + stopPropagation() defense for global shortcuts — xterm canvas events bubble to document; without guard, tab-switch shortcuts send escape sequences to PTY

xterm.js intercepts most keystrokes on the terminal canvas and emits them to the PTY **and** lets them bubble up to `document`. For shortcuts like `Ctrl+1`, this means both the tab switch fires AND `^1` is sent to the PTY.

**Solution:** In `useGlobalHotkeys`, add `event.stopPropagation()` after `event.preventDefault()` when the shortcut is handled. This prevents the event from reaching xterm.js's own listeners that would forward it to the PTY.

Actually, the propagation order is: `document` listeners fire before `element` listeners for capture-phase, but for bubble-phase (which is default), `element` listeners fire first. Since xterm.js attaches to the terminal canvas element, document-level bubble-phase listeners fire **after** xterm has already processed the key. The solution is to use the **capture phase** for the global hotkeys listener:

```typescript
document.addEventListener('keydown', handleKeyDown, { capture: true });
```

With capture-phase registration, the global handler fires first (before xterm.js sees the event), and calling `event.stopPropagation()` prevents xterm from processing it.

**Alternatively**, xterm.js provides `attachCustomKeyEventHandler`:
```typescript
terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  if (event.ctrlKey && ['1','2','3','4','5','6','7','8','9','[',']','b','B','f'].includes(event.key)) {
    return false;  // Tell xterm to ignore this key
  }
  return true;
});
```

The `attachCustomKeyEventHandler` approach is more surgical — it runs inside xterm and suppresses PTY forwarding for the listed keys, while the `document.addEventListener` with capture handles the actual navigation. Use both together for guaranteed correctness.

**Ctrl+F specifically:** From STATE.md:
> [v3.0 Research]: attachCustomKeyEventHandler for Ctrl+F requires both event.preventDefault() AND return false — missing either opens browser native find bar or injects to PTY

### Anti-Patterns to Avoid

- **Calling useAgentLiveStatus in TerminalView or InstanceTabBar:** Creates duplicate polling intervals (one per component). Call once in App.tsx and pass props down.
- **Keying liveStatus by sessionName at hook level:** The existing hook keys by agentId. Build the sessionName→status join in App.tsx with `useMemo`, not inside the hook.
- **Using `event.key === 'Control'` + timeout for Ctrl+ combos:** Always check `event.ctrlKey === true` on the key event directly.
- **Listening on `window` instead of `document` for keyboard events:** Both work, but `document` is the more common target. Pick one and be consistent.
- **Missing `{ capture: true }` on the global hotkey handler:** Without capture phase, xterm.js processes the key first and sends it to the PTY before the navigation fires.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab badge animation | Custom keyframe CSS | Tailwind `animate-pulse` | Already in Tailwind, one class |
| State display chip | New component | Existing `StateBadge` in gsdShared.tsx | Already built, correct styling |
| Pressure display | New component | Existing `PressureIndicator` in gsdShared.tsx | Already built with null handling |
| Agent state data | New API endpoint | Existing `/api/gsd/agents/live-status` | Already returns all needed data |
| State polling | New polling hook | Existing `useAgentLiveStatus` | Already has dedup, 5s interval |
| Keyboard library | react-hotkeys-hook | Custom 40-line useGlobalHotkeys | Explicitly out of scope per REQUIREMENTS.md |

**Key insight:** The entire data pipeline (API → server → hook → Map) already exists. Phase 19 is prop threading + UI additions.

---

## Common Pitfalls

### Pitfall 1: liveStatus Key Mismatch

**What goes wrong:** `useAgentLiveStatus` returns `Map<agentId, AgentLiveStatus>`, but `InstanceTabBar` tabs are keyed by `tmuxSessionName`. Passing the raw map to InstanceTabBar and looking up by sessionName returns `undefined` for all sessions.

**Why it happens:** Forgetting that liveStatus uses agentId as the key (matching the GSD registry convention), not the tmux session name.

**How to avoid:** Build a `sessionStatusMap = Map<tmuxSessionName, AgentLiveStatus>` in App.tsx via `useMemo`, joining through `activeInstances` which has both `.agentId` and `.tmuxSessionName`. Pass this derived map to consumers.

**Warning signs:** Permission badge never appears; console shows `undefined` when logging `sessionStatusMap.get(sessionName)`.

### Pitfall 2: detectAgentState Permission Regex False Positives

**What goes wrong:** The current permission regex `/permission|allow|dangerous/i` matches lines from `npm install`, `git allow-unrelated-histories`, and other shell output, causing false permission badges.

**Current code (gsdRoutes.ts line 31):**
```typescript
if (/permission|allow|dangerous/i.test(pane)) return 'permission_prompt';
```

**From STATE.md:**
> [v3.0 Research]: Tighten detectAgentState() permission regex to /Do you want to proceed\?|❯\s+1\.\s+Yes/i — reduces badge noise from npm install and shell prompts

**How to avoid:** Tighten the regex in `detectAgentState` as part of this phase:
```typescript
if (/Do you want to proceed\?|❯\s*1\.\s*Yes/i.test(pane)) return 'permission_prompt';
```

**Warning signs:** Permission badge appears and disappears erratically during normal working operation.

### Pitfall 3: Keyboard Shortcuts Fire in xterm Canvas

**What goes wrong:** Pressing Ctrl+1 to switch tabs also sends `^1` to the PTY because xterm.js processes the keydown event on the canvas before (or alongside) the document listener.

**How to avoid:** Register the global handler with `{ capture: true }` so it fires before xterm.js, and call both `event.preventDefault()` and `event.stopPropagation()`. Additionally, call `terminal.attachCustomKeyEventHandler()` inside `TerminalView` to return `false` for hotkey combinations.

**Warning signs:** Switching tabs with Ctrl+N causes visible PTY input artifacts.

### Pitfall 4: contextPressure Threshold Mismatch

**What goes wrong:** The server-side `extractContextPressure` uses thresholds of 80%/50% for critical/warning, but the UX requirements specify 90%/70%. The client-side color logic will show the wrong colors.

**How to avoid:** Update `extractContextPressure` in `gsdRoutes.ts`:
```typescript
const level: PressureLevel = percentage >= 90 ? 'critical' : percentage >= 70 ? 'warning' : 'ok';
```

**Warning signs:** 75% shows as green instead of amber; 85% shows as amber instead of green.

### Pitfall 5: Escape Shortcut Conflicts with xterm Escape

**What goes wrong:** Intercepting `Escape` at the document level prevents xterm from receiving Escape key input, breaking TUI applications that use Escape (vim, claude TUI menus).

**How to avoid:** Only intercept Escape when: (a) terminal does NOT have focus (operator is in a UI input somewhere else), or (b) a search overlay is open (Phase 20). In Phase 19, the safest approach is: only call `terminal.focus()` if the terminal doesn't already have focus. Do NOT call `event.preventDefault()` or `event.stopPropagation()` for the Escape handler — just refocus if needed.

Actually the correct behavior: if focus is on the terminal canvas already, Escape goes to PTY normally. Only if focus is elsewhere (e.g. on a button) does the Escape shortcut re-focus the terminal. This means no `preventDefault()` on the Escape handler in Phase 19.

### Pitfall 6: useMemo Missing activeInstances in Deps

**What goes wrong:** The `sessionStatusMap` useMemo has `[liveStatus, activeInstances]` as deps but React sees a new `activeInstances` array on every render (from `instances.filter(...)`), causing the memo to recompute every render.

**How to avoid:** The `activeInstances` filter is already in App.tsx's render body. Either memoize it separately with `useMemo`, or accept that `sessionStatusMap` recomputes when instances change (which is infrequent and correct).

---

## Code Examples

### Permission Badge Dot (Tailwind animate-pulse)

```tsx
// In InstanceTabBar — minimal amber pulse dot
{hasPermissionBadge && (
  <span
    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-warden-warning animate-pulse"
    aria-label="Waiting for permission"
  />
)}
```

The outer tab container `<div>` must have `relative` in its className. The existing `className` string does not include it — add `relative` to the tab container.

### State Chip for TerminalView Header

The existing `StateBadge` from gsdShared renders `px-2 py-0.5 rounded text-xs font-mono`. For the terminal header at xs text size, this is slightly tall. Options:
1. Use StateBadge directly (consistent with AgentsTab appearance)
2. Inline a smaller variant with `py-0` or `text-[10px]`

Recommendation: Use `StateBadge` directly for DRY compliance. The xs size is appropriate in the header bar.

### Pressure Text for TerminalView Header

`PressureIndicator` currently returns `font-mono text-sm`. For the terminal header, this may be slightly large relative to other header text (`text-[10px]`, `text-xs`). Consider passing a size override. Since we're reusing the existing component, accept the `text-sm` styling (consistent with AgentsTab) or create an inline version:

```tsx
// Inline pressure display in terminal header (no size mismatch issues)
function headerPressureText(percentage: number | null, level: PressureLevel | null) {
  if (percentage === null) return <span className="text-[10px] text-warden-text-dim">—</span>;
  const colorClass = level === 'critical' ? 'text-warden-error animate-pulse'
    : level === 'warning' ? 'text-warden-warning'
    : 'text-warden-success';
  return <span className={`text-[10px] font-mono ${colorClass}`}>{percentage}%</span>;
}
```

This is preferable to modifying `PressureIndicator` in gsdShared (which is used in AgentsTab with `text-sm`).

### Global Hotkey Hook Registration

```typescript
// Capture phase ensures this fires before xterm.js
document.addEventListener('keydown', handleKeyDown, { capture: true });
return () => {
  document.removeEventListener('keydown', handleKeyDown, { capture: true });
  // IMPORTANT: removeEventListener must also pass { capture: true } to match
};
```

### TerminalView: Expose Focus Callback

```typescript
// TerminalView props
interface TerminalViewProps {
  tmuxSessionName: string;
  onSessionExit: (sessionName: string, exitCode: number) => void;
  agentLiveStatus?: AgentLiveStatus | null;
  onFocusRequest?: () => void;    // NEW: called when App wants to focus terminal
}

// Inside TerminalView — useEffect to wire onFocusRequest:
useEffect(() => {
  if (!onFocusRequest) return;
  // Expose focus capability upward. When onFocusRequest is called by App,
  // tell xterm to focus (if terminal instance is mounted).
  // Implementation: just call onFocusRequest on mount and update ref.
}, [onFocusRequest]);

// Simpler: just expose a ref approach via callback ref pattern.
// Actually cleanest: accept an onFocusRequest prop and call it inside TerminalView
// by registering it so App can call it. This requires a ref to a callback:
const onFocusRequestRef = useRef(onFocusRequest);
onFocusRequestRef.current = onFocusRequest;
// Then in the keydown handler OR pass via useImperativeHandle + forwardRef.

// SIMPLEST: Just add a `focusTerminal` callback that App receives via useState/useRef
// and TerminalView registers it on mount via useEffect calling a parent setter.
```

**Recommended approach:** Add a `terminalFocusRef: React.MutableRefObject<(() => void) | null>` prop to `TerminalView`. Inside TerminalView's terminal initialization effect, set `terminalFocusRef.current = () => terminal.focus()`. In App.tsx, create `const terminalFocusRef = useRef<(() => void) | null>(null)` and pass it down. `useGlobalHotkeys` calls `terminalFocusRef.current?.()` for Escape.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-component live status hooks | Single hook in App.tsx, props down | Phase 19 (this phase) | Eliminates duplicate polling |
| Loose permission regex | Tighter Claude-specific regex | Phase 19 (this phase) | Fewer false permission badges |
| 80%/50% pressure thresholds | 90%/70% per UX requirements | Phase 19 (this phase) | Correct color coding |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AWARE-01 | Operator sees a pulsing amber badge on the session tab when an agent is waiting for permission input | `useAgentLiveStatus` data already flows from `detectAgentState()`; add amber dot to InstanceTabBar tab div when `state === 'permission_prompt'`. Use Tailwind `animate-pulse` + `bg-warden-warning`. |
| AWARE-02 | Badge clears automatically when operator sends input to the waiting session | Badge is polling-driven (5s interval); clears on next poll after agent state changes. No explicit clear logic needed. Confirmed by user decisions: "polling-driven". |
| AWARE-03 | Operator sees context window pressure percentage in terminal view header for the active session | Pass `agentLiveStatus` prop to `TerminalView`; render inline percentage text in terminal header. Show "—" when null. |
| AWARE-04 | Context pressure badge shows green (<70%), amber (70-89%), or pulsing red (>=90%) | Fix thresholds in `extractContextPressure` (gsdRoutes.ts); add `animate-pulse` class for critical level in header display. |
| AWARE-05 | Operator sees the agent state (working/idle/error/permission) as a chip in terminal view header | Reuse `StateBadge` from gsdShared.tsx in TerminalView header. Already handles null state with "—" fallback. |
| KB-01 | Ctrl+1 through Ctrl+9 switch to the corresponding session tab by index | `useGlobalHotkeys` hook: parse `event.key` as digit 1-9 when `event.ctrlKey`; call `onSelectSession(instances[digit-1].tmuxSessionName)`. Out-of-range silently no-ops. |
| KB-02 | Ctrl+[ and Ctrl+] cycle through session tabs (previous/next) | `useGlobalHotkeys` hook: `event.key === '['` / `']'`; find current index in instances; wrap with modulo. |
| KB-03 | Ctrl+B toggles the AgentSidebar collapsed/expanded | `useGlobalHotkeys` hook: `event.key === 'b'`; call `onToggleSidebar()`. `showSidebar` state already exists in App.tsx. |
| KB-04 | Escape focuses the terminal canvas when search overlay is not open | `useGlobalHotkeys` hook: `event.key === 'Escape'`; call `terminalFocusRef.current?.()`. No `preventDefault` — Escape must still reach PTY when terminal has focus. |
| KB-05 | Keyboard shortcuts do not fire when focus is in a text input or textarea (focus guard) | `isInTextInput(event.target)` guard at top of keydown handler: check `tagName === 'INPUT' || tagName === 'TEXTAREA' || isContentEditable`. |
</phase_requirements>

---

## Open Questions

1. **Permission badge clearing on operator input (AWARE-02)**
   - What we know: User context says "polling-driven" clearing. `useAgentLiveStatus` polls every 5s.
   - What's unclear: Should there be an immediate optimistic clear when the operator types (before next poll confirms)?
   - Recommendation: Start with polling-only clearing (simpler, correct). The 5-second max delay is acceptable for a single-operator dashboard. If it feels laggy in testing, add optimistic clearing: in `handleSelectSession`, call a `clearPermissionBadge(sessionName)` that temporarily zeros the badge in local state.

2. **Ctrl+[ vs Ctrl+] across international keyboard layouts**
   - What we know: `[` and `]` are typically on QWERTY keyboards. The researcher does not have information about non-QWERTY behavior.
   - What's unclear: Do `event.key` values change on German/French keyboards?
   - Recommendation: Also handle `event.code === 'BracketLeft'` and `event.code === 'BracketRight'` as fallbacks. `event.code` is layout-independent.

3. **Escape key and xterm focus conflict**
   - What we know: If terminal already has focus, Escape must go to the PTY. If another element has focus, Escape should refocus terminal.
   - What's unclear: How to reliably detect "terminal has focus" — `document.activeElement` points to the xterm canvas element, but that's nested in a div.
   - Recommendation: Check `!terminalContainerRef.current?.contains(document.activeElement)` before calling `terminal.focus()`. If terminal container already contains the active element, skip (Escape goes to PTY naturally).

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` not present in `.planning/config.json`.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all claims verified against actual source files
  - `src/client/hooks/useAgentLiveStatus.ts` — confirmed hook signature, polling interval, Map<agentId> keying
  - `src/server/routes/gsdRoutes.ts` — confirmed `detectAgentState()` and `extractContextPressure()` implementations + threshold values
  - `src/client/components/gsdShared.tsx` — confirmed `StateBadge`, `PressureIndicator`, `STATE_BADGE_COLORS`, `PRESSURE_COLORS`
  - `src/client/App.tsx` — confirmed `showSidebar`, `setShowSidebar`, `handleSelectSession`, prop interface for InstanceTabBar/TerminalView
  - `src/client/components/InstanceTabBar.tsx` — confirmed current tab structure, className patterns
  - `src/client/components/TerminalView.tsx` — confirmed header structure, terminal instance ref pattern
  - `.planning/STATE.md` — confirmed v3.0 research decisions (liveStatus lift, regex tightening, capture phase)
  - `.planning/REQUIREMENTS.md` — confirmed Out of Scope: no keyboard library, no raw PTY regex

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 `animate-pulse` utility — standard utility class, verified in project's `devDependencies`
- DOM `KeyboardEvent` capture phase behavior — standard DOM specification, HIGH confidence from prior knowledge

### Tertiary (LOW confidence)
- International keyboard layout behavior for `[` / `]` keys — not verified; flagged as Open Question

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed; no new deps needed
- Architecture: HIGH — code read directly; prop threading is straightforward; patterns extracted from actual file structure
- Pitfalls: HIGH — most identified from STATE.md v3.0 research decisions and direct code review
- Permission regex tightening: HIGH — explicitly stated in STATE.md with the recommended regex

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable stack; Tailwind/React/xterm APIs are not fast-moving)
