# Technology Stack

**Project:** Warden Dashboard
**Researched:** 2026-02-12
**Confidence:** MEDIUM (versions verified via npm, gotchas from training data + version analysis)

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x LTS | Runtime environment | LTS with native ESM support, required for node-pty native bindings, stable performance for long-running processes |
| Express | 5.2.1 | HTTP server | Stable v5 release with async/await support, body-parser integrated, simplified error handling. Widely documented for WebSocket integration |
| React | 19.2.4 | UI framework | Latest stable with compiler optimizations, actions API for form handling, improved concurrent rendering for real-time terminal updates |
| TypeScript | 5.9.3 | Type safety | Latest stable with improved inference, decorators support, better performance. Essential for complex WebSocket event typing |
| Vite | 6.4.1 | Build tool & dev server | Fast HMR for React development, built-in TypeScript support, optimized production builds with code splitting |

### Real-Time Communication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Socket.IO | 4.8.3 (server) | WebSocket server | Auto-reconnection, room support for session isolation, binary event support for terminal data, fallback transports |
| socket.io-client | 4.8.3 | WebSocket client | Matches server version exactly (critical), handles reconnection UI state, TypeScript definitions included |

### Terminal Emulation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| xterm.js | 5.3.0 | Terminal renderer | Modern v5 with improved Unicode support, better performance, active development. Industry standard for web terminals |
| @xterm/addon-fit | 0.11.0 | Auto-resize terminal | Official addon matching xterm 5.x, handles responsive terminal sizing |
| @xterm/addon-web-links | 0.12.0 | Clickable URLs | Detects and linkifies URLs in terminal output, standard UX feature |
| node-pty | 1.1.0 | PTY (pseudoterminal) | Creates real shell processes, required for streaming Claude Code output. Microsoft-maintained, Node 22 compatible |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| better-sqlite3 | 11.10.0 | SQLite driver | Synchronous API (simpler than async for small datasets), no external dependencies, built-in migrations via pragma, excellent TypeScript support |

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.1.18 | Utility-first CSS | Latest v4 with Oxide engine (faster builds), CSS-first config, built-in container queries. Matches OpenClaw Gateway UI style requirement |
| PostCSS | 8.4.x | CSS processor | Required by Tailwind 4, handles @import and autoprefixer |
| Autoprefixer | 10.4.x | CSS vendor prefixes | Browser compatibility for production builds |

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cors | 2.8.5 | CORS middleware | Development mode (different ports for Vite/Express), single-origin in production may not need it |
| tsx | 4.19.0 | TypeScript executor | Development server (watch mode), faster than ts-node, ESM support |
| concurrently | 9.0.0 | Run multiple processes | Development only - run Express + Vite simultaneously |

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @types/node | Type definitions for Node.js | Use @types/node@22 to match Node.js 22.x |
| @types/express | Type definitions for Express | Use @types/express@5 for Express 5 compatibility |
| @types/better-sqlite3 | SQLite type definitions | Version 7.6.x works with better-sqlite3 v11 |
| @vitejs/plugin-react | React support for Vite | Enables Fast Refresh, JSX transform |

## Version-Specific Gotchas

### Express 5.2.1

**Breaking changes from Express 4:**
- `app.router` removed - use `app.use(express.Router())` instead
- `res.send()` with number now sends as JSON, not status code
- `req.param()` removed - use `req.params`, `req.query`, or `req.body`
- Path matching is stricter - trailing slashes matter by default
- Body-parser is now built-in (no separate `require('body-parser')`)

**Gotchas:**
- Middleware error handling requires 4 parameters: `(err, req, res, next)`
- Async route handlers need explicit `.catch()` or use wrapper middleware
- Socket.IO integration: attach to HTTP server, not Express app directly

**Example:**
```typescript
// Express 5 with Socket.IO
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app); // Critical: wrap Express app
const io = new Server(httpServer);    // Attach to HTTP server

httpServer.listen(3000); // Listen on HTTP server, not app
```

### React 19.2.4

**Breaking changes from React 18:**
- `ReactDOM.render()` removed - must use `ReactDOM.createRoot()`
- `useFormStatus` and `useFormState` require React 19-aware bundler
- Server Components are stable but require Next.js or similar framework (not applicable for this project)
- `ref` is now a regular prop (no more `forwardRef` needed)

**Gotchas:**
- Terminal re-renders can break xterm.js state - use `useRef()` for xterm instance
- Socket.IO event handlers in `useEffect` need careful cleanup to avoid memory leaks
- Concurrent rendering may batch terminal writes - use `flushSync` if order matters
- React 19 works with Vite 6 but requires `@vitejs/plugin-react` 4.3+

**Example:**
```typescript
// Terminal component pattern
const Terminal = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);

  useEffect(() => {
    // Create xterm instance once
    if (!xtermRef.current && terminalRef.current) {
      xtermRef.current = new XTerminal();
      xtermRef.current.open(terminalRef.current);
    }

    return () => {
      xtermRef.current?.dispose(); // Cleanup on unmount
    };
  }, []); // Empty deps - run once

  return <div ref={terminalRef} />;
};
```

### Tailwind CSS 4.1.18

**Breaking changes from Tailwind 3:**
- Configuration moved from JS file to CSS (`@theme` directive)
- Oxide engine requires different plugin API
- Some v3 plugins need updates for v4 compatibility
- `@apply` has stricter rules about nesting

**Gotchas:**
- Vite requires PostCSS config even though Tailwind 4 is "zero-config"
- Custom colors defined in CSS, not JS: `@theme { --color-brand: #3b82f6; }`
- JIT mode is default and only mode (no "just-in-time" flag)
- OpenClaw Gateway UI matching: may need custom theme values

**Migration path:**
- Start with v4 from scratch (greenfield advantage)
- Define theme in `src/index.css` with `@theme` blocks
- Use Vite's built-in PostCSS support

### xterm.js 5.3.0

**Breaking changes from xterm.js 4:**
- Addons moved to `@xterm/addon-*` scoped packages
- Some APIs renamed for consistency (`Terminal` class is now default export)
- Unicode version updated (better emoji support, but may affect character width calculations)

**Gotchas:**
- **Critical:** `fit()` addon must be called AFTER terminal is visible in DOM
- Terminal writes should be throttled for performance (use `requestAnimationFrame`)
- Buffer cleanup needed for long-running sessions (memory leak risk)
- `onData` handler can receive partial UTF-8 sequences - use built-in decoder
- Resizing requires both terminal resize AND PTY resize (coordinate both)

**Best practices:**
```typescript
// Proper terminal lifecycle
const term = new Terminal({
  cursorBlink: true,
  fontFamily: 'Monaco, Menlo, monospace', // Match OpenClaw style
  fontSize: 14,
  scrollback: 1000 // Limit memory usage
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(container);

// Wait for layout, then fit
requestAnimationFrame(() => {
  fitAddon.fit();
  // Send resize to backend
  socket.emit('resize', { cols: term.cols, rows: term.rows });
});
```

### Socket.IO 4.8.3

**Gotchas:**
- Client/server versions MUST match exactly (4.8.3 ↔ 4.8.3)
- Default transport polling can delay initial connection - set `transports: ['websocket']` for terminals
- Reconnection can cause duplicate PTY processes - implement session recovery
- Binary mode for terminal data is faster than UTF-8 strings
- Room isolation required for multi-session - use session IDs as room names

**Best practices:**
```typescript
// Server-side
io.on('connection', (socket) => {
  const sessionId = socket.handshake.query.sessionId;
  socket.join(`session:${sessionId}`); // Isolate terminal data

  socket.on('disconnect', () => {
    // Decide: keep PTY alive or kill it?
  });
});

// Client-side
const socket = io('http://localhost:3000', {
  transports: ['websocket'], // Skip polling
  query: { sessionId: 'unique-id' },
  reconnectionAttempts: 10
});
```

### node-pty 1.1.0

**Critical gotchas:**
- **Requires native compilation** - needs `python3` and build tools
- **Platform-specific** - different behavior on Windows (conpty) vs Linux/macOS (pty)
- Process cleanup required - zombie processes if not properly disposed
- Must resize both xterm.js AND PTY when window resizes
- Claude Code output uses ANSI escape codes - ensure xterm.js parses them

**Build requirements:**
```bash
# Linux/macOS
apt-get install python3 make g++

# Verify native module builds
npm install node-pty
```

**Lifecycle management:**
```typescript
import { spawn as ptySpawn } from 'node-pty';

const pty = ptySpawn('bash', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME,
  env: process.env
});

// Forward PTY output to Socket.IO
pty.onData((data) => {
  socket.emit('terminal:data', data);
});

// Resize handler
socket.on('terminal:resize', ({ cols, rows }) => {
  pty.resize(cols, rows);
});

// Cleanup
socket.on('disconnect', () => {
  pty.kill(); // Send SIGHUP
});
```

### better-sqlite3 11.10.0

**Gotchas:**
- Synchronous API blocks event loop - keep queries fast
- No connection pooling needed (single connection per process)
- WAL mode recommended for concurrent reads: `PRAGMA journal_mode = WAL;`
- Transactions are MUCH faster than individual inserts
- Foreign keys disabled by default: `PRAGMA foreign_keys = ON;`

**Best practices:**
```typescript
import Database from 'better-sqlite3';

const db = new Database('warden.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Use prepared statements
const insertSession = db.prepare(`
  INSERT INTO sessions (id, agent_name, telegram_topic)
  VALUES (?, ?, ?)
`);

// Transactions for bulk operations
const insertMany = db.transaction((sessions) => {
  for (const session of sessions) {
    insertSession.run(session.id, session.agent, session.topic);
  }
});
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend Framework | Express 5 | Fastify | Express has better Socket.IO integration examples, more middleware ecosystem |
| UI Framework | React 19 | Vue 3 | React has stronger xterm.js integration examples, OpenClaw Gateway likely uses React |
| Build Tool | Vite 6 | Webpack | Vite is faster for dev, simpler config, better DX. No need for Webpack complexity |
| Database | better-sqlite3 | PostgreSQL | Single-user tool, no need for client-server overhead. SQLite is simpler for IP-whitelisted internal tools |
| WebSocket | Socket.IO | ws (raw WebSocket) | Socket.IO handles reconnection, rooms, binary data. Raw ws requires manual implementation |
| Terminal PTY | node-pty | pty.js | pty.js is abandoned. node-pty is Microsoft-maintained and actively developed |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Express 4.x | Missing async/await support, deprecated body-parser separation | Express 5.2+ |
| React 18.x | Missing new hooks, slower reconciler | React 19.x |
| Tailwind 3.x | Slower JIT, JS config less maintainable | Tailwind 4.x with CSS config |
| xterm.js 4.x | Old addon system, worse Unicode support | xterm.js 5.3+ |
| `tsx` alternatives (`ts-node`, `nodemon`) | Slower, worse ESM support | tsx 4.19+ |
| `ws` without wrapper | Manual reconnection logic, no rooms | Socket.IO 4.8+ |
| Prisma/TypeORM for SQLite | Overkill for simple schema, sync API lost | better-sqlite3 with manual SQL |

## Installation

```bash
# Core dependencies
npm install express@5.2.1 socket.io@4.8.3 better-sqlite3@11.10.0 node-pty@1.1.0 cors@2.8.5

# Client dependencies (dev because bundled by Vite)
npm install -D react@19.2.4 react-dom@19.2.4 socket.io-client@4.8.3 xterm@5.3.0 \
  @xterm/addon-fit@0.11.0 @xterm/addon-web-links@0.12.0

# Build tools
npm install -D vite@6.4.1 @vitejs/plugin-react@4.3.0 typescript@5.9.3 \
  tailwindcss@4.1.18 postcss@8.4.0 autoprefixer@10.4.0

# Development tools
npm install -D tsx@4.19.0 concurrently@9.0.0

# TypeScript types
npm install -D @types/node@22.0.0 @types/express@5.0.0 \
  @types/better-sqlite3@7.6.0 @types/cors@2.8.17 \
  @types/react@19.0.0 @types/react-dom@19.0.0
```

## Stack Patterns by Use Case

**If building multi-user version later:**
- Replace SQLite with PostgreSQL
- Add authentication middleware (JWT tokens)
- Implement rate limiting for Socket.IO connections

**If adding Playwright testing:**
- Install `@playwright/test` as dev dependency
- Test against production build (not dev server)
- Mock Socket.IO connections or use test server

**If deploying to production:**
- Set `NODE_ENV=production`
- Use `npm run build` to generate static assets
- Serve static files from Express (not Vite dev server)
- Configure reverse proxy (nginx) for WebSocket upgrades
- Set IP whitelist at nginx level, not application level

## Version Compatibility Matrix

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Express 5.2.1 | Node.js 18+ | Requires ESM or CommonJS with "type": "module" |
| React 19.2.4 | Vite 6.4.1 | Needs @vitejs/plugin-react 4.3+ |
| Socket.IO 4.8.3 | socket.io-client 4.8.3 | MUST match exactly (major.minor.patch) |
| xterm.js 5.3.0 | @xterm/addon-* 0.10-0.12 | Addon versions lag behind core |
| node-pty 1.1.0 | Node.js 18-22 | Requires rebuild on Node version change |
| Tailwind 4.1.18 | PostCSS 8.4+ | PostCSS required even though "zero-config" |
| TypeScript 5.9.3 | All above | Use `moduleResolution: "bundler"` in tsconfig |

## Known Integration Issues

### xterm.js + Socket.IO
- **Issue:** Terminal flickers on reconnect
- **Solution:** Store terminal buffer state, replay on reconnect
- **Prevention:** Use Socket.IO rooms to isolate session data

### node-pty + Express
- **Issue:** PTY process stays alive after HTTP server stops
- **Solution:** Track PTYs in Map, kill all on `process.on('SIGTERM')`

### React 19 + xterm.js
- **Issue:** React re-renders destroy xterm.js instance
- **Solution:** Use `useRef` to store instance, `useEffect` with empty deps for initialization

### Tailwind 4 + Vite
- **Issue:** `@theme` directives not recognized
- **Solution:** Ensure PostCSS config exists (even if empty), import Tailwind in main CSS file

## Performance Considerations

| Concern | Solution |
|---------|----------|
| Terminal rendering lag | Use `requestAnimationFrame` to batch writes, limit scrollback to 1000 lines |
| Socket.IO overhead | Enable binary mode for terminal data, use websocket-only transport |
| SQLite write bottleneck | Use WAL mode, batch inserts in transactions |
| React re-render cost | Memoize terminal components, use `React.memo` for session list |
| Bundle size | Code-split routes if adding multi-page UI, lazy-load xterm addons |

## Sources

- **npm registry** (verified 2026-02-12): Version numbers, peer dependencies, engines
  - express@5.2.1: https://www.npmjs.com/package/express
  - react@19.2.4: https://www.npmjs.com/package/react
  - tailwindcss@4.1.18: https://www.npmjs.com/package/tailwindcss
  - socket.io@4.8.3: https://www.npmjs.com/package/socket.io
  - xterm@5.3.0: https://www.npmjs.com/package/xterm
  - node-pty@1.1.0: https://www.npmjs.com/package/node-pty
  - better-sqlite3@11.10.0: https://www.npmjs.com/package/better-sqlite3

- **Training data** (January 2025): Breaking changes, gotchas, best practices
  - Confidence: MEDIUM (versions verified current, but specific v5/v19/v4 gotchas need real-world validation)

- **package.json** (project): Confirmed pre-decided stack choices align with latest stable versions

## Research Notes

**Verification status:**
- ✅ All version numbers verified as current (2026-02-12)
- ✅ Package compatibility checked via npm metadata
- ⚠️ Breaking changes and gotchas based on training data (January 2025 cutoff)
- ⚠️ Express 5, React 19, Tailwind 4 are relatively new - community patterns still emerging
- ❌ Unable to verify via WebFetch/WebSearch (tools disabled)

**Confidence assessment:**
- HIGH confidence: Version numbers, package dependencies, basic API usage
- MEDIUM confidence: Breaking changes, known gotchas, best practices
- LOW confidence: Specific Express 5 async error handling edge cases, Tailwind 4 migration complexity

**Recommended validation:**
- Test Express 5 async error handling in development
- Verify Tailwind 4 `@theme` syntax with actual OpenClaw Gateway UI
- Check Socket.IO reconnection behavior with real Claude Code streams
- Validate node-pty memory usage under long-running sessions

---
*Stack research for: Browser-based terminal multiplexer dashboard*
*Researched: 2026-02-12*
*Next: Review against actual Express 5/React 19/Tailwind 4 official docs when tools available*
