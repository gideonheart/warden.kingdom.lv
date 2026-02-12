# Architecture Research

**Domain:** Browser-Based Terminal Dashboard / Agent Session Multiplexer
**Researched:** 2026-02-12
**Confidence:** MEDIUM (based on training data for established patterns like Wetty/ttyd/Gotty; WebSearch/WebFetch unavailable)

## Standard Architecture

### System Overview

Browser-based terminal dashboards follow a three-layer architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER (Browser)                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │
│  │   Terminal UI      │  │   Controls Panel   │  │  Metadata    │  │
│  │   (xterm.js)       │  │   (Tabs, Input)    │  │  Sidebar     │  │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────┬───────┘  │
│             │                       │                    │           │
│             └───────────────────────┴────────────────────┘           │
│                                     │                                │
│                          WebSocket (Socket.IO)                       │
├─────────────────────────────────────┼────────────────────────────────┤
│                     APPLICATION LAYER (Node.js)                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Socket Router   │  │  Session Manager │  │  Config Reader   │  │
│  │  (events → ptys) │  │  (tmux lifecycle)│  │  (openclaw.json) │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │             │
│  ┌────────▼────────────────────▼──────────────────────▼─────────┐   │
│  │              Instance Tracker (SQLite)                       │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
├─────────────────────────────────┼────────────────────────────────────┤
│                     PROCESS LAYER (PTY Bridge)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               node-pty (Pseudo-Terminal Interface)           │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │   │ pty → A  │  │ pty → B  │  │ pty → C  │  │ pty → D  │   │    │
│  │   └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘   │    │
│  └─────────┼─────────────┼─────────────┼─────────────┼─────────┘    │
│            │             │             │             │               │
├────────────┼─────────────┼─────────────┼─────────────┼───────────────┤
│                  TERMINAL SESSION LAYER (tmux)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ warden-01  │  │ scout-02   │  │ builder-03 │  │ gideon-04  │    │
│  │ (session)  │  │ (session)  │  │ (session)  │  │ (session)  │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **xterm.js Terminal** | Render terminal output, handle keyboard input, manage display buffer | React component wrapping xterm.js Terminal instance with addons (FitAddon, WebLinksAddon) |
| **Socket.IO Client** | Maintain WebSocket connection, emit input events, receive output events | React hook managing connection lifecycle, reconnection logic |
| **Tab Bar / Multiplexer UI** | Display active sessions, allow switching between terminals | React component with state management for active session ID |
| **Socket Router** | Map incoming WebSocket connections to correct pty processes | Express + Socket.IO namespace handler with session-based rooms |
| **Session Manager** | Create/destroy/list tmux sessions, enforce naming conventions | Service class wrapping tmux CLI commands (list-sessions, new-session, kill-session) |
| **Terminal Stream Service** | Spawn pty processes, bridge I/O between pty ↔ socket | Service class using node-pty to spawn `tmux attach-session -t <name>` |
| **Instance Tracker** | Persist session metadata (agent, project, status, timestamps) | SQLite CRUD operations via better-sqlite3 |
| **Config Reader** | Parse OpenClaw config, extract agent metadata, topic mappings | JSON5 parser with caching, exposes agent list and topic routing |
| **node-pty** | Spawn pseudo-terminal processes, handle resize, I/O buffering | Native addon, spawns shell commands as if from real terminal |
| **tmux** | Persist terminal sessions across disconnects, allow multiple viewers | External process manager, sessions survive WebSocket disconnects |

## Recommended Project Structure

```
warden.kingdom.lv/
├── src/
│   ├── server/
│   │   ├── index.ts                    # Express bootstrap, Socket.IO setup
│   │   ├── routes/
│   │   │   ├── instanceRoutes.ts       # REST: GET /api/instances, POST /api/instances/:id/stop
│   │   │   ├── agentRoutes.ts          # REST: GET /api/agents, POST /api/agents/:id/spawn
│   │   │   └── sessionHistoryRoutes.ts # REST: GET /api/sessions/history
│   │   ├── services/
│   │   │   ├── TmuxSessionManager.ts   # tmux session lifecycle (list, create, destroy)
│   │   │   ├── TerminalStreamService.ts# pty spawn + socket I/O bridge
│   │   │   ├── OpenClawConfigReader.ts # Parse openclaw.json for agent metadata
│   │   │   ├── InstanceTracker.ts      # SQLite CRUD for instance metadata
│   │   │   └── GatewayApiClient.ts     # HTTP client for OpenClaw gateway API
│   │   ├── socket/
│   │   │   └── terminalHandler.ts      # Socket.IO /terminal namespace logic
│   │   ├── database/
│   │   │   ├── schema.sql              # SQLite schema definition
│   │   │   └── DatabaseConnection.ts   # Single db connection with WAL mode
│   │   └── types/
│   │       ├── AgentInstance.ts        # Shared types: AgentInstance, AgentInstanceCreateParams
│   │       ├── TmuxSession.ts          # TmuxSessionInfo interface
│   │       └── OpenClawConfig.ts       # Config parsing types
│   └── client/
│       ├── App.tsx                     # Root component, routing, layout
│       ├── components/
│       │   ├── TerminalView.tsx        # xterm.js wrapper with FitAddon
│       │   ├── InstanceTabBar.tsx      # Horizontal tabs for sessions
│       │   ├── AgentDetailsSidebar.tsx # Agent metadata, SOUL.md preview
│       │   ├── PromptInputPanel.tsx    # Send message to gateway per agent
│       │   └── TelegramTopicMap.tsx    # Visual grid: topic → agent
│       ├── hooks/
│       │   ├── useTerminalSocket.ts    # Socket.IO connection management
│       │   ├── useActiveInstances.ts   # Polling /api/instances
│       │   └── useAgentConfig.ts       # Fetch agent metadata from /api/agents
│       ├── styles/
│       │   └── index.css               # Tailwind imports, custom theme
│       └── types/
│           └── index.ts                # Client-side type definitions
├── data/
│   └── warden.db                       # SQLite database file
├── package.json
├── tsconfig.json                       # Shared TypeScript config
├── tsconfig.server.json                # Server-specific config
├── vite.config.ts                      # Vite build config for client
└── nginx.conf                          # Reference Nginx config
```

### Structure Rationale

- **`src/server/services/`:** Each service has single responsibility (SRP). TmuxSessionManager does NOT stream terminal output — that's TerminalStreamService's job. Clean boundaries prevent coupling.
- **`src/server/socket/`:** Isolate Socket.IO event handling from REST routes. Different lifecycle, different concerns.
- **`src/server/database/`:** Single DatabaseConnection instance. All queries in one place (DRY). Migration logic co-located with connection setup.
- **`src/client/hooks/`:** Reusable stateful logic. useTerminalSocket used by any component needing terminal I/O. No duplicate Socket.IO code.
- **Shared `types/`:** Server and client import same type definitions. Single source of truth for AgentInstance shape.

## Architectural Patterns

### Pattern 1: WebSocket Room-Based Multiplexing

**What:** Each tmux session gets a unique Socket.IO room. Browser connects to room by session name. Multiple browsers can observe same session without interference.

**When to use:** When supporting multiple concurrent viewers per session (read-only observation + one take-over).

**Trade-offs:**
- **Pro:** Clean isolation — each session's I/O only sent to subscribed clients
- **Pro:** Broadcast support — send control messages to all viewers of a session
- **Con:** Requires careful room lifecycle management (join on connect, leave on disconnect)

**Example:**
```typescript
// src/server/socket/terminalHandler.ts
io.of('/terminal').on('connection', (socket) => {
  const { sessionName } = socket.handshake.query;

  // Join room for this session
  socket.join(`session:${sessionName}`);

  // Attach pty to this socket
  terminalStreamService.attachSocketToSession(socket, sessionName, { readOnly: true });

  socket.on('disconnect', () => {
    socket.leave(`session:${sessionName}`);
    terminalStreamService.detachSocket(socket.id);
  });

  socket.on('terminal:input', (data: string) => {
    // Only process if not read-only
    if (terminalStreamService.isSocketInteractive(socket.id)) {
      // Input already forwarded by TerminalStreamService
    }
  });
});
```

### Pattern 2: PTY Process Per Socket vs Shared PTY

**What:** Two approaches for terminal streaming:
- **Per-socket PTY:** Each browser gets its own `tmux attach-session` pty process
- **Shared PTY:** One pty per session, multiple sockets subscribe to its output

**When to use:**
- **Per-socket:** Default pattern. tmux handles multi-attach natively. Each viewer gets independent pty resize control.
- **Shared:** Only if you need precise control over who can write input (e.g., mutex for take-over mode). More complex.

**Trade-offs:**
- **Per-socket PTY:**
  - **Pro:** Simple. tmux already supports multiple attach sessions.
  - **Pro:** Each viewer can resize terminal independently without affecting others.
  - **Con:** More pty processes = more resource usage (minimal for tmux attach).
- **Shared PTY:**
  - **Pro:** Single pty = less resource usage.
  - **Con:** Resize conflicts — all viewers must share same terminal dimensions.
  - **Con:** Input routing complexity — need mutex to prevent multiple writers.

**Recommendation for Warden:** Use per-socket PTY. Resource overhead is negligible, and tmux already solves multi-viewer terminal state.

**Example (per-socket):**
```typescript
// src/server/services/TerminalStreamService.ts
attachSocketToSession(socket: Socket, sessionName: string, options: { readOnly: boolean }): void {
  // Each socket gets its own pty running `tmux attach-session`
  const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
  });

  ptyProcess.onData((terminalOutput: string) => {
    socket.emit('terminal:output', terminalOutput);
  });

  if (!options.readOnly) {
    socket.on('terminal:input', (userInput: string) => {
      ptyProcess.write(userInput);
    });
  }

  this.activeStreams.set(socket.id, { ptyProcess, sessionName, isReadOnly: options.readOnly });
}
```

### Pattern 3: Lazy Session Discovery vs Active Tracking

**What:**
- **Lazy discovery:** On page load, scan tmux sessions, show what exists. No persistent database.
- **Active tracking:** Track all sessions in SQLite with metadata (agent, project, status, timestamps).

**When to use:**
- **Lazy:** Minimal systems with only terminal streaming. No historical data needed.
- **Active:** Systems needing session history, token usage tracking, status aggregation (like Warden).

**Trade-offs:**
- **Lazy:**
  - **Pro:** Zero persistence overhead. Always shows current truth from tmux.
  - **Con:** Can't track historical sessions, token usage, or metadata like "project path".
- **Active:**
  - **Pro:** Rich metadata, historical queries, aggregation.
  - **Con:** Database can desync from tmux if sessions killed outside the app.

**Recommendation for Warden:** Active tracking with periodic reconciliation. Run a background job every 30s to sync SQLite status with actual tmux session list.

**Example:**
```typescript
// src/server/services/InstanceTracker.ts
async reconcileWithTmux(): Promise<void> {
  const activeTmuxSessions = await this.tmuxSessionManager.listAgentSessions();
  const dbInstances = await this.db.listActiveInstances();

  // Mark instances as stopped if tmux session no longer exists
  for (const dbInstance of dbInstances) {
    const stillRunning = activeTmuxSessions.some(
      tmux => tmux.sessionName === dbInstance.tmuxSessionName
    );
    if (!stillRunning) {
      await this.db.updateInstanceStatus(dbInstance.id, 'stopped');
    }
  }

  // Discover new sessions not yet tracked
  for (const tmuxSession of activeTmuxSessions) {
    const alreadyTracked = dbInstances.some(
      db => db.tmuxSessionName === tmuxSession.sessionName
    );
    if (!alreadyTracked) {
      // Auto-register discovered session
      await this.db.insertInstance({
        agentId: tmuxSession.agentId,
        tmuxSessionName: tmuxSession.sessionName,
        projectPath: 'unknown', // Can parse from session name or config
      });
    }
  }
}
```

### Pattern 4: Read-Only by Default, Explicit Take-Over

**What:** All terminal views start in read-only mode. Users must explicitly activate take-over mode to send input. Only one viewer can take over at a time.

**When to use:** Dashboards observing autonomous agents. Prevents accidental input disruption.

**Trade-offs:**
- **Pro:** Safe. Can't accidentally interrupt agent mid-task.
- **Pro:** Clear UX — badge shows "READ ONLY" vs "INTERACTIVE".
- **Con:** Extra click to interact (acceptable trade-off for safety).

**Example:**
```typescript
// src/client/components/TerminalView.tsx
const [isTakeOverActive, setIsTakeOverActive] = useState(false);

const handleTakeOver = async () => {
  const response = await fetch(`/api/instances/${instanceId}/take-over`, { method: 'POST' });
  if (response.ok) {
    setIsTakeOverActive(true);
  }
};

return (
  <div>
    {!isTakeOverActive && (
      <div className="read-only-badge">READ ONLY</div>
    )}
    {!isTakeOverActive && (
      <button onClick={handleTakeOver}>Take Over</button>
    )}
    <TerminalView
      sessionName={sessionName}
      isReadOnly={!isTakeOverActive}
    />
  </div>
);
```

## Data Flow

### Request Flow: Terminal Output Streaming

```
User loads dashboard
    ↓
React App renders TerminalView
    ↓
useTerminalSocket hook connects to Socket.IO
    ↓
Socket.IO /terminal namespace handler
    ↓
TerminalStreamService.attachSocketToSession(socket, sessionName)
    ↓
node-pty spawns: tmux attach-session -t warden-coding-001
    ↓
tmux session already running Claude Code
    ↓
ptyProcess.onData() receives terminal output
    ↓
socket.emit('terminal:output', data)
    ↓
Browser receives event
    ↓
xterm.js terminal.write(data)
    ↓
User sees live terminal output
```

### Request Flow: User Input (Take-Over Mode)

```
User types in terminal
    ↓
xterm.js terminal.onData(userInput)
    ↓
socket.emit('terminal:input', userInput)
    ↓
Server socket handler receives event
    ↓
TerminalStreamService forwards to ptyProcess.write(userInput)
    ↓
ptyProcess writes to tmux session stdin
    ↓
tmux session receives input
    ↓
Claude Code processes command
    ↓
Output flows back through ptyProcess.onData → socket.emit → xterm.js
```

### Request Flow: Session Discovery

```
Page load
    ↓
useActiveInstances hook calls GET /api/instances
    ↓
instanceRoutes handler
    ↓
InstanceTracker.listActiveInstances()
    ↓
DatabaseConnection.query('SELECT * FROM instances WHERE status = active')
    ↓
Return instance list
    ↓
React renders InstanceTabBar with tabs
    ↓
User clicks tab → TerminalView mounts → connects to Socket.IO
```

### State Management

For Warden (small-scale, single-user dashboard), simple state patterns suffice:

```
Server State (Source of Truth):
  ├── SQLite: instance metadata, session history, token usage
  ├── tmux: actual running sessions
  └── OpenClaw config: agent definitions, topic mappings

Client State (Derived):
  ├── useState: active tab ID, take-over mode toggle
  ├── useEffect polling: instance list (refresh every 5s)
  └── Socket.IO: real-time terminal output (push from server)
```

No need for Redux/Zustand/etc. — component-level state + polling + WebSocket is sufficient for 1-4 concurrent sessions.

### Key Data Flows

1. **Terminal Output (server → client):** ptyProcess.onData → socket.emit → xterm.js.write
2. **User Input (client → server):** xterm.js.onData → socket.emit → ptyProcess.write
3. **Session List (client ← server):** HTTP polling /api/instances every 5s
4. **Config Metadata (client ← server):** HTTP GET /api/agents on mount, cache in state
5. **Take-Over Toggle (client → server):** HTTP POST /api/instances/:id/take-over → update TerminalStreamService internal state

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **1-5 concurrent sessions** | Monolith is perfect. Single Node.js process, SQLite, no optimization needed. |
| **5-20 concurrent sessions** | Add connection pooling for Socket.IO. Enable tmux aggressive-resize. Consider moving SQLite to /dev/shm for faster writes. |
| **20-100 concurrent sessions** | Move to PostgreSQL (SQLite write contention). Add Redis for session state. Consider clustering Node.js (multiple workers). |
| **100+ concurrent sessions** | Split into service layers: Terminal Gateway (handles ptys) + API Server (handles REST). Use message queue (RabbitMQ) for inter-service communication. Consider tmux alternatives (containerized pty processes). |

### Scaling Priorities

**Warden context:** 1-4 concurrent sessions (Gideon, Warden, Scout, Builder). No scaling needed. SQLite + single Node.js process is correct choice.

1. **First bottleneck (if ever hit):** Socket.IO reconnection storms if server restarts. **Fix:** Stagger reconnection delays with exponential backoff + jitter.
2. **Second bottleneck:** SQLite write contention if adding verbose logging. **Fix:** Batch writes, use WAL mode (already planned), or debounce status updates.

## Anti-Patterns

### Anti-Pattern 1: Direct Terminal Process Spawning (No tmux)

**What people do:** Spawn `claude` or shell process directly via node-pty without tmux wrapper.

**Why it's wrong:**
- Sessions die when WebSocket disconnects.
- Can't reattach to running process.
- No persistence across server restarts.
- Can't manually inspect session from SSH.

**Do this instead:** Always spawn sessions inside tmux. Use `tmux new-session -d -s <name> <command>` for creation, `tmux attach-session -t <name>` for viewing. tmux provides free session persistence and multi-viewer support.

### Anti-Pattern 2: Shared PTY Without Input Mutex

**What people do:** Use single pty per session, allow all connected sockets to write input.

**Why it's wrong:**
- Race conditions — two users typing simultaneously produces garbled input.
- No clear ownership of who's controlling the session.
- Hard to debug "who sent that command?"

**Do this instead:** Either use per-socket pty (recommended) OR implement take-over mutex (only one socket can be interactive at a time, others read-only).

### Anti-Pattern 3: Polling Terminal Output via HTTP

**What people do:** Client polls GET /api/terminal/:id/output every 500ms to fetch new terminal data.

**Why it's wrong:**
- Terrible latency — up to 500ms delay between output and display.
- Massive overhead — most polls return empty (no new data).
- Doesn't scale — 10 clients = 20 req/sec just for idle terminal.

**Do this instead:** Use WebSocket (Socket.IO) for terminal output. Server pushes data as it arrives. Sub-100ms latency, zero overhead when idle.

### Anti-Pattern 4: Storing Terminal Buffers in Database

**What people do:** Capture all terminal output to database for "full history replay".

**Why it's wrong:**
- Massive database bloat — terminal sessions generate MB of ANSI escape sequences.
- Slow queries — replaying 10,000 lines from SQLite for xterm.js is sluggish.
- tmux already provides scrollback buffer (configurable limit).

**Do this instead:** Store session metadata (status, timestamps, project path) in database. Store logs as files if history needed (e.g., `/data/logs/warden-coding-001.log`). Let tmux handle scrollback for active sessions.

### Anti-Pattern 5: Synchronous tmux Command Execution

**What people do:** Execute `tmux list-sessions` synchronously in HTTP request handler.

**Why it's wrong:**
- Blocks event loop if tmux hangs (rare but possible).
- Single slow tmux command delays all concurrent requests.

**Do this instead:** Use async/await with execAsync. Add timeout to tmux commands (e.g., 5s). Cache results for non-critical queries (list-sessions can be cached for 2-3 seconds).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **OpenClaw Gateway API** | HTTP REST client | POST to `/api/gateway/send` with agent ID + message. Used for prompt injection from PromptInputPanel. |
| **tmux** | Shell command via node child_process | `tmux list-sessions`, `tmux new-session`, `tmux attach-session`. Assumes tmux 3.0+ installed. |
| **node-pty** | Native Node.js addon | Requires compilation (node-gyp). Install build-essential on Ubuntu. Works with tmux, bash, any shell command. |
| **SQLite (better-sqlite3)** | Synchronous Node.js API | Enable WAL mode for concurrent reads. Single connection shared across app. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Client ↔ Server (REST)** | HTTP JSON | Session list, agent metadata, history queries. Standard Express routes. |
| **Client ↔ Server (Terminal)** | WebSocket (Socket.IO) | Real-time terminal I/O. Namespace: `/terminal`. Events: `terminal:output`, `terminal:input`, `terminal:resize`, `terminal:exit`. |
| **TerminalStreamService ↔ TmuxSessionManager** | Direct method calls | TerminalStreamService spawns pty for sessions. TmuxSessionManager provides session names. No circular dependency — Manager creates sessions, Service streams them. |
| **InstanceTracker ↔ DatabaseConnection** | Direct method calls | InstanceTracker is thin wrapper over DatabaseConnection. Adds business logic (reconciliation), delegates persistence to db. |
| **OpenClawConfigReader ↔ File System** | fs.readFileSync | Reads `/home/forge/.openclaw/openclaw.json`. Caches for 30s to avoid excessive disk reads. |

## Build Order Implications

Based on dependencies between components, recommended build order:

### Phase 1: Foundation (Backend Core)
**Why first:** No UI dependencies. Backend can be tested via curl + wscat.

1. DatabaseConnection + schema (no dependencies)
2. TmuxSessionManager (no dependencies, just tmux CLI)
3. TerminalStreamService (depends on node-pty, tmux)
4. Socket.IO handler (depends on TerminalStreamService)
5. InstanceTracker (depends on DatabaseConnection, TmuxSessionManager)
6. REST routes for /api/instances (depends on InstanceTracker)

**Validation:** `curl localhost:3001/api/instances` returns empty array. `wscat -c ws://localhost:3001/terminal?sessionName=test` connects (even if session doesn't exist, connection succeeds).

### Phase 2: Frontend Shell (Client Core)
**Why second:** Backend API exists, can build UI against real data.

7. React app scaffold + Vite config
8. TerminalView component (xterm.js wrapper)
9. useTerminalSocket hook (Socket.IO client)
10. InstanceTabBar (depends on useActiveInstances hook)
11. useActiveInstances hook (polls /api/instances)

**Validation:** Dashboard shows empty state. Manually create tmux session via SSH, refresh page, see it appear in tab bar. Click tab, see terminal output.

### Phase 3: Agent Integration (Config + Gateway)
**Why third:** Requires backend + frontend working. Adds business logic layer.

12. OpenClawConfigReader service
13. GatewayApiClient service
14. /api/agents REST route (depends on OpenClawConfigReader)
15. AgentDetailsSidebar component (depends on /api/agents)
16. PromptInputPanel component (depends on GatewayApiClient)
17. TelegramTopicMap component (depends on OpenClawConfigReader)

**Validation:** Sidebar shows agent SOUL.md. PromptInputPanel sends message to gateway (check OpenClaw logs). Topic map shows correct agent → topic mappings.

### Phase 4: History & Polish
**Why last:** Nice-to-have features. Core functionality already works.

18. Session history table + search
19. Token usage dashboard
20. Dark theme polish
21. Error boundaries, loading states
22. Playwright tests

**Dependency reasoning:**
- TerminalView must exist before InstanceTabBar (tab bar switches between TerminalViews).
- useTerminalSocket must exist before TerminalView (component needs socket hook).
- InstanceTracker must exist before REST routes (routes query tracker).
- DatabaseConnection must exist before InstanceTracker (tracker persists to db).

**Critical path:** DatabaseConnection → InstanceTracker → REST routes → useActiveInstances → InstanceTabBar → TerminalView → useTerminalSocket → Socket.IO handler → TerminalStreamService.

## Sources

**Confidence note:** This architecture research is based on training data knowledge of established patterns in browser terminal systems (Wetty, ttyd, Gotty, xterm.js, Socket.IO, node-pty). WebSearch and WebFetch were unavailable during research. Patterns described are industry-standard as of 2024-2025. Specific library versions and API details should be verified against official documentation during implementation.

**Referenced patterns from:**
- Browser terminal emulators: Wetty (butlerx/wetty), ttyd (tsl0922/ttyd), Gotty (yudai/gotty)
- Terminal rendering: xterm.js (xtermjs.org)
- WebSocket multiplexing: Socket.IO room-based architecture
- PTY abstraction: node-pty (microsoft/node-pty)
- Session persistence: tmux multi-viewer patterns

---
*Architecture research for: Warden Dashboard (Browser-Based Terminal Multiplexer)*
*Researched: 2026-02-12*
