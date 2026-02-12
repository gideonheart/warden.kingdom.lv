# Phase 6: Close v1 Audit Gaps - Research

**Researched:** 2026-02-12
**Domain:** Gap closure - UI enhancements, file system operations, and documentation
**Confidence:** HIGH

## Summary

Phase 6 closes four specific gaps identified in the v1.0 milestone audit: (1) reading and displaying SOUL.md preview from agent workspace directories, (2) displaying memory status (exists/size) for each agent, (3) adding a visible stop button to terminate tmux sessions, and (4) updating README.md with comprehensive test documentation. All gaps are small-effort fixes to existing components.

**Technical scope:** Node.js fs/promises API for async file reading, React component state management for UI controls, TypeScript interface extension for new properties, and markdown documentation updates. No new libraries needed - all gaps can be closed with existing stack (Express 5, React 19, TypeScript 5.7, Node.js fs module).

**Primary recommendation:** Use fs/promises with async/await for reading SOUL.md and checking memory directory stats, extend existing TypeScript interfaces to add optional properties, add stop button to InstanceTabBar component with state management for loading/error states, and enhance README.md test section with prerequisite details and verification steps.

## Standard Stack

### Core
All libraries already installed - no additional dependencies needed.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js fs/promises | Built-in (Node.js 22+) | Async file operations | Promise-based API, cleaner than callbacks, built-in to Node.js |
| React useState | Built-in (React 19) | Component state for stop button | Standard React state hook for local UI state |
| TypeScript | 5.7 (installed) | Type safety for interface extension | Existing project dependency, extends keyword for interfaces |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| path.join | Built-in (Node.js) | Safe path construction | Joining workspace directory paths to SOUL.md/memory paths |
| fs.stat | Built-in (fs/promises) | Check file/directory metadata | Checking if MEMORY.md exists, getting file size in bytes |
| fs.readFile | Built-in (fs/promises) | Read file contents | Reading SOUL.md text for preview extraction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fs/promises | fs with callbacks | Promises cleaner with async/await, no advantage to callbacks in 2026 |
| fs/promises | fs.promises (old import) | Same API, new import style preferred in Node.js 22+ |
| Manual fetch in component | Custom React hook | Overkill for simple one-time data fetch on load |

**Installation:**
```bash
# No installation needed - all dependencies already in package.json
```

## Architecture Patterns

### Recommended File Structure (Changes Only)
```
src/
├── server/
│   └── services/
│       └── OpenClawConfigReader.ts  # MODIFY: Read SOUL.md, check memory
├── client/
│   └── components/
│       ├── AgentSidebar.tsx         # MODIFY: Display soulPreview, memoryStatus
│       └── InstanceTabBar.tsx       # MODIFY: Add stop button
├── shared/
│   └── openclawTypes.ts             # MODIFY: Extend AgentDetails interface
└── README.md                         # MODIFY: Enhance test documentation
```

### Pattern 1: Reading SOUL.md Preview with fs/promises
**What:** Async file read from agent workspace, extract first 200-300 characters for preview
**When to use:** Reading small text files for preview display
**Example:**
```typescript
// Source: https://nodejs.org/en/learn/manipulating-files/reading-files-with-nodejs
import { readFile } from 'fs/promises';
import path from 'path';

async function readSoulPreview(workspacePath: string): Promise<string | null> {
  try {
    const soulPath = path.join(workspacePath, 'SOUL.md');
    const content = await readFile(soulPath, 'utf-8');

    // Extract first 200 chars, find natural break point (newline/sentence)
    const preview = content.slice(0, 200);
    const lastNewline = preview.lastIndexOf('\n');
    return lastNewline > 100 ? preview.slice(0, lastNewline).trim() : preview.trim();
  } catch (error) {
    // ENOENT = file doesn't exist, return null (not an error condition)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to read SOUL.md from ${workspacePath}:`, error);
    return null;
  }
}
```
**Why:** Promise-based fs.readFile with async/await is cleaner than callbacks, try-catch handles missing files gracefully.

### Pattern 2: Checking Memory Status with fs.stat
**What:** Check if MEMORY.md file exists and get its size in bytes
**When to use:** File existence check and metadata retrieval
**Example:**
```typescript
// Source: https://nodejs.org/api/fs.html + https://attacomsian.com/blog/nodejs-get-file-size
import { stat } from 'fs/promises';
import path from 'path';

interface MemoryStatus {
  exists: boolean;
  sizeBytes: number | null;
}

async function getMemoryStatus(workspacePath: string): Promise<MemoryStatus> {
  try {
    const memoryPath = path.join(workspacePath, 'MEMORY.md');
    const stats = await stat(memoryPath);

    return {
      exists: true,
      sizeBytes: stats.size,
    };
  } catch (error) {
    // ENOENT = file doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, sizeBytes: null };
    }
    console.error(`Failed to stat MEMORY.md at ${workspacePath}:`, error);
    return { exists: false, sizeBytes: null };
  }
}
```
**Why:** fs.stat returns file metadata including size, graceful ENOENT handling for missing files.

### Pattern 3: Extending TypeScript Interfaces
**What:** Add optional properties to existing AgentDetails interface
**When to use:** Adding new fields without breaking existing code
**Example:**
```typescript
// Source: https://www.typescripttutorial.net/typescript-tutorial/typescript-extend-interface/
// In src/shared/openclawTypes.ts

export interface AgentDetails {
  id: string;
  name: string;
  workspace: string;
  model: string;
  isDefault: boolean;
  soulPreview: string | null;
  // NEW: Add memory status fields
  memoryExists?: boolean;
  memorySizeBytes?: number | null;
}
```
**Why:** Optional properties (?) allow incremental addition without requiring all consumers to update immediately.

### Pattern 4: React Stop Button with State Management
**What:** Button that calls API, manages loading/error states, updates UI
**When to use:** User-initiated API actions from React components
**Example:**
```typescript
// Source: https://bobbyhadz.com/blog/react-fetch-data-on-button-click
import { useState } from 'react';

function StopButton({ instanceId, sessionName, onStopped }: StopButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/instances/${instanceId}/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop session');
      }

      onStopped(sessionName); // Callback to parent to update UI
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleStop}
      disabled={isLoading}
      className="px-2 py-1 text-xs bg-warden-error/20 text-warden-error rounded hover:bg-warden-error/30 disabled:opacity-50"
    >
      {isLoading ? 'Stopping...' : 'Stop'}
    </button>
  );
}
```
**Why:** useState manages loading/error states, async/await for fetch, disabled state prevents double-clicks.

### Pattern 5: README Test Documentation Structure
**What:** Organized test documentation with prerequisites, run commands, expected output, verification steps
**When to use:** Documenting test suites for new contributors
**Example:**
```markdown
## Testing

### Prerequisites

- Node.js 22+ installed
- tmux installed (`sudo apt install tmux` or `brew install tmux`)
- Playwright browsers: `npx playwright install chromium`
- Server running on port 3001 for some tests

### Running Tests

#### Backend Verification

Tests backend functionality without UI (tmux auto-discovery, session stop, database).

```bash
# Start server first
npm run dev

# In another terminal
npm run test:backend
```

**What it tests:**
- Health check (200 OK on /api/health)
- Auto-discovery (tmux sessions appear in /api/instances)
- Session stop (POST /api/instances/:id/stop)
- Database (SQLite WAL mode, all tables exist)
- Socket.IO (WebSocket endpoint accessible)

**Expected output:** All checks pass with green checkmarks.

#### Playwright E2E Tests

Desktop UI tests verify core dashboard flows.

```bash
# Headless mode (CI-friendly)
npm run test:e2e

# Interactive UI (debugging)
npm run test:e2e:ui
```

**What it tests:**
- Dashboard load (header, navigation, session count)
- View navigation (switch between Terminals/History)
- Agent sidebar (toggle visibility)
- Session history (filters work correctly)
- Token usage (per-agent summary, daily breakdown)
- Log viewer (agent filter, auto-refresh toggle)
- Tab bar (session tabs presence)

**Expected output:** 12/12 tests passing.

### Manual Verification

#### PTY Resize Safety

Verifies terminal resize handler guards against EBADF errors:

1. Start: `npm run dev:all`
2. Open dashboard, connect to tmux session
3. Kill session: `tmux kill-session -t <name>`
4. Resize browser window
5. Check server logs for `[TerminalStream] Ignoring resize error (EBADF)`
6. Verify `/api/health` still returns 200

**Expected:** Server logs warning but doesn't crash.
```
**Why:** Clear structure with prerequisites, commands, expected output, and verification steps makes tests accessible to new contributors.

### Anti-Patterns to Avoid
- **Reading entire large files for preview:** Only read first N bytes, not full file
- **Missing ENOENT error handling:** SOUL.md/MEMORY.md may not exist, don't log errors for missing files
- **Blocking file I/O in request handlers:** Use async fs/promises, not sync fs methods
- **Stop button without loading state:** Users will double-click if no visual feedback
- **README without prerequisites:** Contributors need to know what to install first

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File path joining | String concatenation with / | path.join() | Cross-platform (Windows uses \), handles edge cases (double slashes, ..) |
| File existence check | Try readFile, catch error | fs.stat() then check stats.isFile() | stat gives metadata (size, mtime), purpose-built for existence checks |
| Memory size formatting | Custom byte-to-KB converter | Existing formatter or Intl.NumberFormat | Edge cases (0 bytes, negative, very large), localization |
| Stop button debouncing | Custom setTimeout logic | Button disabled state + loading flag | Simpler, clearer intent, built-in React pattern |

**Key insight:** Node.js fs/promises API is mature and handles edge cases (ENOENT, EACCES, encoding). Don't reimplement file operations - use built-in modules.

## Common Pitfalls

### Pitfall 1: SOUL.md Preview Reading Entire File
**What goes wrong:** Reading full SOUL.md file (potentially MB-sized) just to show 200-character preview.
**Why it happens:** readFile() loads entire file into memory by default.
**How to avoid:**
1. Read file with readFile (acceptable for small files under 10KB)
2. For preview, slice to first 200 chars immediately
3. For large files, consider createReadStream with limited bytes
4. SOUL.md files are typically small (<5KB), so readFile is acceptable
**Warning signs:** Memory usage spikes when loading agent sidebar, slow API responses.

### Pitfall 2: Missing ENOENT Error Handling
**What goes wrong:** Server logs ERROR when SOUL.md or MEMORY.md don't exist, even though this is a normal condition.
**Why it happens:** Not all agents have SOUL.md/MEMORY.md files, try-catch logs all errors.
**How to avoid:**
1. Check error code: `if (error.code === 'ENOENT') return null;`
2. Only log non-ENOENT errors (EACCES, EISDIR, etc.)
3. Return null for missing files, display "No SOUL.md" in UI
**Warning signs:** Server logs filled with ENOENT errors for missing SOUL.md files.

### Pitfall 3: Stop Button Without Loading State
**What goes wrong:** User clicks stop button, no visual feedback, clicks again, sends duplicate API calls.
**Why it happens:** No loading state, button stays enabled during API call.
**How to avoid:**
1. useState to track isLoading boolean
2. Set isLoading=true before fetch, false in finally block
3. Disable button when isLoading=true
4. Show "Stopping..." text when loading
**Warning signs:** Duplicate stop requests in server logs, users reporting button doesn't work.

### Pitfall 4: Hardcoded Workspace Paths
**What goes wrong:** Assuming workspace is always ~/.openclaw/workspace-<agentId>, fails for custom workspace paths.
**Why it happens:** OpenClaw config allows custom workspace paths via agents.list[].workspace or agents.defaults.workspace.
**How to avoid:**
1. Always use workspace path from openclaw.json (OpenClawConfigReader.getAgents())
2. Never assume default workspace location
3. Handle absolute and relative paths (relative to ~/.openclaw/)
**Warning signs:** SOUL.md preview works for some agents, fails for others with custom workspace paths.

### Pitfall 5: Memory Size Display Without Formatting
**What goes wrong:** Displaying "5243890 bytes" instead of "5.0 MB" - poor UX.
**Why it happens:** stats.size returns bytes, no automatic formatting.
**How to avoid:**
1. Create formatBytes helper: convert bytes to KB/MB/GB
2. Use Intl.NumberFormat for locale-aware formatting
3. Display "5.0 MB" or "~5 MB" for readability
4. Handle edge cases: 0 bytes, null (file doesn't exist)
**Warning signs:** Users complain about unreadable byte counts in UI.

### Pitfall 6: README Test Docs Without Prerequisites
**What goes wrong:** New contributor runs `npm run test:e2e`, gets cryptic Chromium errors because Playwright browsers not installed.
**Why it happens:** Playwright requires `playwright install` step, not obvious from package.json scripts.
**How to avoid:**
1. Add Prerequisites section listing tmux, Node.js version, Playwright browsers
2. Include install commands: `npx playwright install chromium`
3. Document which tests need server running, which don't
4. Show expected output for successful test runs
**Warning signs:** Contributors asking "Why do tests fail?" on first run.

## Code Examples

Verified patterns from official sources and existing codebase:

### OpenClawConfigReader: Read SOUL.md Preview
```typescript
// Source: Node.js fs/promises docs + existing OpenClawConfigReader.ts pattern
import { readFile } from 'fs/promises';
import path from 'path';

async function getAgents(): Promise<AgentDetails[]> {
  const config = await this.getConfig();
  const defaults = config.agents.defaults;

  return await Promise.all(
    config.agents.list.map(async (agent) => {
      const modelConfig = agent.model ?? defaults?.model;
      const model = typeof modelConfig === 'string'
        ? modelConfig
        : modelConfig?.primary ?? 'unknown';

      const workspace = agent.workspace ?? defaults?.workspace ?? '';
      const soulPreview = await this.readSoulPreview(workspace);
      const memoryStatus = await this.getMemoryStatus(workspace);

      return {
        id: agent.id,
        name: agent.name,
        workspace,
        model,
        isDefault: agent.default ?? false,
        soulPreview,
        memoryExists: memoryStatus.exists,
        memorySizeBytes: memoryStatus.sizeBytes,
      };
    })
  );
}

private async readSoulPreview(workspacePath: string): Promise<string | null> {
  if (!workspacePath) return null;

  try {
    // Resolve workspace path (may be relative to ~/.openclaw/)
    const resolvedPath = path.isAbsolute(workspacePath)
      ? workspacePath
      : path.join(process.env.HOME ?? '/home/forge', '.openclaw', workspacePath);

    const soulPath = path.join(resolvedPath, 'SOUL.md');
    const content = await readFile(soulPath, 'utf-8');

    // Extract first 200 chars, find natural break
    const preview = content.slice(0, 200);
    const lastNewline = preview.lastIndexOf('\n');
    return lastNewline > 100 ? preview.slice(0, lastNewline).trim() : preview.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // Normal - not all agents have SOUL.md
    }
    console.error(`[OpenClawConfig] Failed to read SOUL.md from ${workspacePath}:`, error);
    return null;
  }
}

private async getMemoryStatus(workspacePath: string): Promise<{ exists: boolean; sizeBytes: number | null }> {
  if (!workspacePath) return { exists: false, sizeBytes: null };

  try {
    const resolvedPath = path.isAbsolute(workspacePath)
      ? workspacePath
      : path.join(process.env.HOME ?? '/home/forge', '.openclaw', workspacePath);

    const memoryPath = path.join(resolvedPath, 'MEMORY.md');
    const stats = await stat(memoryPath);

    return {
      exists: stats.isFile(),
      sizeBytes: stats.size,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, sizeBytes: null };
    }
    console.error(`[OpenClawConfig] Failed to stat MEMORY.md at ${workspacePath}:`, error);
    return { exists: false, sizeBytes: null };
  }
}
```

### AgentSidebar: Display SOUL.md Preview and Memory Status
```typescript
// Source: Existing AgentSidebar.tsx + React best practices
import type { AgentDetails } from '../../shared/openclawTypes.js';

export function AgentSidebar({ agents, selectedAgentId }: AgentSidebarProps) {
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Helper to format bytes
  const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (bytes === 0) return '0 bytes';

    const k = 1024;
    const sizes = ['bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="w-72 bg-warden-panel border-l border-warden-border flex flex-col overflow-y-auto">
      {/* ... agent list ... */}

      {selectedAgent && (
        <div className="border-t border-warden-border p-3 space-y-3">
          <h3 className="text-xs font-semibold text-warden-text uppercase tracking-wider">Details</h3>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-warden-text-dim">Workspace</span>
              <p className="text-warden-text font-mono mt-0.5 break-all">{selectedAgent.workspace || 'N/A'}</p>
            </div>

            <div>
              <span className="text-warden-text-dim">Model</span>
              <p className="text-warden-text font-mono mt-0.5">{selectedAgent.model}</p>
            </div>

            {/* NEW: SOUL.md preview */}
            <div>
              <span className="text-warden-text-dim">SOUL.md</span>
              {selectedAgent.soulPreview ? (
                <p className="text-warden-text-dim/80 mt-0.5 text-xs leading-relaxed">
                  {selectedAgent.soulPreview}
                </p>
              ) : (
                <p className="text-warden-text-dim/50 mt-0.5 italic">No SOUL.md found</p>
              )}
            </div>

            {/* NEW: Memory status */}
            <div>
              <span className="text-warden-text-dim">Memory</span>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${selectedAgent.memoryExists ? 'bg-warden-success' : 'bg-warden-text-dim/30'}`} />
                <span className="text-warden-text font-mono">
                  {selectedAgent.memoryExists
                    ? formatBytes(selectedAgent.memorySizeBytes)
                    : 'No MEMORY.md'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### InstanceTabBar: Add Stop Button
```typescript
// Source: Existing InstanceTabBar.tsx + React fetch pattern
import { useState } from 'react';
import type { AgentInstance } from '../../shared/types.js';

interface InstanceTabBarProps {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  onSessionStopped?: (sessionName: string) => void; // NEW: Callback when session stopped
}

export function InstanceTabBar({ instances, selectedSessionName, onSelectSession, onSessionStopped }: InstanceTabBarProps) {
  const [stoppingSession, setStoppingSession] = useState<string | null>(null);

  const handleStop = async (instance: AgentInstance) => {
    setStoppingSession(instance.tmuxSessionName);

    try {
      const response = await fetch(`/api/instances/${instance.id}/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop session');
      }

      // Notify parent component to refresh instance list
      onSessionStopped?.(instance.tmuxSessionName);
    } catch (error) {
      console.error('Stop session error:', error);
      alert(`Failed to stop session: ${(error as Error).message}`);
    } finally {
      setStoppingSession(null);
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto">
      {instances.map((instance) => {
        const isSelected = instance.tmuxSessionName === selectedSessionName;
        const isStopping = stoppingSession === instance.tmuxSessionName;

        return (
          <div
            key={instance.tmuxSessionName}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                : 'text-warden-text-dim hover:bg-warden-border/50 border border-transparent'
            }`}
          >
            <button
              onClick={() => onSelectSession(instance.tmuxSessionName)}
              className="flex items-center gap-2 flex-1"
            >
              <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[instance.status] ?? 'bg-warden-idle'}`} />
              <span className="font-medium">{instance.agentName || instance.agentId}</span>
              <span className="text-xs opacity-60 font-mono">{instance.tmuxSessionName.split('-').slice(1).join('-')}</span>
            </button>

            {/* NEW: Stop button */}
            <button
              onClick={(e) => {
                e.stopPropagation(); // Don't trigger tab selection
                handleStop(instance);
              }}
              disabled={isStopping || instance.status === 'stopped'}
              className="px-2 py-0.5 text-xs bg-warden-error/20 text-warden-error rounded hover:bg-warden-error/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Stop session"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

### README.md: Enhanced Test Documentation
```markdown
## Testing

Warden Dashboard has three test layers: backend verification (bash script), Playwright E2E tests (browser UI), and manual verification steps.

### Prerequisites

Before running tests, ensure you have:

- **Node.js 22+** installed (`node --version`)
- **tmux** installed (`tmux -V`) — for backend tests
  - Ubuntu/Debian: `sudo apt install tmux`
  - macOS: `brew install tmux`
- **Playwright browsers** installed — for E2E tests
  ```bash
  npx playwright install chromium
  ```

### Backend Verification

Tests backend functionality without UI (tmux auto-discovery, session stop, database).

**Prerequisites:** Server must be running on port 3001.

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run backend tests
npm run test:backend
```

**What it tests:**
- ✓ Health check: Server responds 200 OK on `/api/health`
- ✓ Auto-discovery: tmux sessions matching agent naming convention appear in `/api/instances`
- ✓ Session stop: Sessions can be stopped via `POST /api/instances/:id/stop`
- ✓ Database persistence: SQLite database exists with WAL mode, all tables created
- ✓ Socket.IO: WebSocket endpoint is accessible

**Expected output:**
```
✓ Server health check passed
✓ Instance list endpoint working
✓ Database exists and has WAL mode
✓ All tables created (instances, session_logs, token_usage)
✓ Socket.IO endpoint accessible
```

**Troubleshooting:**
- If health check fails: Verify server is running on port 3001
- If auto-discovery fails: Create test tmux session with `tmux new -s warden-test`
- If database fails: Check `data/warden.db` exists and is readable

### Playwright E2E Tests

Desktop UI tests verify core dashboard flows using Playwright.

**Prerequisites:** Chromium browser installed via `npx playwright install chromium`.

```bash
# Headless mode (CI-friendly)
npm run test:e2e

# Interactive UI mode (for debugging)
npm run test:e2e:ui
```

**What it tests:**
- ✓ Dashboard load: Header, navigation buttons, active session count
- ✓ View navigation: Switch between Terminals and History views
- ✓ Agent sidebar: Toggle visibility
- ✓ Session history: Filter controls (agent ID, status, date range)
- ✓ Token usage: Per-agent summary, daily breakdown
- ✓ Log viewer: Agent filter, auto-refresh toggle
- ✓ Tab bar: Session tabs presence on terminals view

**Test files:**
- `tests/e2e/dashboard.spec.ts` — Core dashboard flow tests (10 tests)
- `tests/e2e/screenshot.spec.ts` — Visual regression tests (2 tests)
- `playwright.config.ts` — Playwright configuration (Chromium, 1280x800 viewport)

**Expected output:** `12 passed (12/12)`

**Troubleshooting:**
- If browser fails to launch: Run `npx playwright install chromium`
- If tests timeout: Increase timeout in `playwright.config.ts` (default: 30s)
- If server not found: Playwright auto-starts dev servers, but check ports 3001/5173 aren't in use

### Manual Verification

#### PTY Resize Safety

Verifies terminal resize handler guards against EBADF errors when PTY process exits:

1. Start both servers: `npm run dev:all`
2. Open dashboard in browser (http://localhost:5173)
3. Connect to a tmux session by clicking a tab
4. Kill the tmux session externally: `tmux kill-session -t <session-name>`
5. Resize browser window (drag corner or use DevTools responsive mode)
6. Check server logs for: `[TerminalStream] Ignoring resize error (EBADF)` ← expected
7. Verify server still responds: `curl http://127.0.0.1:3001/api/health` should return 200

**Expected behavior:** Server logs warning but continues running (doesn't crash).

**Why this matters:** Without the guard, server crashes when browser tries to resize a PTY that's already exited.

#### Stop Button Verification

1. Start dashboard: `npm run dev:all`
2. Create test session: `tmux new -s warden-test`
3. In dashboard, click Stop button on warden-test tab
4. Button should show "Stopping..." text and be disabled
5. Session should disappear from tab bar after ~1s
6. Verify with `tmux list-sessions` — warden-test should not be in list

**Expected behavior:** Clean stop with visual feedback, session removed from both UI and tmux.

### Test Coverage

| Layer | Type | Files | Purpose |
|-------|------|-------|---------|
| Backend | Integration | `tests/backend-verify.sh` | API endpoints, database, Socket.IO |
| E2E | Browser UI | `tests/e2e/*.spec.ts` | User flows, visual regression |
| Manual | Verification | README.md | Edge cases, safety guards |

**Coverage gaps:**
- No unit tests (low priority - integration tests cover critical paths)
- Token usage data population not automated (manual SQL inserts for now)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fs callbacks | fs/promises with async/await | Node.js 10+ (2018) | Cleaner code, no callback hell, native promise support |
| Manual file existence checks | fs.stat() with ENOENT handling | Always available | Purpose-built, returns metadata (size, mtime) |
| React class components with state | Functional components with useState | React 16.8+ (2019) | Simpler, less boilerplate, hooks composability |
| defaultProps for React components | JavaScript default parameters | React 18+ (2022) | Better TypeScript inference, cleaner syntax |
| README without prerequisites | Structured test docs with prereqs | Best practice evolution (2024+) | Lower barrier to contribution, fewer support questions |

**Deprecated/outdated:**
- **fs.exists()**: Deprecated, use fs.stat() and check ENOENT instead
- **fs.promises (old import)**: Use `fs/promises` import style in Node.js 22+
- **React defaultProps**: Discouraged in React 18+, use default parameters
- **Unstructured README test sections**: Modern best practice requires prerequisites, expected output, troubleshooting

## Open Questions

1. **SOUL.md Format Variations**
   - What we know: SOUL.md is markdown, first line typically contains agent name/identity
   - What's unclear: Is there a standard format? Should we parse frontmatter? Extract specific sections?
   - Recommendation: Start with simple first-200-chars preview, enhance later if format standardizes

2. **Memory Size Display Units**
   - What we know: MEMORY.md file size ranges from KB to MB
   - What's unclear: Best UX - show bytes, KB, or auto-format?
   - Recommendation: Auto-format (formatBytes helper) - "5.2 KB" is more readable than "5243 bytes"

3. **Stop Button Confirmation Dialog**
   - What we know: API endpoint works, can stop sessions
   - What's unclear: Should stop button require confirmation? Risk of accidental clicks?
   - Recommendation: Start without confirmation (fast operator workflow), add confirmation if users report accidental stops

4. **README Test Prerequisites Location**
   - What we know: Playwright requires browser install, backend tests need tmux
   - What's unclear: Should prerequisites be top-level section or embedded in each test type?
   - Recommendation: Embedded in each test section (context-specific), top-level summary table for quick reference

## Sources

### Primary (HIGH confidence)
- [Node.js Reading Files](https://nodejs.org/en/learn/manipulating-files/reading-files-with-nodejs) - fs/promises readFile documentation
- [Node.js File Stats](https://nodejs.org/en/learn/manipulating-files/nodejs-file-stats) - fs.stat() for file metadata
- [Node.js fs API](https://nodejs.org/api/fs.html) - Official fs module documentation
- [React Managing State](https://react.dev/learn/managing-state) - useState patterns
- [TypeScript Extend Interface](https://www.typescripttutorial.net/typescript-tutorial/typescript-extend-interface/) - Interface extension syntax
- Existing codebase: OpenClawConfigReader.ts, AgentSidebar.tsx, InstanceTabBar.tsx, README.md

### Secondary (MEDIUM confidence)
- [How to get file size in Node.js](https://attacomsian.com/blog/nodejs-get-file-size) - fs.stat() size property
- [React fetch on button click](https://bobbyhadz.com/blog/react-fetch-data-on-button-click) - useState + fetch pattern
- [React State Management 2026](https://www.developerway.com/posts/react-state-management-2025) - useState best practices
- [OpenClaw Configuration](https://docs.openclaw.ai/gateway/configuration) - Workspace directory structure
- [SOUL.md GitHub Repo](https://github.com/aaronjmars/soul.md) - SOUL.md format background
- [Giving Claude Code a Memory](https://therealjasoncoleman.com/2026/02/05/giving-claude-code-a-memory-and-a-soul-with-automem/) - SOUL.md and MEMORY.md context

### Tertiary (LOW confidence)
- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory) - Memory directory structure (general Claude Code, not OpenClaw-specific)
- WebSearch results - Various React TypeScript patterns (confirmed with official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All built-in Node.js/React modules, existing project dependencies
- Architecture: HIGH - Simple file I/O patterns, React state management, existing codebase matches patterns
- Pitfalls: HIGH - ENOENT handling verified from Node.js docs, React state patterns from official React docs
- Code examples: HIGH - Based on official Node.js/React docs + existing codebase structure

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable APIs, Node.js fs and React patterns slow-moving)
