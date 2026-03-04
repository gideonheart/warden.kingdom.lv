# Warden Dashboard

## What This Is

A browser-based terminal multiplexer and operations platform hosted at `warden.kingdom.lv` that streams live Claude Code output via xterm.js, provides agent lifecycle control (start/stop/restart), cost velocity tracking with budget alerts, session recording with variable-speed replay, and operator awareness features (permission badges, context pressure, keyboard navigation, terminal search, browser notifications). It is the observation, control, and audit layer for the multi-agent system orchestrated by Gideon.

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
- ✓ Dead code removal (~740 LOC deleted) — v2.3
- ✓ Unified GSD types in src/shared/gsdTypes.ts — v2.3
- ✓ Shared GSD UI module (gsdShared.tsx) with 9 extracted constants/components — v2.3
- ✓ GsdView decomposed to 76-line router with 4 standalone tab components — v2.3
- ✓ Lazy-mount GSD tabs eliminating idle polling waste — v2.3
- ✓ fd safety, setTimeout cleanup, Map stabilization, anchored regex — v2.3
- ✓ SessionUsageReader JSONL scanner with cache token tracking — v2.3
- ✓ Auto-scan token usage on boot + every 5 minutes — v2.3
- ✓ Enhanced TokenUsageView with cache columns and Scan Now button — v2.3
- ✓ Permission prompt detection with tab badge alert — v3.0
- ✓ Context window pressure badge in terminal view header — v3.0
- ✓ Agent state chip in terminal header — v3.0
- ✓ Keyboard navigation shortcuts (Ctrl+1-9, Ctrl+B, Ctrl+[/]) — v3.0
- ✓ Terminal text search via xterm-addon-search (Ctrl+F) — v3.0
- ✓ Search match count, highlight persistence, scrollbar gutter markers — v3.0
- ✓ Browser notifications for permission prompts (opt-in) — v3.0
- ✓ Start, stop, and restart agent sessions from dashboard — v3.1
- ✓ Agent session status lifecycle with transitional states (starting/stopping) — v3.1
- ✓ Safety guards for agent orchestration (confirmations, 409 duplicate guard) — v3.1
- ✓ Token burn rate calculation with sliding windows (Today/2-day/7-day) — v3.1
- ✓ Per-agent budget alerts at 80%/100% thresholds with nav badge — v3.1
- ✓ Cost projection at current burn rate — v3.1
- ✓ Model cost comparison view (bar chart by model variant) — v3.1
- ✓ CSV export of token usage data — v3.1
- ✓ Terminal session recording in asciicast v2 format — v3.1
- ✓ Recording toggle per session with red pulse indicator — v3.1
- ✓ Recording replay at variable speed (1x/2x/4x/8x) — v3.1
- ✓ Recording library with session metadata — v3.1

### Active

- [ ] Auto-record option with configurable triggers (REC-05, deferred from v3.1)
- [ ] Recording storage rotation policy (auto-delete, cap total storage)
- [ ] Telegram integration for permission prompt forwarding

## Current State

**Latest milestone:** v3.1 Agent Control & Deep Insights (shipped 2026-03-04)

Warden has evolved from a monitoring dashboard to a full operations platform. The operator can now start, stop, and restart agent sessions; monitor cost velocity with budget alerts; compare model costs; export usage data; and record/replay terminal sessions.

### Out of Scope

- Multi-user auth — IP-whitelisted, single operator (Gideon)
- Agent creation/deletion — managed via openclaw.json, not the dashboard
- Telegram bot management — handled by OpenClaw gateway
- Terminal themes/customization — monitoring tool, single dark theme
- Multi-pane terminal splits — tmux handles layout within sessions
- In-dashboard code editor — agents edit files, operator intervenes via prompts
- Offline mode — real-time is core value
- detectAgentState() rewrite — regex heuristics fragile but functional; deferred

## Context

Shipped v3.1 with 10,685 LOC TypeScript (src/). Net +4,092 LOC from v3.0.
Tech stack: Express 5, Socket.IO 4, React 19, xterm.js 5, node-pty, SQLite (better-sqlite3), Tailwind CSS 4, Vite 6, Vitest.
Features: live terminal streaming, agent lifecycle control (start/stop/restart), token burn rate with budget alerts, model cost comparison, CSV export, session recording (asciicast v2) with variable-speed replay, terminal search, browser notifications, keyboard navigation, GSD Manager plugin, activity timeline.
Runs on Ubuntu 24 server (Laravel Forge managed), same host as gideons.kingdom.lv.
20 Playwright E2E tests + Vitest unit tests. Production Nginx config with SSL + IP whitelist + WebSocket.
tmux configured with mouse mode and 50,000-line scrollback buffer for monitoring workflows.
Known tech debt: detectAgentState() regex heuristics fragile but functional; REC-05 auto-record deferred.

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

| Lazy-mount GSD tabs | Conditional render active tab only; hooks auto-deactivate on unmount | ✓ Good — eliminated ~18 req/min + 60 tmux/min idle waste |
| Extract shared GSD status components | DRY — 9 constants/components duplicated across 3 files | ✓ Good — gsdShared.tsx, zero duplicates |
| Unified gsdTypes.ts in src/shared/ | Follow established shared types pattern, eliminate client/server type drift | ✓ Good — Phase 15, all imports updated |
| SRP tab extraction for GsdView.tsx | Each tab standalone, parent is pure router | ✓ Good — 76 LOC router, 4 tab files |
| JSONL scanner for token usage | Read Claude Code session files directly instead of scraping | ✓ Good — idempotent upserts, cache token support |
| Per-model pricing with fallback | Map known models, default to sonnet-4-6 for unknowns | ✓ Good — safe default, warn-once for new variants |
| Streaming readline for JSONL | Replace readFile with readline stream for large files | ✓ Good — memory-efficient, fd-safe cleanup |
| useSessionSelection hook | Centralize tab selection with polling dedup and hysteresis | ✓ Good — eliminated socket disruption on polls |
| Fire-and-forget start with 202 response | tmux commands fast (<1s), no event loop blocking | ✓ Good — session appears via InstanceTracker within 10s |
| 30-minute retention for stopped/errored sessions | Balances restart access vs tab bar clutter | ✓ Good — OR clause, same single-pass performance |
| Inline confirmation dialogs (not modal) | Local state string pattern for compact UX | ✓ Good — simple, no shared state needed |
| useBudgetAlerts previousRef guard | Only calls setAlertLevel when value changes | ✓ Good — prevents unnecessary re-renders every 30s |
| In-memory frame buffer for recordings | No intermediate disk writes, full asciicast v2 on stop | ✓ Good — clean files, no partial writes |
| PTY output tap via onData callback | Zero-latency impact, after broadcast loop | ✓ Good — recording transparent to terminal streaming |
| Auto-stop recording on PTY exit | Guarantees .cast file written even if operator never clicks stop | ✓ Good — no orphaned recordings |
| RAF loop for recording playback | Writes all frames up to virtual time per tick, handles any speed | ✓ Good — smooth at all speeds |
| sessionExited() resets client recording state | Server auto-stops; client only resets local state, no HTTP call | ✓ Good — clean separation of concerns |

---
*Last updated: 2026-03-04 after v3.1 milestone*
