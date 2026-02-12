# Warden Dashboard

Browser-based terminal multiplexer for OpenClaw agent sessions. Streams live Claude Code output via xterm.js, shows agent ownership, maps sessions to Telegram topics, and enables operator intervention.

## Quick Start

```bash
npm install
npm run dev:all    # Start both server and client
```

Server runs at `http://127.0.0.1:3001`, client dev server at `http://localhost:5173`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend server (tsx watch) |
| `npm run dev:client` | Start Vite dev server |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Production build (client + server) |
| `npm start` | Run production server |
| `npm run typecheck` | TypeScript type check |
| `npm run test:backend` | Run backend verification tests |

## Backend Verification

Test Phase 1 backend functionality without UI.

### Prerequisites

- tmux installed
- Server running on port 3001 (`npm run dev`)

### Run

```bash
npm run test:backend
```

### What it tests

- **Health check**: Server responds 200 OK on `/api/health`
- **Auto-discovery**: tmux sessions with agent naming convention appear in `/api/instances`
- **Session stop**: Sessions can be stopped via `POST /api/instances/:id/stop`
- **Database persistence**: SQLite database exists with WAL mode, all tables created
- **Socket.IO**: WebSocket endpoint is accessible

### Expected output

```
━━━ Health Check ━━━
  PASS Server responds 200 OK on /api/health
  PASS Health response contains status: ok
  PASS Health response contains uptime
  PASS Health response contains activeStreams count

━━━ Session Auto-Discovery ━━━
  PASS Test tmux session created: gideon-test-verify-12345
  PASS Test session auto-discovered in /api/instances
  PASS Instance has agentId field
  PASS Instance has tmuxSessionName field
  PASS Instance has status field

━━━ Session Management ━━━
  PASS Stop endpoint returns 200 OK
  PASS tmux session killed after stop

━━━ Database Persistence ━━━
  PASS SQLite database file exists
  PASS WAL mode confirmed
  PASS instances table exists
  PASS session_logs table exists
  PASS token_usage table exists

━━━ Socket.IO Configuration ━━━
  PASS Socket.IO endpoint accessible

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Results: 17 passed, 0 failed, 17 total
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Architecture

- **Backend**: Node.js 22+, Express 5, Socket.IO 4, better-sqlite3, node-pty
- **Frontend**: React 19, Vite 6, xterm.js, Tailwind CSS 4
- **Data**: SQLite with WAL mode in `data/warden.db`
