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
| `npm run test:e2e` | Run Playwright UI tests |
| `npm run test:e2e:ui` | Run Playwright with interactive UI |

## Playwright E2E Tests

Desktop UI tests verify core dashboard flows using Playwright.

### Prerequisites

```bash
npx playwright install chromium
```

### Run

```bash
# Start dev servers and run tests
npm run test:e2e

# Or with interactive Playwright UI
npm run test:e2e:ui
```

If servers are already running, Playwright reuses them automatically.

### What it tests

- **Dashboard load**: Header, navigation buttons, active session count
- **View navigation**: Switch between Terminals and History views
- **Agent sidebar**: Toggle visibility
- **Session history**: Filter controls (agent ID, status, date range)
- **Token usage**: Per-agent summary, daily breakdown
- **Log viewer**: Agent filter, auto-refresh toggle
- **Tab bar**: Session tabs presence on terminals view

### Test files

- `tests/e2e/dashboard.spec.ts` — Core dashboard flow tests
- `playwright.config.ts` — Playwright configuration (Chromium, 1280x800 viewport)

## Backend Verification

Test backend functionality without UI.

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

## Production Deployment

### Build

```bash
npm run build
NODE_ENV=production npm start
```

### Nginx

A reference Nginx config is provided at `deploy/nginx.conf`. It includes:

- SSL termination (Let's Encrypt)
- IP whitelist (94.30.169.76)
- WebSocket upgrade for Socket.IO
- Security headers

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/warden.kingdom.lv
sudo ln -s /etc/nginx/sites-available/warden.kingdom.lv /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Architecture

- **Backend**: Node.js 22+, Express 5, Socket.IO 4, better-sqlite3, node-pty
- **Frontend**: React 19, Vite 6, xterm.js, Tailwind CSS 4
- **Data**: SQLite with WAL mode in `data/warden.db`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/instances` | List active instances |
| GET | `/api/instances/:id` | Get instance details |
| POST | `/api/instances/:id/stop` | Stop a session |
| GET | `/api/agents` | List agents from openclaw.json |
| GET | `/api/agents/topics` | Telegram topic mappings |
| POST | `/api/agents/:agentId/prompt` | Send prompt to agent |
| GET | `/api/history/sessions` | Search session archive |
| GET | `/api/history/token-usage` | Token usage data |
| GET | `/api/history/logs` | Gateway log tail |
