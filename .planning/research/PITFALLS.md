# Pitfalls Research: v2.0 Mission Control

**Domain:** Adding Plugin Registry, Activity Timeline, and Mobile UI to Small Monitoring Dashboard
**Researched:** 2026-02-16
**Confidence:** HIGH (verified with current sources 2025-2026)

## Critical Pitfalls

### Pitfall 1: Over-Engineering Plugin System for Single-User Tool

**What goes wrong:**
Developers build a full-featured plugin architecture with sandboxing, versioning, dependency management, plugin discovery, and lifecycle hooks when the actual need is "add 2-3 internal code modules with metadata." The codebase balloons from 2,644 LOC to 10,000+ LOC, slowing development while adding zero user value.

**Why it happens:**
Plugin architecture is exciting to build and feels "professional," but there's a cognitive trap: complexity in software design often leads to systems that are difficult to maintain, debug, and scale. Developers sometimes **over-engineer solutions by adding unnecessary layers of abstraction, dependencies, or excessive configurations**, making the system harder to understand and modify.

The temptation is to design for hypothetical future plugins ("What if we want third-party plugins?") rather than the actual requirement: a handful of internal tool panels with metadata.

**How to avoid:**
- **Ask the YAGNI question:** "Do we need plugin isolation if all plugins are our own code?"
- Start with the simplest thing: TypeScript modules with metadata objects, registered at build-time
- Build-time registration (import all plugins in an index file) is fine for single-user tools
- Use TypeScript's type system for plugin contracts instead of runtime validation
- Defer sandboxing, versioning, and plugin marketplace features until there's concrete demand
- Set a complexity budget: "Plugin system should be <200 LOC, not >2000 LOC"

**Warning signs:**
- Plugin architecture PR exceeds 1,000 LOC
- Adding "plugin SDK" or "plugin API versioning" to roadmap
- Implementing runtime plugin loading from filesystem/URLs
- Building plugin dependency resolution system
- Creating plugin permissions/security model for internal tools
- More time spent on plugin infrastructure than actual plugins

**Phase to address:**
Phase 1 (Plugin Foundation) - Must establish the "simple registry" pattern from day one. Over-engineering here dooms the entire milestone.

**Sources:**
- [Common Mistakes in Software Development](https://www.securitycompass.com/blog/common-mistakes-in-software-development/) — adding unnecessary complexity
- [Trillions spent and big software projects are still failing](https://news.ycombinator.com/item?id=46045085) — over-abstraction dangers

---

### Pitfall 2: xterm.js Mobile Touch Experience is Fundamentally Broken

**What goes wrong:**
After weeks of mobile UI work, the terminal is unusable on mobile: virtual keyboard doesn't work, copy/paste fails, touch scrolling conflicts with xterm.js, and the experience regresses on desktop. Users report "typing doesn't work on iPad" and "can't select text on Android."

**Why it happens:**
xterm.js has **limited touch support on mobile devices** which severely impacts usability — users cannot effectively interact with the terminal using touch gestures and mobile-specific input methods. This is a **5+ year old issue** still actively reported in 2025.

Key problems:
- **No native touch event handling** — CoreBrowserTerminal.ts focuses on mouse/keyboard events
- **Copy/paste broken on iOS** — Cmd+C doesn't work on iPad (Issue #3727)
- **Erratic typing on Android/Chrome** — input duplication, missing characters (Issue #3600, #675)
- **Smart Keyboard arrow keys don't work on iOS** (Issue #1101)
- **Virtual/predictive keyboards not accommodated** (Issue #2403)

The current implementation in `CoreBrowserTerminal.ts` focuses primarily on mouse and keyboard events, with no dedicated touch event handling.

**How to avoid:**
- **Decide early:** Is mobile terminal interaction a core requirement or nice-to-have?
- If nice-to-have: Make mobile terminal **read-only** — disable input, show "Use desktop for terminal interaction" message
- If core requirement: Budget 2-3 weeks of mobile-specific terminal work and expect ongoing issues
- Don't promise "full mobile terminal" — it's a known hard problem xterm.js hasn't solved
- Test on real iOS and Android devices early (emulators hide keyboard issues)
- Consider alternative mobile UX: agent activity timeline + quick actions instead of raw terminal

**Warning signs:**
- Product requirement says "mobile-first" but includes "interactive terminal on mobile"
- No mobile device testing until late in development
- Assuming xterm.js "just works" on mobile because it's HTML5
- Planning to "add touch support" as a small task
- No backup plan if mobile terminal is unusable

**Phase to address:**
Phase 0 (Research/Scoping) - Must decide mobile terminal strategy BEFORE starting mobile UI work. Changing this mid-phase causes rework.

**Sources:**
- [Limited touch support on mobile devices impacts terminal usability · Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377) — July 2025
- [Copy and paste do not work on touch devices · Issue #3727](https://github.com/xtermjs/xterm.js/issues/3727)
- [Erratic text output from typing into xterm console on Chrome on Android devices · Issue #3600](https://github.com/xtermjs/xterm.js/issues/3600)
- [Support mobile platforms · Issue #1101](https://github.com/xtermjs/xterm.js/issues/1101)

---

### Pitfall 3: Terminal Output Parsing Becomes Performance Nightmare

**What goes wrong:**
Real-time ANSI parsing of terminal output for activity timeline causes server CPU to spike to 100%, SQLite database grows to gigabytes within days, and the dashboard becomes sluggish. Queries like "show me all file edits today" timeout after 30 seconds.

**Why it happens:**
Developers underestimate terminal output volume and parsing complexity:
- Claude Code generates **thousands of lines per minute** (tool calls, file diffs, compilation output)
- ANSI parsing requires **finite state machine** processing byte-by-byte
- **Capturing everything** creates exponential storage growth
- Queries over millions of unindexed terminal output rows are slow

tmux's ANSI parser is highly optimized (ternary trees, compact grid encoding), but naive regex-based parsing in JavaScript is orders of magnitude slower.

**How to avoid:**
- **Parse selectively, not everything:**
  - Only parse lines matching known patterns (e.g., `Tool call: fs_edit`)
  - Ignore noisy output (progress bars, npm install logs, compilation warnings)
  - Use streaming regex on chunks, not character-by-character state machine
- **Set aggressive retention limits:**
  - Keep only last 7 days of activity events
  - Set `PRAGMA wal_autocheckpoint = 1000` to prevent infinite WAL growth
  - Run daily cleanup job: `DELETE FROM activity_events WHERE timestamp < DATE('now', '-7 days')`
- **Index aggressively:**
  - Index `(timestamp, event_type)` for timeline queries
  - Index `(agent_id, timestamp)` for per-agent filtering
  - Use covering indexes for common queries
- **Offload parsing to background worker:**
  - Don't parse in real-time streaming path
  - Buffer raw output, parse in background thread/process
  - Use worker threads for CPU-intensive ANSI parsing
- **Monitor database size:**
  - Alert if `data/warden.db` exceeds 100MB
  - Run `PRAGMA wal_checkpoint(TRUNCATE)` on graceful shutdown
  - Check for checkpoint starvation with long-running queries

**Warning signs:**
- Database file grows >1MB/hour
- WAL file never shrinks (checkpoint starvation from concurrent readers)
- CPU usage correlates with terminal output volume
- Queries slow down as data accumulates
- No retention policy defined
- Parsing code uses complex regex or character-by-character loops

**Phase to address:**
Phase 2 (Activity Timeline) - Must establish parsing strategy and retention policy BEFORE going to production. Storage growth is exponential.

**Sources:**
- [SQLite performance tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/) — WAL growth, indexing
- [SQLite WAL Mode](https://sqlite.org/wal.html) — checkpoint starvation
- [tmux ANSI parsing](https://deepwiki.com/tmux/tmux/3.1-input-processing) — state machine complexity
- [How SQLite Scales Read Concurrency](https://fly.io/blog/sqlite-internals-wal/) — concurrent readers block checkpoints

---

### Pitfall 4: ANSI Escape Sequences Create Security and Storage Vulnerabilities

**What goes wrong:**
Stored terminal output in the activity timeline contains malicious ANSI escape sequences that, when viewed later, execute arbitrary code, manipulate log displays to hide evidence, or cause Denial of Service by printing billions of characters. Ransomware gangs could manipulate log files so they look empty or normal whenever viewed.

**Why it happens:**
ANSI escape sequences are in-band control codes mixed with data. Research has uncovered **10 CVEs against terminal emulators** that could result in Remote Code Execution (RCE). Key vulnerability classes:
- **Full echoback vulnerabilities** — attacker can insert control characters into input stream, enabling RCE
- **Log file manipulation** — escape sequences make logs appear empty/normal when viewed
- **Denial of Service** — ANSI character multiplier code can print billions of characters
- **2025: ANSI attacks target AI/LLM tools** — escape codes used to obfuscate malicious payloads in tool descriptions

ANSI terminal escape codes can be used to **obfuscate malicious payloads** in MCP server tool descriptions. Claude Code (version 0.2.76) does not offer any filtering or sanitization for tool descriptions and outputs containing ANSI escape sequences. Using these sequences, an attacker can make line-jumping payloads invisible on the screen.

**How to avoid:**
- **Strip ANSI before storing in database:**
  - Replace any byte with hex value `0x1b` (start of escape sequence) with placeholder
  - Use battle-tested ANSI stripping library (e.g., `strip-ansi` npm package)
  - Never store raw terminal output with escape sequences
- **Strip ANSI before displaying in timeline:**
  - Even if stored clean, defensively strip on display
  - Don't render ANSI in React components (use plain text)
- **Validate storage size:**
  - Reject lines >10KB before storing
  - Detect ANSI multiplier codes and reject
  - Set max event count per session (e.g., 10,000 events)
- **If preserving ANSI for terminal replay:**
  - Store in separate `raw_output` table with size limits
  - Never display raw output in web UI
  - Use read-only xterm.js instance for replay (no input)

**Warning signs:**
- Storing raw PTY output without sanitization
- Activity timeline renders terminal output with `dangerouslySetInnerHTML`
- No ANSI stripping library in dependencies
- No max size limit on stored events
- Log viewer shows colored/formatted terminal output (ANSI is being rendered)

**Phase to address:**
Phase 2 (Activity Timeline) - Security must be built into parsing/storage from day one. Retrofitting ANSI stripping is hard.

**Sources:**
- [Don't Trust This Title: Abusing Terminal Emulators with ANSI Escape Characters](https://www.cyberark.com/resources/threat-research-blog/dont-trust-this-title-abusing-terminal-emulators-with-ansi-escape-characters)
- ["\\u001b[31m"?! ANSI Terminal security in 2023 and finding 10 CVEs](https://dgl.cx/2023/09/ansi-terminal-security) — 10 CVE discoveries
- [Deceiving users with ANSI terminal codes in MCP](https://blog.trailofbits.com/2025/04/29/deceiving-users-with-ansi-terminal-codes-in-mcp/) — 2025 AI tool attacks
- [Terminal Emulator Security](https://etbe.coker.com.au/2026/01/11/terminal-emulator-security/) — 2026 overview

---

### Pitfall 5: Desktop-First Mobile Implementation Breaks Desktop UX

**What goes wrong:**
After adding mobile support, desktop users complain: giant touch-friendly buttons waste space, navigation requires extra clicks, information density is too low, and keyboard shortcuts stop working. The desktop experience regresses to accommodate mobile.

**Why it happens:**
The most common pitfall: teams build a complex, full-featured desktop website first, treating responsive design as an "afterthought" — a resizing tool used to scale down the design for mobile. The result: **giant buttons designed for "fat fingers"** on mobile touchscreens end up ported to desktop screens, forcing users with high-precision mice to interact with a UI that looks comically large and simplistic.

Another cause: **bidirectional style cascading** — styles applied to smaller breakpoints cascade down AND styles applied to larger breakpoints cascade up. Styles set on breakpoints smaller than desktop **override** styles set on the breakpoint above, causing desktop regressions.

**How to avoid:**
- **Use mobile-first CSS with `min-width` media queries:**
  - Base styles target mobile (no media query)
  - `@media (min-width: 768px)` for tablet enhancements
  - `@media (min-width: 1200px)` for desktop enhancements
  - This ensures mobile is optimized and desktop builds on solid foundation
- **Design components with viewport-specific variants:**
  - Mobile: bottom sheet, single column, full-width buttons
  - Desktop: sidebar, multi-column, compact buttons
  - Don't just resize — restructure
- **Use content-based breakpoints, not device defaults:**
  - Set breakpoints where the layout visually breaks
  - Don't force mobile design on 1440px screens
- **Test desktop AND mobile throughout development:**
  - Don't develop mobile-only, test desktop late
  - Use Chrome DevTools responsive mode constantly
- **Use fluid grids with relative units:**
  - Percentages, `em`, `rem`, `vw`/`vh` instead of fixed pixels
  - Allows proportional scaling without breaking

**Warning signs:**
- Desktop buttons suddenly 60px tall to accommodate touch
- Desktop users need to scroll more after mobile implementation
- Information density drops (fewer items per screen)
- Desktop-specific keyboard shortcuts removed "to simplify"
- CSS using only `max-width` media queries (desktop-first anti-pattern)
- Testing exclusively on mobile during mobile phase

**Phase to address:**
Phase 3 (Mobile UI) - Must use mobile-first CSS from the start. Desktop-first approach requires full rewrite to fix.

**Sources:**
- [Why Responsive Design Still Fails In 2025](https://blog.imagine.bo/responsive-design-still-fails/)
- [Responsive design best practices for 2025: Mobile-first imperative](https://www.adicator.com/post/responsive-design-best-practices)
- [Mobile First CSS Design Principles](https://allthingsprogramming.com/mobile-first-css-design-principles/)
- [Responsive Design Breakpoints in 2025](https://www.browserstack.com/guide/responsive-design-breakpoints)

---

### Pitfall 6: Socket.IO Connection State Recovery Fails for Activity Timeline

**What goes wrong:**
Users on flaky mobile networks (WiFi to 4G switching) miss activity events during reconnection. Timeline shows gaps, critical operator actions are lost, and `socket.recovered` is always `false` despite configuration being correct.

**Why it happens:**
Socket.IO Connection State Recovery has several known failure modes:
- **Network switching (WiFi → 4G):** `socket.recovered` returns `false` because reconnection occurs **before the old socket is disconnected** — server isn't aware of disconnection yet
- **Long-lived, low-traffic connections:** If server doesn't periodically send messages, recovery fails — server purges buffered events within `maxDisconnectionDuration`, and without new events it can't find the appropriate offset
- **Multi-node deployments:** Connection state recovery works only for temporary disconnections with the same server — not across load-balanced nodes without Redis adapter

For activity timeline, missed events during reconnection are **permanently lost** unless the application implements its own gap detection and backfill.

**How to avoid:**
- **Always check `socket.recovered` and handle unrecovered case:**
  ```typescript
  socket.on('connect', () => {
    if (socket.recovered) {
      // No backfill needed
    } else {
      // Fetch missed events via REST API
      const lastEventId = getLastReceivedEventId();
      fetch(`/api/activity/since/${lastEventId}`).then(backfillEvents);
    }
  });
  ```
- **Send periodic heartbeat events to keep offsets valid:**
  - Emit `activity:heartbeat` every 30s even if no activity
  - Ensures server has recent offset for recovery
- **Implement gap detection:**
  - Add sequence numbers to activity events
  - Client detects missing sequence numbers and requests backfill
- **Use REST API for initial load and backfill:**
  - Socket.IO for real-time updates only
  - REST API for reliable historical data
  - Don't rely solely on Socket.IO event stream
- **For mobile: implement aggressive reconnection:**
  - Lower `reconnectionDelay` (default 1000ms → 500ms)
  - Increase `reconnectionAttempts` (default 20 → 50)
  - Detect network change events and force reconnect

**Warning signs:**
- No backfill logic when `socket.recovered` is `false`
- Activity timeline implementation relies solely on Socket.IO events
- No sequence numbers or timestamps to detect gaps
- No heartbeat events for long-idle connections
- Testing only on stable desktop WiFi, not mobile networks

**Phase to address:**
Phase 2 (Activity Timeline) - Event delivery reliability must be designed from the start. Adding backfill logic later is complex.

**Sources:**
- [Connection state recovery](https://socket.io/docs/v4/connection-state-recovery) — official docs
- [ConnectionStateRecovery not working when switching from wifi to 4g](https://github.com/socketio/socket.io/discussions/5248)
- [Connection State Recovery fails for long-lived connections](https://github.com/socketio/socket.io/issues/5282)
- [Handling disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections) — tutorial

---

### Pitfall 7: Node.js Memory Leaks in Terminal Streaming Services

**What goes wrong:**
After hours of operation with mobile users connecting/disconnecting frequently, the server runs out of memory (OOM killer terminates process) or exhibits severe GC pressure causing request latency spikes.

**Why it happens:**
Node.js has several known memory leak vectors in 2025-2026:
- **High-severity flaw (CVE-2025-55131):** Node.js memory allocation vulnerability allows buffers to retain data from previous operations — "dirty" memory with secrets/tokens can leak
- **TLS memory leak (CVE-2025-59464):** Remote Denial of Service against applications processing TLS client certificates
- **Stream piping memory leaks:** Known issue involves **high memory consumption during pipe operations and memory leak after operation finishes**
- **`fetch` memory leak in Node 24:** `await response.text()` leaks memory in successive fetch calls

For terminal streaming, leaks typically occur from:
- PTY event listeners not removed on disconnect
- Socket.IO listeners accumulating
- Terminal output buffers not garbage collected

**How to avoid:**
- **Track and remove ALL event listeners:**
  ```typescript
  const ptyDataHandler = (data: string) => socket.emit('terminal:output', data);
  ptyProcess.onData(ptyDataHandler);

  socket.on('disconnect', () => {
    ptyProcess.removeListener('data', ptyDataHandler); // Critical!
    ptyProcess.kill();
  });
  ```
- **Use WeakMap for connection metadata:**
  - Allows garbage collection when socket is gone
  - Prevents circular references
- **Monitor memory usage:**
  - Log `process.memoryUsage().heapUsed` every minute
  - Alert if growth >10MB/hour steady-state
  - Use heap snapshots to detect listener accumulation
- **Limit buffer sizes:**
  - Cap terminal output buffer at 1MB per session
  - Use circular buffer with fixed size
  - Implement backpressure (pause PTY when buffer full)
- **Test with repeated connect/disconnect cycles:**
  - 100+ connection cycles should show stable memory
  - Use `node --inspect` and Chrome DevTools heap profiler
  - Check `socket.listenerCount('event')` doesn't grow

**Warning signs:**
- `process.memoryUsage().heapUsed` grows linearly over time
- Memory usage doesn't drop after clients disconnect
- Event listener count grows: `emitter.listenerCount()` increases
- No explicit `removeListener()` calls in disconnect handlers
- Heap snapshots show arrays of closures

**Phase to address:**
Phase 1 (Plugin Foundation) and Phase 2 (Activity Timeline) - Memory leaks compound with activity timeline background processing.

**Sources:**
- [Node.js Patches Memory Leak and Permission Bypasses](https://securityonline.info/node-js-patches-memory-leak-and-permission-bypasses/) — CVE-2025-55131, CVE-2025-59464
- [High memory consumption when piping between streams · Issue #50762](https://github.com/nodejs/node/issues/50762)
- [Node 24.0.2: Memory leak on `fetch` response `.text()`](https://github.com/nodejs/node/issues/58380)
- [How to Profile Node.js Applications for Memory Leaks](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view)

---

### Pitfall 8: SQLite WAL Checkpoint Starvation from Activity Timeline Queries

**What goes wrong:**
The SQLite WAL file grows to gigabytes, write performance degrades dramatically, and the database eventually runs out of disk space. Queries slow from milliseconds to seconds. The issue only appears in production with real activity timeline query patterns.

**Why it happens:**
**Checkpoint starvation** occurs when SQLite is unable to recycle the WAL file due to everlasting concurrent reads. If there is always at least one active reader, checkpointing will never complete, and **the WAL file will grow indefinitely**, leading to unacceptable disk usage and deteriorating performance.

Checkpointing interferes with readers: it cannot transfer WAL changes that go after the end mark of any active transaction. So **checkpointing runs only up to the first end mark**. If a write transaction makes the WAL grow above 1000 pages, that transaction performs checkpointing — but the checkpoint **must stop when it reaches a page past the end mark of any current reader**.

Activity timeline queries can be long-running: "show me all tool calls from last 7 days" might scan millions of rows, holding a read transaction open for seconds, blocking checkpoints.

**How to avoid:**
- **Ensure "reader gaps" — times when no processes are reading:**
  - Don't run background queries continuously
  - Use short-lived read transactions (<1 second)
  - Batch timeline queries: fetch 1 day at a time, not 7 days at once
- **Run manual checkpoints:**
  - Use `SQLITE_CHECKPOINT_TRUNCATE` on graceful shutdown
  - Consider periodic checkpoints: `db.pragma('wal_checkpoint(RESTART)')` every hour
- **Set busy timeout:**
  - `db.pragma('busy_timeout = 5000')` allows 5s wait for locks
  - Prevents immediate `SQLITE_BUSY` errors
- **Optimize query patterns:**
  - Use indexes to speed up timeline queries (reduce transaction duration)
  - Implement pagination (LIMIT/OFFSET) to avoid full table scans
  - Add `created_at` index for timeline range queries
- **Monitor WAL file size:**
  - Alert if `warden.db-wal` exceeds 50MB
  - Log checkpoint failures
- **Consider WAL2 mode (experimental) or alternative solutions:**
  - WAL2 uses two WAL files to avoid infinite growth
  - Turso concurrent writes (2025) eliminates `SQLITE_BUSY` errors

**Warning signs:**
- WAL file grows continuously, never shrinks
- Write latency increases over time
- `SQLITE_BUSY` errors in logs
- Background queries run for >1 second
- No `wal_checkpoint` calls in graceful shutdown
- Pagination not implemented for timeline queries

**Phase to address:**
Phase 2 (Activity Timeline) - Must design query patterns with checkpoint implications from the start.

**Sources:**
- [Write-Ahead Logging](https://sqlite.org/wal.html) — official WAL documentation
- [How SQLite Scales Read Concurrency](https://fly.io/blog/sqlite-internals-wal/) — checkpoint mechanics
- [SQLite concurrent writes and "database is locked" errors](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [WAL checkpoint starved?](https://sqlite-users.sqlite.narkive.com/muT0rMYt/sqlite-wal-checkpoint-starved)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Runtime plugin loading from filesystem | Feels flexible/extensible | Security risk, testing complexity, no type safety | Never (build-time registration is simpler and safer) |
| Storing raw terminal output with ANSI | Skip ANSI stripping logic | Security vulnerabilities, storage bloat, rendering issues | Never (strip-ansi is one npm install) |
| Mobile terminal full interactivity | "Feature complete" claim | Ongoing xterm.js touch bugs, support burden | Never (read-only mobile terminal is acceptable) |
| Parse all terminal output for activity | Complete audit trail | CPU/storage explosion, performance degradation | Never (selective parsing is required) |
| Desktop-first responsive CSS | Faster initial dev | Desktop regression when adding mobile, full CSS rewrite | Never (mobile-first is same effort, better outcome) |
| Socket.IO-only activity events (no REST backfill) | Simpler architecture | Event loss on reconnection, unreliable timeline | Never (REST backfill is ~50 LOC) |
| No ANSI sanitization in stored events | Skip validation logic | Security vulnerabilities, potential RCE | Never (critical security issue) |
| Long-running timeline queries without pagination | Simpler SQL queries | WAL checkpoint starvation, database growth | Acceptable only for admin-only debug queries |
| No plugin metadata schema validation | Faster plugin development | Runtime errors, inconsistent UI, debugging difficulty | Acceptable if all plugins are internal (TypeScript types sufficient) |
| Mobile bottom-sheet without keyboard detection | Simpler mobile layout | Keyboard covers input on iOS, broken UX | Never (visual viewport handling is essential) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Plugin rendering in React | Passing plugin component as prop causes re-render issues | Use React.lazy() + Suspense for dynamic plugin components |
| ANSI parsing in activity timeline | Using complex regex on entire terminal output | Use streaming parser on chunks, match only known patterns |
| Mobile viewport height | Using `100vh` (doesn't account for mobile browser chrome) | Use `100dvh` or visual viewport API with fallback |
| Activity timeline + Socket.IO | Assuming connection state recovery prevents event loss | Always implement REST backfill for `socket.recovered === false` |
| SQLite WAL + long timeline queries | No pagination, full table scans block checkpoints | Use indexed queries with LIMIT/OFFSET, <1s transaction duration |
| Mobile touch + xterm.js | Expecting touch events to work like desktop | Make mobile terminal read-only or budget weeks for touch debugging |
| Plugin registry TypeScript types | Runtime plugin discovery loses type safety | Build-time registration with generated type manifest |
| Mobile CSS media queries | Using `max-width` (desktop-first) | Use `min-width` (mobile-first) for progressive enhancement |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Parsing every line of terminal output | Server CPU 100%, UI lag | Parse only lines matching activity patterns (tool calls, file edits) | >1000 lines/min per session |
| No retention policy on activity events | Database grows to gigabytes | Delete events older than 7 days, use `PRAGMA wal_checkpoint(TRUNCATE)` | After 1 week of continuous operation |
| Mobile: re-rendering entire timeline on new event | UI jank, battery drain | Use React virtualization (react-window), only render visible rows | Timeline >1000 events |
| SQLite full table scans for timeline queries | Query timeout after 30s | Index `(timestamp, event_type)` and `(agent_id, timestamp)` | Database >100K events |
| No ANSI stripping before storage | Database bloat (ANSI codes 5-10x text size) | Strip ANSI before storing, or use compressed BLOB column | High terminal output volume |
| Long-running activity queries blocking checkpoints | WAL grows unbounded | Paginate queries (LIMIT 100), keep transactions <1s | Concurrent readers + high write volume |
| Mobile: loading full activity timeline on page load | 10-30s load time, mobile data usage | Lazy load timeline, start with today only, fetch older on scroll | Timeline >10K events |
| Terminal output buffer accumulation | Memory leak, OOM crashes | Circular buffer with 1MB cap per session, implement backpressure | >10 active sessions with high output |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing/rendering raw ANSI in activity timeline | RCE via ANSI escape sequences, log manipulation | Strip ANSI before storage (replace `\x1b`), use plain text rendering |
| No size limits on activity events | DoS via storage exhaustion | Max 10KB per event, max 10K events per session |
| Plugin code execution without sandboxing | Malicious plugin can access full Node.js API | Acceptable for internal plugins; external plugins require Worker isolation |
| Exposing activity timeline to non-authenticated users | Information disclosure (commands, file paths, tool usage) | Require authentication (already IP-whitelisted) |
| No input validation on activity event filters | SQL injection via timeline search | Use parameterized queries, validate date ranges |
| Rendering user-generated content in timeline without sanitization | XSS via crafted terminal output or activity descriptions | Escape HTML entities, use React's default escaping |
| No rate limiting on activity event creation | Event flood DoS | Max 100 events/min per agent, reject overflow |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Mobile terminal input without keyboard detection | iOS keyboard covers input field, unusable | Use visual viewport API, shift UI above keyboard |
| Activity timeline without real-time updates | User must refresh to see new events | Socket.IO for live updates + optimistic UI |
| No loading state for timeline queries | User unsure if data is loading or empty | Skeleton UI or spinner during queries |
| Desktop UI breaking when adding mobile | Desktop users frustrated by giant buttons, lost information density | Mobile-first CSS, viewport-specific component variants |
| Timeline shows raw ANSI codes | Unreadable `\x1b[31mText\x1b[0m` in UI | Strip ANSI, optionally preserve as `<span style="color:red">` |
| No visual indication of timeline gaps | User doesn't know events are missing after reconnect | Show "Reconnected - some events may be missing" banner |
| Plugin panels without error boundaries | One plugin crash takes down entire dashboard | Wrap each plugin in React error boundary |
| Mobile: bottom sheet without swipe-to-dismiss | User can't close panel intuitively on mobile | Implement swipe gesture for bottom sheet |

## "Looks Done But Isn't" Checklist

- [ ] **ANSI stripping:** Often missing — verify activity timeline shows clean text, no `\x1b[` sequences
- [ ] **Mobile terminal touch:** Often broken — verify typing works on real iOS/Android, or verify read-only state
- [ ] **Timeline reconnection backfill:** Often missing — verify network interruption doesn't lose events (check `socket.recovered` handling)
- [ ] **Plugin error boundaries:** Often missing — verify throwing error in one plugin doesn't crash dashboard
- [ ] **SQLite retention policy:** Often missing — verify `DELETE FROM activity_events WHERE timestamp < DATE('now', '-7 days')` runs daily
- [ ] **WAL checkpoint on shutdown:** Often missing — verify `db.pragma('wal_checkpoint(TRUNCATE)')` in shutdown handler
- [ ] **Timeline query pagination:** Often missing — verify queries use LIMIT/OFFSET, not full table scans
- [ ] **Mobile keyboard handling:** Often broken — verify iOS virtual keyboard doesn't cover input fields
- [ ] **Desktop regression testing:** Often skipped — verify desktop experience wasn't degraded by mobile CSS
- [ ] **ANSI security testing:** Often skipped — verify malicious ANSI codes in terminal output don't execute or corrupt UI

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Over-engineered plugin system | HIGH | Rip out plugin infrastructure; replace with simple module imports; rebuild type manifest |
| xterm.js mobile touch broken | MEDIUM | Make mobile terminal read-only; add "Use desktop for terminal" message; or budget 2 weeks for touch debugging |
| Database growth from no retention | LOW | Run cleanup: `DELETE FROM activity_events WHERE timestamp < DATE('now', '-7 days')`; add cron job |
| WAL checkpoint starvation | MEDIUM | Restart server; add `wal_checkpoint(TRUNCATE)` to shutdown; paginate queries |
| ANSI security vulnerability | HIGH | Add `strip-ansi` to pipeline; migration to clean existing data; security audit |
| Desktop UX regression | HIGH | Rewrite CSS mobile-first; test desktop at every breakpoint; may require component restructure |
| Socket.IO event loss | MEDIUM | Add REST backfill logic; implement sequence numbers; test with network interruption |
| Memory leak from listeners | MEDIUM | Add `removeListener()` to cleanup; restart server; add memory monitoring |
| Plugin type safety lost | LOW | Switch to build-time registration; generate type manifest; requires plugin refactor |
| Terminal output parsing CPU spike | MEDIUM | Switch to selective parsing; add pattern allowlist; process in background worker |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Over-engineered plugin system | Phase 1: Plugin Foundation | Plugin system <200 LOC; new plugin added in <1 hour |
| xterm.js mobile touch broken | Phase 0: Research/Scoping | Test on real iOS/Android; decide read-only vs interactive |
| Terminal output parsing performance | Phase 2: Activity Timeline | Load test: 1000 lines/min output; verify CPU <50%, DB <100MB/day |
| ANSI security vulnerability | Phase 2: Activity Timeline | Inject malicious ANSI; verify stripped before storage and display |
| Desktop UX regression | Phase 3: Mobile UI | Test desktop after every mobile commit; verify no giant buttons |
| Socket.IO event loss | Phase 2: Activity Timeline | Disconnect network during activity; verify backfill fetches missing events |
| Memory leak from listeners | Phase 1 & 2 | 100 connect/disconnect cycles; verify stable memory |
| WAL checkpoint starvation | Phase 2: Activity Timeline | Run long query + concurrent writes; verify WAL size stays <50MB |
| Plugin error boundary missing | Phase 1: Plugin Foundation | Throw error in plugin; verify dashboard still renders |
| Mobile keyboard covering input | Phase 3: Mobile UI | Test on real iOS Safari; verify input visible when keyboard opens |

## Phase-Specific Recommendations

### Phase 1: Plugin Foundation
**Primary risks:** Over-engineering, type safety loss, error isolation
**Must-haves:**
- Simple build-time registration (not runtime loading)
- TypeScript plugin interface with strict types
- React error boundary per plugin
- Plugin system <200 LOC total

### Phase 2: Activity Timeline
**Primary risks:** Storage growth, parsing performance, ANSI security, WAL checkpoint starvation
**Must-haves:**
- ANSI stripping before storage (`strip-ansi` library)
- Selective parsing (pattern allowlist, not everything)
- Retention policy (7-day max, daily cleanup job)
- Indexed queries with pagination
- REST API backfill for Socket.IO gaps
- WAL checkpoint on graceful shutdown

### Phase 3: Mobile UI
**Primary risks:** xterm.js touch broken, desktop regression, keyboard covering input
**Must-haves:**
- Mobile-first CSS (`min-width` media queries)
- Real device testing (iOS Safari + Android Chrome)
- Decision: mobile terminal read-only OR 2-week touch debugging budget
- Visual viewport API for keyboard detection
- Desktop regression testing after every mobile change

## Sources

**Confidence: HIGH** — All findings verified with 2025-2026 sources.

### Plugin Systems & Over-Engineering
- [Common Mistakes in Software Development](https://www.securitycompass.com/blog/common-mistakes-in-software-development/) — adding unnecessary complexity
- [Trillions spent and big software projects are still failing | Hacker News](https://news.ycombinator.com/item?id=46045085)

### xterm.js Mobile Issues
- [Limited touch support on mobile devices impacts terminal usability · Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377) — July 2025
- [Support mobile platforms · Issue #1101](https://github.com/xtermjs/xterm.js/issues/1101)
- [Copy and paste do not work on touch devices · Issue #3727](https://github.com/xtermjs/xterm.js/issues/3727)
- [Erratic text output from typing into xterm console on Chrome on Android devices · Issue #3600](https://github.com/xtermjs/xterm.js/issues/3600)

### ANSI Security Vulnerabilities
- [Don't Trust This Title: Abusing Terminal Emulators with ANSI Escape Characters](https://www.cyberark.com/resources/threat-research-blog/dont-trust-this-title-abusing-terminal-emulators-with-ansi-escape-characters)
- ["\\u001b[31m"?! ANSI Terminal security in 2023 and finding 10 CVEs](https://dgl.cx/2023/09/ansi-terminal-security)
- [Deceiving users with ANSI terminal codes in MCP](https://blog.trailofbits.com/2025/04/29/deceiving-users-with-ansi-terminal-codes-in-mcp/) — 2025 AI tools
- [Terminal Emulator Security](https://etbe.coker.com.au/2026/01/11/terminal-emulator-security/) — 2026 overview

### SQLite Performance & WAL
- [SQLite performance tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/)
- [Write-Ahead Logging](https://sqlite.org/wal.html) — official documentation
- [How SQLite Scales Read Concurrency](https://fly.io/blog/sqlite-internals-wal/)
- [SQLite concurrent writes and "database is locked" errors](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)

### Node.js Memory Leaks
- [Node.js Patches Memory Leak and Permission Bypasses](https://securityonline.info/node-js-patches-memory-leak-and-permission-bypasses/)
- [High memory consumption when piping between streams · Issue #50762](https://github.com/nodejs/node/issues/50762)
- [How to Profile Node.js Applications for Memory Leaks](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view)

### Socket.IO Connection State Recovery
- [Connection state recovery](https://socket.io/docs/v4/connection-state-recovery)
- [ConnectionStateRecovery not working when switching from wifi to 4g](https://github.com/socketio/socket.io/discussions/5248)
- [Connection State Recovery fails for long-lived connections](https://github.com/socketio/socket.io/issues/5282)

### Mobile-First Responsive Design
- [Why Responsive Design Still Fails In 2025](https://blog.imagine.bo/responsive-design-still-fails/)
- [Responsive design best practices for 2025: Mobile-first imperative](https://www.adicator.com/post/responsive-design-best-practices)
- [Mobile First CSS Design Principles](https://allthingsprogramming.com/mobile-first-css-design-principles/)
- [Responsive Design Breakpoints in 2025](https://www.browserstack.com/guide/responsive-design-breakpoints)

### Terminal Parsing & tmux
- [tmux: Input Processing](https://deepwiki.com/tmux/tmux/3.1-input-processing)
- [VT100.net: A parser for DEC's ANSI-compatible video terminals](https://vt100.net/emu/dec_ansi_parser)

---
*Pitfalls research for: Warden v2.0 Mission Control (plugin registry, activity timeline, mobile UI)*
*Researched: 2026-02-16*
*Confidence: HIGH (2025-2026 verified sources)*
