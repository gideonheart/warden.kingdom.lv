# Architecture Research: GSD Manager Plugin Integration

**Domain:** Warden Dashboard — GSD Manager Control Center plugin
**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct codebase inspection)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER CLIENT (React 19 SPA)                   │
├──────────────────┬──────────────────────────────────────────────────────┤
│  Plugin Slot:    │  Plugin Slot:    │  Plugin Slot:   │  Plugin Slot:    │
│  sidebar-top     │  sidebar-bottom  │  bottom-panel   │terminal-overlay  │
│                  │                  │                 │                  │
│                  │ [example-plugin] │ [gsd-manager-   │                  │
│                  │                  │  plugin] <- NEW │                  │
├──────────────────┴──────────────────┴─────────────────┴──────────────────┤
│  PluginSlotRenderer (ErrorBoundary per plugin, Vite glob auto-discovery) │
│  usePluginRegistry (localStorage persistence, enable/disable toggle)     │
├─────────────────────────────────────────────────────────────────────────┤
│                   App.tsx renders bottom-panel slot under terminals view  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  HTTP /api/gsd/*     Socket.IO /gsd-hooks
                                │  (REST polling)      (real-time streaming)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                       EXPRESS 5 SERVER (src/server/)                     │
├──────────────────┬──────────────────┬───────────────────────────────────┤
│  instanceRoutes  │  agentRoutes     │  historyRoutes  │  activityRoutes  │
│  (existing)      │  (existing)      │  (existing)     │  (existing)      │
│                  │                  │                 │                  │
│            gsdRoutes <- NEW (mount at /api/gsd/)                        │
├──────────────────┴──────────────────┴───────────────────────────────────┤
│  GsdService <- NEW          │  GsdHookLogWatcher <- NEW                  │
│  (spawn.sh, menu-driver.sh  │  (fs.watch on /tmp/gsd-hooks.log,          │
│   wrapper, registry I/O,    │   emits via Socket.IO /gsd-hooks ns)       │
│   STATE.md reader)          │                                            │
├──────────────────────────────┬──────────────────────────────────────────┤
│  TmuxSessionManager          │  OpenClawConfigReader  │  DatabaseConn.   │
│  (existing -- reused)        │  (existing -- reused)  │  (existing)      │
└──────────────────────────────┴────────────────────────┴──────────────────┘
         │ execFile                              │ fs.readFile
         ▼                                       ▼
  [tmux / spawn.sh /              [recovery-registry.json]
   menu-driver.sh]                [.planning/STATE.md per workdir]
                                  [/tmp/gsd-hooks.log]
```

---

## Component Responsibilities

| Component | File | Responsibility | Status |
|-----------|------|----------------|--------|
| `gsdRoutes` | `src/server/routes/gsdRoutes.ts` | HTTP endpoints at `/api/gsd/*` | NEW |
| `GsdService` | `src/server/services/GsdService.ts` | Shell command execution, registry I/O, STATE.md reads | NEW |
| `GsdHookLogWatcher` | `src/server/services/GsdHookLogWatcher.ts` | Tail `/tmp/gsd-hooks.log`, emit events via Socket.IO | NEW |
| `gsd-manager-plugin` | `src/client/plugins/gsd-manager-plugin.tsx` | Bottom-panel UI: agent grid, quick actions, hook feed, registry view | NEW |
| `useGsdManager` | `src/client/hooks/useGsdManager.ts` | REST fetch + Socket.IO `/gsd-hooks` consumer for plugin | NEW |
| `src/server/index.ts` | (existing) | Mount `gsdRoutes`, init `GsdHookLogWatcher` | MODIFIED (3 lines) |
| `src/shared/gsdTypes.ts` | `src/shared/gsdTypes.ts` | TypeScript types shared between client and server for GSD domain | NEW |

---

## New vs Modified Files (Explicit)

### New Files

```
src/
├── shared/
│   └── gsdTypes.ts                    # RegistryAgent, GsdSessionState, HookLogEntry, API shapes
├── server/
│   ├── routes/
│   │   └── gsdRoutes.ts               # Express Router, mounted at /api/gsd/
│   └── services/
│       ├── GsdService.ts              # spawn.sh/menu-driver.sh wrapper, registry/STATE.md I/O
│       └── GsdHookLogWatcher.ts       # fs.watch + tail of /tmp/gsd-hooks.log -> Socket.IO
└── client/
    ├── hooks/
    │   └── useGsdManager.ts           # Fetch hook + Socket.IO /gsd-hooks consumer
    └── plugins/
        └── gsd-manager-plugin.tsx     # Plugin manifest (bottom-panel) + PanelComponent
```

### Modified Files

```
src/server/index.ts      # Add: import gsdRoutes, import gsdHookLogWatcher,
                         #      app.use(gsdRoutes),
                         #      gsdHookLogWatcher.setupSocketNamespace(socketServer) in startup,
                         #      gsdHookLogWatcher.start() in startup,
                         #      gsdHookLogWatcher.stop() in handleShutdown
```

No other existing files need modification. The plugin auto-discovers via Vite glob import in `src/client/plugins/index.ts` — that file uses `import.meta.glob('./*.tsx', { eager: true, import: 'default' })` which picks up any new `.tsx` file dropped in the directory automatically.

---

## Architectural Patterns

### Pattern 1: Route Module Pattern (gsdRoutes.ts)

**What:** Named export of an Express `Router`. Imports service singletons. Mounted in `index.ts` with `app.use(gsdRoutes)`.

**Matches exactly:** `instanceRoutes.ts`, `agentRoutes.ts`, `historyRoutes.ts`, `activityRoutes.ts`.

**Example:**
```typescript
// src/server/routes/gsdRoutes.ts
import { Router } from 'express';
import { gsdService } from '../services/GsdService.js';

const router = Router();

router.get('/api/gsd/registry', async (_request, response) => {
  try {
    const registry = await gsdService.readRegistry();
    response.json({ registry });
  } catch (error) {
    console.error('[GSD] Failed to read registry:', error);
    response.status(500).json({ error: 'Failed to read recovery registry' });
  }
});

router.patch('/api/gsd/registry/agents/:agentId', async (request, response) => {
  const { agentId } = request.params;
  const patch = request.body as Partial<RegistryAgent>;
  try {
    await gsdService.patchRegistryAgent(agentId, patch);
    response.json({ success: true });
  } catch (error) {
    response.status(500).json({ error: 'Failed to update agent in registry' });
  }
});

router.post('/api/gsd/spawn', async (request, response) => {
  const { agentName, workingDirectory, firstCommand } = request.body;
  // Validate inputs, then fire-and-forget spawn (see anti-pattern note below)
  try {
    await gsdService.validateSpawnInputs(agentName, workingDirectory);
    gsdService.spawnAgentBackground(agentName, workingDirectory, firstCommand);
    response.status(202).json({ success: true, message: 'Spawning agent...' });
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});

router.post('/api/gsd/sessions/:session/command', async (request, response) => {
  const { session } = request.params;
  const { action, args } = request.body as GsdCommandRequest;
  try {
    await gsdService.runMenuDriverCommand(session, action, args);
    response.json({ success: true });
  } catch (error) {
    response.status(500).json({ error: 'Failed to run menu-driver command' });
  }
});

router.get('/api/gsd/sessions/:session/state', async (request, response) => {
  const { session } = request.params;
  try {
    const content = await gsdService.readSessionState(session);
    response.json({ content });
  } catch (error) {
    response.status(404).json({ error: 'STATE.md not found for this session' });
  }
});

router.get('/api/gsd/hooks/log', async (_request, response) => {
  try {
    const lines = await gsdService.tailHookLog(100);
    response.json({ lines });
  } catch (error) {
    response.status(500).json({ error: 'Failed to read hook log' });
  }
});

export { router as gsdRoutes };
```

### Pattern 2: Service Class Singleton (GsdService.ts)

**What:** A class with private helpers, exported as a module-level singleton. Mirrors `TmuxSessionManager` (execFile wrapper) and `OpenClawConfigReader` (file reader with TTL cache).

**Key decisions:**
- `spawn.sh` blocks for ~15-25s waiting for Claude TUI. Use `execFile` without blocking the response (see anti-pattern below). The session auto-appears in `/api/instances` via `InstanceTracker.startPeriodicSync()` within 10s.
- `menu-driver.sh` is fast (tmux send-keys). Await it fully, 5s timeout.
- Registry reads use 30s TTL cache (same as `OpenClawConfigReader`).
- Registry writes (toggle enabled) invalidate cache immediately.
- `STATE.md` path derived from registry agent's `working_directory` field.

**Example structure:**
```typescript
// src/server/services/GsdService.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { RecoveryRegistry, RegistryAgent, GsdCommandRequest } from '../../shared/gsdTypes.js';

const execFileAsync = promisify(execFile);

const GSD_SKILL_ROOT = path.resolve(
  process.env.HOME ?? '/home/forge',
  '.openclaw/workspace/skills/gsd-code-skill'
);
const SPAWN_SCRIPT_PATH = path.join(GSD_SKILL_ROOT, 'scripts/spawn.sh');
const MENU_DRIVER_SCRIPT_PATH = path.join(GSD_SKILL_ROOT, 'scripts/menu-driver.sh');
export const REGISTRY_PATH = path.join(GSD_SKILL_ROOT, 'config/recovery-registry.json');
export const HOOK_LOG_PATH = process.env.GSD_HOOK_LOG ?? '/tmp/gsd-hooks.log';

const REGISTRY_CACHE_TTL_MS = 30_000;

class GsdService {
  private cachedRegistry: RecoveryRegistry | null = null;
  private registryCachedAt = 0;

  async readRegistry(): Promise<RecoveryRegistry> {
    const now = Date.now();
    if (this.cachedRegistry && now - this.registryCachedAt < REGISTRY_CACHE_TTL_MS) {
      return this.cachedRegistry;
    }
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    this.cachedRegistry = JSON.parse(raw) as RecoveryRegistry;
    this.registryCachedAt = now;
    return this.cachedRegistry;
  }

  async patchRegistryAgent(agentId: string, patch: Partial<RegistryAgent>): Promise<void> {
    const registry = await this.readRegistry();
    const index = registry.agents.findIndex(agent => agent.agent_id === agentId);
    if (index === -1) throw new Error(`Agent not found in registry: ${agentId}`);
    registry.agents[index] = { ...registry.agents[index], ...patch };
    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
    this.cachedRegistry = registry;
    this.registryCachedAt = Date.now();
  }

  async validateSpawnInputs(agentName: string, workingDirectory: string): Promise<void> {
    if (!agentName || typeof agentName !== 'string') throw new Error('agentName required');
    if (!workingDirectory || typeof workingDirectory !== 'string') throw new Error('workingDirectory required');
    // Check workdir exists
    const { stat } = await import('fs/promises');
    const stats = await stat(workingDirectory);
    if (!stats.isDirectory()) throw new Error(`workingDirectory is not a directory: ${workingDirectory}`);
  }

  spawnAgentBackground(agentName: string, workingDirectory: string, firstCommand?: string): void {
    const spawnArgs = [agentName, workingDirectory];
    if (firstCommand) spawnArgs.push(firstCommand);
    // Fire and forget — spawn.sh blocks ~20s waiting for TUI readiness
    execFile(SPAWN_SCRIPT_PATH, spawnArgs, { timeout: 120_000 }, (error) => {
      if (error) console.error(`[GsdService] spawn.sh failed for ${agentName}:`, error.message);
      else console.log(`[GsdService] spawn.sh completed for ${agentName}`);
    });
  }

  async runMenuDriverCommand(sessionName: string, action: string, args?: string[]): Promise<void> {
    const cmdArgs = [sessionName, action, ...(args ?? [])];
    await execFileAsync(MENU_DRIVER_SCRIPT_PATH, cmdArgs, { timeout: 5_000 });
  }

  async readSessionState(sessionName: string): Promise<string | null> {
    const registry = await this.readRegistry();
    const agent = registry.agents.find(a => a.tmux_session_name === sessionName);
    if (!agent?.working_directory) return null;
    const statePath = path.join(agent.working_directory, '.planning', 'STATE.md');
    try {
      return await readFile(statePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async tailHookLog(lineCount: number): Promise<string[]> {
    try {
      const content = await readFile(HOOK_LOG_PATH, 'utf-8');
      return content.split('\n').filter(line => line.trim()).slice(-lineCount);
    } catch {
      return [];
    }
  }
}

export const gsdService = new GsdService();
```

### Pattern 3: Socket.IO Namespace (GsdHookLogWatcher.ts)

**What:** A service class that receives the `SocketIOServer` instance and creates a new namespace `/gsd-hooks`. Uses `fs.watch` on the hook log file to stream new lines to all connected clients.

**Matches:** `TerminalStreamService.setupSocketNamespace()` pattern. The new namespace `/gsd-hooks` is independent of `/terminal`.

**Why a separate namespace:** `/terminal` is tightly coupled to PTY session lifecycle. Hook log streaming is session-agnostic, always-on, and read-only.

**Socket.IO event emitted:** `gsd:hook-event` with payload `GsdHookEvent`.

**Example structure:**
```typescript
// src/server/services/GsdHookLogWatcher.ts
import { watch, type FSWatcher } from 'fs';
import { open } from 'fs/promises';
import type { Server as SocketIOServer } from 'socket.io';
import { HOOK_LOG_PATH } from './GsdService.js';
import type { GsdHookEvent } from '../../shared/gsdTypes.js';

class GsdHookLogWatcher {
  private watcher: FSWatcher | null = null;
  private socketServer: SocketIOServer | null = null;
  private lastReadPosition = 0;

  setupSocketNamespace(socketServer: SocketIOServer): void {
    this.socketServer = socketServer;
    const hookNamespace = socketServer.of('/gsd-hooks');
    hookNamespace.on('connection', async (socket) => {
      console.log(`[GsdHookLog] Client ${socket.id} connected`);
      // Backfill last 20 lines on connect
      const recentLines = await this.readRecentLines(20);
      for (const event of recentLines) {
        socket.emit('gsd:hook-event', event);
      }
    });
  }

  start(): void {
    this.initializeReadPosition().then(() => {
      try {
        this.watcher = watch(HOOK_LOG_PATH, () => this.onFileChange());
        console.log(`[GsdHookLog] Watching ${HOOK_LOG_PATH}`);
      } catch {
        // Log file may not exist yet; poll for it
        console.log(`[GsdHookLog] ${HOOK_LOG_PATH} not found, will retry`);
        setTimeout(() => this.start(), 5_000);
      }
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async initializeReadPosition(): Promise<void> {
    try {
      const fileHandle = await open(HOOK_LOG_PATH, 'r');
      const stats = await fileHandle.stat();
      this.lastReadPosition = stats.size;
      await fileHandle.close();
    } catch {
      this.lastReadPosition = 0;
    }
  }

  private async onFileChange(): Promise<void> {
    const fileHandle = await open(HOOK_LOG_PATH, 'r');
    const stats = await fileHandle.stat();
    if (stats.size <= this.lastReadPosition) {
      await fileHandle.close();
      return; // File truncated or no new content
    }
    const newBytes = stats.size - this.lastReadPosition;
    const buffer = Buffer.alloc(newBytes);
    await fileHandle.read(buffer, 0, newBytes, this.lastReadPosition);
    await fileHandle.close();
    this.lastReadPosition = stats.size;
    const newLines = buffer.toString('utf-8').split('\n').filter(line => line.trim());
    const namespace = this.socketServer?.of('/gsd-hooks');
    if (!namespace) return;
    for (const line of newLines) {
      const event = this.parseLine(line);
      if (event) namespace.emit('gsd:hook-event', event);
    }
  }

  private async readRecentLines(count: number): Promise<GsdHookEvent[]> {
    const { readFile } = await import('fs/promises');
    try {
      const content = await readFile(HOOK_LOG_PATH, 'utf-8');
      return content.split('\n')
        .filter(line => line.trim())
        .slice(-count)
        .map(line => this.parseLine(line))
        .filter((event): event is GsdHookEvent => event !== null);
    } catch {
      return [];
    }
  }

  private parseLine(raw: string): GsdHookEvent | null {
    // Format: [2026-02-17T22:21:21Z] [stop-hook.sh] message text here
    const match = raw.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$/);
    if (!match) return null;
    return {
      timestamp: match[1],
      script: match[2],
      message: match[3],
      raw,
    };
  }
}

export const gsdHookLogWatcher = new GsdHookLogWatcher();
```

### Pattern 4: Plugin Component (gsd-manager-plugin.tsx)

**What:** A single `.tsx` file in `src/client/plugins/` exporting `{ manifest, PanelComponent }` satisfying `PluginModule`. No setup needed — Vite glob auto-discovers it.

**Slot:** `bottom-panel`. Rendered in `App.tsx` line 318: `<PluginSlotRenderer slot="bottom-panel" enabledPlugins={enabledPlugins} />`.

**Critical constraint:** `PanelComponent` is typed as `ComponentType` (no props). The plugin must be fully self-contained — all data fetched via the `useGsdManager` hook internally.

**Example structure:**
```typescript
// src/client/plugins/gsd-manager-plugin.tsx
import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';
import { useGsdManager } from '../hooks/useGsdManager.js';

const manifest = {
  id: 'gsd-manager',
  name: 'GSD Control Center',
  version: '1.0.0',
  description: 'Spawn agents, send GSD commands, monitor hook activity',
  slot: 'bottom-panel',
  capabilities: ['gsd-management', 'agent-control', 'session-monitoring'],
} as const satisfies PluginManifest;

function GsdControlCenterPanel() {
  const { registry, hookEvents, sessionStates, spawnAgent, sendCommand } = useGsdManager();
  // Render: AgentGrid | QuickActions | HookFeed | ManualCommandRef sections
  return (
    <div className="bg-warden-panel border-t border-warden-border p-3">
      {/* ... */}
    </div>
  );
}

export default { manifest, PanelComponent: GsdControlCenterPanel } satisfies PluginModule;
```

### Pattern 5: Data-Fetching Hook (useGsdManager.ts)

**What:** A custom hook that polls REST endpoints and subscribes to Socket.IO `/gsd-hooks` namespace. Encapsulates all GSD-related state for the plugin.

**Polling strategy:** Registry and session states poll every 30s (low-frequency, file-based data). Hook events are pushed via Socket.IO (no polling).

**Example structure:**
```typescript
// src/client/hooks/useGsdManager.ts
import { useState, useEffect, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RecoveryRegistry, GsdHookEvent, GsdSessionState } from '@shared/gsdTypes.js';

const REGISTRY_POLL_INTERVAL_MS = 30_000;

export function useGsdManager() {
  const [registry, setRegistry] = useState<RecoveryRegistry | null>(null);
  const [hookEvents, setHookEvents] = useState<GsdHookEvent[]>([]);
  const [sessionStates, setSessionStates] = useState<Record<string, GsdSessionState>>({});

  // Fetch registry
  const fetchRegistry = useCallback(async () => {
    const response = await fetch('/api/gsd/registry');
    if (!response.ok) return;
    const data = await response.json();
    setRegistry(data.registry);
  }, []);

  useEffect(() => {
    fetchRegistry();
    const interval = setInterval(fetchRegistry, REGISTRY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRegistry]);

  // Socket.IO hook event subscription
  useEffect(() => {
    const socket: Socket = io('/gsd-hooks');
    socket.on('gsd:hook-event', (event: GsdHookEvent) => {
      setHookEvents(previous => [event, ...previous].slice(0, 20)); // keep last 20
    });
    return () => { socket.disconnect(); };
  }, []);

  const spawnAgent = useCallback(async (agentName: string, workingDirectory: string, firstCommand?: string) => {
    await fetch('/api/gsd/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, workingDirectory, firstCommand }),
    });
  }, []);

  const sendCommand = useCallback(async (session: string, action: string, args?: string[]) => {
    await fetch(`/api/gsd/sessions/${encodeURIComponent(session)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args }),
    });
  }, []);

  return { registry, hookEvents, sessionStates, spawnAgent, sendCommand };
}
```

---

## Shared Types (gsdTypes.ts)

Follows `src/shared/types.ts` and `src/shared/openclawTypes.ts` pattern. Imported with `@shared` alias.

```typescript
// src/shared/gsdTypes.ts

export interface RegistryAgent {
  agent_id: string;
  enabled: boolean;
  auto_wake: boolean;
  topic_id: number;
  openclaw_session_id: string;
  working_directory: string;
  tmux_session_name: string;
  claude_resume_target: string;
  claude_launch_command: string;
  claude_post_launch_mode: string;
  system_prompt: string;
  hook_settings: Record<string, unknown>;
}

export interface RecoveryRegistry {
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: RegistryAgent[];
}

export interface GsdHookEvent {
  timestamp: string;    // e.g. "2026-02-17T22:21:21Z"
  script: string;       // e.g. "stop-hook.sh"
  message: string;      // e.g. "state=idle"
  raw: string;          // full log line
}

export interface GsdSessionState {
  sessionName: string;
  agentId: string;
  stateMdContent: string | null;
  lastFetchedAt: string;
}

export interface GsdSpawnRequest {
  agentName: string;
  workingDirectory: string;
  firstCommand?: string;
}

export interface GsdCommandRequest {
  action: 'snapshot' | 'enter' | 'esc' | 'clear_then' | 'choose' | 'type' | 'submit';
  args?: string[];
}
```

---

## Data Flow Diagrams

### Spawn Agent Flow

```
User clicks "Spawn" in gsd-manager-plugin
    |
    v
POST /api/gsd/spawn { agentName, workingDirectory, firstCommand }
    |
    v
gsdRoutes validates inputs -> gsdService.validateSpawnInputs()
    |
    v
gsdService.spawnAgentBackground() [fire and forget]
    |                                         |
    v                                         v (background)
202 Accepted returned to client        spawn.sh creates tmux session,
    |                                  launches Claude Code,
    v                                  waits for TUI (~15-20s),
Plugin shows "Spawning..." status      sends firstCommand
                                              |
                                             10s later
                                              |
                                              v
                                    InstanceTracker.syncWithTmux()
                                    discovers new session
                                              |
                                              v
                                    /api/instances updated
                                    -> new TerminalView tab appears
```

### Send GSD Command Flow

```
User clicks "/gsd:resume-work" preset in plugin
    |
    v
POST /api/gsd/sessions/warden-main/command
     { action: "clear_then", args: ["/gsd:resume-work"] }
    |
    v
gsdRoutes -> gsdService.runMenuDriverCommand("warden-main", "clear_then", ["/gsd:resume-work"])
    |
    v
execFileAsync(menu-driver.sh, ["warden-main", "clear_then", "/gsd:resume-work"], timeout: 5s)
    |
    v
tmux send-keys executes in session
    |
    v
200 OK { success: true }
```

### Hook Log Streaming Flow

```
Hook script (stop-hook.sh, pre-tool-use-hook.sh) fires
    |
    v
Appends to /tmp/gsd-hooks.log:
"[2026-02-18T10:00:00Z] [stop-hook.sh] state=idle"
    |
    v
GsdHookLogWatcher.onFileChange() triggered by fs.watch
    |
    v
Reads new bytes since lastReadPosition
Parses lines -> GsdHookEvent[]
    |
    v
socketServer.of('/gsd-hooks').emit('gsd:hook-event', event)
    |
    v
useGsdManager hook receives event via socket.on('gsd:hook-event', ...)
    |
    v
setHookEvents(previous => [event, ...previous].slice(0, 20))
    |
    v
HookFeed section in gsd-manager-plugin re-renders with new event prepended
```

### Registry + STATE.md Data Flow

```
Plugin mounts -> useGsdManager initializes
    |
    v
GET /api/gsd/registry
    |
    v
gsdService.readRegistry()
  -> fs.readFile(REGISTRY_PATH)
  -> JSON.parse -> cached for 30s
    |
    v
{ registry: RecoveryRegistry } stored in hook state
    |
    v (per agent with working_directory)
GET /api/gsd/sessions/:session/state
    |
    v
gsdService.readSessionState(session)
  -> registry lookup by tmux_session_name
  -> fs.readFile(workdir + '/.planning/STATE.md')
  -> return raw string content (or null if missing)
    |
    v
Plugin renders STATE.md as preformatted text
Best-effort phase extraction with regex fallback to "unknown"
```

---

## Integration Points: New vs Existing

| New Component | Integrates With | How |
|---------------|-----------------|-----|
| `gsdRoutes` | `src/server/index.ts` | `app.use(gsdRoutes)` — 1 line, same as existing route mounts |
| `GsdHookLogWatcher` | `src/server/index.ts` | `setupSocketNamespace(socketServer)` + `start()`/`stop()` — mirrors `terminalStreamService` pattern |
| `GsdService` | `TmuxSessionManager` | No coupling. `spawn.sh` handles tmux internally. `InstanceTracker` discovers the result. |
| `GsdService` | `OpenClawConfigReader` | No coupling. Both read independent JSON files with their own caches. |
| `gsd-manager-plugin.tsx` | Plugin system | Drop file in `src/client/plugins/`. Vite glob in `index.ts` auto-discovers. Zero other changes. |
| `useGsdManager` | Socket.IO | Connects to `/gsd-hooks` (new namespace). Uses same `socket.io-client` already in dependencies. |

---

## Suggested Build Order

Build order respects: types first, then server infrastructure, then server routes, then client.

### Step 1: Shared Types (No Dependencies)
**File:** `src/shared/gsdTypes.ts`

Create all TypeScript interfaces: `RegistryAgent`, `RecoveryRegistry`, `GsdHookEvent`, `GsdSessionState`, `GsdSpawnRequest`, `GsdCommandRequest`.

**Verify:** Types compile cleanly, `@shared` alias resolves.

### Step 2: GsdService (Depends on: gsdTypes)
**File:** `src/server/services/GsdService.ts`

Implement registry read/cache, `patchRegistryAgent`, `validateSpawnInputs`, `spawnAgentBackground`, `runMenuDriverCommand`, `readSessionState`, `tailHookLog`.

**Verify:** Smoke-test each method manually: `readRegistry()` returns parsed JSON, `runMenuDriverCommand` calls correct script path, `readSessionState` returns null gracefully for unknown sessions.

### Step 3: gsdRoutes + index.ts mount (Depends on: GsdService)
**Files:** `src/server/routes/gsdRoutes.ts` + 1-line change in `src/server/index.ts`

Implement all 6 REST endpoints. Add `app.use(gsdRoutes)` to `index.ts`.

**Verify:** `curl http://localhost:3001/api/gsd/registry` returns registry JSON.

### Step 4: GsdHookLogWatcher + index.ts (Depends on: gsdTypes, Socket.IO server)
**File:** `src/server/services/GsdHookLogWatcher.ts`

Implement `setupSocketNamespace`, `start`, `stop`, `onFileChange`, `parseLine`, `readRecentLines`. Add to `index.ts` startup/shutdown (3 lines, mirrors `terminalStreamService`).

**Verify:** Connect a `socket.io-client` test to `/gsd-hooks` namespace; append a line to `/tmp/gsd-hooks.log`; receive `gsd:hook-event`.

### Step 5: useGsdManager Hook (Depends on: gsdTypes, Steps 3-4 server routes live)
**File:** `src/client/hooks/useGsdManager.ts`

Implement registry polling, Socket.IO subscription, `spawnAgent`, `sendCommand` mutations.

**Verify:** Hook renders without error when wrapped in a test component; registry state populates from `/api/gsd/registry`.

### Step 6: gsd-manager-plugin.tsx (Depends on: useGsdManager, gsdTypes)
**File:** `src/client/plugins/gsd-manager-plugin.tsx`

Implement manifest (`bottom-panel` slot), `GsdControlCenterPanel` with four sections: AgentGrid, QuickActions, HookFeed, ManualCommandRef.

**Verify:** Plugin appears in Plugins registry view. Enables and renders in bottom panel on Terminals view.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking the HTTP Request on spawn.sh

**What people do:** `await execFileAsync(spawn.sh, ...)` in the route handler, making the client wait 20+ seconds.

**Why it's wrong:** `spawn.sh` blocks for ~15-25s waiting for the Claude TUI readiness check (`wait_for_claude_tui_readiness`). The HTTP request will timeout in browsers and proxies at their default timeouts.

**Do this instead:** Validate inputs synchronously, start `execFile` without awaiting, return `202 Accepted` immediately. The session will appear in `/api/instances` within 10s via `InstanceTracker.startPeriodicSync()`.

### Anti-Pattern 2: Writing registry-registry.json Without Awareness of spawn.sh Locking

**What people do:** `readFile` -> modify in memory -> `writeFile` in a Node.js async function.

**Why it's wrong:** `spawn.sh` uses `flock -x` for all registry writes. If a Node.js write occurs concurrently with a spawn, the JSON can be corrupted (partial write).

**Do this instead:** For simple field patches (toggling `enabled`), the risk is low since spawns are rare. However, document the known race and keep writes minimal. Never do batch/structural writes from Node.js.

### Anti-Pattern 3: Polling the Hook Log from the Client

**What people do:** Client calls `GET /api/gsd/hooks/log` every few seconds.

**Why it's wrong:** Each poll reads the entire tail of a growing file. Creates O(n) work per poll. Duplicate events on each response unless client tracks what it has seen.

**Do this instead:** `GsdHookLogWatcher` tails server-side and pushes only new lines via Socket.IO. Client receives exactly one event per hook log line appended.

### Anti-Pattern 4: Injecting Props into PanelComponent

**What people do:** Try to pass `instances` or `selectedSession` as props to `GsdControlCenterPanel`.

**Why it's wrong:** `PluginSlotRenderer` calls `<PanelComponent />` with no props — `ComponentType` in `pluginTypes.ts` accepts none. Adding props requires changing the plugin type contract, which breaks all existing plugins.

**Do this instead:** `GsdControlCenterPanel` sources all data through `useGsdManager`. If it needs the currently selected tmux session, it calls `GET /api/instances` itself.

### Anti-Pattern 5: Complex STATE.md Parsing in the Service Layer

**What people do:** Attempt to extract structured phase numbers and progress percentages from STATE.md using multi-regex pipelines in `GsdService`.

**Why it's wrong:** STATE.md is human-written markdown with no stable schema across projects. Complex parsing breaks silently as the format drifts.

**Do this instead:** Return raw STATE.md content to the client. The plugin performs best-effort first-heading extraction for the summary row and displays the full content as preformatted text. Graceful fallback to "unknown" when parsing fails.

---

## Scaling Considerations

This is a single-operator local dashboard. The only multi-connection scenario is multiple browser tabs.

| Concern | Approach |
|---------|----------|
| Multiple browser tabs on `/gsd-hooks` | Socket.IO namespace fan-out handles this natively |
| Concurrent spawn requests | `validateSpawnInputs` rejects if session name already exists via tmux check |
| Registry write contention (Node.js vs spawn.sh) | Low-frequency writes; document as known race; acceptable for operator tooling |
| Hook log file unbounded growth | `GsdHookLogWatcher` tracks byte position; never loads full file into memory |
| `GsdService` registry cache stale after spawn | Cache TTL 30s; spawn completion visible in `/api/instances` before cache expires |

---

## Sources

All findings from direct codebase inspection (HIGH confidence):

- `src/server/index.ts` — Route mounting pattern, service initialization, shutdown pattern
- `src/server/routes/instanceRoutes.ts`, `agentRoutes.ts`, `historyRoutes.ts`, `activityRoutes.ts` — Confirmed route module pattern (Router export, singleton import, error handling shape)
- `src/server/services/TmuxSessionManager.ts` — `execFileAsync` wrapper pattern, singleton export
- `src/server/services/OpenClawConfigReader.ts` — TTL cache pattern (30s), `readFile` + JSON parse
- `src/server/services/TerminalStreamService.ts` — Socket.IO namespace setup, `setSocketServer`/`setupSocketNamespace` integration with `index.ts`
- `src/client/plugins/example-plugin.tsx` — Confirmed plugin contract: `{ manifest, PanelComponent }` satisfies `PluginModule`, no props on `PanelComponent`
- `src/shared/pluginTypes.ts` — Confirmed `ComponentType` (no props), `PluginSlot` enum includes `'bottom-panel'`
- `src/client/plugins/index.ts` — Confirmed `import.meta.glob('./*.tsx', { eager: true, import: 'default' })` for auto-discovery
- `src/client/App.tsx` line 318 — Confirmed `bottom-panel` slot rendered under terminals view
- `src/client/hooks/useActiveInstances.ts` — Polling pattern (5s interval, `useCallback`+`useEffect`)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh` — Confirmed 15-25s blocking (`wait_for_claude_tui_readiness`), `flock` on registry writes, session naming (`{agent}-main`)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh` — Confirmed actions: `snapshot`, `enter`, `esc`, `clear_then`, `choose`, `type`, `submit`
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json` — Live schema confirmed: `agent_id`, `enabled`, `working_directory`, `tmux_session_name` fields
- `/tmp/gsd-hooks.log` — Live log format confirmed: `[ISO-timestamp] [script-name.sh] message`

---

*Architecture research for: GSD Manager Plugin integration into Warden Dashboard*
*Researched: 2026-02-18*
