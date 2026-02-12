# Warden Dashboard

## What This Is

A browser-based terminal multiplexer hosted at `warden.kingdom.lv` that streams live Claude Code output via xterm.js, shows which OpenClaw agent owns each session, maps sessions to Telegram topics, and lets the operator take over or inject prompts. It is the observation and override layer for the multi-agent system orchestrated by Gideon.

## Core Value

Real-time visibility into all active Claude Code agent sessions from a single browser tab — see what every agent is doing, right now.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Live xterm.js terminal streaming of tmux sessions (read-only by default)
- [ ] Instance tab bar showing all active agent sessions with name, status, project path
- [ ] Auto-discovery of tmux sessions named with agent prefix (warden-*, scout-*, etc.)
- [ ] SQLite-backed instance status tracking (active, idle, stopped, error)
- [ ] Prompt input panel to send messages to OpenClaw gateway per agent
- [ ] Take-over mode toggle from read-only to interactive terminal input
- [ ] Telegram topic-to-agent mapping visual grid
- [ ] Agent details sidebar (SOUL.md preview, workspace, model, memory status)
- [ ] Session history with search and date filters
- [ ] Token usage dashboard with per-agent daily aggregation
- [ ] Gateway log tail viewer filtered by agent

### Out of Scope

- Mobile app — single-user internal tool, desktop browser only
- Multi-user auth — IP-whitelisted, single operator (Gideon)
- Agent creation/deletion — managed via openclaw.json, not the dashboard
- Telegram bot management — handled by OpenClaw gateway

## Context

- Runs on same Ubuntu 24 server as gideons.kingdom.lv (Laravel Forge managed)
- OpenClaw is the multi-agent gateway routing Telegram messages to Claude Code agents
- Each agent (Warden, Scout, Builder) has isolated workspace, agentDir, session store
- Agents run in tmux sessions with naming convention: `<agentId>-<projectSlug>-<shortId>`
- Session keys follow pattern: `agent:<id>:telegram:group:<groupId>:topic:<topicId>`
- Nginx handles SSL termination, IP whitelist (94.30.169.76), WebSocket upgrade
- Node.js binds to 127.0.0.1:3535, not exposed to internet directly
- Bearer token auth injected at Nginx proxy level

## Constraints

- **Tech Stack**: Node.js 22+, Express 5, React 19, TypeScript 5, Vite 6, Socket.IO 4, xterm.js 5, SQLite (better-sqlite3), Tailwind CSS 4, node-pty — per PRD specification
- **Server**: Single Ubuntu 24 server, `forge` user, Laravel Forge managed
- **Port**: 3535 (behind Nginx reverse proxy)
- **Security**: IP whitelist + bearer token at Nginx level, no application-level auth needed
- **Process**: tmux 3.4+ for session persistence

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express 5 over alternatives | Lightweight, matches OpenClaw ecosystem, no magic | — Pending |
| SQLite over Postgres | Zero-config, single-file, single-server deployment | — Pending |
| Socket.IO over raw WS | Auto-reconnect, room-based multiplexing, proven with xterm.js | — Pending |
| node-pty for terminal bridge | Spawns real PTY to attach to tmux, full terminal emulation | — Pending |
| Tailwind CSS 4 | Utility-first, matches OpenClaw dark UI aesthetic | — Pending |
| SRP service architecture | Each service does one thing: TmuxSessionManager, TerminalStreamService, etc. | — Pending |

---
*Last updated: 2026-02-12 after initialization*
