# Phase 1: Core Infrastructure - Research

**Researched:** 2026-02-12
**Domain:** Node.js backend with WebSocket terminal streaming, tmux integration, and SQLite persistence
**Confidence:** HIGH

## Summary

Phase 1 establishes the backend foundation for Warden Dashboard: an Express 5 server with Socket.IO WebSocket support that streams tmux terminal sessions to browsers via xterm.js, backed by SQLite for session persistence. The stack leverages modern async/await patterns with automatic error propagation (Express 5), parameterized command execution for security (execFile), and write-ahead logging for database reliability (SQLite WAL mode).

**Architecture pattern:** Service-oriented classes (TmuxSessionManager, TerminalStreamService, InstanceTracker) with singleton exports, using dependency-free instantiation and TypeScript for type safety. Project structure already scaffolded with proper separation: `src/server/` for backend logic, `src/shared/types.ts` for cross-boundary contracts, `src/client/` for React frontend.

**Primary recommendation:** Focus on graceful shutdown handlers (SIGTERM/SIGINT) with proper PTY process cleanup, WAL checkpoint on database close, and Socket.IO event listener cleanup to prevent zombie processes and memory leaks. Use parameterized execFile for all tmux commands to prevent command injection.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | 5.2.1+ | HTTP server + routing | Native async/await error propagation (Express 5 feature), industry standard for Node.js web apps |
| Socket.IO | 4.8.3+ | WebSocket transport | Auto-reconnect, room-based multiplexing, connection state recovery for terminal sessions |
| better-sqlite3 | 11.0.0+ (latest: 12.6.2) | SQLite persistence | Synchronous API (simpler than async), WAL mode support, excellent TypeScript types via @types/better-sqlite3 |
| node-pty | 1.1.0 | Terminal pseudoterminal | forkpty(3) bindings for spawning shells/processes with PTY, required for terminal I/O |
| xterm.js | 5.5.0 | Browser terminal emulator | Native ANSI color support, GPU acceleration via WebGL addon, zero dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | 7.6.0+ | TypeScript definitions | Always - better-sqlite3 is JS, types come separately |
| @xterm/addon-fit | 0.10.0 | Terminal auto-resize | Fit terminal to container element on window resize |
| @xterm/addon-webgl | Latest | GPU-accelerated rendering | Optional performance boost for high-volume terminal output |
| tsx | 4.19.0+ | TypeScript execution | Development server with watch mode (`tsx watch src/server/index.ts`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Socket.IO | native WebSocket (ws) | Lose auto-reconnect, room management, fallback transports - not worth complexity |
| better-sqlite3 | Postgres | SQLite sufficient for single-server deployment, zero config, WAL mode handles concurrency well |
| Express 5 | Fastify | Express has larger ecosystem, native async error handling in v5, team familiarity |
| node-pty | tmux control mode | node-pty gives finer control over PTY lifecycle, better for process management |

**Installation:**
```bash
npm install express@^5.0.0 socket.io@^4.8.0 better-sqlite3@^11.0.0 node-pty@^1.0.0
npm install --save-dev @types/better-sqlite3 @types/express tsx
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server/
│   ├── index.ts              # Entry point, server initialization
│   ├── database/
│   │   └── DatabaseConnection.ts  # SQLite connection + schema
│   ├── services/
│   │   ├── TmuxSessionManager.ts     # tmux CLI wrapper
│   │   ├── TerminalStreamService.ts  # PTY ↔ Socket.IO bridge
│   │   └── InstanceTracker.ts        # DB persistence + reconciliation
│   └── routes/
│       └── instanceRoutes.ts         # REST API endpoints
├── shared/
│   └── types.ts              # Cross-boundary TypeScript interfaces
└── client/
    └── hooks/                # React hooks for WebSocket integration
```

### Pattern 1: Service-Oriented Singletons
**What:** Stateful service classes exported as singletons, dependency-free instantiation
**When to use:** Services managing shared resources (DB connection, tmux sessions, PTY processes)
**Example:**
```typescript
// Source: Existing TmuxSessionManager.ts
export class TmuxSessionManager {
  async listAgentSessions(): Promise<TmuxSessionInfo[]> {
    const rawOutput = await this.executeTmuxCommand('list-sessions', [
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
    ]);
    return this.parseTmuxSessionList(rawOutput);
  }

  private async executeTmuxCommand(command: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('tmux', [command, ...args]);
    return stdout;
  }
}

export const tmuxSessionManager = new TmuxSessionManager();
```
**Why:** Simple DI without framework overhead, testable (can mock singleton export), clear ownership of resources.

### Pattern 2: Parameterized Command Execution (Security)
**What:** Use `execFile` with arguments array instead of string concatenation
**When to use:** ALWAYS when executing shell commands with external input
**Example:**
```typescript
// Source: Auth0 command injection prevention guide
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

// GOOD: Arguments passed as array, no shell interpretation
await execFileAsync('tmux', ['attach-session', '-t', userProvidedSessionName]);

// BAD: String concatenation - vulnerable to injection
await execAsync(`tmux attach-session -t ${userProvidedSessionName}`); // NEVER DO THIS
```
**Why:** `execFile` does not spawn a shell, preventing backticks, pipes, semicolons from executing arbitrary commands.

### Pattern 3: Express 5 Async Error Propagation
**What:** Return promises directly from route handlers, Express 5 auto-calls `next(error)` on rejection
**When to use:** All async route handlers in Express 5+
**Example:**
```typescript
// Source: https://expressjs.com/en/guide/error-handling.html
app.get('/instances/:id', async (req: Request, res: Response) => {
  // No try-catch needed - Express 5 catches promise rejections automatically
  const instance = await instanceTracker.getById(req.params.id);
  res.json(instance);
});

// Error middleware catches all errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```
**Why:** Express 5 eliminates boilerplate try-catch blocks, errors automatically propagate to error middleware.

### Pattern 4: Graceful Shutdown with Cleanup
**What:** Handle SIGTERM/SIGINT, close resources in order: stop accepting connections → finish pending requests → close DB → exit
**When to use:** REQUIRED for production Node.js services
**Example:**
```typescript
// Source: https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown');

  // 1. Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // 2. Close database connection (triggers WAL checkpoint)
  database.close();

  // 3. Kill all PTY processes
  await terminalStreamService.killAllPtyProcesses();

  // 4. Disconnect all Socket.IO clients
  io.close(() => {
    console.log('Socket.IO server closed');
    process.exit(0);
  });
});
```
**Why:** Prevents dirty shutdown, ensures SQLite WAL checkpoint runs, prevents PTY zombie processes.

### Pattern 5: Socket.IO Connection State Recovery
**What:** Server persists socket state (ID, rooms, data) during disconnection, restores on reconnect
**When to use:** Terminal sessions that must survive network interruptions
**Example:**
```typescript
// Source: https://socket.io/docs/v4/connection-state-recovery
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

io.on('connection', (socket) => {
  if (socket.recovered) {
    console.log('Recovery successful: rooms and data restored');
  } else {
    console.log('New connection or recovery failed');
    // Re-attach to terminal session
  }
});
```
**Why:** Browser refresh or network blip doesn't kill terminal session, user sees seamless reconnect.

### Anti-Patterns to Avoid
- **Global mutable state outside classes:** Use class instances or singleton exports, not top-level `let` variables
- **String concatenation for shell commands:** Always use `execFile` with args array
- **Synchronous SQLite in async context:** better-sqlite3 is sync-only, but wrap in service methods for testability
- **Missing event listener cleanup:** Socket.IO listeners must be removed on disconnect to prevent memory leaks
- **Ignoring PTY exit events:** Must track PTY processes and clean up on exit, or create zombies

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection | Custom reconnect logic with exponential backoff | Socket.IO `reconnection: true` (default) | Handles edge cases: offline mode, long-polling fallback, connection state recovery |
| Terminal emulator | HTML table + ANSI parser | xterm.js 5.x | 10+ years of edge case handling: Unicode, IME, ligatures, GPU rendering |
| SQLite connection pooling | Custom connection manager | better-sqlite3 single connection | SQLite serializes writes anyway, single connection with WAL mode handles concurrency |
| Process cleanup on exit | Manual process.exit() trapping | Signal handlers (SIGTERM/SIGINT) + async cleanup | Kubernetes/systemd send SIGTERM, need proper async shutdown sequence |
| Command injection escaping | Custom shell escape function | `execFile` with args array | Shell metacharacter edge cases are complex, execFile skips shell entirely |

**Key insight:** Terminal streaming has deceptive complexity (PTY lifecycle, ANSI parsing, Unicode, reconnection) - use battle-tested libraries (node-pty, xterm.js, Socket.IO) instead of rolling your own.

## Common Pitfalls

### Pitfall 1: PTY Zombie Processes
**What goes wrong:** Spawning PTY processes via node-pty without tracking them leaves zombie processes when server crashes or client disconnects abruptly.
**Why it happens:** PTY processes are child processes; if parent exits without cleanup, they become zombies (exit completed but still in process table).
**How to avoid:**
1. Track all PTY processes in a Map keyed by socket ID
2. Listen for `ptyProcess.onExit` and remove from tracking
3. On socket disconnect, call `ptyProcess.kill()` explicitly
4. On SIGTERM/SIGINT, iterate tracked PTYs and kill all
**Warning signs:** `ps aux | grep defunct` shows zombie processes, or memory usage grows unbounded.

### Pitfall 2: SQLite WAL Corruption on Dirty Shutdown
**What goes wrong:** Server crashes without closing database connection → WAL file not checkpointed → next startup sees incomplete transactions or corruption.
**Why it happens:** SQLite WAL mode writes to separate log file, checkpointed to main DB on `database.close()`. Dirty shutdown skips checkpoint.
**How to avoid:**
1. Enable WAL mode: `database.pragma('journal_mode = WAL')`
2. Register SIGTERM/SIGINT handlers that call `database.close()` before `process.exit(0)`
3. Use `database.pragma('wal_checkpoint(TRUNCATE)')` before close for clean shutdown
**Warning signs:** `-wal` and `-shm` files persist after shutdown, or database locked errors on restart.

### Pitfall 3: Socket.IO Memory Leaks from Event Listeners
**What goes wrong:** Adding event listeners on database connections or external services during socket connection without cleanup → listeners accumulate on every reconnect → memory leak.
**Why it happens:** `socket.on()` registers listeners that survive socket disconnect if external objects are referenced.
**How to avoid:**
1. Use `socket.once()` for one-time events
2. Store listener function refs and call `socket.off(event, listener)` on disconnect
3. Avoid adding listeners to long-lived objects inside socket handlers
**Warning signs:** MaxListenersExceededWarning in logs, memory usage grows linearly with connection count.

### Pitfall 4: Command Injection via String Concatenation
**What goes wrong:** Building tmux commands with template strings or concatenation → user input can inject shell metacharacters (`; rm -rf /`, backticks, pipes).
**Why it happens:** `exec()` and `execSync()` spawn a shell that interprets metacharacters; string concatenation includes user input verbatim.
**How to avoid:**
1. ALWAYS use `execFile(command, [args])` instead of `exec()`
2. Pass arguments as array, never concatenate into command string
3. Validate session names match expected pattern before passing to execFile
**Warning signs:** Shell characters in session names, or unexpected command execution in logs.

### Pitfall 5: Express 5 Async Error Handling Assumption
**What goes wrong:** Assuming Express <5 automatically catches async errors → unhandled promise rejections crash server.
**Why it happens:** Express 4 and below don't auto-catch promise rejections; must manually call `next(error)` or wrap in try-catch.
**How to avoid:**
1. Verify package.json has `express@^5.0.0` (check `npm list express`)
2. For Express 4, use `express-async-errors` package or manual try-catch
3. Always define error middleware with 4 parameters: `(err, req, res, next)`
**Warning signs:** UnhandledPromiseRejectionWarning in logs, server exits on async errors.

### Pitfall 6: Tmux Session Starvation
**What goes wrong:** Tmux sessions accumulate over time, server never cleans up stopped/detached sessions → memory usage grows unbounded.
**Why it happens:** Auto-discovery only adds sessions to DB, no periodic cleanup of dead sessions.
**How to avoid:**
1. Reconciliation service: compare DB sessions vs `tmux list-sessions` every 60s
2. Mark sessions not in tmux output as `status: 'stopped'`
3. Garbage collect `stopped` sessions older than 24h
4. Provide manual "kill session" button in UI
**Warning signs:** `tmux list-sessions` shows dozens of old sessions, server memory grows over days.

## Code Examples

Verified patterns from official sources and existing codebase:

### Tmux Session Discovery with Format Strings
```typescript
// Source: https://github.com/tmux/tmux/wiki/Formats + existing TmuxSessionManager.ts
async listAgentSessions(): Promise<TmuxSessionInfo[]> {
  const rawOutput = await this.executeTmuxCommand('list-sessions', [
    '-F',
    '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
  ]);

  if (!rawOutput.trim()) return [];

  return rawOutput
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [sessionName, windowCount, createdTimestamp, attachedCount] = line.split('|');
      return {
        sessionName,
        agentId: sessionName.split('-')[0],
        windowCount: parseInt(windowCount, 10),
        createdAt: new Date(parseInt(createdTimestamp, 10) * 1000),
        isAttached: parseInt(attachedCount, 10) > 0,
      };
    });
}
```

### SQLite WAL Mode Setup + Graceful Checkpoint
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3 + https://sqlite.org/wal.html
import Database from 'better-sqlite3';

class DatabaseConnection {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Optional: configure WAL autocheckpoint threshold
    this.db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
  }

  close(): void {
    // Checkpoint before close to ensure all data is in main DB
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
  }
}
```

### Socket.IO Terminal Streaming with PTY
```typescript
// Source: https://github.com/microsoft/node-pty + Socket.IO docs
import * as pty from 'node-pty';
import { Server, Socket } from 'socket.io';

class TerminalStreamService {
  private ptyProcesses = new Map<string, pty.IPty>();

  attachToSession(io: Server, socket: Socket, sessionName: string): void {
    // Spawn PTY attached to tmux session
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env,
    });

    // Track process for cleanup
    this.ptyProcesses.set(socket.id, ptyProcess);

    // Stream PTY output to browser
    ptyProcess.onData((data: string) => {
      socket.emit('terminal:data', data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      socket.emit('terminal:exit', { sessionName, exitCode });
      this.ptyProcesses.delete(socket.id);
    });

    // Handle browser input
    socket.on('terminal:input', (data: string) => {
      ptyProcess.write(data);
    });

    // Handle terminal resize
    socket.on('terminal:resize', ({ cols, rows }) => {
      ptyProcess.resize(cols, rows);
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      const pty = this.ptyProcesses.get(socket.id);
      if (pty) {
        pty.kill();
        this.ptyProcesses.delete(socket.id);
      }
    });
  }

  async killAllPtyProcesses(): Promise<void> {
    for (const [socketId, pty] of this.ptyProcesses.entries()) {
      pty.kill();
      this.ptyProcesses.delete(socketId);
    }
  }
}
```

### Express 5 Server with Graceful Shutdown
```typescript
// Source: https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

// Start server
httpServer.listen(3001, '127.0.0.1', () => {
  console.log('Server listening on http://127.0.0.1:3001');
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`${signal} received, starting graceful shutdown`);

  // 1. Stop accepting new HTTP connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // 2. Kill all PTY processes
  await terminalStreamService.killAllPtyProcesses();

  // 3. Close database (triggers WAL checkpoint)
  databaseConnection.close();
  console.log('Database closed');

  // 4. Close Socket.IO server
  io.close(() => {
    console.log('Socket.IO server closed');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### xterm.js Browser Integration with Socket.IO
```typescript
// Source: https://xtermjs.org/docs/guides/using-addons/ + Socket.IO client docs
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io } from 'socket.io-client';

const terminal = new Terminal({
  cursorBlink: true,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
  },
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

terminal.open(document.getElementById('terminal-container'));
fitAddon.fit();

// Connect to Socket.IO backend
const socket = io('http://127.0.0.1:3001');

socket.on('terminal:data', (data: string) => {
  terminal.write(data);
});

socket.on('terminal:exit', ({ exitCode }: { exitCode: number }) => {
  terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
});

// Send user input to backend
terminal.onData((data: string) => {
  socket.emit('terminal:input', data);
});

// Handle terminal resize
window.addEventListener('resize', () => {
  fitAddon.fit();
  socket.emit('terminal:resize', {
    cols: terminal.cols,
    rows: terminal.rows,
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express 4 try-catch wrappers | Express 5 auto async error propagation | Express 5.0.0 (2025) | Eliminates boilerplate, cleaner code |
| pty.js (deprecated) | node-pty | 2016 | Active maintenance, Windows support, modern API |
| Socket.IO attach addon (deprecated) | Manual PTY ↔ Socket.IO bridge | xterm.js 4.0 (2020) | More control over PTY lifecycle, better cleanup |
| SQLite DELETE mode | WAL mode | Always available, now default recommendation | Better concurrency, prevents writer starvation |
| xterm.js canvas renderer | WebGL addon (GPU-accelerated) | xterm.js 4.6+ (2021) | 2-3x faster rendering for high-volume output |

**Deprecated/outdated:**
- **pty.js**: Replaced by node-pty (Microsoft fork), no longer maintained
- **Socket.IO 2.x**: Missing connection state recovery (added in 4.x)
- **xterm-addon-attach**: Removed in xterm.js 5.0, replaced with manual Socket.IO integration
- **Express async wrapper packages (express-async-errors)**: Not needed in Express 5

## Open Questions

1. **Playwright UI Testing Strategy**
   - What we know: PRD requires Playwright desktop UI verification, CLAUDE.md mentions documenting how to run it
   - What's unclear: Should tests run against tmux mock sessions or real tmux? How to snapshot terminal output in tests?
   - Recommendation: Phase 1 focus on backend, defer Playwright to Phase 2 (UI). For backend verification, use integration tests with real tmux sessions in CI.

2. **Session Reconciliation Frequency**
   - What we know: Need periodic reconciliation between SQLite state and actual tmux sessions
   - What's unclear: Optimal frequency (every 60s? 5min? On-demand only?)
   - Recommendation: Start with 60s interval, make configurable via env var, monitor performance impact.

3. **Multi-User Authorization**
   - What we know: PRD mentions "user can view/stop sessions" but not authentication
   - What's unclear: Should backend enforce session ownership? Or trust localhost-only deployment?
   - Recommendation: Phase 1 assumes single-user localhost deployment (127.0.0.1 binding), defer auth to later phase if needed.

## Sources

### Primary (HIGH confidence)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) - v12.6.2 release, WAL mode documentation
- [Express.js Error Handling](https://expressjs.com/en/guide/error-handling.html) - Express 5 async error propagation
- [Socket.IO Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery) - v4.x reconnection features
- [node-pty GitHub](https://github.com/microsoft/node-pty) - v1.1.0 API documentation
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js) - Core library and addon documentation
- [tmux Formats Wiki](https://github.com/tmux/tmux/wiki/Formats) - Format variables for list-sessions
- Existing codebase: TmuxSessionManager.ts, types.ts, package.json

### Secondary (MEDIUM confidence)
- [Node.js Graceful Shutdown (OneUpTime, Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) - SIGTERM/SIGINT best practices
- [Command Injection Prevention (Auth0)](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/) - execFile vs exec security
- [Socket.IO Memory Usage](https://socket.io/docs/v4/memory-usage/) - Event listener cleanup patterns
- [@types/better-sqlite3 npm](https://www.npmjs.com/package/@types/better-sqlite3) - TypeScript type definitions

### Tertiary (LOW confidence - for awareness only)
- [WebSearch: TypeScript + Node.js Enterprise Patterns](https://medium.com/slalom-build/typescript-node-js-enterprise-patterns-630df2c06c35) - Service layer architecture discussion
- [WebSearch: xterm.js Socket.IO examples](https://github.com/jpcweb/xtermjs-socketio) - Community integration examples

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are current versions, official docs verified, existing package.json confirms choices
- Architecture: HIGH - Existing codebase demonstrates service-oriented pattern, execFile usage, TypeScript setup
- Pitfalls: HIGH - Command injection, PTY zombies, WAL shutdown verified via official docs + security guides
- Code examples: HIGH - Sourced from official docs (Express, Socket.IO, node-pty, better-sqlite3) + existing codebase

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable backend technologies, slow-moving ecosystem)
