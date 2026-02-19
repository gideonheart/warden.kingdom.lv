# Warden Dashboard

## What This Is

A browser-based terminal multiplexer hosted at `warden.kingdom.lv` that streams live Claude Code output via xterm.js, shows which OpenClaw agent owns each session, maps sessions to Telegram topics, and lets the operator inject prompts or type directly into terminals — with auto-focusing terminals, mouse scrollback, and session-aware prompt delivery via Gateway. It is the observation and override layer for the multi-agent system orchestrated by Gideon.

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
- ✓ Terminal auto-focus on load and tab switch (no click needed) — v1.1
- ✓ Mouse wheel scrollback via tmux history (50,000 lines) — v1.1
- ✓ Prompt dropdown reflects selected session and auto-syncs on tab switch — v1.1
- ✓ Prompt dropdown allows manual override to any configured agent — v1.1
- ✓ Send button delivers prompts via Gateway API — v1.1
- ✓ Ctrl+Enter sends prompts — v1.1

### Active

#### Current Milestone: v2.2 Code Hygiene

**Goal:** Eliminate dead code, extract shared components, unify types, decompose monolithic views, and add lazy tab mounting — pure refactor, net-negative ~500 LOC.

**Target features:**
- ✓ Delete ~750 lines of dead code (gutted plugin file, orphaned AgentsView) — Phase 15
- ✓ Create `src/shared/gsdTypes.ts` — unify GSD types across client/server boundary — Phase 15
- ✓ Extract 9 duplicated constants/components into shared GSD status module (`gsdShared.tsx`) — Phase 16
- ✓ Decompose GsdView.tsx into 4 tab sub-components (AgentsTab, ControlsTab, RegistryTab, HooksTab) — Phase 16, GsdView now 76 lines
- Lazy-mount tabs — only render active tab, eliminating ~18 HTTP req/min + 60 tmux subprocess/min waste
- Fix minor issues: fd leak in spawn handler, setTimeout cleanup, Map re-creation, regex fragility

### Out of Scope

- Multi-user auth — IP-whitelisted, single operator (Gideon)
- Agent creation/deletion — managed via openclaw.json, not the dashboard
- Telegram bot management — handled by OpenClaw gateway
- Terminal themes/customization — monitoring tool, single dark theme
- Multi-pane terminal splits — tmux handles layout within sessions
- In-dashboard code editor — agents edit files, operator intervenes via prompts
- Offline mode — real-time is core value

## Context

Shipped v1.1 with 2,644 LOC TypeScript (src + tests). Phase 9 added 185 LOC for plugin infrastructure.
Tech stack: Express 5, Socket.IO 4, React 19, xterm.js 5, node-pty, SQLite (better-sqlite3), Tailwind CSS 4, Vite 6.
Runs on Ubuntu 24 server (Laravel Forge managed), same host as gideons.kingdom.lv.
20 Playwright E2E tests passing (12 from v1.0 + 8 from v1.1). Production Nginx config with SSL + IP whitelist + WebSocket.
tmux configured with mouse mode and 50,000-line scrollback buffer for monitoring workflows.

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
| Immediate terminal.focus() after open() | Eliminates visible focus delay vs requestAnimationFrame | ✓ Good — instant interactive feel |
| tmux 50,000-line history-limit | ~10MB/pane, adequate for monitoring use | ✓ Good — enables session debugging |
| Derived state for prompt panel sync | Compute derivedAgentId from activeInstances lookup | ✓ Good — reliable, no manual tracking |
| Separate sidebar/prompt panel agent state | Clean separation of concerns, avoids state conflicts | ✓ Good — independent behavior |
| Vite import.meta.glob for plugin discovery | Zero manual registration, add .tsx file and it appears | ✓ Good — 185 LOC total |
| Build-time satisfies for plugin validation | Catches invalid manifests at compile time, not runtime | ✓ Good — immediate feedback |
| ErrorBoundary per plugin panel | Crashing plugin cannot break main dashboard | ✓ Good — isolates failures |

| Lazy-mount GSD tabs | Conditional render active tab only; hooks auto-deactivate on unmount | — Pending |
| Extract shared GSD status components | DRY — 9 constants/components duplicated across 3 files | ✓ Good — gsdShared.tsx, zero duplicates |
| Unified gsdTypes.ts in src/shared/ | Follow established shared types pattern, eliminate client/server type drift | ✓ Good — Phase 15, all imports updated |
| SRP tab extraction for GsdView.tsx | Each tab standalone, parent is pure router | ✓ Good — 76 LOC router, 4 tab files |

---
*Last updated: 2026-02-19 after Phase 16*
