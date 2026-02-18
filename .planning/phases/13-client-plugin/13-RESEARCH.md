# Phase 13: Client Plugin - Research

**Researched:** 2026-02-18
**Domain:** React plugin file, custom fetch hooks, Socket.IO client, clipboard API, optimistic UI
**Confidence:** HIGH

---

## Summary

Phase 13 implements a single file — `src/client/plugins/gsd-manager-plugin.tsx` — that registers into the existing plugin system's `bottom-panel` slot and provides a tabbed GSD Control Center UI. Every API endpoint, Socket.IO namespace, and data type this phase needs already exists and is verified working from Phase 12. The backend is complete. This phase is pure client work: fetch hooks, a Socket.IO hook for the `/gsd-hooks` namespace, and a panel UI organized into four sections (Agent Grid, Spawn/Command forms, Registry table, Hook feed).

The plugin `PanelComponent` receives zero props by contract (`ComponentType` with no generic argument in `pluginTypes.ts`). For operations that need the selected terminal session name (e.g., pre-filling a command target), the plugin must fetch `/api/instances` internally rather than receiving props from `App.tsx`. The decision note says to evaluate whether fetching in a hook is sufficient before extending `PluginSlotRenderer` — and it is: `useActiveInstances` already does exactly this fetch with 5s polling, so the plugin can call the same hook internally.

The hardest design question is layout: the `bottom-panel` slot renders below the terminal view inside `main`, receiving whatever vertical space remains. The panel must be collapsible (start collapsed) so it does not obscure the terminal on first render. All four sections (agent grid, spawn/command, registry, hook feed) can live in a single file using tabbed navigation within the panel, staying within the spirit of the 200 LOC plugin budget. Given the required surface area (8 requirements), a realistic budget is 300-400 LOC for the plugin file plus 1-2 small supporting hooks (~100 LOC total), still well under any reasonable limit.

**Primary recommendation:** Single plugin file with collapsible panel + 4-tab navigation. Two small custom hooks (`useGsdRegistry`, `useGsdHookFeed`) extracted as co-located helpers in the same file or in `src/client/hooks/`. No new npm dependencies required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRID-01 | Operator can view all managed agents in a grid showing session status (active/idle/stopped) | `GET /api/gsd/registry` returns agents array with `tmux_session_name`; cross-reference with `GET /api/instances` for live status. Hook: `useGsdRegistry` polls registry, `useActiveInstances` (or inline fetch) provides live status. |
| GRID-02 | Operator can see each agent's working directory in the grid | `working_directory` field in `RegistryAgent` from `GET /api/gsd/registry`. Displayed as truncated path in grid cell. |
| CTRL-01 | Operator can spawn a new GSD agent session from the UI with agent name, working directory, and optional first command | `POST /api/gsd/spawn` with `{ agentName, workdir, firstCommand? }` returns 202. Spawn form: three inputs, submit button disables + shows "Spawning..." during fetch, re-enables after response regardless of outcome. |
| CTRL-02 | Operator can send any custom command to a running agent's tmux session | `POST /api/gsd/sessions/:session/command` with `{ action: 'clear_then', args: '<command>' }`. Command form: text input + session selector dropdown (populated from active instances), submit shows "Dispatched" confirmation. |
| REG-01 | Operator can view all agents in the recovery registry with their configuration | `GET /api/gsd/registry` returns full `GsdRegistry` object. Table shows `agent_id`, `enabled`, `working_directory`, `tmux_session_name`, `auto_wake`. |
| REG-02 | Operator can toggle an agent's enabled/disabled status from the UI | `PATCH /api/gsd/registry/agents/:agentId` with `{ enabled: boolean }`. Optimistic UI: toggle state immediately in local React state, revert on error response. |
| HOOK-01 | Operator can see a live feed of the last 20 hook events streamed via Socket.IO | Connect to `/gsd-hooks` Socket.IO namespace on mount. Listen for `gsd-hooks:backfill` (initial 200 lines) and `gsd-hooks:lines` (new lines). Parse lines into events grouped by `FIRED` marker. Display last 20 events newest-first. |
| DX-01 | Every UI action displays the equivalent manual bash command with copy-to-clipboard | Inline `<code>` block below each form showing the bash equivalent. One-click copy via `navigator.clipboard.writeText()`. Show "Copied!" for 2s then revert. No library needed. |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 | `useState`, `useEffect`, `useCallback`, `useMemo` for all state and side effects | Already used throughout client |
| socket.io-client | ^4.8.0 | Connect to `/gsd-hooks` namespace for live hook feed | Already used in `useTerminalSocket`; same `io('/gsd-hooks', {...})` pattern |
| Tailwind CSS 4 | ^4.0.0 | `warden-*` tokens for all styling | Already configured; use same tokens as every other component |
| TypeScript 5.7 | ^5.7.0 | Type-safe plugin manifest + typed API responses | Already in use |

### Supporting (already installed, no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Clipboard API (built-in) | Web API | `navigator.clipboard.writeText()` for copy-to-clipboard | DX-01. No library needed; available in all modern browsers. |
| `fetch` (built-in) | Web API | All REST calls to `/api/gsd/*` | Already used pattern in every hook |
| `import.meta.glob` | Vite 6 | Plugin auto-discovery — NO new code needed | Already handles `gsd-manager-plugin.tsx` automatically |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `navigator.clipboard.writeText()` | `react-copy-to-clipboard` npm package | Built-in is sufficient; avoids dependency |
| Custom `useGsdRegistry` hook | Shared `useFetch` generic | DRY option, but adds abstraction for 1-2 callers — inline is cleaner |
| Single-file plugin | Multi-file plugin + separate hooks dir | Phase 9 decision: plugin co-location (PLUG-06). Keeping hooks in `src/client/hooks/` is also acceptable if the file grows over 300 LOC |
| Tabs for sections | Always-visible accordion | Tabs are more space-efficient in narrow bottom panel; accordion adds vertical scroll |

**Installation:**
```bash
# No new packages required.
```

---

## Architecture Patterns

### Recommended File Structure

```
src/client/
├── plugins/
│   └── gsd-manager-plugin.tsx    # NEW — the entire plugin (manifest + PanelComponent)
└── hooks/
    ├── useGsdRegistry.ts          # NEW (optional) — polls GET /api/gsd/registry
    └── useGsdHookFeed.ts          # NEW (optional) — Socket.IO /gsd-hooks consumer
```

If the plugin file stays under 300 LOC, hooks can be co-located as local functions inside `gsd-manager-plugin.tsx`. If it grows beyond that, extract to `src/client/hooks/`.

### Pattern 1: Plugin File Structure

**What:** Single default export matching `PluginModule` interface. `PanelComponent` receives no props.
**When to use:** Only file entry point — `import.meta.glob` picks it up automatically.

```typescript
// src/client/plugins/gsd-manager-plugin.tsx
import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';

const manifest = {
  id: 'gsd-manager',
  name: 'GSD Manager',
  version: '1.0.0',
  description: 'Control center for GSD agent sessions',
  slot: 'bottom-panel',
  capabilities: ['gsd-management', 'agent-control', 'session-monitoring'],
} as const satisfies PluginManifest;

function GsdManagerPanel() {
  // All state + hooks live here — PanelComponent receives zero props by contract
  return <div>...</div>;
}

export default { manifest, PanelComponent: GsdManagerPanel } satisfies PluginModule;
```

### Pattern 2: Registry Polling Hook

**What:** Fetch `/api/gsd/registry` on mount and on a timer. Expose `agents`, `isLoading`, `error`, `refetch`.
**When to use:** Drives GRID-01, GRID-02, REG-01, REG-02.

```typescript
// Can be co-located in plugin file or in src/client/hooks/useGsdRegistry.ts
function useGsdRegistry() {
  const [registry, setRegistry] = useState<GsdRegistry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRegistry = useCallback(async () => {
    try {
      const response = await fetch('/api/gsd/registry');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as GsdRegistry;
      setRegistry(data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch registry');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistry();
    const interval = setInterval(fetchRegistry, 10_000); // 10s poll — registry changes infrequently
    return () => clearInterval(interval);
  }, [fetchRegistry]);

  return { registry, isLoading, error, refetch: fetchRegistry };
}
```

### Pattern 3: Socket.IO Hook Feed

**What:** Connect to `/gsd-hooks` namespace. Receive `gsd-hooks:backfill` on connect, `gsd-hooks:lines` on new events. Parse lines into event groups. Keep last 20 groups in state.
**When to use:** HOOK-01.

```typescript
// Source: mirrors useTerminalSocket.ts pattern
function useGsdHookFeed() {
  const [hookLines, setHookLines] = useState<string[]>([]);

  useEffect(() => {
    const socket = io('/gsd-hooks', {
      reconnection: true,
      reconnectionDelay: 2_000,
      reconnectionAttempts: 5,
    });

    socket.on('gsd-hooks:backfill', ({ lines }: { lines: string[] }) => {
      setHookLines(lines.slice(-200)); // keep last 200 raw lines
    });

    socket.on('gsd-hooks:lines', ({ lines }: { lines: string[] }) => {
      setHookLines((prev) => [...prev, ...lines].slice(-200));
    });

    return () => { socket.disconnect(); };
  }, []);

  // Parse raw lines into displayable events (last 20)
  const hookEvents = useMemo(() => parseHookEvents(hookLines, 20), [hookLines]);
  return { hookEvents };
}
```

### Pattern 4: Optimistic Toggle for Registry Enable/Disable

**What:** Immediately flip local state, then PATCH, revert on error.
**When to use:** REG-02.

```typescript
// Inside GsdManagerPanel or useGsdRegistry
const [optimisticEnabled, setOptimisticEnabled] = useState<Record<string, boolean>>({});

const handleToggleEnabled = useCallback(async (agentId: string, currentEnabled: boolean) => {
  const newEnabled = !currentEnabled;
  // Optimistic update
  setOptimisticEnabled((prev) => ({ ...prev, [agentId]: newEnabled }));
  try {
    const response = await fetch(`/api/gsd/registry/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Server confirmed — refetch registry to sync
    refetchRegistry();
  } catch {
    // Revert optimistic update on error
    setOptimisticEnabled((prev) => ({ ...prev, [agentId]: currentEnabled }));
  }
}, [refetchRegistry]);
```

### Pattern 5: Copy-to-Clipboard with Feedback

**What:** `navigator.clipboard.writeText()` + 2s "Copied!" state per button.
**When to use:** DX-01.

```typescript
// Reusable helper, not a library
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard write failed (non-HTTPS or permission denied) — show nothing
    });
  }, [text]);

  return (
    <button onClick={handleCopy} className="text-xs px-2 py-0.5 rounded bg-warden-border/50 text-warden-text-dim hover:text-warden-text">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
```

### Pattern 6: Hook Log Line Parser

**What:** Group raw log lines by `FIRED` marker, extract timestamp, hook script name, agent_id, tmux_session, hook_event_name. Return last N events newest-first.
**When to use:** HOOK-01 display.

Real log event structure (verified from `/tmp/gsd-hooks.log`):
```
[2026-02-18T05:23:22Z] [stop-hook.sh] FIRED — PID=41240 TMUX=...
[2026-02-18T05:23:22Z] [stop-hook.sh] stdin: 301 bytes, hook_event_name=Stop
[2026-02-18T05:23:22Z] [stop-hook.sh] tmux_session=warden-main-2
[2026-02-18T05:23:22Z] [stop-hook.sh] agent_id=warden openclaw_session_id=...
[2026-02-18T05:23:22Z] [stop-hook.sh] state=permission_prompt
[2026-02-18T05:23:22Z] [stop-hook.sh] content source: transcript
[2026-02-18T05:23:22Z] [stop-hook.sh] DELIVERING: mode=async ...
```

Parser approach:
```typescript
interface HookEvent {
  timestamp: string;   // ISO from FIRED line
  hookScript: string;  // e.g. "stop-hook.sh"
  hookEventName: string; // e.g. "Stop", "Notification"
  agentId: string | null;
  tmuxSession: string | null;
  state: string | null;
}

function parseHookEvents(lines: string[], maxEvents: number): HookEvent[] {
  const events: HookEvent[] = [];
  let current: Partial<HookEvent> | null = null;

  for (const line of lines) {
    // Detect FIRED line — starts a new event group
    const firedMatch = line.match(/^\[(.+?)\] \[(.+?)\] FIRED/);
    if (firedMatch) {
      if (current?.timestamp) events.push(current as HookEvent);
      current = {
        timestamp: firedMatch[1],
        hookScript: firedMatch[2],
        hookEventName: '',
        agentId: null,
        tmuxSession: null,
        state: null,
      };
      continue;
    }
    if (!current) continue;

    // Extract fields from continuation lines
    const eventNameMatch = line.match(/hook_event_name=(\S+)/);
    if (eventNameMatch) current.hookEventName = eventNameMatch[1];

    const agentMatch = line.match(/agent_id=(\S+)/);
    if (agentMatch) current.agentId = agentMatch[1];

    const sessionMatch = line.match(/tmux_session=(\S+)/);
    if (sessionMatch) current.tmuxSession = sessionMatch[1];

    const stateMatch = line.match(/state=(\S+)/);
    if (stateMatch) current.state = stateMatch[1];
  }
  if (current?.timestamp) events.push(current as HookEvent);

  // Return last N, newest first
  return events.slice(-maxEvents).reverse();
}
```

### Pattern 7: Spawn Form with Loading State

**What:** Three inputs (agentName, workdir, firstCommand). Submit POSTs to `/api/gsd/spawn`. Button disables during fetch and shows "Spawning...". On 202: show success message. On error: show error message.
**When to use:** CTRL-01.

```typescript
const [isSpawning, setIsSpawning] = useState(false);
const [spawnStatus, setSpawnStatus] = useState<{type: 'success'|'error'; text: string} | null>(null);

const handleSpawn = async () => {
  setIsSpawning(true);
  setSpawnStatus(null);
  try {
    const response = await fetch('/api/gsd/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, workdir, ...(firstCommand ? { firstCommand } : {}) }),
    });
    const data = await response.json();
    if (response.status === 202) {
      setSpawnStatus({ type: 'success', text: `Spawning ${data.agentName}... session: ${data.expectedSessionName}` });
    } else {
      setSpawnStatus({ type: 'error', text: data.error ?? 'Spawn failed' });
    }
  } catch {
    setSpawnStatus({ type: 'error', text: 'Network error' });
  } finally {
    setIsSpawning(false);
  }
};

// DX-01 manual bash command shown below form:
const spawnBashCommand = `spawn.sh ${agentName} ${workdir}${firstCommand ? ` "${firstCommand}"` : ''}`;
```

### Pattern 8: Command Dispatch with Session Selector

**What:** Text input for command text + `<select>` populated from `useActiveInstances` (or inline fetch). POST to `/api/gsd/sessions/:session/command` with `action: 'clear_then'`, `args: commandText`.
**When to use:** CTRL-02.

```typescript
// Session selector uses active instances from /api/instances
// The plugin calls useActiveInstances() internally since PanelComponent takes no props
const { instances } = useActiveInstances();
const activeInstances = instances.filter(i => i.status === 'active' || i.status === 'idle');

const handleDispatch = async () => {
  const response = await fetch(`/api/gsd/sessions/${targetSession}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear_then', args: commandText }),
  });
  // ... handle response
};

// DX-01 bash equivalent:
const dispatchBashCommand = `menu-driver.sh ${targetSession} clear_then "${commandText}"`;
```

### Anti-Patterns to Avoid

- **Extending PluginSlotRenderer to pass props:** `PanelComponent` is `ComponentType` (no props). The contract is zero-props. Do not modify `pluginTypes.ts` or `PluginSlotRenderer.tsx`. Call `useActiveInstances()` directly inside the plugin.
- **Modifying App.tsx for plugin context:** The plugin is self-contained. If it needs the currently selected session, fetch from `/api/instances` internally.
- **Persistent Socket.IO connection when panel is collapsed:** Disconnect the socket when the panel is collapsed (collapsed = unmounted OR not visible). Connect on expand. This avoids keeping a connection alive for a hidden panel.
- **Creating a new Socket.IO connection per re-render:** Use `useRef` + `useEffect` with proper cleanup, as shown in `useTerminalSocket`. Never create socket inside render.
- **`navigator.clipboard` without error handling:** HTTPS-only API. Wrap in `.catch(() => {})` silently — the fallback is that the button does nothing on non-HTTPS context (dev proxy is fine).
- **Polling `/api/gsd/registry` at 1s interval:** Registry changes infrequently (only on toggle or spawn). 10s is sufficient. REG-02 uses optimistic UI so no aggressive polling is needed.
- **Rendering all sections always visible:** The bottom panel has limited height. Use tabs or a collapsible accordion. Sections that are not visible should not mount their fetch hooks (conditional rendering).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Copy to clipboard | Custom clipboard util | `navigator.clipboard.writeText()` | Web standard, already available, no library |
| Socket.IO connection lifecycle | Custom WebSocket wrapper | `io('/gsd-hooks', {...})` from `socket.io-client` | Already installed, same pattern as `useTerminalSocket` |
| Registry data fetching | Custom HTTP client | `fetch()` + `useState`/`useEffect` | Already used everywhere in the codebase |
| Session list for command target | Separate API endpoint | `useActiveInstances()` hook | Already polls `/api/instances` at 5s, reuse directly |
| Line grouping into events | External log parser | Inline `parseHookEvents()` function | ~30 LOC, regex-based, no library needed |

**Key insight:** Every capability maps to browser built-ins, already-installed packages, or existing hooks. Zero new npm dependencies are required or justified.

---

## Common Pitfalls

### Pitfall 1: Panel Height Collapse Problem

**What goes wrong:** The `bottom-panel` slot renders inside `<main>` below the terminal view. If the panel is always visible and not collapsible, it takes vertical space from the terminal, making it very short on laptop screens.

**Why it happens:** `bottom-panel` is rendered at line 318 of `App.tsx` — `<PluginSlotRenderer slot="bottom-panel" .../>` — directly below the terminal div. The panel shares vertical space with the terminal.

**How to avoid:** Start the panel collapsed (collapsed = renders a thin header bar only, ~32px). Expand on click. Use `useState(false)` for `isExpanded`. When collapsed, do NOT mount fetch hooks (conditional rendering) — only the header renders.

**Warning signs:** Terminal is tiny on first page load because the GSD panel is fully visible.

### Pitfall 2: Socket.IO Connection Leak on Tab Switch

**What goes wrong:** If the `/gsd-hooks` Socket.IO connection is established when the panel mounts, and the panel unmounts (collapsed or view switches away from terminals), the socket should disconnect. If not, connections accumulate across mount/unmount cycles.

**Why it happens:** `useEffect` cleanup is not called if the socket is not stored in a ref and disconnected in the cleanup function.

**How to avoid:** Mirror `useTerminalSocket.ts` exactly: create socket in `useEffect`, store in `useRef`, disconnect in cleanup `return () => { socket.disconnect(); }`. This is the established pattern in the codebase.

**Warning signs:** Browser DevTools show multiple `/gsd-hooks` connections from the same client.

### Pitfall 3: Stale Session List in Command Dropdown

**What goes wrong:** The command dispatch form lets the operator select a target session. If the session list is fetched once on mount and not refreshed, stopped sessions appear in the dropdown, and dispatch fails with a 500 from `menu-driver.sh`.

**Why it happens:** Operator stops a session in the Terminals view while the GSD panel is open — the local session list is stale.

**How to avoid:** Use `useActiveInstances()` hook directly inside the plugin. It polls every 5 seconds and filters to `active | idle`. This is the same hook used by `App.tsx` and `InstanceTabBar.tsx`.

**Warning signs:** Dropdown shows session names that produce dispatch errors.

### Pitfall 4: `navigator.clipboard` Fails in Development HTTP

**What goes wrong:** In development, the server is at `http://localhost:3001`. `navigator.clipboard.writeText()` requires a secure context (HTTPS or localhost). The Vite dev proxy serves at `http://localhost:5173` — this IS localhost and IS a secure context, so clipboard works. But if the operator accesses the server directly at `http://192.168.x.x:3001` (non-localhost), clipboard will fail silently.

**Why it happens:** Clipboard API is blocked on non-secure, non-localhost origins.

**How to avoid:** Wrap clipboard call in `.catch(() => {})` and never throw. The button simply does nothing if clipboard is unavailable. The bash command is still visible in the `<code>` block.

**Warning signs:** Copy button shows "Copy" forever and never shows "Copied!" when accessing via IP address.

### Pitfall 5: Hook Log Interleaved Non-Event Lines

**What goes wrong:** `/tmp/gsd-hooks.log` contains non-event lines — operator messages injected between hook FIRED blocks (visible in the actual log file). The parser groups by `FIRED` marker; non-event lines between events will be part of the preceding event's group if not handled.

**Why it happens:** The hook scripts don't own the entire log file — operator actions (Telegram messages, etc.) are also logged there.

**How to avoid:** The parser starts a new event group only on `FIRED` lines. Any line not matching a known field pattern is skipped silently. The display shows only fields that were successfully parsed — missing fields show as "unknown". The interleaved non-event text is simply not shown.

**Warning signs:** Event `agentId` shows as `null` for some events; acceptable, show "—" in UI.

### Pitfall 6: Optimistic Toggle Flicker on Fast Re-poll

**What goes wrong:** REG-02 uses optimistic UI: flip local state immediately, then PATCH, then `refetchRegistry()` on success. If `refetchRegistry` fires before the server writes (30s TTL cache means it may return stale data), the toggle appears to revert then flip again.

**Why it happens:** The 30s TTL cache in `GsdRegistryService` is invalidated on write (`cachedRegistry = null`). BUT if the client `refetch()` fires in the ~10ms between the `PATCH` request arriving and the server completing `rename()`, the cache is invalidated but the read might load from the old file before rename completes.

**How to avoid:** On successful PATCH response, the server returns the `updatedAgent` object directly. Update local state from the response body rather than refetching from the poll cycle. The `optimisticEnabled` state can be removed in favor of using the returned agent data to update local registry state. Alternatively: rely on the 10s poll to catch up — the visual lag is acceptable.

**Practical fix:** Keep optimistic state in a separate `Record<agentId, boolean>` overlay, applied on top of poll data. On successful PATCH, remove the overlay entry (poll data is now correct). On error, revert the overlay.

---

## Code Examples

Verified patterns from the codebase:

### Socket.IO Client Connection (mirrors useTerminalSocket.ts)

```typescript
// Source: src/client/hooks/useTerminalSocket.ts lines 19-27
const socket = io('/gsd-hooks', {
  reconnection: true,
  reconnectionDelay: 1_000,
  reconnectionAttempts: 10,
});

socket.on('connect', () => { /* ... */ });
socket.on('gsd-hooks:backfill', ({ lines }) => { /* ... */ });
socket.on('gsd-hooks:lines', ({ lines }) => { /* ... */ });
// Cleanup:
return () => { socket.disconnect(); };
```

### Plugin File Template (from example-plugin.tsx)

```typescript
// Source: src/client/plugins/example-plugin.tsx
import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';

const manifest = {
  id: 'gsd-manager',
  name: 'GSD Manager',
  version: '1.0.0',
  description: 'Control center for GSD agent sessions',
  slot: 'bottom-panel',
  capabilities: ['gsd-management', 'agent-control', 'session-monitoring'],
} as const satisfies PluginManifest;

function GsdManagerPanel() { /* ... */ }

export default { manifest, PanelComponent: GsdManagerPanel } satisfies PluginModule;
```

### Fetch + Poll Pattern (from useActiveInstances.ts)

```typescript
// Source: src/client/hooks/useActiveInstances.ts lines 11-32
const fetchInstances = useCallback(async () => {
  try {
    const response = await fetch('/api/gsd/registry');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setRegistry(data);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed');
  } finally {
    setIsLoading(false);
  }
}, []);

useEffect(() => {
  fetchRegistry();
  const interval = setInterval(fetchRegistry, 10_000);
  return () => clearInterval(interval);
}, [fetchRegistry]);
```

### PATCH with Optimistic Update (pattern from PromptPanel.tsx)

```typescript
// Source: src/client/components/PromptPanel.tsx — adapted for toggle
setIsSending(true);
try {
  const response = await fetch(`/api/gsd/registry/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: newEnabled }),
  });
  const result = await response.json();
  if (!response.ok) {
    // revert optimistic state
    setOptimisticEnabled((prev) => ({ ...prev, [agentId]: currentEnabled }));
  }
} catch {
  setOptimisticEnabled((prev) => ({ ...prev, [agentId]: currentEnabled }));
} finally {
  setIsSending(false);
}
```

### Status Dot Component (from InstanceTabBar.tsx)

```typescript
// Source: src/client/components/InstanceTabBar.tsx lines 11-16
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};
// Usage: <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
```

---

## Key API Contracts (from Phase 12, verified)

### GET /api/gsd/registry

Response shape (from `GsdRegistry` type in `GsdRegistryService.ts`):
```typescript
{
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: Array<{
    agent_id: string;       // "warden", "forge"
    enabled: boolean;
    working_directory: string;  // "/home/forge/warden.kingdom.lv"
    tmux_session_name: string;  // "warden-main-3"
    claude_launch_command: string;
    auto_wake: boolean;
    topic_id: number;
    openclaw_session_id: string;
    claude_resume_target: string;
    claude_post_launch_mode: string;
  }>;
}
```

### POST /api/gsd/spawn

Request: `{ agentName: string, workdir: string, firstCommand?: string }`
Response 202: `{ message: string, agentName: string, workdir: string, expectedSessionName: string, spawnLogFile: string }`
Response 400: `{ error: string }` (validation failure)

### POST /api/gsd/sessions/:session/command

Request: `{ action: 'clear_then' | 'type' | 'enter' | ..., args?: string }`
Response 200: `{ dispatched: true, output: string }`
Response 400: `{ error: string }`
Response 500: `{ error: string }` (menu-driver.sh failure)

### PATCH /api/gsd/registry/agents/:agentId

Request: `{ enabled: boolean }`
Response 200: returns the updated `RegistryAgent` object
Response 404: `{ error: 'Agent not found...' }`

### Socket.IO /gsd-hooks namespace

Events:
- `gsd-hooks:backfill` → `{ lines: string[] }` (last ~200 lines on connect)
- `gsd-hooks:lines` → `{ lines: string[] }` (new lines as they arrive, ~1s poll)

---

## Session Context: The Props-vs-Hook Decision

`PanelComponent` is typed as `ComponentType` (no props). The prior decision note says: "if session selector needs active tab context, evaluate whether fetching instances in hook is sufficient before extending PluginSlotRenderer."

**Conclusion: fetching in hook is sufficient.**

- `useActiveInstances()` is already available and polls every 5s.
- The plugin calls `useActiveInstances()` directly inside `GsdManagerPanel`.
- The session selector `<select>` is pre-populated from `activeInstances.filter(i => i.status !== 'stopped')`.
- No props needed, no changes to `PluginSlotRenderer` or `pluginTypes.ts`.

---

## LOC Budget Reality Check

Prior decision: "185 LOC total for complete plugin system — under 200 LOC budget." That budget applied to the ENTIRE plugin registry foundation (Phase 9), not to individual plugin files. The 127 LOC total for the plugin infrastructure (5 files) is already done.

For `gsd-manager-plugin.tsx`, the realistic estimate is:
- Manifest + boilerplate: ~20 LOC
- `useGsdRegistry` hook: ~35 LOC
- `useGsdHookFeed` hook: ~40 LOC
- `parseHookEvents` parser: ~40 LOC
- `CopyButton` component: ~20 LOC
- `GsdManagerPanel` component with 4 tabs: ~150-200 LOC
- **Total plugin file: ~300-350 LOC**

This is acceptable — the 200 LOC budget was for the plugin SYSTEM (Phase 9), not for individual plugins. No concern.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate API + hook per feature | Co-located fetch in plugin file | Phase 9 decision | Simpler for plugins with 1-2 data sources |
| Navigator.clipboard polyfills | `navigator.clipboard.writeText()` native | Baseline 2020+ | No library needed for copy |
| Eager full-page polling | Conditional hooks (mount only when visible) | React 18+ pattern | Panel hooks only activate when expanded |

**Not deprecated in this project:**
- `io()` from socket.io-client — still the correct client API.
- `fetch()` + manual state — context in React 19 is still optional; no React Query/SWR needed.

---

## Open Questions

1. **Should the panel start collapsed or expanded?**
   - What we know: `bottom-panel` takes vertical space from the terminal. The PRD shows it as an always-visible panel, but that reduces terminal height.
   - What's unclear: User preference. No CONTEXT.md decision.
   - Recommendation: Start collapsed (show only `"GSD Control Center [Expand ▾]"` header). User expands on demand. This matches every dashboard tool that uses bottom panels.

2. **Which tab is active by default?**
   - What we know: GRID-01/GRID-02 are the "overview" requirements. Hook feed (HOOK-01) is most dynamic.
   - Recommendation: Default to "Agent Grid" tab. It's the overview state. Hook feed should be available but not default.

3. **Should the command dispatch use `clear_then` or `type`+`enter`?**
   - What we know: `ALLOWED_ACTIONS = ['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'submit', 'type']`. `clear_then` is the most natural for sending a GSD command (clears current input, types new command, submits).
   - Recommendation: Use `clear_then` as the default action for the "Send Command" form. Show the bash equivalent as `menu-driver.sh <session> clear_then "<command>"`.

4. **How to cross-reference registry agents with live instances?**
   - What we know: Registry has `tmux_session_name`, instances have `tmuxSessionName`. Both are the same value (e.g., `"warden-main-3"`).
   - Recommendation: In the Agent Grid, join on `tmuxSessionName === tmux_session_name`. Show `status` from instances if a match is found, show "stopped/unknown" if no match (agent in registry but no active tmux session).

---

## Sources

### Primary (HIGH confidence)

- Codebase analysis — `src/client/plugins/example-plugin.tsx` (plugin file structure)
- Codebase analysis — `src/shared/pluginTypes.ts` (`PluginModule`, `ComponentType` no-props contract)
- Codebase analysis — `src/client/plugins/index.ts` (auto-discovery via `import.meta.glob`)
- Codebase analysis — `src/client/components/PluginSlotRenderer.tsx` (zero-props rendering contract)
- Codebase analysis — `src/client/hooks/useTerminalSocket.ts` (Socket.IO client pattern)
- Codebase analysis — `src/client/hooks/useActiveInstances.ts` (fetch + poll pattern)
- Codebase analysis — `src/client/components/PromptPanel.tsx` (fetch with loading state + error pattern)
- Codebase analysis — `src/client/components/InstanceTabBar.tsx` (status dot color pattern)
- Codebase analysis — `src/client/App.tsx` line 318 (`bottom-panel` slot position, rendering context)
- Codebase analysis — `src/server/routes/gsdRoutes.ts` (all 6 endpoints, request/response shapes)
- Codebase analysis — `src/server/services/GsdRegistryService.ts` (`RegistryAgent`, `GsdRegistry` types)
- Codebase analysis — `src/server/services/GsdHookLogWatcher.ts` (Socket.IO events: `gsd-hooks:backfill`, `gsd-hooks:lines`)
- Live file inspection — `/tmp/gsd-hooks.log` (event line format, FIRED marker, field names)
- Live file inspection — `recovery-registry.json` (actual agent data: `forge`, `warden` with all fields)
- Phase 12 VERIFICATION.md — all 18 must-have truths verified; API surface confirmed working
- Phase 9 RESEARCH.md — plugin system design decisions, 200 LOC budget context

### Secondary (MEDIUM confidence)

- MDN Web Docs (training knowledge) — `navigator.clipboard.writeText()` requires secure context. Verified against project setup: Vite dev server at localhost is a secure context; HTTPS in production.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, patterns exist in codebase
- Architecture: HIGH — plugin contract verified from code, all API shapes verified from Phase 12
- Hook log parsing: HIGH — actual log format verified from `/tmp/gsd-hooks.log`
- Pitfalls: HIGH — derived from actual codebase constraints (props contract, TTL cache behavior, Socket.IO lifecycle)

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable stack — 30 days)
