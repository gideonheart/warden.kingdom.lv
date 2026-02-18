# Phase 12: Backend Foundation - Research

**Researched:** 2026-02-18
**Domain:** Express 5 REST API, Socket.IO namespace, fs.watch tail, execFile spawn, input validation, JSON atomic writes
**Confidence:** HIGH

---

## Summary

Phase 12 adds a complete server-side API for GSD Control Center operations: reading and patching `recovery-registry.json`, spawning Claude Code sessions via `spawn.sh`, dispatching menu-driver.sh commands to live tmux sessions, streaming `/tmp/gsd-hooks.log` appends over a new Socket.IO namespace, and rejecting malformed input before it touches any shell.

The codebase already provides every pattern this phase needs. `TmuxSessionManager` shows the `execFile` / `promisify` / `execFileAsync` pattern for injection-safe shell dispatch. `OpenClawConfigReader` shows the 30s TTL cache-then-read pattern for file-backed data. `TerminalStreamService` shows how to register a second Socket.IO namespace (`socketServer.of('/gsd-hooks')`) with subscriber fan-out. `ActivityEventService` shows the singleton-with-backpressure service pattern. Route files (`instanceRoutes.ts`, `agentRoutes.ts`) show the `Router()` + mount-in-`index.ts` pattern. No new npm packages are required — all capabilities map to Node.js 22 built-ins or already-installed packages.

The two non-trivial implementation decisions already locked are: (1) spawn is fire-and-forget using `child_process.spawn` with `detached: true`, `stdio: 'ignore'`, and `child.unref()` — the 202 response is sent immediately before spawn.sh finishes; (2) registry writes use `writeFile` to a `.tmp` sibling then `fs.rename` (POSIX-atomic) to avoid corruption windows that `writeFileSync` would create.

**Primary recommendation:** Implement as three new files — `src/server/routes/gsdRoutes.ts`, `src/server/services/GsdRegistryService.ts`, `src/server/services/GsdHookLogWatcher.ts` — plus a mount line in `index.ts` and a `setupSocketNamespace` call mirroring the terminal pattern.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Server exposes REST endpoints for registry, spawn, command dispatch, state, and hook log operations | Five endpoints in `gsdRoutes.ts` following `instanceRoutes.ts` / `agentRoutes.ts` pattern; `Router()` mounted at `app.use(gsdRoutes)` in `index.ts` |
| INFRA-02 | Server exposes a Socket.IO namespace for real-time hook event push | `GsdHookLogWatcher` singleton using `socketServer.of('/gsd-hooks')` — mirrors `terminalStreamService.setupSocketNamespace()` pattern; `fs.watch` + offset tracking for log tailing; backfill 20 events on connect |
| INFRA-03 | All endpoints validate input to prevent shell injection and path traversal | `workdir`: `path.resolve()` + `.startsWith('/home/forge/')` assertion (CVE-2025-27210 — `path.normalize` insufficient). `firstCommand` / command args: `/^[\/a-zA-Z0-9 @:._-]+$/` allowlist (execFile does not protect downstream `send-keys` context). `action`: explicit allowlist of menu-driver.sh verbs |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express (Router) | ^5.0.0 | REST routes for `/api/gsd/*` | Already used; Router() pattern in every route module |
| socket.io (Server) | ^4.8.0 | `/gsd-hooks` namespace for live events | Already used; `socketServer.of('/gsd-hooks')` mirrors terminal namespace |
| child_process (built-in) | Node 22 | `spawn()` for fire-and-forget spawn.sh; `execFile` for menu-driver.sh | `execFile` already used in TmuxSessionManager |
| fs / fs/promises (built-in) | Node 22 | `fs.watch` for log tailing; `readFile` / `writeFile` / `rename` for registry R/W | Already used in OpenClawConfigReader, LogTailService |
| path (built-in) | Node 22 | `path.resolve` + prefix assertion for workdir security | Already used throughout codebase |
| better-sqlite3 | ^11.0.0 | NOT needed in Phase 12 — GSD state is file-based, not DB | Registry is JSON; hooks log is a flat text file |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| util.promisify | Node 22 | Wrap `execFile` for async/await (already used in TmuxSessionManager) | Use for synchronous menu-driver.sh dispatch only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `child_process.spawn` (fire-and-forget) | `execFile` / `execFileAsync` | execFile awaits completion — spawn.sh blocks 15-25s, must not block the 202 response |
| `fs.watch` + offset tracking | `tail -f` via child_process | fs.watch is a built-in; child_process adds complexity and a persistent child process |
| `path.resolve` + prefix assertion | `path.normalize` | path.normalize is insufficient per CVE-2025-27210; resolve collapses `..` before comparison |
| Atomic `writeFile` + `rename` | `writeFileSync` direct | Direct writes create corruption windows; rename is POSIX-atomic |

**Installation:** None required.

---

## Architecture Patterns

### Recommended File Structure

```
src/server/
├── routes/
│   ├── gsdRoutes.ts           # NEW — mounts at app.use(gsdRoutes) in index.ts
│   └── (existing route files)
├── services/
│   ├── GsdRegistryService.ts  # NEW — registry R/W with 30s TTL cache + atomic writes
│   ├── GsdHookLogWatcher.ts   # NEW — singleton fs.watch tail; /gsd-hooks namespace fan-out
│   └── (existing services)
└── index.ts                   # MODIFIED — import and mount gsdRoutes + GsdHookLogWatcher
```

### Pattern 1: REST Routes (mirrors instanceRoutes.ts)

**What:** `Router()` exported as named constant, mounted via `app.use()` in `index.ts`.
**When to use:** All five GSD REST endpoints.

```typescript
// src/server/routes/gsdRoutes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { gsdRegistryService } from '../services/GsdRegistryService.js';

export const gsdRoutes = Router();

gsdRoutes.get('/api/gsd/registry', async (_request: Request, response: Response) => {
  try {
    const registry = await gsdRegistryService.getRegistry();
    response.json(registry);
  } catch (error) {
    console.error('[GSD] Failed to read registry:', error);
    response.status(500).json({ error: 'Failed to read registry' });
  }
});
```

```typescript
// src/server/index.ts (addition)
import { gsdRoutes } from './routes/gsdRoutes.js';
import { gsdHookLogWatcher } from './services/GsdHookLogWatcher.js';
// ...
app.use(gsdRoutes);
// After socketServer is created:
gsdHookLogWatcher.setupSocketNamespace(socketServer);
gsdHookLogWatcher.startWatching();
// In handleShutdown:
gsdHookLogWatcher.stopWatching();
```

### Pattern 2: Registry Service with TTL Cache (mirrors OpenClawConfigReader)

**What:** Singleton class with `cachedRegistry` + `lastReadAt`, 30s TTL, invalidate on write.
**When to use:** `GET /api/gsd/registry` (read) and `PATCH /api/gsd/registry/agents/:agentId` (write).

```typescript
// src/server/services/GsdRegistryService.ts
import { readFile, writeFile, rename } from 'fs/promises';
import path from 'path';

const REGISTRY_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json';
const CACHE_TTL_MS = 30_000;

interface RegistryAgent {
  agent_id: string;
  enabled: boolean;
  working_directory: string;
  tmux_session_name: string;
  claude_launch_command: string;
  auto_wake: boolean;
  topic_id: number;
  openclaw_session_id: string;
  claude_resume_target: string;
  claude_post_launch_mode: string;
}

interface GsdRegistry {
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: RegistryAgent[];
}

class GsdRegistryService {
  private cachedRegistry: GsdRegistry | null = null;
  private lastReadAt = 0;

  async getRegistry(): Promise<GsdRegistry> {
    const now = Date.now();
    if (this.cachedRegistry && now - this.lastReadAt < CACHE_TTL_MS) {
      return this.cachedRegistry;
    }
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    this.cachedRegistry = JSON.parse(raw) as GsdRegistry;
    this.lastReadAt = now;
    return this.cachedRegistry;
  }

  async patchAgent(agentId: string, patch: Partial<Pick<RegistryAgent, 'enabled'>>): Promise<void> {
    const registry = await this.getRegistry();
    registry.agents = registry.agents.map(agent =>
      agent.agent_id === agentId ? { ...agent, ...patch } : agent
    );
    // Atomic write: temp file then rename
    const tmpPath = `${REGISTRY_PATH}.tmp`;
    await writeFile(tmpPath, JSON.stringify(registry, null, 2), 'utf-8');
    await rename(tmpPath, REGISTRY_PATH);
    // Invalidate cache immediately
    this.cachedRegistry = null;
    this.lastReadAt = 0;
  }
}

export const gsdRegistryService = new GsdRegistryService();
```

### Pattern 3: Fire-and-Forget Spawn (new pattern)

**What:** `child_process.spawn` with `detached: true`, `stdio: 'ignore'`, `child.unref()`.
**When to use:** `POST /api/gsd/spawn` — must return 202 before spawn.sh finishes (15-25s).

```typescript
// In gsdRoutes.ts
import { spawn } from 'child_process';

const SPAWN_SH_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh';

gsdRoutes.post('/api/gsd/spawn', async (request: Request, response: Response) => {
  const { agentName, workdir, firstCommand } = request.body as {
    agentName?: string;
    workdir?: string;
    firstCommand?: string;
  };

  // --- Validation ---
  if (!agentName || typeof agentName !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(agentName)) {
    response.status(400).json({ error: 'agentName must be alphanumeric/dash/underscore, starting with a letter' });
    return;
  }

  if (!workdir || typeof workdir !== 'string') {
    response.status(400).json({ error: 'workdir is required' });
    return;
  }

  // path.resolve + prefix assertion (CVE-2025-27210: path.normalize is insufficient)
  const resolvedWorkdir = path.resolve(workdir);
  if (!resolvedWorkdir.startsWith('/home/forge/')) {
    response.status(400).json({ error: 'workdir must be within /home/forge/' });
    return;
  }

  if (firstCommand !== undefined) {
    if (typeof firstCommand !== 'string' || !/^[\/a-zA-Z0-9 @:._-]+$/.test(firstCommand)) {
      response.status(400).json({ error: 'firstCommand contains disallowed characters' });
      return;
    }
  }

  // --- Fire-and-forget spawn ---
  const spawnArgs = [agentName, resolvedWorkdir];
  if (firstCommand) spawnArgs.push(firstCommand);

  const child = spawn(SPAWN_SH_PATH, spawnArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref(); // Do NOT await — respond immediately

  response.status(202).json({ message: 'Spawn initiated', agentName, workdir: resolvedWorkdir });
});
```

### Pattern 4: Synchronous Command Dispatch via execFile (mirrors TmuxSessionManager)

**What:** `execFile` (promisified) for `menu-driver.sh` — this IS awaited because the caller wants to know if the dispatch succeeded.
**When to use:** `POST /api/gsd/sessions/:session/command`.

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MENU_DRIVER_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh';
const ALLOWED_ACTIONS = new Set(['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'submit', 'type']);
const COMMAND_ARG_RE = /^[\/a-zA-Z0-9 @:._-]+$/;
const SESSION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

gsdRoutes.post('/api/gsd/sessions/:session/command', async (request: Request, response: Response) => {
  const { session } = request.params;
  const { action, args } = request.body as { action?: string; args?: string };

  if (!SESSION_NAME_RE.test(session)) {
    response.status(400).json({ error: 'Invalid session name' });
    return;
  }
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    response.status(400).json({ error: `action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}` });
    return;
  }
  if (args !== undefined && (typeof args !== 'string' || !COMMAND_ARG_RE.test(args))) {
    response.status(400).json({ error: 'args contains disallowed characters' });
    return;
  }

  try {
    const commandArgs = [session, action, ...(args ? [args] : [])];
    const { stdout } = await execFileAsync(MENU_DRIVER_PATH, commandArgs);
    response.json({ dispatched: true, output: stdout.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.status(500).json({ error: `Command dispatch failed: ${message}` });
  }
});
```

### Pattern 5: Socket.IO Namespace with fs.watch Tail (new pattern, mirrors /terminal namespace)

**What:** Singleton `GsdHookLogWatcher` watches `/tmp/gsd-hooks.log` with `fs.watch`, reads new bytes from tracked offset, emits line events to all namespace subscribers. Backfills last 20 log events on connect.
**When to use:** `GsdHookLogWatcher.setupSocketNamespace(socketServer)` call in `index.ts`.

```typescript
// src/server/services/GsdHookLogWatcher.ts
import * as fs from 'fs';
import type { Server as SocketIOServer } from 'socket.io';

const HOOK_LOG_PATH = '/tmp/gsd-hooks.log';
const BACKFILL_EVENT_COUNT = 20;

class GsdHookLogWatcher {
  private fileWatcher: fs.FSWatcher | null = null;
  private currentOffset = 0;
  private socketServer: SocketIOServer | null = null;

  setupSocketNamespace(socketServer: SocketIOServer): void {
    this.socketServer = socketServer;
    const namespace = socketServer.of('/gsd-hooks');

    namespace.on('connection', (socket) => {
      console.log(`[GsdHookLogWatcher] Client connected: ${socket.id}`);
      // Backfill last 20 events on connect
      const backfillLines = this.readLastLines(BACKFILL_EVENT_COUNT * 6); // ~6 lines/event avg
      socket.emit('gsd-hooks:backfill', { lines: backfillLines });

      socket.on('disconnect', () => {
        console.log(`[GsdHookLogWatcher] Client disconnected: ${socket.id}`);
      });
    });
  }

  startWatching(): void {
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);
      this.currentOffset = stat.size; // start at end — don't replay history via watcher
    } catch {
      this.currentOffset = 0; // file doesn't exist yet
    }

    this.fileWatcher = fs.watch(HOOK_LOG_PATH, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        this.readNewLines();
      }
    });

    this.fileWatcher.on('error', (error) => {
      console.error('[GsdHookLogWatcher] Watch error:', error);
    });

    console.log(`[GsdHookLogWatcher] Watching ${HOOK_LOG_PATH} from offset ${this.currentOffset}`);
  }

  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  private readNewLines(): void {
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);
      if (stat.size <= this.currentOffset) return; // no new data (or file truncated)

      const readSize = stat.size - this.currentOffset;
      const buffer = Buffer.alloc(readSize);
      const fileDescriptor = fs.openSync(HOOK_LOG_PATH, 'r');
      fs.readSync(fileDescriptor, buffer, 0, readSize, this.currentOffset);
      fs.closeSync(fileDescriptor);
      this.currentOffset = stat.size;

      const newContent = buffer.toString('utf-8');
      const newLines = newContent.split('\n').filter(line => line.trim().length > 0);

      if (newLines.length > 0 && this.socketServer) {
        const namespace = this.socketServer.of('/gsd-hooks');
        namespace.emit('gsd-hooks:lines', { lines: newLines });
      }
    } catch (error) {
      console.error('[GsdHookLogWatcher] Failed to read new lines:', error);
    }
  }

  private readLastLines(lineCount: number): string[] {
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);
      const readBytes = Math.min(stat.size, lineCount * 120); // 120 chars/line estimate
      const buffer = Buffer.alloc(readBytes);
      const fileDescriptor = fs.openSync(HOOK_LOG_PATH, 'r');
      fs.readSync(fileDescriptor, buffer, 0, readBytes, stat.size - readBytes);
      fs.closeSync(fileDescriptor);
      const content = buffer.toString('utf-8');
      return content.split('\n').filter(line => line.trim().length > 0).slice(-lineCount);
    } catch {
      return [];
    }
  }
}

export const gsdHookLogWatcher = new GsdHookLogWatcher();
```

### Pattern 6: State File Read (GET /api/gsd/sessions/:session/state)

**What:** Find `working_directory` from registry for a session, then read `.planning/STATE.md`.
**When to use:** `GET /api/gsd/sessions/:session/state`.

```typescript
gsdRoutes.get('/api/gsd/sessions/:session/state', async (request: Request, response: Response) => {
  const { session } = request.params;
  if (!SESSION_NAME_RE.test(session)) {
    response.status(400).json({ error: 'Invalid session name' });
    return;
  }

  const registry = await gsdRegistryService.getRegistry();
  const agentEntry = registry.agents.find(a => a.tmux_session_name === session);
  if (!agentEntry) {
    response.status(404).json({ error: 'Session not found in registry' });
    return;
  }

  const statePath = path.join(agentEntry.working_directory, '.planning', 'STATE.md');
  try {
    const content = await readFile(statePath, 'utf-8');
    response.json({ sessionName: session, stateContent: content });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      response.json({ sessionName: session, stateContent: null });
    } else {
      response.status(500).json({ error: 'Failed to read STATE.md' });
    }
  }
});
```

### Anti-Patterns to Avoid

- **Using `exec` instead of `execFile`:** `exec` passes command through a shell — shell injection is trivially possible. Always use `execFile` for subprocess calls.
- **Using `path.normalize` for security:** `path.normalize` collapses `..` but does not enforce prefix — see CVE-2025-27210. Use `path.resolve` + `startsWith` assertion.
- **Spawning spawn.sh with `execFileAsync`:** spawn.sh takes 15-25s to complete. Awaiting it blocks the event loop and returns a timeout. Use fire-and-forget pattern.
- **Creating a new `fs.FSWatcher` per Socket.IO connection:** Each watcher is a file descriptor. Use the singleton `GsdHookLogWatcher` pattern — one watcher, fan-out via `namespace.emit`.
- **Writing registry JSON directly (no atomic pattern):** If the server crashes mid-write, the registry is corrupt. Always: write to `.tmp`, then `rename`.
- **Trusting `agentName` / `session` as safe shell tokens:** Even with `execFile`, argument values flow into tmux `send-keys` commands inside spawn.sh, which ARE shell-context. Validate with allowlist regex before passing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log file tailing | Custom polling interval | `fs.watch` (Node built-in) + offset tracking | `fs.watch` uses kernel inotify — efficient, no polling overhead |
| Registry JSON parsing | Custom parser | `JSON.parse` + TypeScript interface | registry is valid JSON (no JSON5 comments unlike openclaw.json) |
| Backfill of recent events | Read entire file | Read from `fileSize - N_bytes` offset | File is ~48KB and growing; avoid loading all of it per connection |
| Input validation | Express middleware library | Inline regex + early return | Simpler; no new deps; follows existing route pattern |
| Process management | pm2 or job queues | `child.unref()` | Spawn.sh is self-contained and writes its own state; no tracking needed |

**Key insight:** Every capability maps to a Node.js 22 built-in or an already-installed package. The architectural complexity is in the validation logic, not in new libraries.

---

## Common Pitfalls

### Pitfall 1: `fs.watch` Event Deduplication on Linux

**What goes wrong:** On Linux, `fs.watch` emits multiple `change` events for a single `write()` syscall (especially for buffered writes). Without deduplication, `readNewLines()` runs 2-3× per append, potentially emitting duplicate lines.

**Why it happens:** Linux `inotify` can batch events differently than macOS `FSEvents`. A single append from a hook script may emit 1-3 `change` events.

**How to avoid:** Check `stat.size <= this.currentOffset` at the top of `readNewLines()`. Since offset advances after each read, duplicate events become no-ops. This is exactly the right guard (already shown in Pattern 5).

**Warning signs:** Clients receive identical lines twice in the hook feed.

### Pitfall 2: Log File Not Yet Existing at Server Start

**What goes wrong:** `/tmp/gsd-hooks.log` may not exist if no hooks have fired since the last reboot. `fs.statSync` throws `ENOENT`.

**Why it happens:** The log is in `/tmp/` — ephemeral, cleared on reboot.

**How to avoid:** Wrap `fs.statSync` in a try-catch in `startWatching()`, default `currentOffset = 0`. Also wrap `fs.watch` itself — if the file doesn't exist, watch the directory (`/tmp/`) for file creation, or use a simple polling fallback with `fs.watchFile` (which does not require the file to exist).

**Warning signs:** Server crashes on startup if no GSD hooks have fired yet.

**Better approach:** Use `fs.watchFile(HOOK_LOG_PATH, ...)` instead of `fs.watch` — `fs.watchFile` uses polling but does not throw if the file doesn't exist, and works when the file is created after watching starts. Since this is a low-frequency log (not a performance-sensitive hot path), polling every 1s is fine.

### Pitfall 3: Registry Concurrent Write Race with spawn.sh

**What goes wrong:** `POST /api/gsd/spawn` triggers spawn.sh which calls `upsert_agent_entry_in_registry` with `flock`. If the Node.js `PATCH /api/gsd/registry/agents/:id` endpoint writes at the same time, one write overwrites the other.

**Why it happens:** `flock` in bash and `rename` in Node.js don't share a lock.

**How to avoid:** Decision already accepted in state: "race with spawn.sh flock is acceptable at single-operator scale." Document this as a known limitation. The atomic rename from Node.js still prevents JSON corruption — only field-level merge conflicts are possible, not file corruption.

**Warning signs:** An `enabled` flag reverts after spawning. Acceptable at current scale.

### Pitfall 4: Injection via `session` URL Parameter

**What goes wrong:** `POST /api/gsd/sessions/:session/command` passes the session name to `menu-driver.sh`. `execFile` prevents shell injection at the Node.js level, but `session` is passed as the first arg to menu-driver.sh which calls `tmux has-session -t "$SESSION"`. If session contains special tmux characters (`:`, `.`), it may address unexpected panes.

**Why it happens:** tmux session addressing format is `session:window.pane`. A session named `foo:0.0` would address window 0 pane 0 of session `foo`, not a session literally named `foo:0.0`.

**How to avoid:** `SESSION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/` — forbid `:` and `.` in session names passed to this endpoint. Legitimate GSD session names (e.g., `warden`, `forge`, `gideon`) match this pattern.

**Warning signs:** Menu-driver.sh addresses wrong tmux pane.

### Pitfall 5: Backfill Over-reads

**What goes wrong:** `readLastLines(BACKFILL_EVENT_COUNT * 6)` reads a fixed line count from the tail of the file, but if recent events have long stdin dumps (2000+ bytes each), 120 chars/line estimate underestimates and the backfill misses events.

**Why it happens:** Hook log entries include stdin byte counts and tmux session info — some events are 3 lines, others are 8.

**How to avoid:** Read at least 8KB from the end of the file, split into lines, group by FIRED markers, take last 20 groups. Alternatively, keep it simple: read last 200 lines (always more than 20 events at 5.7 avg lines/event) and return them as-is. The client groups by FIRED markers for display.

**Warning signs:** Connect backfill returns fewer than 20 events even though the log has 93+ events.

---

## Code Examples

Verified patterns from this codebase:

### execFile Promisified (from TmuxSessionManager.ts)

```typescript
// Source: src/server/services/TmuxSessionManager.ts lines 1-6
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
// Usage:
const { stdout } = await execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}']);
```

### Socket.IO Namespace Fan-out (from TerminalStreamService.ts)

```typescript
// Source: src/server/services/TerminalStreamService.ts lines 17-22
setupSocketNamespace(socketServer: SocketIOServer): void {
  const terminalNamespace = socketServer.of('/terminal');
  terminalNamespace.on('connection', (socket: Socket) => {
    // ... per-socket setup
  });
}
```

### TTL Cache Pattern (from OpenClawConfigReader.ts)

```typescript
// Source: src/server/services/OpenClawConfigReader.ts lines 8-27
private cachedConfig: OpenClawConfig | null = null;
private lastReadAt = 0;

async getConfig(): Promise<OpenClawConfig> {
  const now = Date.now();
  if (this.cachedConfig && now - this.lastReadAt < CACHE_TTL_MS) {
    return this.cachedRegistry;
  }
  const rawContent = await readFile(CONFIG_PATH, 'utf-8');
  this.cachedConfig = JSON.parse(rawContent) as OpenClawConfig;
  this.lastReadAt = now;
  return this.cachedConfig;
}
```

### Router Module Pattern (from instanceRoutes.ts)

```typescript
// Source: src/server/routes/instanceRoutes.ts lines 1-3, 51
import { Router } from 'express';
const router = Router();
// ... route definitions
export { router as instanceRoutes };
```

### Fire-and-Forget (verified in this research session)

```typescript
// Verified working: Node.js 22 child_process.spawn
import { spawn } from 'child_process';

const child = spawn(SPAWN_SH_PATH, [agentName, resolvedWorkdir], {
  detached: true,
  stdio: 'ignore',
});
child.unref(); // event loop can exit without waiting for child
// Respond 202 immediately after this point
```

### Atomic Registry Write (verified in this research session)

```typescript
// POSIX rename is atomic — reader always sees either old or new, never corrupt
import { writeFile, rename } from 'fs/promises';

const tmpPath = `${REGISTRY_PATH}.tmp`;
await writeFile(tmpPath, JSON.stringify(registry, null, 2), 'utf-8');
await rename(tmpPath, REGISTRY_PATH); // atomic on same filesystem
```

### Path Security (verified in this research session)

```typescript
import path from 'path';

const resolvedWorkdir = path.resolve(workdir); // collapses all '..' traversal
if (!resolvedWorkdir.startsWith('/home/forge/')) {
  // reject — path.normalize alone is insufficient (CVE-2025-27210)
  return response.status(400).json({ error: 'workdir must be within /home/forge/' });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `exec` for subprocesses | `execFile` (arg array, no shell) | Node.js best practice | Shell injection impossible at Node boundary |
| `path.normalize` for path safety | `path.resolve` + prefix assertion | CVE-2025-27210 (2025) | `normalize` does not prevent absolute path injection |
| `fs.watch` per connection | Singleton watcher with fan-out | Resource exhaustion pattern | Prevents FD leak at high connection count |

**Deprecated / Outdated:**
- `exec(command)`: Never use for user-supplied input. `execFile(path, args[])` separates binary from arguments.
- `fs.watchFile` polling: Still valid for files that may not exist yet — NOT deprecated, just slower than `fs.watch`.

---

## Open Questions

1. **What happens when `/tmp/gsd-hooks.log` is recreated (server reboot)?**
   - What we know: The log is in `/tmp/` and is ephemeral. Server restart resets the watcher.
   - What's unclear: If the watcher is started on server boot when the file doesn't exist yet, and the file is created later, will `fs.watch` pick it up?
   - Recommendation: Use `fs.watchFile` with `{ interval: 1000, persistent: false }` — it polls and works on non-existent files. Switch to `fs.watch` only if performance becomes a concern (unlikely at 1 hook/min frequency).

2. **Should `GET /api/gsd/hooks/log` (static tail) be included or deferred to Phase 13?**
   - What we know: PRD lists it; Phase 12 success criteria only mention Socket.IO streaming.
   - What's unclear: Whether the client plugin (Phase 13) needs the REST endpoint or only the Socket.IO feed.
   - Recommendation: Implement the REST endpoint in Phase 12 (`GET /api/gsd/hooks/log?lines=100`) as a simple `readLastLines` call — it's trivial since `GsdHookLogWatcher` already implements it.

3. **Session name for spawn: registry-derived vs caller-provided?**
   - What we know: spawn.sh determines the actual tmux session name from the registry + suffix logic. The 202 response cannot include the final session name.
   - What's unclear: How does the client know which new session appeared in `/api/instances` after spawn?
   - Recommendation: Return `{ agentName, workdir }` in the 202 body. Client polls `/api/instances` and looks for a new session matching the agent prefix. The `agentName` is the prefix. This is described in Phase 12 Success Criteria #2.

---

## Sources

### Primary (HIGH confidence)

- Codebase analysis — `src/server/services/TmuxSessionManager.ts` (execFile pattern)
- Codebase analysis — `src/server/services/TerminalStreamService.ts` (Socket.IO namespace pattern)
- Codebase analysis — `src/server/services/OpenClawConfigReader.ts` (TTL cache pattern)
- Codebase analysis — `src/server/routes/instanceRoutes.ts` (Router pattern)
- Codebase analysis — `src/server/index.ts` (service wiring pattern)
- Live file inspection — `/tmp/gsd-hooks.log` (550 lines, ~5.7 lines/event, 93 events verified)
- Live file inspection — `recovery-registry.json` (structure verified)
- Live script inspection — `spawn.sh`, `menu-driver.sh` (interface and behavior verified)
- Runtime verification — `child_process.spawn` fire-and-forget (PID confirmed, no blocking)
- Runtime verification — `path.resolve` + prefix assertion (traversal correctly rejected)
- Runtime verification — `writeFile` + `rename` atomic pattern (verified working)
- Runtime verification — `firstCommand` regex allowlist (injection correctly rejected)

### Secondary (MEDIUM confidence)

- CVE-2025-27210 reference in phase prior decisions — confirms `path.normalize` is insufficient; `path.resolve` + prefix is the correct guard

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed and in use
- Architecture: HIGH — patterns extracted directly from codebase, not from docs or training
- Pitfalls: HIGH — identified from live code behavior (fs.watch dedup, flock race, tmux addressing)
- Security validation: HIGH — regex and path assertions verified at runtime

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable stack — 30 days)
