# Pitfalls Research

**Domain:** Browser-based Terminal Dashboard / Agent Session Multiplexer
**Researched:** 2026-02-12
**Confidence:** MEDIUM (based on training data and architectural patterns; WebSearch/WebFetch unavailable for current verification)

## Critical Pitfalls

### Pitfall 1: PTY Process Zombie Apocalypse

**What goes wrong:**
node-pty spawned processes (tmux sessions) are not properly cleaned up when Socket.IO connections drop or clients navigate away. Zombie processes accumulate, consuming system resources until the server becomes unresponsive.

**Why it happens:**
Developers assume Socket.IO disconnect events are sufficient for cleanup, but network issues, browser crashes, and tab closures don't always trigger clean disconnects. Additionally, the PTY process lifecycle is separate from the Socket.IO connection lifecycle.

**How to avoid:**
- Implement a two-stage cleanup strategy:
  1. Socket.IO disconnect handlers (optimistic)
  2. Heartbeat/ping timeout detection (pessimistic fallback)
- Track all spawned PTY processes in a Map with metadata (creation time, last activity)
- Use `pty.kill()` followed by `pty.kill('SIGKILL')` after timeout if graceful shutdown fails
- Implement process monitoring that scans for orphaned tmux sessions
- Set `socket.io pingTimeout` and `pingInterval` appropriately (e.g., 5s/25s)

**Warning signs:**
- `ps aux | grep tmux` shows increasing session count over time
- Memory usage climbs steadily without corresponding active users
- Server becomes slow to respond after running for hours/days
- Errors like "EMFILE: too many open files"

**Phase to address:**
Phase 1 (Core Infrastructure) - Must be correct from day one. Process lifecycle management is foundational.

---

### Pitfall 2: Socket.IO Reconnection Data Loss

**What goes wrong:**
When Socket.IO reconnects after network disruption, terminal output generated during the disconnection is lost. Users see gaps in command output or miss critical error messages. The PTY continues running and producing output, but there's no buffer.

**Why it happens:**
Developers treat Socket.IO as a simple pipe without considering that it's an unreliable transport. Terminal output is streamed directly from PTY to socket without server-side buffering for reconnection scenarios.

**How to avoid:**
- Implement circular buffer per PTY session (e.g., last 10,000 lines or 1MB)
- On reconnection, send buffer contents to client before resuming live stream
- Add sequence numbers to messages for client-side gap detection
- Consider using tmux's built-in scrollback as the buffer (already persisted)
- Send periodic "heartbeat" messages with timestamps so gaps are detectable

**Warning signs:**
- Users report "missing output" after network interruptions
- Terminal shows incomplete command results
- No mechanism to replay recent history on reconnect
- Client-side xterm.js buffer gets cleared on reconnection

**Phase to address:**
Phase 2 (Terminal Integration) - Critical before multi-session support. Single-session testing won't expose this without deliberate network simulation.

---

### Pitfall 3: xterm.js Fit Addon Resize Race Condition

**What goes wrong:**
Terminal dimensions are incorrect, causing text wrapping issues, broken ncurses UIs (htop, vim), and tmux pane size mismatches. Resizing the browser window creates visual artifacts.

**Why it happens:**
Multiple async resize events race:
1. Browser window resize event
2. CSS layout recalculation
3. xterm.js fit addon calculation
4. Socket.IO message to server
5. PTY resize via `pty.resize()`
6. tmux window resize propagation

Without debouncing and synchronization, these can arrive out of order or incomplete.

**How to avoid:**
- Debounce resize events (300-500ms) on client side
- Wait for xterm.js `Terminal.element.offsetWidth/Height` to stabilize before calling fit()
- Send resize to server only after fit() completes
- On server, verify dimensions are sane (>= 1x1, <= 999x999) before calling pty.resize()
- Handle SIGWINCH properly in PTY (node-pty does this, but tmux interaction matters)
- Initial terminal creation must wait for DOM mount and first fit() before connecting PTY

**Warning signs:**
- Terminal text wraps at wrong column
- Vim/htop appear corrupted or truncated
- tmux panes don't match browser window proportions
- Console errors about invalid dimensions
- Terminal is 80x24 despite window being larger

**Phase to address:**
Phase 2 (Terminal Integration) - Must be tested with real ncurses applications (vim, htop, tmux UI).

---

### Pitfall 4: Express 5 Async Error Handling Gaps

**What goes wrong:**
Async errors in route handlers or middleware are not caught, causing the process to crash with "UnhandledPromiseRejectionWarning" or requests hanging indefinitely.

**Why it happens:**
Express 5 has better async support than Express 4, but doesn't automatically catch all async errors. Developers familiar with Express 4 patterns may not realize async middleware requires explicit error forwarding.

**How to avoid:**
- Use async middleware wrapper or express-async-errors package
- Always call `next(err)` in async try/catch blocks
- Set up global error handler middleware (with 4 parameters: err, req, res, next)
- Use top-level async handler wrapper:
  ```typescript
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  ```
- Configure process-level handlers:
  ```typescript
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
  });
  ```

**Warning signs:**
- Server crashes with unhandled promise rejections
- Requests timeout without response
- Error logs show promise rejections but no Express error handler execution
- No 500 responses, just hanging connections

**Phase to address:**
Phase 1 (Core Infrastructure) - Must be in place before any async route handlers are written.

---

### Pitfall 5: SQLite WAL Mode Corruption on Dirty Shutdown

**What goes wrong:**
SQLite database becomes corrupted after unclean server shutdown (kill -9, power loss, OOM killer). Sessions metadata is lost or inconsistent with actual tmux state.

**Why it happens:**
better-sqlite3 with WAL mode requires proper shutdown to checkpoint the WAL file. Without explicit cleanup on process signals, the WAL may not flush, leaving database in inconsistent state.

**How to avoid:**
- Enable WAL mode explicitly: `PRAGMA journal_mode = WAL;`
- Set appropriate checkpoint interval: `PRAGMA wal_autocheckpoint = 1000;`
- Implement graceful shutdown handler:
  ```typescript
  const gracefulShutdown = async () => {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    // Clean up PTY processes
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  ```
- Use immediate transactions for critical writes
- Implement database health check on startup (schema validation, integrity check)
- Consider foreign key constraints and cascading deletes for cleanup

**Warning signs:**
- "database disk image is malformed" errors on startup
- Session metadata doesn't match `tmux list-sessions` output
- Database file grows indefinitely (WAL not checkpointing)
- Queries return stale data after restart

**Phase to address:**
Phase 1 (Core Infrastructure) - Database initialization should include WAL setup and shutdown handlers.

---

### Pitfall 6: React 19 useEffect Double-Execution in StrictMode

**What goes wrong:**
Terminal components mount twice in development, creating duplicate Socket.IO connections and PTY sessions. Each tab refresh spawns two tmux sessions instead of one.

**Why it happens:**
React 19 StrictMode intentionally double-invokes effects to surface cleanup issues. Developers not expecting this behavior create effects without proper cleanup functions, causing resource leaks.

**How to avoid:**
- Always return cleanup function from useEffect:
  ```typescript
  useEffect(() => {
    const socket = io('/terminal');
    socket.on('data', handleData);

    return () => {
      socket.disconnect();
    };
  }, []);
  ```
- Use refs to track connection state and prevent double-connection:
  ```typescript
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) return; // Already connected

    socketRef.current = io('/terminal');
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);
  ```
- Test with StrictMode enabled in development
- Consider using React 19's useEffectEvent for stable event handlers

**Warning signs:**
- Console shows "Socket.IO connection" logged twice per mount
- `tmux list-sessions` shows duplicate sessions with similar names
- Memory usage doubles when component unmounts and remounts
- Dev tools Network tab shows duplicate WebSocket connections

**Phase to address:**
Phase 2 (Terminal Integration) - Must be correct before multi-tab support, as this amplifies the issue.

---

### Pitfall 7: Tailwind CSS 4 JIT Purge Removing Terminal Classes

**What goes wrong:**
Terminal UI elements lose styling in production build because Tailwind's JIT compiler purges dynamically generated class names (from xterm.js themes or runtime state).

**Why it happens:**
Tailwind CSS 4's CSS-first configuration and enhanced JIT engine is more aggressive about tree-shaking. Terminal themes may use class names not present in JSX/TSX source files.

**How to avoid:**
- Use Tailwind's safelist for dynamic terminal classes:
  ```typescript
  // tailwind.config.ts
  export default {
    safelist: [
      'xterm', 'xterm-screen', 'xterm-viewport',
      // Terminal color classes if using custom theme
      'terminal-cursor', 'terminal-foreground',
    ]
  }
  ```
- Prefer inline styles or CSS modules for xterm.js customization:
  ```typescript
  terminal.options.theme = {
    background: '#1a1b26',
    foreground: '#a9b1d6',
    // ... explicit colors, not class-based
  };
  ```
- Test production build thoroughly (dev mode doesn't purge)
- Keep terminal container styling in explicit JSX classes

**Warning signs:**
- Terminal renders correctly in dev, broken in production build
- Missing background colors or cursor styling in production
- Browser console shows unstyled xterm.js DOM elements
- Tailwind classes work everywhere except terminal component

**Phase to address:**
Phase 3 (UI Polish) - Discovered during production build testing.

---

### Pitfall 8: tmux Session Name Collisions with Concurrent Agents

**What goes wrong:**
Multiple agent sessions attempt to attach to the same tmux session, causing output to interleave or commands from one agent to appear in another's terminal.

**Why it happens:**
Developers use predictable session names (e.g., "agent-session") or fail to implement proper session isolation. Each agent instance should have a unique, stable tmux session.

**How to avoid:**
- Use UUID or hash-based session names: `agent-${agentId}-${timestamp}`
- Store session name in database linked to agent metadata
- Before creating new session, check if one exists: `tmux has-session -t <name>`
- Implement session ownership model:
  ```typescript
  // On agent start
  const sessionName = `agent-${agentId}`;
  const exists = await tmuxSessionExists(sessionName);

  if (exists) {
    // Reattach to existing session
    pty = spawn('tmux', ['attach-session', '-t', sessionName]);
  } else {
    // Create new session
    pty = spawn('tmux', ['new-session', '-s', sessionName, '-d']);
  }
  ```
- Clean up sessions on agent termination (but allow reattachment on reconnect)

**Warning signs:**
- Terminal output shows commands user didn't type
- Multiple browser tabs show identical terminal content
- `tmux list-sessions` shows fewer sessions than active agents
- Agent state diverges from terminal display

**Phase to address:**
Phase 2 (Terminal Integration) - Critical before multi-agent support.

---

### Pitfall 9: Memory Leak from Unremoved Event Listeners

**What goes wrong:**
Server memory usage grows unbounded as clients connect and disconnect. After hours of operation, the server runs out of memory or becomes slow from GC pressure.

**Why it happens:**
Socket.IO and node-pty event listeners are registered but never removed. Each connection adds listeners, but cleanup code doesn't remove them, creating a classic memory leak.

**How to avoid:**
- Track all event listeners and remove them explicitly:
  ```typescript
  const handleData = (data: string) => {
    socket.emit('terminal-output', data);
  };

  pty.onData(handleData);

  socket.on('disconnect', () => {
    pty.off('data', handleData); // Critical!
    pty.kill();
  });
  ```
- Use `once()` for one-time events instead of `on()`
- Implement connection registry with cleanup:
  ```typescript
  const connections = new Map<string, {
    socket: Socket,
    pty: IPty,
    cleanup: () => void
  }>();
  ```
- Monitor event listener count: `process.memoryUsage()` and `process._getActiveHandles()`
- Use heap snapshots to detect listener accumulation

**Warning signs:**
- `process.memoryUsage().heapUsed` grows linearly with connection count
- Server performance degrades over time
- Event listener count grows: `socket.listenerCount('event')` increases
- Heap snapshots show arrays of closures

**Phase to address:**
Phase 1 (Core Infrastructure) - Must be correct in initial Socket.IO implementation.

---

### Pitfall 10: Inadequate Input Sanitization Leading to Command Injection

**What goes wrong:**
User input from the browser is passed directly to the PTY/shell, allowing arbitrary command execution on the server. Malicious input can escape the tmux session or execute system commands.

**Why it happens:**
Developers assume the tmux session provides sufficient isolation and don't validate/sanitize input. Browser-to-shell path is treated as trusted.

**How to avoid:**
- Never construct shell commands from user input via string concatenation
- Use tmux's command mode exclusively, not shell expansion:
  ```typescript
  // BAD: Command injection risk
  pty.write(`tmux send-keys -t ${sessionName} "${userInput}"\n`);

  // GOOD: Input is data, not code
  pty.write(Buffer.from(userInput, 'utf-8'));
  ```
- Implement input validation:
  - Max length limits (e.g., 4096 bytes)
  - Rate limiting per connection
  - Detect suspicious patterns (null bytes, escape sequences)
- Run server with limited user privileges (not root)
- Consider using pty in raw mode and letting tmux handle all interpretation
- Audit all code paths that call `pty.write()` or `socket.send()`

**Warning signs:**
- No input validation on client data before pty.write()
- String interpolation used to construct tmux commands
- Server runs as root or privileged user
- No rate limiting on terminal input
- Logs show unexpected system command execution

**Phase to address:**
Phase 1 (Core Infrastructure) - Security must be built in from the start, not retrofitted.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping Socket.IO authentication | Faster MVP development | Security vulnerability; anyone can connect and spawn PTY processes | Never (even single-user needs localhost-only binding) |
| No PTY output buffering | Simpler implementation | Data loss on reconnection; poor UX | Never (circular buffer is ~50 lines of code) |
| Global error handling only | Less boilerplate | Errors don't include request context; hard to debug | Never (async wrappers are one-time setup) |
| Inline terminal theme colors | Skip Tailwind safelist config | Hard to maintain consistent design | Acceptable for MVP if documented |
| Single-threaded Socket.IO | Standard Node.js approach | Limited to one CPU core; fine for 1-10 concurrent users | Acceptable until >50 concurrent terminals |
| Polling tmux state vs. event-driven | Easier implementation | Higher CPU usage; slower state updates | Acceptable for MVP (optimize in Phase 3) |
| Browser-only reconnection logic | Server doesn't need to track | Client reload loses session context | Acceptable if tmux persistence works |
| No compression on Socket.IO | Lower latency | Higher bandwidth usage for long-running sessions | Acceptable for LAN deployment |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| xterm.js + Socket.IO | Calling `terminal.write()` synchronously in tight loop | Buffer writes and use `terminal.write()` callback chaining or batch writes |
| node-pty + tmux | Using shell spawn (`/bin/bash -c tmux attach`) | Spawn tmux directly with args: `spawn('tmux', ['attach-session', '-t', name])` |
| React + xterm.js | Creating terminal in render function | Create terminal in useEffect, store in ref, dispose in cleanup |
| Express + Socket.IO | Attaching Socket.IO to Express app incorrectly | Attach to HTTP server, not Express app: `io(httpServer)` |
| better-sqlite3 + async | Wrapping sync calls in Promise.resolve() | Use synchronous API directly (it's thread-safe) or worker threads for isolation |
| Tailwind + xterm.js | Tailwind reset styles breaking terminal | Scope Tailwind to non-terminal elements or use CSS layers |
| Socket.IO + CORS | Allowing all origins in production | Explicitly whitelist origins in Socket.IO config |
| tmux + environment vars | Environment not passed to new sessions | Use `tmux new-session -e VAR=value` or `set-environment` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded xterm.js scrollback | Browser tab uses 1GB+ RAM | Set `terminal.options.scrollback = 10000` (or rely on tmux scrollback) | After ~1M lines of output |
| No Socket.IO message batching | High CPU from tiny messages | Batch terminal output (e.g., 16ms intervals or 1KB chunks) | >10 active terminals with rapid output |
| Synchronous SQLite in request path | Request latency spikes | Use connection pool or move DB calls to background tasks | >100 req/sec |
| Sending full terminal state on reconnect | Multi-second reconnection time | Send only scrollback delta or tmux pane content | Terminal scrollback >100K lines |
| No PTY output throttling | Client can't keep up; browser freezes | Implement backpressure: pause PTY when socket buffer is full | Compiling large projects in terminal |
| CSS recalculations on every character | Terminal rendering jank | Use xterm.js canvas renderer instead of DOM | Terminals with rapid output (logs, builds) |
| Spawning new tmux server per session | Process/memory overhead | Use single tmux server with multiple sessions | >20 concurrent sessions |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No authentication on Socket.IO | Anyone on network can spawn shells | Implement session-based auth or token validation on connection |
| Serving on 0.0.0.0 in single-user mode | Remote code execution risk | Bind to 127.0.0.1 only for local-only tools |
| Exposing full shell instead of tmux | Users can escape to system shell | Always spawn tmux, never raw shell access |
| No resource limits on PTY processes | Resource exhaustion attacks | Use cgroups or process limits (ulimit) |
| Storing tmux session names in localStorage | Session hijacking if XSS exists | Store session IDs server-side, use secure session tokens |
| Running node-pty as root | Privilege escalation risk | Run as dedicated non-privileged user |
| No rate limiting on terminal input | Command injection or DoS | Implement input rate limiting (e.g., 10KB/second per terminal) |
| Trusting client-side terminal dimensions | Potential for integer overflow bugs | Validate and sanitize resize dimensions server-side |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during connection | User types into non-connected terminal; input lost | Show "Connecting..." overlay until PTY ready |
| No visual reconnection indicator | User doesn't know if terminal is live or stale | Show reconnection banner with countdown/retry state |
| Clearing terminal on reconnect | Lost context; user can't see previous work | Preserve xterm.js buffer and replay missed output |
| No copy/paste indication | User unsure if copy worked | Show toast notification on successful copy |
| Terminal not focused on load | User must click before typing | Auto-focus terminal on component mount |
| No keyboard shortcuts documented | Users don't discover features | Show keyboard shortcuts in UI (Ctrl+Shift+C for copy, etc.) |
| Tiny default terminal size | Poor readability on large monitors | Default to reasonable size (120x30) with responsive fit |
| No indication of background processes | User closes tab, kills long-running job | Show indicator if processes are running in tmux session |

## "Looks Done But Isn't" Checklist

- [ ] **PTY cleanup:** Often missing graceful shutdown handler — verify signal handlers (SIGTERM, SIGINT) kill PTY processes
- [ ] **Socket.IO reconnection:** Often missing output buffering — verify network interruption test shows no data loss
- [ ] **Terminal resize:** Often missing debounce — verify rapid window resize doesn't cause flickering or errors
- [ ] **React cleanup:** Often missing effect cleanup — verify StrictMode doesn't create duplicate connections
- [ ] **Error boundaries:** Often missing in React — verify terminal component errors don't crash entire app
- [ ] **SQLite WAL checkpoint:** Often missing shutdown handler — verify kill -9 followed by restart doesn't corrupt DB
- [ ] **Input rate limiting:** Often missing — verify rapid-fire input doesn't overwhelm server
- [ ] **Session name uniqueness:** Often missing validation — verify concurrent sessions don't collide
- [ ] **Memory leak testing:** Often skipped — verify 100 connect/disconnect cycles doesn't leak memory
- [ ] **Production build testing:** Often skipped — verify `npm run build` produces working terminal (Tailwind purge issue)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| PTY zombie processes | LOW | Write cleanup script: `pkill -f "tmux attach-session"`; add to cron or startup |
| SQLite corruption | MEDIUM | Delete DB file (sessions lost); tmux sessions persist; rebuild metadata from `tmux list-sessions` |
| Socket.IO data loss | HIGH | Requires architectural change to add buffering; can't recover historical data |
| Memory leaks | MEDIUM | Restart server process; fix listener cleanup; add monitoring |
| Tailwind purge issue | LOW | Add safelist to config; rebuild; or switch to inline styles |
| Session name collisions | MEDIUM | Implement session rename/migration; may require downtime |
| Input sanitization missing | HIGH | Requires security audit, input validation layer, and testing |
| React double-mounting | LOW | Add cleanup functions to effects; test with StrictMode |
| Express async errors | MEDIUM | Add global async wrapper; audit all route handlers |
| Resize race conditions | MEDIUM | Add debouncing and synchronization; requires testing with ncurses apps |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PTY zombie processes | Phase 1: Core Infrastructure | Load test: 100 connect/disconnect cycles; verify `ps aux \| grep tmux` count stable |
| Socket.IO reconnection data loss | Phase 2: Terminal Integration | Network simulation: disconnect for 10s during active output; verify output complete |
| xterm.js resize race condition | Phase 2: Terminal Integration | Test with vim/htop; rapid window resize; verify no visual corruption |
| Express 5 async errors | Phase 1: Core Infrastructure | Throw error in async handler; verify 500 response, no crash |
| SQLite WAL corruption | Phase 1: Core Infrastructure | Kill -9 server during write; restart; verify DB loads |
| React 19 useEffect double-execution | Phase 2: Terminal Integration | Enable StrictMode; verify single Socket.IO connection in dev tools |
| Tailwind CSS 4 purge | Phase 3: UI Polish | Production build test; verify terminal styling intact |
| tmux session collisions | Phase 2: Terminal Integration | Create 10 concurrent sessions; verify unique session names |
| Memory leaks | Phase 1: Core Infrastructure | Heap snapshot before/after 50 connections; verify no listener accumulation |
| Command injection | Phase 1: Core Infrastructure | Security audit; attempt injection via terminal input; verify isolation |

## Sources

**Note:** This research was conducted using training data (knowledge cutoff: January 2025) due to WebSearch and WebFetch being unavailable. Confidence level is MEDIUM. The following sources informed this research during training:

- xterm.js official documentation and GitHub issues (common terminal rendering, addon, and memory leak issues)
- node-pty GitHub issues and documentation (PTY lifecycle, platform differences, zombie processes)
- Socket.IO v4 documentation (reconnection strategies, event handling, scalability)
- Express.js 5 migration guide and breaking changes documentation
- React 19 release notes and breaking changes (useEffect behavior, StrictMode)
- Tailwind CSS 4 upgrade guide and JIT purge behavior
- better-sqlite3 documentation (WAL mode, synchronous API patterns)
- Common terminal multiplexer architecture patterns (gotty, ttyd, wetty projects)
- tmux session management best practices
- Personal knowledge of WebSocket-based terminal implementations

**Recommendation:** Verify specific version details (Express 5, React 19, Tailwind 4) against current official documentation when available, as these were recently released or in beta at training cutoff.

---
*Pitfalls research for: Warden Dashboard (browser-based terminal multiplexer)*
*Researched: 2026-02-12*
*Confidence: MEDIUM (training data only; external verification recommended)*
