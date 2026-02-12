# Project Research Summary

**Project:** Warden Dashboard
**Domain:** Browser-based terminal dashboard / multi-agent session multiplexer
**Researched:** 2026-02-12
**Confidence:** MEDIUM

## Executive Summary

Warden Dashboard is a browser-based terminal multiplexer specifically designed for monitoring and intervening with OpenClaw autonomous agents. The product combines three established patterns: terminal multiplexing (tmux model), web-based terminal emulation (xterm.js rendering), and agent monitoring dashboards (Jenkins/Kubernetes agent grid model). Research indicates the recommended approach uses a proven stack (Express 5 + Socket.IO + React 19 + xterm.js 5 + node-pty + tmux) with a three-layer architecture: presentation layer (browser with xterm.js), application layer (Node.js with Socket.IO for real-time streaming), and process layer (node-pty bridging to persistent tmux sessions).

The key differentiation is that Warden is NOT a general-purpose terminal tool competing with tmux. It's a monitoring and intervention layer for autonomous agents, prioritizing observation, non-invasiveness, and surgical intervention over power-user terminal features. The architecture must support read-only observation by default with explicit take-over mode, agent-to-Telegram topic mapping for routing clarity, and seamless reconnection without data loss.

Critical risks include PTY process zombie accumulation (requires explicit cleanup handlers), Socket.IO reconnection data loss (requires server-side buffering), xterm.js resize race conditions (requires debouncing and synchronization), and React 19 StrictMode double-mounting effects (requires proper cleanup functions). These pitfalls are well-documented with clear prevention strategies and must be addressed from Phase 1 to avoid expensive retrofitting.

## Key Findings

### Recommended Stack

The stack leverages cutting-edge but stable versions of established technologies. Express 5.2.1 provides async/await support with integrated body-parser. React 19.2.4 offers improved concurrent rendering critical for real-time terminal updates. Socket.IO 4.8.3 handles WebSocket communication with auto-reconnection and room-based multiplexing. xterm.js 5.3.0 provides modern Unicode support and addon architecture. node-pty 1.1.0 creates real PTY processes required for streaming Claude Code output. better-sqlite3 11.10.0 offers synchronous API for simple persistence without client-server overhead. Tailwind CSS 4.1.18 provides fast builds with CSS-first configuration matching OpenClaw Gateway UI style.

**Core technologies:**
- **Express 5.2.1**: HTTP server with native async/await support and integrated body-parser
- **React 19.2.4**: UI framework with compiler optimizations and improved concurrent rendering for terminal updates
- **Socket.IO 4.8.3**: WebSocket library with auto-reconnection, room isolation, and binary event support
- **xterm.js 5.3.0**: Terminal renderer with modern Unicode support and addon system (FitAddon, WebLinksAddon)
- **node-pty 1.1.0**: Pseudo-terminal interface for spawning real shell processes and streaming output
- **better-sqlite3 11.10.0**: Synchronous SQLite driver with no external dependencies for session metadata
- **Tailwind CSS 4.1.18**: Utility-first CSS with Oxide engine for fast builds and OpenClaw UI consistency

**Version-specific gotchas:**
- Express 5 requires HTTP server wrapping (not direct app listen) for Socket.IO integration
- React 19 StrictMode double-invokes effects (requires explicit cleanup functions)
- Tailwind 4 uses CSS-first config with @theme directives (may require safelist for dynamic classes)
- xterm.js fit() must be called AFTER DOM mount with proper debouncing for resize
- Socket.IO client/server versions MUST match exactly (4.8.3 <-> 4.8.3)

### Expected Features

Research identifies clear table stakes vs differentiators. Users expect live terminal streaming, session persistence across browser disconnects, multi-session tabs, read-only by default mode, connection status indicators, and terminal scrollback. These are baseline expectations from any terminal multiplexer and must work flawlessly.

**Must have (table stakes):**
- Live terminal streaming with sub-100ms latency
- Session persistence across browser disconnects (tmux-backed)
- Multi-session tabs with agent metadata (name, project, status)
- Read-only by default to prevent accidental agent interference
- Connection status indicators (connected/reconnecting/dead)
- Terminal scroll buffer and copy/paste support
- Auto-reconnect on network drop
- Terminal resizing on window resize

**Should have (competitive differentiators):**
- Agent-to-Telegram topic mapping (visual grid showing routing)
- Prompt injection via OpenClaw gateway (structured intervention)
- Explicit take-over mode (toggle to interactive terminal)
- Agent identity in UI (color-coded tabs, distinct visual identity)
- Session status tracking (active/idle/stopped/error states)
- Project path context (which git repo the agent is working in)
- SOUL.md preview (quick reminder of agent role)

**Defer (v2+):**
- Session history with search and date filters
- Token usage dashboard per agent
- Log viewer for OpenClaw gateway logs
- Multi-pane terminal splits (tmux already does this)
- Terminal themes/customization (monitoring tool, not daily driver)
- Session recording/replay (storage cost, complexity)

**MVP recommendation:**
Phase 1 focuses on pure observation (terminal streaming, session discovery, multi-session tabs, read-only mode) to prove the observation model works before adding intervention features. Phase 2 adds intervention capabilities (prompt input, take-over mode, topic mapping) once observation is validated. Phase 3 adds analytics and history once intervention patterns are established.

### Architecture Approach

The architecture follows a three-layer pattern with WebSocket room-based multiplexing for session isolation. Each tmux session gets a unique Socket.IO room. Browser connects by session name. Multiple browsers can observe the same session without interference. The recommended pattern uses per-socket PTY (each browser gets its own `tmux attach-session` process) rather than shared PTY, as tmux handles multi-attach natively and resource overhead is negligible.

**Major components:**
1. **Socket Router** (server) — Maps incoming WebSocket connections to correct PTY processes using Socket.IO rooms for session isolation
2. **Session Manager** (server) — Creates/destroys/lists tmux sessions, enforces naming conventions, implements reconciliation between SQLite metadata and actual tmux sessions
3. **Terminal Stream Service** (server) — Spawns node-pty processes, bridges I/O between pty and socket, implements read-only vs interactive mode, handles cleanup on disconnect
4. **Instance Tracker** (server) — Persists session metadata to SQLite (agent, project, status, timestamps), reconciles with tmux state periodically, provides query API
5. **Config Reader** (server) — Parses OpenClaw config (openclaw.json), extracts agent metadata and topic mappings, caches for 30s to avoid excessive disk reads
6. **Terminal View** (client) — React component wrapping xterm.js with FitAddon and WebLinksAddon, uses useRef to prevent re-render issues, implements proper cleanup
7. **Terminal Socket Hook** (client) — Manages Socket.IO connection lifecycle, handles reconnection, exposes send/receive interface to components

**Key patterns:**
- **Room-based multiplexing**: Each session isolated in Socket.IO room (prevents cross-session data leakage)
- **Per-socket PTY**: Each browser connection spawns own `tmux attach-session` (simpler than shared PTY, no resize conflicts)
- **Active tracking with reconciliation**: SQLite tracks metadata, periodic background job syncs with actual tmux sessions (handles sessions killed outside app)
- **Read-only by default, explicit take-over**: Safe observation model with clear UX boundary for intervention

**Project structure:**
```
src/
├── server/
│   ├── services/          # TmuxSessionManager, TerminalStreamService, InstanceTracker, OpenClawConfigReader
│   ├── socket/            # terminalHandler.ts (Socket.IO /terminal namespace)
│   ├── routes/            # REST endpoints for instance management, agent metadata
│   └── database/          # schema.sql, DatabaseConnection.ts
└── client/
    ├── components/        # TerminalView, InstanceTabBar, AgentDetailsSidebar, PromptInputPanel
    └── hooks/             # useTerminalSocket, useActiveInstances, useAgentConfig
```

### Critical Pitfalls

Research identified 10 critical pitfalls, all well-documented with clear prevention strategies. The top 5 that must be addressed in Phase 1:

1. **PTY Process Zombie Apocalypse** — node-pty processes not cleaned up on disconnect, accumulate until server unresponsive. **Prevention**: Two-stage cleanup (Socket.IO disconnect + heartbeat timeout), track all PTY processes in Map, implement graceful shutdown handlers (SIGTERM/SIGINT), use `pty.kill()` followed by `pty.kill('SIGKILL')` if needed.

2. **Socket.IO Reconnection Data Loss** — Terminal output generated during network disconnection is lost. **Prevention**: Implement circular buffer per PTY session (last 10K lines or 1MB), send buffer contents on reconnection before resuming live stream, use tmux scrollback as persistence layer.

3. **xterm.js Fit Addon Resize Race Condition** — Terminal dimensions incorrect, causing text wrapping issues and broken ncurses UIs (vim, htop). **Prevention**: Debounce resize events (300-500ms), wait for DOM layout stabilization before calling fit(), verify dimensions are sane before calling pty.resize(), handle initial mount carefully.

4. **Express 5 Async Error Handling Gaps** — Async errors in route handlers not caught, causing process crash or hanging requests. **Prevention**: Use async middleware wrapper, always call next(err) in try/catch blocks, implement global error handler with 4 parameters, configure process-level unhandledRejection handler.

5. **SQLite WAL Mode Corruption on Dirty Shutdown** — Database corrupted after unclean shutdown (kill -9, power loss). **Prevention**: Enable WAL mode explicitly, implement graceful shutdown handler that checkpoints WAL and closes DB properly, set appropriate checkpoint interval.

**Phase 2 pitfalls:**
- React 19 useEffect double-execution in StrictMode (requires cleanup functions)
- tmux session name collisions with concurrent agents (requires UUID-based naming)

**Phase 3 pitfalls:**
- Tailwind CSS 4 JIT purge removing terminal classes (requires safelist)

**Security pitfalls (address throughout):**
- Inadequate input sanitization leading to command injection (validate all pty.write() calls)
- No authentication on Socket.IO (implement at minimum localhost-only binding)
- Memory leaks from unremoved event listeners (track and clean up all listeners)

## Implications for Roadmap

Based on architecture dependencies, feature priorities, and pitfall timing, recommend a three-phase structure focused on incremental validation:

### Phase 1: Core Infrastructure (Foundation)
**Rationale:** No UI dependencies. Backend can be tested independently via curl + wscat. Must establish foundation with proper error handling, cleanup, and persistence before building on top. All critical pitfalls with "Phase 1" designation must be addressed here to avoid expensive retrofitting.

**Delivers:** Working backend with terminal streaming, session management, and database persistence. Validates core technical feasibility before investing in frontend.

**Addresses features:**
- Live terminal streaming (table stake)
- Session persistence across disconnects (table stake)
- Connection status indicators (table stake)

**Avoids pitfalls:**
- PTY zombie processes (cleanup handlers)
- Express 5 async error gaps (global error handling)
- SQLite WAL corruption (graceful shutdown)
- Memory leaks (event listener tracking)
- Command injection (input validation)

**Components:**
- DatabaseConnection + schema
- TmuxSessionManager
- TerminalStreamService
- Socket.IO handler
- InstanceTracker
- REST routes for /api/instances

**Validation:** `curl localhost:3001/api/instances` returns empty array. `wscat -c ws://localhost:3001/terminal?sessionName=test` connects. Manually create tmux session via SSH, see it tracked in database.

### Phase 2: Terminal Integration (UI + Real-time Streaming)
**Rationale:** Backend API exists, can build UI against real data. This phase connects xterm.js to Socket.IO and validates the full observation loop. Must address React/xterm.js integration pitfalls and resize handling.

**Delivers:** Working dashboard that streams live terminal output. Users can observe multiple agents simultaneously with proper tab switching.

**Addresses features:**
- Multi-session tabs (table stake)
- Read-only by default (table stake)
- Terminal scroll and copy/paste (table stake)
- Terminal resizing (table stake)
- Agent identity in UI (differentiator)
- Project path context (differentiator)

**Avoids pitfalls:**
- Socket.IO reconnection data loss (buffering)
- xterm.js resize race conditions (debouncing)
- React 19 useEffect double-execution (cleanup functions)
- tmux session name collisions (UUID naming)

**Components:**
- React app scaffold + Vite config
- TerminalView component (xterm.js wrapper)
- useTerminalSocket hook
- InstanceTabBar
- useActiveInstances hook

**Validation:** Dashboard shows empty state. Manually create tmux session, refresh page, see tab appear. Click tab, see live terminal output. Disconnect network, reconnect, see no data loss. Resize window, verify vim/htop render correctly.

### Phase 3: Agent Integration (Config + Gateway)
**Rationale:** Requires backend + frontend working. Adds business logic layer connecting to OpenClaw config and gateway API. Enables intervention capabilities beyond pure observation.

**Delivers:** Full intervention capabilities via prompt injection and take-over mode. Visual mapping of agent routing. Agent details for informed intervention decisions.

**Addresses features:**
- Prompt injection via gateway (differentiator)
- Explicit take-over mode (differentiator)
- Agent-to-Telegram topic mapping (differentiator)
- SOUL.md preview (differentiator)
- Session status tracking (differentiator)

**Avoids pitfalls:**
- Tailwind CSS 4 purge issues (safelist)

**Components:**
- OpenClawConfigReader service
- GatewayApiClient service
- /api/agents REST route
- AgentDetailsSidebar
- PromptInputPanel
- TelegramTopicMap

**Validation:** Sidebar shows agent SOUL.md. PromptInputPanel sends message (verify in OpenClaw logs). Topic map shows correct agent → topic mappings. Take-over mode allows typing into terminal.

### Phase 4: History & Polish (v2+ Features)
**Rationale:** Nice-to-have features. Core functionality works. Historical analysis and analytics only valuable once product is used daily.

**Delivers:** Session history search, token usage dashboard, log viewer, UI polish, Playwright tests.

**Addresses features:**
- Session history (deferred)
- Token usage dashboard (deferred)
- Log viewer (deferred)

### Phase Ordering Rationale

- **Foundation first**: DatabaseConnection → InstanceTracker → REST routes establishes persistence layer all other components depend on
- **Backend before frontend**: Server components can be tested independently with curl/wscat, proving technical feasibility before UI investment
- **Observation before intervention**: Phase 1-2 prove the observation model works (live streaming, multi-session tabs) before adding intervention complexity (prompts, take-over)
- **Standard before custom**: Terminal streaming (standard xterm.js + Socket.IO pattern) before OpenClaw integration (custom business logic)
- **Critical path**: DatabaseConnection → InstanceTracker → REST routes → useActiveInstances → InstanceTabBar → TerminalView → useTerminalSocket → Socket.IO handler → TerminalStreamService

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Core Infrastructure):** Well-documented Express + Socket.IO + SQLite patterns. Established xterm.js/node-pty integration examples (Wetty, ttyd, Gotty). No research needed.
- **Phase 2 (Terminal Integration):** Standard React + xterm.js + Socket.IO client patterns. Abundant examples in open source. Skip research.

**Phases likely needing deeper research:**
- **Phase 3 (Agent Integration):** Requires understanding OpenClaw gateway API and config structure. Research `/gsd:research-phase 3` to investigate:
  - OpenClaw config format (openclaw.json structure, agent definitions)
  - Gateway API endpoints (how to send messages to specific agents/topics)
  - Token usage visibility (does gateway expose per-agent metrics?)
  - Log format and access patterns

**Research gaps to address in Phase 3:**
- OpenClaw gateway prompt injection API (does it exist? what's the endpoint?)
- Token usage visibility (API vs log parsing?)
- Session lifecycle events (webhook support or polling only?)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | All versions verified via npm (2026-02-12), but Express 5/React 19/Tailwind 4 are relatively new. Breaking changes based on training data (January 2025 cutoff). High confidence in core choices, medium confidence in version-specific gotchas. |
| Features | MEDIUM | Feature landscape based on training data understanding of terminal multiplexers (tmux, screen), web terminals (Wetty, ttyd), and agent dashboards (Jenkins, K8s). Could not verify 2026 state via WebSearch. Patterns are established and slow-changing. |
| Architecture | MEDIUM | Architecture patterns based on established browser terminal systems (Wetty, ttyd, Gotty) and WebSocket multiplexing. Socket.IO room-based isolation and node-pty/tmux integration are proven patterns. Unable to verify current best practices via live sources. |
| Pitfalls | MEDIUM | Pitfalls drawn from training data knowledge of common issues with xterm.js, Socket.IO, node-pty, React hooks, and SQLite. Specific Express 5/React 19/Tailwind 4 edge cases need real-world validation. Prevention strategies are sound but may need adjustment during implementation. |

**Overall confidence:** MEDIUM

### Gaps to Address

Research areas with lower confidence that require validation during implementation:

- **Express 5 async error handling edge cases**: Training data covers general approach, but specific v5 behavior needs testing. **Mitigation**: Write error handling tests early in Phase 1.

- **Tailwind 4 @theme syntax with OpenClaw Gateway UI**: Must verify Tailwind 4 CSS-first config matches OpenClaw UI style requirements. **Mitigation**: Check OpenClaw Gateway UI code during Phase 3 for theme structure.

- **Socket.IO reconnection behavior with Claude Code streams**: Specific behavior with long-running Claude Code output needs testing. **Mitigation**: Simulate network interruptions during Phase 2 testing.

- **node-pty memory usage under long-running sessions**: Unknown memory footprint after 24+ hours of continuous streaming. **Mitigation**: Load test with long-running sessions during Phase 2.

- **OpenClaw gateway API capabilities**: Unclear if gateway exposes prompt injection endpoint or token usage metrics. **Mitigation**: Research OpenClaw codebase during Phase 3 planning (use `/gsd:research-phase 3`).

- **React 19 concurrent rendering impact on terminal writes**: May need `flushSync` if order matters. **Mitigation**: Test with rapid terminal output during Phase 2.

- **xterm.js performance with 24+ hour sessions**: Unknown scroll buffer memory impact. **Mitigation**: Cap scroll buffer at 10K lines, rely on tmux scrollback for history.

## Sources

### Primary (HIGH confidence)
- **npm registry** (verified 2026-02-12): Version numbers, peer dependencies, engines for express@5.2.1, react@19.2.4, socket.io@4.8.3, xterm@5.3.0, node-pty@1.1.0, better-sqlite3@11.10.0, tailwindcss@4.1.18
- **package.json** (project): Confirmed pre-decided stack choices align with latest stable versions

### Secondary (MEDIUM confidence)
- **Training data** (January 2025 cutoff): Breaking changes for Express 5, React 19, Tailwind 4, xterm.js 5, Socket.IO 4
- **Training data**: Browser terminal architecture patterns (Wetty, ttyd, Gotty, tmate)
- **Training data**: Agent monitoring dashboard patterns (Jenkins, Kubernetes Dashboard, PM2)
- **Training data**: Terminal multiplexing patterns (tmux, screen, byobu)
- **Training data**: Common pitfalls with xterm.js, Socket.IO, node-pty, React hooks, SQLite

### Tertiary (LOW confidence, needs validation)
- **Inferred**: OpenClaw gateway API capabilities (prompt injection, token metrics)
- **Inferred**: Express 5 specific async error handling edge cases
- **Inferred**: React 19 concurrent rendering impact on terminal writes

### Recommended Validation
- Test Express 5 async error handling in development during Phase 1
- Verify Tailwind 4 @theme syntax against OpenClaw Gateway UI during Phase 3
- Check Socket.IO reconnection behavior with real Claude Code streams during Phase 2
- Validate node-pty memory usage under long-running sessions during Phase 2
- Research OpenClaw codebase for gateway API capabilities during Phase 3 planning

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
