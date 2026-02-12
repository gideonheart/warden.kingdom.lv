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

## Testing

Warden includes three test layers: backend verification, Playwright E2E, and manual verification.

### Prerequisites

Before running tests, ensure the following are installed:

- **Node.js 22+**: Check with `node --version`
- **tmux**: Check with `tmux -V`
  - Ubuntu/Debian: `sudo apt install tmux`
  - macOS: `brew install tmux`
- **Playwright browsers**: `npx playwright install chromium`
- **Note**: Some tests require the server running on port 3001

### Backend Verification

Test backend functionality without UI.

**Prerequisites**: Server must be running (`npm run dev`)

**Run**:

```bash
npm run test:backend
```

**What it tests**:

- ✓ **Health check**: Server responds 200 OK on `/api/health`
- ✓ **Auto-discovery**: tmux sessions with agent naming convention appear in `/api/instances`
- ✓ **Session stop**: Sessions can be stopped via `POST /api/instances/:id/stop`
- ✓ **Database persistence**: SQLite database exists with WAL mode, all tables created
- ✓ **Socket.IO**: WebSocket endpoint is accessible

**Expected output**:

```
✓ GET /api/health should return 200 OK
✓ GET /api/instances should return active tmux sessions
✓ POST /api/instances/:id/stop should stop a session
✓ Database should exist with WAL mode
✓ Socket.IO endpoint should be accessible

5 passed
```

**Troubleshooting**:

- **Health check fails**: Verify server is running on port 3001 (`npm run dev`)
- **Auto-discovery fails**: Create a test tmux session (`tmux new-session -d -s test-agent-123`)
- **Database fails**: Check `data/warden.db` exists and is writable

### Playwright E2E Tests

Desktop UI tests verify core dashboard flows.

**Prerequisites**: Chromium via `npx playwright install chromium`

**Run**:

```bash
# Headless mode
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui
```

**What it tests**:

- ✓ **Dashboard load**: Header, navigation buttons, active session count
- ✓ **View navigation**: Switch between Terminals and History views
- ✓ **Agent sidebar**: Toggle visibility
- ✓ **Session history**: Filter controls (agent ID, status, date range)
- ✓ **Token usage**: Per-agent summary, daily breakdown
- ✓ **Log viewer**: Agent filter, auto-refresh toggle
- ✓ **Tab bar**: Session tabs presence on terminals view

**Test file locations**:

- `tests/e2e/dashboard.spec.ts` — Core dashboard flow tests
- `tests/e2e/screenshot.spec.ts` — Screenshot capture tests
- `playwright.config.ts` — Playwright configuration

**Expected output**: `12 passed (12/12)`

**Troubleshooting**:

- **Browser launch fails**: Run `npx playwright install chromium` to install browsers
- **Tests timeout**: Increase timeout in `playwright.config.ts` or check server performance
- **Server not found**: Verify dev servers are running or let Playwright start them automatically

### Manual Verification

#### PTY Resize Safety

The terminal resize handler guards against EBADF/EINVAL errors when a PTY process has already exited.

**Steps to verify**:

1. Start the server: `npm run dev:all`
2. Open the dashboard in a browser and connect to a tmux session
3. Kill the tmux session externally: `tmux kill-session -t <name>`
4. Resize the browser window — the server should log a warning but **not crash**
5. Check server logs for: `[TerminalStream] Ignoring resize error (EBADF)` (expected)
6. Confirm `/api/health` still returns 200

**Expected behavior**: Server continues running, logs warning, dashboard shows disconnected session.

#### Stop Button

Verify that the stop button correctly terminates tmux sessions.

**Steps to verify**:

1. Start the dashboard: `npm run dev:all`
2. Create a test tmux session: `tmux new-session -d -s test-warden-stop`
3. In the dashboard, click the "Stop" button next to the test session
4. Verify the button shows a loading state during the operation
5. Verify the session is removed from the UI after stopping
6. Verify the session is terminated: `tmux list-sessions` should not show `test-warden-stop`

### Test Coverage Summary

| Layer | Type | Files | Purpose |
|-------|------|-------|---------|
| Backend | Integration | `tests/backend/` | Verify API endpoints, database, Socket.IO |
| E2E | UI Automation | `tests/e2e/` | Verify dashboard flows in Chromium browser |
| Manual | Verification | N/A | Verify edge cases (PTY safety, stop button) |

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
