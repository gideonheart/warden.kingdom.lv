# Stack Research

**Domain:** GSD Manager Plugin — shell command proxying, real-time log tailing, process spawning, JSON config editing, tmux session management, STATE.md parsing
**Researched:** 2026-02-18
**Confidence:** HIGH

---

## Context: Milestone v2.1 — Additive Only

This file covers only the NEW technical capabilities needed for the GSD Manager plugin. The following are validated and in production — do not re-research or re-add them:

| Already Present | Version | Notes |
|-----------------|---------|-------|
| Express 5 | ^5.0.0 | Route module pattern: `src/server/routes/*.ts`, mounted in `index.ts` |
| Socket.IO 4 | ^4.8.0 | `/terminal` namespace exists; adding `/gsd` follows the same pattern |
| React 19 | ^19.0.0 | Plugin auto-discovered via `import.meta.glob('./*.tsx', {eager: true})` |
| better-sqlite3 | ^11.0.0 | WAL mode SQLite; not needed for GSD plugin features |
| node-pty | ^1.0.0 | Terminal streaming; not needed for GSD plugin |
| Tailwind CSS 4 | ^4.0.0 | `warden-*` tokens established in `styles.css` |
| TypeScript 5 | ^5.7.0 | Strict mode, ESM |
| Node.js | v22.22.0 | Confirmed on this machine |
| socket.io-client | ^4.8.0 | Already in devDependencies, used by client |

**Result: Zero new npm dependencies required for this milestone.**

---

## Capability Analysis

### Capability 1: Shell Command Proxying (spawn.sh, menu-driver.sh)

**Requirement:** Express routes that execute `spawn.sh <agent> <workdir> [cmd]` and `menu-driver.sh <session> <action> [args]` as subprocesses, capturing output and exit codes.

**Decision: `child_process.execFile` (Node.js built-in) — already in codebase.**

`TmuxSessionManager.ts` already uses `execFile` promisified via `util.promisify`. It is the established project pattern. `execFile` does not spawn a shell, so arguments cannot be injected through shell metacharacters — each argument is passed as a discrete array element to the OS exec syscall. This is the correct security model.

Script paths confirmed on this machine:
- `spawn.sh`: `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh`
- `menu-driver.sh`: `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh`

`spawn.sh` takes 15–30 seconds to complete (it polls for Claude TUI readiness). Use a 60-second timeout on `execFile`.

Pattern (mirrors existing `TmuxSessionManager.ts`):

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SPAWN_SCRIPT_PATH =
  '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh';
const MENU_DRIVER_SCRIPT_PATH =
  '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh';

async function spawnGsdAgent(
  agentId: string,
  workingDirectory: string,
  firstCommand: string
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    SPAWN_SCRIPT_PATH,
    [agentId, workingDirectory, firstCommand],
    { timeout: 60_000 }
  );
}

async function runMenuDriverAction(
  sessionName: string,
  action: string,
  actionArgs: string[]
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    MENU_DRIVER_SCRIPT_PATH,
    [sessionName, action, ...actionArgs],
    { timeout: 10_000 }
  );
}
```

**Input validation** — manual TypeScript guards, same pattern as `agentRoutes.ts`:
- `agentId`: must match `/^[a-z][a-z0-9-]{0,50}$/` (agent names are lowercase identifiers)
- `workingDirectory`: must be absolute path starting with `/`; verify it exists with `fs.stat()` before calling script
- `firstCommand`: string, reject if it contains null bytes
- `sessionName` in route params: must match `/^[a-zA-Z0-9_-]+$/` before passing to execFile
- `action` for menu-driver: validate against allowlist: `['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'type', 'submit']`

**Why not `child_process.exec`:** `exec` spawns `/bin/sh -c`, creating a shell injection vector. `execFile` bypasses the shell entirely. This is a principle, not just a performance concern.

**Why not `child_process.spawn` for streaming:** `spawn.sh` runs to completion before the session is useful. `execFile` with timeout is simpler and the established pattern. No streaming of spawn output is needed.

**Why not rewrite spawn.sh logic in TypeScript:** The script handles flock-based concurrent registry writes, TUI readiness polling (polling for `❯` character), system prompt composition, session name conflict resolution, and `jq`-based JSON manipulation. Rewriting creates maintenance divergence with a proven script. Call it; don't copy it.

---

### Capability 2: Real-Time Log File Tailing (gsd-hooks.log)

**Requirement:** Push new lines from `/tmp/gsd-hooks.log` to the browser as they are appended — the "Hook Activity Feed" showing the last ~20 events.

**Decision: `fs.watch` (Node.js built-in) + new Socket.IO `/gsd` namespace — no new dependency.**

On Linux, `fs.watch` uses inotify, which fires reliably on file appends without polling. Verified on this machine: `fs.watch` on `/tmp/gsd-hooks.log` registers correctly. Incremental reads from the last known byte offset capture only new content.

The log format is consistent line-by-line. Each entry:
```
[2026-02-17T22:21:21Z] [stop-hook.sh] FIRED — PID=2798 TMUX=/tmp/...
[2026-02-17T22:21:21Z] [stop-hook.sh] tmux_session=warden-main-2
[2026-02-17T22:21:21Z] [stop-hook.sh] state=permission_prompt
```

For the initial page load, tail the last 100 lines via a GET endpoint (read whole file, split, slice last 100).

For live updates, use a `GsdHookLogWatcher` service singleton that holds the `fs.watch` handle and emits to all `/gsd` namespace subscribers:

```typescript
import { watch, statSync, openSync, readSync, closeSync } from 'fs';
import type { Server as SocketIOServer } from 'socket.io';

const GSD_HOOKS_LOG_PATH = '/tmp/gsd-hooks.log';

class GsdHookLogWatcher {
  private lastFileOffset = 0;
  private fileWatcher: ReturnType<typeof watch> | null = null;

  setupSocketNamespace(socketServer: SocketIOServer): void {
    const gsdNamespace = socketServer.of('/gsd');

    gsdNamespace.on('connection', () => {
      // Client connected — tailing happens server-side, broadcast to all
    });

    this.startWatching((newLines) => {
      gsdNamespace.emit('gsd:hook-lines', { lines: newLines });
    });
  }

  private startWatching(onNewLines: (lines: string[]) => void): void {
    // Start at end-of-file — don't replay history on server start
    try {
      this.lastFileOffset = statSync(GSD_HOOKS_LOG_PATH).size;
    } catch {
      this.lastFileOffset = 0;
    }

    this.fileWatcher = watch(GSD_HOOKS_LOG_PATH, (event) => {
      if (event !== 'change') return;
      try {
        const currentSize = statSync(GSD_HOOKS_LOG_PATH).size;
        if (currentSize <= this.lastFileOffset) {
          // File truncated — reset offset
          this.lastFileOffset = 0;
          return;
        }

        const newByteCount = currentSize - this.lastFileOffset;
        const buffer = Buffer.alloc(newByteCount);
        const fd = openSync(GSD_HOOKS_LOG_PATH, 'r');
        readSync(fd, buffer, 0, newByteCount, this.lastFileOffset);
        closeSync(fd);
        this.lastFileOffset = currentSize;

        const newLines = buffer
          .toString('utf-8')
          .split('\n')
          .filter((line) => line.trim().length > 0);

        if (newLines.length > 0) onNewLines(newLines);
      } catch {
        // Log may not exist yet — ignore until it appears
      }
    });
  }

  stopWatching(): void {
    this.fileWatcher?.close();
    this.fileWatcher = null;
  }
}

export const gsdHookLogWatcher = new GsdHookLogWatcher();
```

**Mount in `index.ts`:** Call `gsdHookLogWatcher.setupSocketNamespace(socketServer)` and `gsdHookLogWatcher.stopWatching()` in the shutdown handler.

**Client-side:** In the plugin component, connect to `/gsd` namespace via `socket.io-client` (already installed). Listen for `gsd:hook-lines` event. Keep a rolling buffer of last 100 lines in React state. This mirrors the `useTerminalSocket` hook pattern.

**Why not chokidar:** chokidar is a polling wrapper. On Linux it delegates to inotify (same as `fs.watch`). It adds ~100KB of transitive dependencies for zero benefit in this environment. The PRD explicitly states "No new dependencies required."

**Why not SSE (EventSource):** Socket.IO is already the real-time transport for this project. The client already opens a Socket.IO connection. Adding `/gsd` namespace is 10 lines. SSE would require a new `EventSource` client setup and a new server-side paradigm.

**Why not polling the log endpoint:** Polling every 1-2s creates unnecessary HTTP traffic and has latency. inotify is instant.

---

### Capability 3: JSON Config File Reading and Editing (recovery-registry.json)

**Requirement:** GET registry to display agent list (enabled/disabled, working directory, session name). PATCH individual agents to toggle `enabled`, update `working_directory`, etc.

**Decision: `fs/promises` (Node.js built-in) with atomic write-then-rename — no new dependency.**

The recovery-registry.json is **plain JSON** — not JSON5. Verified: `JSON.parse` works directly on the file. No comment stripping is needed (unlike `openclaw.json` which uses the existing `OpenClawConfigReader`).

Registry structure (confirmed from live file):
```json
{
  "global_status_openclaw_session_id": "...",
  "global_status_openclaw_session_key": "...",
  "agents": [
    {
      "agent_id": "forge",
      "enabled": true,
      "auto_wake": false,
      "topic_id": 1,
      "openclaw_session_id": "...",
      "working_directory": "/home/forge",
      "tmux_session_name": "forge-main",
      "claude_resume_target": "",
      "claude_launch_command": "claude --dangerously-skip-permissions",
      "claude_post_launch_mode": "resume_then_agent_pick"
    }
  ]
}
```

Atomic write pattern (mirrors `spawn.sh`'s own `mv "$tmp_file" "$registry_file_path"` pattern):

```typescript
import { readFile, writeFile, rename } from 'fs/promises';
import path from 'path';

const REGISTRY_PATH =
  '/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json';

interface RegistryAgent {
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
}

interface RegistryData {
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: RegistryAgent[];
}

class GsdRegistryService {
  async readRegistry(): Promise<RegistryData> {
    const content = await readFile(REGISTRY_PATH, 'utf-8');
    return JSON.parse(content) as RegistryData;
  }

  async patchAgent(
    agentId: string,
    changes: Partial<Pick<RegistryAgent, 'enabled' | 'working_directory'>>
  ): Promise<void> {
    const registry = await this.readRegistry();
    const agent = registry.agents.find((a) => a.agent_id === agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    Object.assign(agent, changes);
    await this.writeRegistryAtomically(registry);
  }

  private async writeRegistryAtomically(data: RegistryData): Promise<void> {
    const tempPath = REGISTRY_PATH + '.warden-tmp';
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tempPath, REGISTRY_PATH); // atomic on same filesystem
  }
}

export const gsdRegistryService = new GsdRegistryService();
```

**Concurrency:** The operator is a single user. `spawn.sh` uses `flock` on the registry file. To avoid conflicting with spawn.sh writes, Warden's PATCH endpoint should be quick (read-modify-write in <100ms). No file locking library is needed. If a race condition occurs (extremely rare — spawn takes 15+ seconds), the last writer wins and the registry remains valid JSON.

**Why not json5 package:** The registry is plain JSON written by `jq`, not JSON5.

**Why not a JSON schema validator (zod):** Single-operator trusted environment. TypeScript interface + `JSON.parse` type assertion is sufficient. Adding zod adds a dependency for no practical security gain in this context.

---

### Capability 4: Tmux Session Spawning and Management

**Requirement:** POST `/api/gsd/spawn` launches a new GSD session. POST `/api/gsd/sessions/:session/command` runs a menu-driver action. GET endpoints check session existence.

**Decision: Extend `TmuxSessionManager` with a `spawnGsdSession` method + call scripts via `execFile` — no new dependency.**

`TmuxSessionManager` already has:
- `listAgentSessions()` — filtered session list
- `sessionExists()` — check if a session is live
- `destroySession()` — kill a session
- `sendPromptToSession()` — send keystrokes via `tmux send-keys` (already usable for `/api/gsd/sessions/:session/prompt`)

New methods to add to `TmuxSessionManager`:

```typescript
// Add to TmuxSessionManager class:

async spawnGsdSession(
  agentId: string,
  workingDirectory: string,
  firstCommand: string
): Promise<{ sessionName: string; stdout: string }> {
  const { stdout, stderr } = await execFileAsync(
    SPAWN_SCRIPT_PATH,
    [agentId, workingDirectory, firstCommand],
    { timeout: 60_000 }
  );
  // spawn.sh logs "Attach: tmux attach -t <name>" at the end
  const sessionMatch = stdout.match(/Attach: tmux attach -t (\S+)/);
  const sessionName = sessionMatch?.[1] ?? `${agentId}-main`;
  return { sessionName, stdout };
}

async runMenuDriverAction(
  sessionName: string,
  action: MenuDriverAction,
  actionArgs: string[]
): Promise<string> {
  const { stdout } = await execFileAsync(
    MENU_DRIVER_SCRIPT_PATH,
    [sessionName, action, ...actionArgs],
    { timeout: 10_000 }
  );
  return stdout;
}
```

**Why not add a separate `GsdSessionSpawner` service:** The `TmuxSessionManager` already owns all tmux-related operations. Adding spawn and menu-driver methods keeps the service boundary clean (tmux operations in one place). If it grows too large later, extract — but don't pre-optimize.

---

### Capability 5: STATE.md File Parsing

**Requirement:** GET `/api/gsd/sessions/:session/state` reads `STATE.md` from the session's project's `.planning/` directory and returns parsed fields (phase, progress, status, last activity).

**Decision: `fs/promises.readFile` + regex field extraction — no new dependency.**

STATE.md structure is consistent across all GSD projects (verified against 3 live files on this machine: warden, gsd-code-skill, getcpsr). The `## Current Position` section always contains these fields:

```
Phase: 7 of 7 (Registration, Deployment, and Documentation)
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-02-18 — Phase 7 complete, v2.0 milestone shipped
Progress: [██████████] 100% (v1.0 complete, v2.0 complete)
```

Field values are on a single line after the label. No multi-line parsing needed.

```typescript
import { readFile } from 'fs/promises';
import path from 'path';

interface ParsedStateFile {
  phase: string;
  currentPhaseNumber: number | null;
  totalPhases: number | null;
  plan: string;
  status: string;
  lastActivity: string;
  progressPercent: number | null;
  progressBar: string;
  rawContent: string;
}

function parseStateMdContent(content: string): ParsedStateFile {
  const extractField = (label: string): string =>
    content.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';

  const phaseRaw = extractField('Phase');
  const phaseMatch = phaseRaw.match(/^(\d+)\s+of\s+(\d+)/);
  const progressRaw = extractField('Progress');
  const percentMatch = progressRaw.match(/(\d+)%/);

  return {
    phase: phaseRaw,
    currentPhaseNumber: phaseMatch ? parseInt(phaseMatch[1], 10) : null,
    totalPhases: phaseMatch ? parseInt(phaseMatch[2], 10) : null,
    plan: extractField('Plan'),
    status: extractField('Status'),
    lastActivity: extractField('Last activity'),
    progressPercent: percentMatch ? parseInt(percentMatch[1], 10) : null,
    progressBar: progressRaw,
    rawContent: content,
  };
}

class GsdStateReader {
  async readSessionState(workingDirectory: string): Promise<ParsedStateFile | null> {
    const statePath = path.join(workingDirectory, '.planning', 'STATE.md');
    try {
      const content = await readFile(statePath, 'utf-8');
      return parseStateMdContent(content);
    } catch {
      return null; // Project may not have .planning/STATE.md yet
    }
  }
}

export const gsdStateReader = new GsdStateReader();
```

**Working directory resolution:** Look up `agent_id` (derived from session name prefix: `sessionName.split('-')[0]`) in `recovery-registry.json` to get `working_directory`. Then construct: `path.join(workingDirectory, '.planning', 'STATE.md')`.

**Why not a markdown parser (marked, remark, unified):** STATE.md is not parsed for markdown structure — only for 5 specific key-value lines in a known section. Regex on a ~100-line file is instant and dependency-free. A markdown parser would add 50–300KB of dependencies and parse structure that isn't needed.

---

## Recommended Stack Summary

### Zero New Dependencies

| Capability | Implementation | Node.js API |
|------------|---------------|------------|
| Shell command proxying | `execFile` (promisified) | `child_process` built-in |
| Real-time log tailing | `fs.watch` + inotify | `fs` built-in |
| JSON config read/write | `readFile` + `writeFile` + `rename` | `fs/promises` built-in |
| Tmux session management | Extend `TmuxSessionManager` | Uses existing `execFile` |
| STATE.md parsing | `readFile` + regex | `fs/promises` built-in |
| Real-time push to client | Socket.IO `/gsd` namespace | `socket.io` already installed |
| Plugin UI | `import.meta.glob` auto-discovery | Vite 6 built-in |

### New Files Required

| File | Type | Purpose |
|------|------|---------|
| `src/server/services/GsdRegistryService.ts` | Service | Read/write `recovery-registry.json` atomically |
| `src/server/services/GsdHookLogWatcher.ts` | Service | `fs.watch` on `/tmp/gsd-hooks.log`, emit to `/gsd` namespace |
| `src/server/services/GsdStateReader.ts` | Service | Read + parse `.planning/STATE.md` from project directory |
| `src/server/routes/gsdRoutes.ts` | Route module | Mount at `/api/gsd/`, wire services to endpoints |
| `src/client/plugins/gsd-manager-plugin.tsx` | Plugin | Self-registering bottom-panel plugin component |
| `src/client/hooks/useGsdSocket.ts` | Hook | Socket.IO `/gsd` namespace hook |
| `src/client/hooks/useGsdRegistry.ts` | Hook | Fetch + mutate registry via REST |
| `src/client/hooks/useGsdSessionState.ts` | Hook | Fetch parsed STATE.md for a session |
| `src/shared/gsdTypes.ts` | Types | Shared TypeScript types for GSD plugin API responses |

### Extensions to Existing Files

| File | Change |
|------|--------|
| `src/server/services/TmuxSessionManager.ts` | Add `spawnGsdSession()` and `runMenuDriverAction()` methods |
| `src/server/index.ts` | Import and mount `gsdRoutes`, initialize `GsdHookLogWatcher` |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `chokidar` | Polling wrapper; on Linux delegates to inotify = same as `fs.watch`; adds ~100KB transitive deps | `fs.watch` built-in |
| `zod` / `joi` / `yup` | No validation library in project; single-operator trust model; TypeScript interfaces + manual guards sufficient | Manual type guards (see `agentRoutes.ts` pattern) |
| `json5` npm package | `recovery-registry.json` is plain JSON written by `jq`; `openclaw.json` already handled by existing `OpenClawConfigReader` | `JSON.parse` for registry |
| `proper-lockfile` / `flock` npm packages | Single writer (operator); atomic rename pattern is correct for this concurrency level | `fs.rename` atomic pattern |
| `child_process.exec` | Spawns `/bin/sh -c`, enabling argument injection via shell metacharacters | `child_process.execFile` (no shell) |
| `child_process.spawn` for scripts | More complex API; scripts run to completion so streaming isn't needed | `execFile` with timeout |
| Rewriting `spawn.sh` in TypeScript | Creates maintenance divergence; script handles edge cases (flock, TUI readiness, jq writes) | Call `spawn.sh` via `execFile` |
| `marked` / `remark` / `unified` | Full markdown parsers; overkill for reading 5 key-value fields from STATE.md | Regex field extraction |
| SSE (`EventSource`) | Project uses Socket.IO for all real-time; adding SSE creates a second paradigm | Socket.IO `/gsd` namespace |

---

## Integration Points with Existing Services

### `TmuxSessionManager`
- `listAgentSessions()` — used by GSD routes to list sessions for the agent grid
- `sessionExists()` — validate session before running menu-driver commands
- `destroySession()` — called by stop action in GSD Manager
- `sendPromptToSession()` — already usable for `/api/gsd/sessions/:session/prompt` (send GSD command via tmux send-keys)
- **Add:** `spawnGsdSession()` and `runMenuDriverAction()` methods

### `OpenClawConfigReader`
- `getAgents()` — used to display agent display names alongside registry data (cross-reference by `agent_id`)
- 30s cache is acceptable for agent names

### `TerminalStreamService` / Socket.IO architecture
- New `/gsd` namespace follows identical pattern to `/terminal` namespace
- Instantiated in `index.ts`, passed `SocketIOServer` instance
- `GsdHookLogWatcher` emits to all `/gsd` subscribers

### `ActivityEventService`
- Optional: GSD Manager spawn actions can call `activityEventService.capturePromptSent()` to log to the activity timeline
- Not required for core functionality

---

## Version Compatibility

All new capabilities use Node.js 22 built-in APIs. No version compatibility issues.

| Component | Version | Confirmed By |
|-----------|---------|-------------|
| Node.js | v22.22.0 | `node --version` on this machine |
| `fs.watch` inotify backend | v22 built-in | Manual test on `/tmp/gsd-hooks.log` — fires on append |
| `fs.rename` atomic semantics | v22 built-in | POSIX guarantee; confirmed in Node.js docs |
| `execFile` promisified | v22 built-in | Already used in `TmuxSessionManager.ts` |
| `JSON.parse` on registry | v22 built-in | Manual test — file is valid plain JSON |
| Socket.IO namespace | 4.8.0 | Read existing `/terminal` namespace implementation |
| Plugin auto-discovery | Vite 6 + `import.meta.glob` | Read `src/client/plugins/index.ts` |
| STATE.md field format | — | Verified across 3 projects on this machine |

---

## Installation

```bash
# No new dependencies required.
# All capabilities use Node.js 22 built-ins and packages already installed.
```

---

## Sources

- `/home/forge/warden.kingdom.lv/src/server/services/TmuxSessionManager.ts` — `execFile` promisify pattern (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/services/LogTailService.ts` — `fs/promises.readFile` pattern (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/services/TerminalStreamService.ts` — Socket.IO namespace pattern (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/routes/agentRoutes.ts` — manual type guard validation pattern (HIGH confidence, read directly)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json` — plain JSON format confirmed (HIGH confidence, read directly + `JSON.parse` verified)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh` — interface `<agent> <workdir> [first-command]`, runtime ~15-30s, outputs `Attach: tmux attach -t <name>` (HIGH confidence, full read)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh` — actions allowlist: `snapshot|enter|esc|clear_then|choose|type|submit` (HIGH confidence, full read)
- `node --version` → v22.22.0 (HIGH confidence, executed)
- Manual test: `fs.watch` on `/tmp/gsd-hooks.log` registers without error; inotify-backed on Linux (HIGH confidence, executed)
- Manual test: `execFile('tmux', ['list-sessions', ...])` returns session list (HIGH confidence, executed)
- Manual test: `JSON.parse(fs.readFileSync(registry-path))` succeeds (HIGH confidence, executed)
- Manual test: atomic `writeFile` + `rename` pattern works correctly (HIGH confidence, executed)
- STATE.md verified in 3 projects (warden, gsd-code-skill, getcpsr): consistent `Phase:`, `Plan:`, `Status:`, `Progress:`, `Last activity:` fields (HIGH confidence, all 3 files read)
- `/tmp/gsd-hooks.log` — line format `[ISO-TIMESTAMP] [script-name] message` confirmed (HIGH confidence, read directly)

---

*Stack research for: GSD Manager Plugin (milestone v2.1) on Warden Dashboard*
*Researched: 2026-02-18*
