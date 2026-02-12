# Warden Dashboard

## What This Is

A browser-based terminal multiplexer hosted at `warden.kingdom.lv` that streams live Claude Code output via xterm.js, shows which OpenClaw agent owns each session, maps sessions to Telegram topics, and lets the operator inject prompts or type directly into terminals. It is the observation and override layer for the multi-agent system orchestrated by Gideon.

## Core Value

Real-time visibility into all active Claude Code agent sessions from a single browser tab — see what every agent is doing, right now.

## Requirements

### Validated

- ✓ Live xterm.js terminal streaming of tmux sessions — v1.0
- ✓ Instance tab bar showing all active agent sessions with name, status, project path — v1.0
- ✓ Auto-discovery of tmux sessions named with agent prefix — v1.0
- ✓ SQLite-backed instance status tracking (active, idle, stopped, error) — v1.0
- ✓ Prompt input panel to send messages to OpenClaw gateway per agent — v1.0
- ✓ Always-interactive terminals (no toggle needed) — v1.0
- ✓ Telegram topic-to-agent mapping visual grid — v1.0
- ✓ Agent details sidebar (SOUL.md preview, workspace, model, memory status) — v1.0
- ✓ Session history with search and date filters — v1.0
- ✓ Token usage dashboard with per-agent daily aggregation — v1.0
- ✓ Gateway log tail viewer filtered by agent — v1.0
- ✓ Per-session stop button — v1.0
- ✓ Comprehensive README with test documentation — v1.0

### Active

(None — define in next milestone via `/gsd:new-milestone`)

### Out of Scope

- Mobile app — single-user internal tool, desktop browser only
- Multi-user auth — IP-whitelisted, single operator (Gideon)
- Agent creation/deletion — managed via openclaw.json, not the dashboard
- Telegram bot management — handled by OpenClaw gateway
- Terminal themes/customization — monitoring tool, single dark theme
- Multi-pane terminal splits — tmux handles layout within sessions
- Session recording/replay — storage cost, session history table sufficient
- In-dashboard code editor — agents edit files, operator intervenes via prompts
- Offline mode — real-time is core value

## Context

Shipped v1.0 with 2,385 LOC TypeScript across 66 files.
Tech stack: Express 5, Socket.IO 4, React 19, xterm.js 5, node-pty, SQLite (better-sqlite3), Tailwind CSS 4, Vite 6.
Runs on Ubuntu 24 server (Laravel Forge managed), same host as gideons.kingdom.lv.
12 Playwright E2E tests passing. Production Nginx config with SSL + IP whitelist + WebSocket.

## Constraints

- **Tech Stack**: Node.js 22+, Express 5, React 19, TypeScript 5, Vite 6, Socket.IO 4, xterm.js 5, SQLite (better-sqlite3), Tailwind CSS 4, node-pty
- **Server**: Single Ubuntu 24 server, `forge` user, Laravel Forge managed
- **Port**: 3001 (behind Nginx reverse proxy)
- **Security**: IP whitelist + bearer token at Nginx level, no application-level auth needed
- **Process**: tmux 3.4+ for session persistence

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express 5 over alternatives | Lightweight, matches OpenClaw ecosystem, no magic | ✓ Good — stable, fast, zero issues |
| SQLite over Postgres | Zero-config, single-file, single-server deployment | ✓ Good — WAL mode handles concurrent reads |
| Socket.IO over raw WS | Auto-reconnect, room-based multiplexing, proven with xterm.js | ✓ Good — connectionStateRecovery works well |
| node-pty for terminal bridge | Spawns real PTY to attach to tmux, full terminal emulation | ✓ Good — needs isAlive guard for EBADF |
| Tailwind CSS 4 | Utility-first, matches OpenClaw dark UI aesthetic | ✓ Good — requires @tailwindcss/vite plugin |
| SRP service architecture | Each service does one thing: TmuxSessionManager, TerminalStreamService, etc. | ✓ Good — clean separation |
| Always-interactive terminals | Read-only mode adds friction, single operator model | ✓ Good — simplified codebase, fixed buffer-clearing bug |

---
*Last updated: 2026-02-12 after v1.0 milestone*
