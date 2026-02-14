# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Warden is a browser-based terminal multiplexer dashboard for OpenClaw agent sessions. It auto-discovers tmux sessions by agent-prefix naming convention, streams live terminal output via xterm.js over Socket.IO, and provides session history, token usage tracking, and operator prompt injection.

This repo is trusted and owned by Rolands.

## Development commands

```bash
npm run dev:all          # Start backend (tsx watch) + Vite client concurrently
npm run dev              # Backend only (Express on :3001)
npm run dev:client       # Vite client only (:5173, proxies /api + /socket.io to :3001)
npm run build            # Production build: vite build + tsc -p tsconfig.server.json
npm start                # Run production server (serves built client from dist/)
npm run typecheck        # TypeScript type check (no emit)
```

### Testing

```bash
npm run test:backend     # Shell-based integration tests (requires server running on :3001)
npm run test:e2e         # Playwright E2E tests (headless Chromium, auto-starts dev servers)
npm run test:e2e:ui      # Playwright with interactive UI
npx playwright test tests/e2e/dashboard.spec.ts  # Run a single E2E spec
npx playwright install chromium                    # First-time browser setup
```

Backend tests (`tests/backend-verify.sh`) require a running server. Playwright tests auto-start `npm run dev:all` via `webServer` config if servers aren't already running.

## Architecture

### Server (Express 5 + Socket.IO 4 + node-pty)

`src/server/index.ts` — Entry point. Mounts three route modules and initializes services:

- **InstanceTracker** — Polls `TmuxSessionManager` every 10s, upserts discovered sessions into SQLite, marks disappeared sessions as stopped. This is the source of truth for `/api/instances`.
- **TmuxSessionManager** — Wraps tmux CLI calls (`execFile`). Filters sessions by `KNOWN_AGENT_PREFIXES` array: `gideon`, `warden`, `scout`, `builder`, `forge`. Session naming format: `{agentId}-{projectSlug}-{shortUuid}`.
- **TerminalStreamService** — Socket.IO `/terminal` namespace. Each client connection spawns a node-pty process that attaches to the tmux session. Handles `terminal:input`, `terminal:output`, `terminal:resize`, `terminal:exit` events.
- **OpenClawConfigReader** — Reads `~/.openclaw/openclaw.json` (JSON5 with comment-stripping), caches for 30s. Provides agent list, Telegram topic mappings, and gateway URL/token.
- **DatabaseConnection** — SQLite via better-sqlite3 with WAL mode at `data/warden.db`. Three tables: `instances`, `session_logs`, `token_usage`. Migrations run inline on construction.

Route modules: `instanceRoutes.ts`, `agentRoutes.ts`, `historyRoutes.ts`.

### Client (React 19 + Vite 6 + Tailwind CSS 4)

SPA with two views toggled in `App.tsx`:
- **Terminals view** — `InstanceTabBar` (session tabs with stop buttons) + `TerminalView` (xterm.js) + `PromptPanel` (sends prompts to agent tmux sessions)
- **History view** — `SessionHistory` + `TokenUsageView` + `LogViewer`

`AgentSidebar` — Right panel showing agents from `openclaw.json` with SOUL.md previews.

Key hooks: `useActiveInstances` (polls `/api/instances`), `useTerminalSocket` (Socket.IO connection to `/terminal` namespace), `useAgentConfig` (agent list + topic mappings).

### Shared types

`src/shared/types.ts` — `AgentInstance`, `TmuxSessionInfo`, terminal payload types.
`src/shared/openclawTypes.ts` — `OpenClawConfig`, `AgentDetails`, `TopicMapping`, `PromptRequest/Response`.

Path alias: `@shared` → `src/shared/` (configured in both `tsconfig.json` and `vite.config.ts`).

### Build output

Two tsconfig files: `tsconfig.json` (client + shared, bundler resolution) and `tsconfig.server.json` (server + shared → `dist/server/`). Vite builds client to `dist/client/`. Production server serves `dist/client/` as static files with SPA fallback.

## Theming

Custom Tailwind color tokens prefixed `warden-*` defined in `src/client/styles.css` via `@theme` (Tailwind CSS v4 syntax). Use these throughout UI — e.g., `bg-warden-panel`, `text-warden-accent`, `border-warden-border`.

## Product requirements

- UI style: match **OpenClaw Gateway UI / dashboard panel style** (sessions/jobs web panel look).
- No paid-subscription dependencies; prefer widely used & well documented stack.
- DRY + SRP.
- Use clear, explicit variable/function names (no abbreviations).
- Include **Playwright** desktop UI verification and document how to run it.

## Working conventions

- Keep short research notes in `.planning/` when starting a new phase.
- Keep commits small and descriptive.

## Launching a Claude Code TUI session that shows up in Warden

Warden Dashboard only lists tmux sessions whose names start with one of the known agent prefixes (e.g. `warden-`, `gideon-`, `scout-`, `builder-`, `forge-`) on the **default tmux server**.

```bash
cd /home/forge/warden.kingdom.lv
tmux new-session -d -s warden-dashboard -c /home/forge/warden.kingdom.lv
tmux send-keys -t warden-dashboard:0.0 "claude --dangerously-skip-permissions" Enter
```

To inspect: `tmux attach -t warden-dashboard`

## If Claude Code asks interactive setup questions

- **Trust folder?** → Yes, I trust this folder.
- **Use skill `gsd:new-project`?** → Yes, and don't ask again for this repo.
- **Proceed with commands (npx/node/npm/tmux/etc.)?** → Yes, and don't ask again for this repo.
- **Work mode** → YOLO (auto-approve execution).
- **Research before planning each phase?** → YES (always research; large project).

## GSD standard operating procedure (SOP)

If using GSD, follow `.planning/GSD_WORKFLOW.md`.

Default sequence: `/gsd:new-project @PRD.md` → `/gsd:research-phase 1`

If GSD prompts become disruptive mid-run, stop using `/gsd:*` and proceed in vanilla Claude Code while continuing to maintain `.planning/RESEARCH.md` + `.planning/PLAN.md`.
