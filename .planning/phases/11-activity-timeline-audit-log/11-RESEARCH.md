# Phase 11: Activity Timeline & Audit Log - Research

**Researched:** 2026-02-17
**Domain:** SQLite event storage, terminal output parsing, React filterable timeline UI, browser-side export
**Confidence:** HIGH

---

## Summary

Phase 11 adds a structured event capture pipeline, a filterable Activity view, and export capabilities to the Warden dashboard. The core challenge is safely capturing terminal output from node-pty streams (ANSI-stripping is mandatory before storage), parsing Claude Code's distinctive output patterns to extract semantic events, and presenting thousands of events efficiently in a React timeline.

The existing codebase provides a strong foundation: `DatabaseConnection` already uses better-sqlite3 with WAL mode, `TerminalStreamService` already receives all PTY `onData` events, and the `HistoryView` tab system plus `SessionHistory` filtering patterns are directly reusable. This phase follows those patterns closely rather than introducing new architectural layers.

ANSI stripping does NOT require installing a new package — the `ansi-regex` pattern can be inlined as a constant (the installed strip-ansi@6.0.1 is CJS and the project is `"type": "module"`, so a direct import would require ESM dynamic import or a wrapper). Inlining the compiled regex is simpler and zero-dependency.

Terminal output parsing for Claude Code's tool calls (ACTV-08/09) should be implemented as selective pattern matching against known Claude Code output markers (the `⏺` bullet character prefix pattern) rather than general log parsing. This avoids the performance/storage nightmare flagged in STATE.md. Timestamp-based terminal linking (ACTV-10) is a navigation concern only — the UI switches to the Terminals view and scrolls, it does not require storing or replaying terminal state.

**Primary recommendation:** New `activity_events` SQLite table + `ActivityEventService` that hooks into TerminalStreamService's PTY data stream. ActivityView as a new tab inside HistoryView. Browser-side Blob export. No new npm packages required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACTV-01 | System captures structured events (session start/stop, prompt injections, operator terminal input) in SQLite | New `activity_events` table; hook into InstanceTracker (session lifecycle) and agentRoutes (prompt injections) |
| ACTV-02 | Operator can view chronological event list (newest first) in dedicated Activity view | New `ActivityView` tab in HistoryView; paginated query on `activity_events` ORDER BY timestamp DESC |
| ACTV-03 | Operator can view event detail panel with full metadata | Expandable row or slide-over detail panel in ActivityView |
| ACTV-04 | Operator can filter activity by agent | `agent_id` column + WHERE clause in query; follows SessionHistory pattern |
| ACTV-05 | Operator can filter activity by date range | `timestamp` column with indexed range filter; follows existing date filter pattern |
| ACTV-06 | Operator can filter activity by event type | `event_type` column + multi-select filter component |
| ACTV-07 | Operator can export activity events to CSV or JSON | Browser-side Blob + anchor download; no library needed |
| ACTV-08 | System parses terminal output to extract structured events (tool calls, file edits, commands) | Regex matching on ANSI-stripped PTY onData chunks; Claude Code output markers documented below |
| ACTV-09 | Events show success/failure indicators (parsed from exit codes, error patterns) | Exit code pattern + error keyword matching from terminal output; success/failure field on event |
| ACTV-10 | Operator can click an event to jump to terminal session at timestamp | URL hash navigation: `#view=terminals&session=NAME` + App.tsx handleSelectSession; no timestamp replay needed |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.0.0 | Event storage with filtering/pagination | Already used; synchronous API matches server pattern |
| React 19 | ^19.0.0 | ActivityView, filter controls, detail panel | Already the client framework |
| Tailwind CSS v4 | ^4.0.0 | Styling with warden-* tokens | Already the styling system |

### Supporting (no new installs needed)
| Concern | Solution | Why No Package Needed |
|---------|----------|----------------------|
| ANSI stripping | Inline regex constant | ansi-regex pattern is 2 lines; strip-ansi@6 is CJS incompatible with ESM project |
| CSV/JSON export | Browser Blob API | Native browser API; no library needed |
| Virtualized list | Not needed for this phase | 7-day retention + pagination limits dataset to manageable size |

### Packages NOT needed (confirmed)
- `strip-ansi` — inline the regex pattern instead (CJS compatibility issue with `"type": "module"`)
- `react-window` / TanStack Virtual — 7-day retention + 50-row pages keeps DOM count low
- Any date library — SQLite ISO 8601 strings + native Date API is sufficient

**No new npm install required for this phase.**

---

## Architecture Patterns

### Database Schema: New `activity_events` Table

```sql
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER REFERENCES instances(id),
  agent_id TEXT NOT NULL,
  session_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  summary TEXT NOT NULL,
  detail TEXT,
  success INTEGER,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_events_agent_id ON activity_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(session_name);
```

**Field notes:**
- `event_type`: string enum stored as TEXT — `session_start`, `session_stop`, `prompt_sent`, `operator_input`, `tool_call`, `file_edit`, `bash_command`, `error`
- `success`: SQLite INTEGER (1=true, 0=false, NULL=unknown/not applicable)
- `summary`: short human-readable description (e.g., "Read src/index.ts", "npm test")
- `detail`: full content for prompt injections, file paths, command strings
- `metadata`: JSON blob for extra structured data (e.g., `{"file": "src/index.ts", "lines": "1-50"}`)

**Retention:** Add a `createdAt < datetime('now', '-7 days')` cleanup query run daily via `setInterval` in server startup.

### Recommended Project Structure Addition
```
src/
├── server/
│   ├── database/
│   │   └── DatabaseConnection.ts    # Add activity_events methods here (migration + CRUD)
│   ├── services/
│   │   └── ActivityEventService.ts  # New: event capture + parsing pipeline
│   └── routes/
│       └── activityRoutes.ts        # New: GET /api/activity/events, POST not needed
├── client/
│   └── components/
│       ├── HistoryView.tsx          # Add 'Activity' tab
│       ├── ActivityView.tsx         # New: filterable list + detail panel
│       └── ActivityEventRow.tsx     # New: single event row with expand
```

### Pattern 1: Event Capture in ActivityEventService

The service hooks into `TerminalStreamService` via a callback registration. TerminalStreamService already calls `ptyProcess.onData(...)` per session — we add a side-channel tap there.

```typescript
// Source: existing TerminalStreamService.ts onData pattern
// src/server/services/ActivityEventService.ts

// ANSI strip regex — inlined from ansi-regex@5 (avoids CJS/ESM issue)
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?(?:\u0007|(?:\u001B\[|\u009B)[\dA-PR-TZcf-ntqry=><~])))/g;

function stripAnsi(input: string): string {
  return typeof input === 'string' ? input.replace(ANSI_REGEX, '') : input;
}

// Claude Code terminal output patterns (from live tmux capture analysis)
const CLAUDE_TOOL_CALL_PATTERN = /^[●⏺]\s+([\w]+)\((.{0,200})\)/m;
const CLAUDE_RESULT_PATTERN = /^[⎿]\s+(.{0,300})/m;
const BASH_EXIT_PATTERN = /exit code[:\s]+(\d+)/i;
const ERROR_KEYWORDS = /\b(Error|error|FAILED|failed|exception|Exception|threw|Traceback)\b/;
```

**Key design: tap without blocking.** The PTY `onData` callback must return quickly. Use `setImmediate` or async processing if database writes introduce latency:

```typescript
ptyProcess.onData((rawOutput: string) => {
  socket.emit('terminal:output', rawOutput);
  // Side-channel tap — does NOT block terminal output delivery
  setImmediate(() => {
    activityEventService.processChunk(sessionName, rawOutput);
  });
});
```

### Pattern 2: Claude Code Output Markers

From live tmux capture of a Claude Code session running GSD workflows, the terminal output uses these recognizable markers:

```
● Bash(INIT_RAW=$(node /home/forge/.../gsd-tools.cjs init plan-phase "11")…)
  ⎿  {
       "commit_docs": true,
       ...
● Read 1 file (ctrl+o to expand)
● Next unplanned phase: Phase 11 — Activity Timeline & Audit Log
```

**Claude Code output marker patterns (verified from live capture):**

| Pattern | Regex | Event Type | Success Signal |
|---------|-------|------------|----------------|
| `● ToolName(args)` or `⏺ ToolName(args)` | `/^[●⏺]\s+([\w]+)\(/m` | `tool_call` | Result line follows |
| `⎿ Error:` | `/^[⎿]\s+Error:/m` | `tool_call` | `success=false` |
| `⎿ Updated [file]` | `/^[⎿]\s+Updated (.+)/m` | `file_edit` | `success=true` |
| `⎿ Exit code 1` | `/exit code[:\s]+(\d+)/i` | `bash_command` | `success = code === 0` |
| Operator `terminal:input` event | Direct — from Socket.IO | `operator_input` | N/A |

**Note on Unicode:** The actual markers are `●` (U+25CF, BLACK CIRCLE) and `⏺` (U+23FA, BLACK CIRCLE FOR RECORD) for tool bullets, and `⎿` (U+23BF, BOTTOM LEFT CORNER) for results. Both appear in practice — match both.

### Pattern 3: Event Capture Hooks into Existing Services

Three integration points — no new Socket.IO namespaces or major refactors needed:

**1. Session lifecycle events** — hook into `InstanceTracker.syncWithTmux()`:
```typescript
// In InstanceTracker.upsertInstance() — already called when session appears
activityEventService.captureSessionStart(session.sessionName, session.agentId, instanceId);

// In InstanceTracker.markMissingSessionsStopped() — already called when session disappears
activityEventService.captureSessionStop(sessionName, agentId);
```

**2. Prompt injection events** — hook into `agentRoutes.ts` POST handler:
```typescript
// In agentRoutes.ts after successful gatewayApiClient.sendPrompt()
await activityEventService.capturePromptSent(agentId, prompt.trim(), result.success);
```

**3. Terminal output events** — hook into `TerminalStreamService.attachSocketToSession()`:
```typescript
// Side-channel tap on existing ptyProcess.onData handler
```

**4. Operator keyboard input** — hook into `TerminalStreamService` `terminal:input` handler:
```typescript
socket.on('terminal:input', (userInput: string) => {
  ptyProcess.write(userInput);
  // Capture non-control characters as operator_input events
  if (userInput.trim().length > 0 && !isControlSequence(userInput)) {
    activityEventService.captureOperatorInput(sessionName, userInput);
  }
});
```

### Pattern 4: ActivityView Component Structure

Follows the exact same pattern as `SessionHistory.tsx`:

```typescript
// src/client/components/ActivityView.tsx

interface ActivityEvent {
  id: number;
  instanceId: number | null;
  agentId: string;
  sessionName: string;
  eventType: ActivityEventType;
  timestamp: string;
  summary: string;
  detail: string | null;
  success: boolean | null;
  metadata: string | null;
}

type ActivityEventType = 'session_start' | 'session_stop' | 'prompt_sent' |
  'operator_input' | 'tool_call' | 'file_edit' | 'bash_command' | 'error';
```

Filter state mirrors SessionHistory:
```typescript
interface ActivityFilters {
  agentId: string;
  eventType: string;    // '' = all, or specific type
  dateFrom: string;
  dateTo: string;
}
```

### Pattern 5: Export via Browser Blob API

No library needed. Pure browser API pattern:

```typescript
// CSV export
function exportToCSV(events: ActivityEvent[], filename: string): void {
  const headers = ['id', 'timestamp', 'agentId', 'sessionName', 'eventType', 'summary', 'success', 'detail'];
  const rows = events.map(e => [
    e.id, e.timestamp, e.agentId, e.sessionName, e.eventType,
    `"${(e.summary ?? '').replace(/"/g, '""')}"`,  // escape quotes
    e.success ?? '',
    `"${(e.detail ?? '').replace(/"/g, '""')}"`,
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

// JSON export
function exportToJSON(events: ActivityEvent[], filename: string): void {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

### Pattern 6: Terminal Timestamp Navigation (ACTV-10)

"Jump to terminal session at timestamp" does NOT require replaying terminal state. The xterm.js buffer holds scrollback (5000 lines). The implementation is:

1. Event row has a "Go to terminal" button
2. Button calls `App.tsx`'s `handleSelectSession(event.sessionName)` which sets `currentView = 'terminals'` and `selectedSessionName = event.sessionName`
3. This already works via `updateHash('terminals', sessionName)` — the URL hash approach in App.tsx

The timestamp is stored for display/context only. No terminal time-travel replay is needed.

**Expose a navigation callback via a route or event bus:**

Option A (simplest): Pass `onNavigateToSession` prop down from App to ActivityView, same pattern as `handleSelectSession` already used by `InstanceTabBar`.

Option B: URL hash: `#view=terminals&session=NAME` — App.tsx already parses this on `hashchange`.

Use Option A — prop drilling is fine at this component depth.

### Anti-Patterns to Avoid
- **Storing raw terminal output in SQLite:** Exponential storage growth. Only store parsed/summarized event data. Never store raw PTY chunks in the database.
- **Blocking the PTY onData callback:** Any database write inside `onData` risks adding latency to terminal output delivery. Always use `setImmediate`.
- **Rendering ANSI sequences in the web UI:** Never pass raw terminal output (even stripped) to dangerouslySetInnerHTML. Display only `summary` and `detail` text fields that were pre-stripped server-side.
- **Using OFFSET-based pagination for large result sets:** Use keyset pagination (`WHERE id < :cursor`) for forward/backward scrolling if dataset grows large. For this phase, standard `OFFSET` is fine since 7-day retention keeps rows manageable.
- **Storing operator keystrokes verbatim:** Operator `terminal:input` events should store a truncated, sanitized version. Skip pure control sequences (Ctrl+C, arrow keys, etc.).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape stripping | Custom string parser | Inline `ansi-regex` pattern (2 lines) | ANSI spec has many edge cases; 10 CVEs in this space |
| CSV encoding | Manual string manipulation | The BOM + quote-escape pattern above | Excel compatibility, multi-line value handling |
| SQLite connection pooling | Multiple Database instances | Single `DatabaseConnection` singleton (already exists) | better-sqlite3 is synchronous; one instance is correct |
| Event bus / pub-sub | Custom EventEmitter | Direct method call: `activityEventService.capture*()` | No async boundary needed; services are singletons |

**Key insight:** The terminal output parsing does NOT need to be perfect — it only needs to capture the most common patterns (tool calls, file edits, bash commands). Unknown output chunks are silently skipped. This avoids the performance nightmare while still providing useful visibility.

---

## Common Pitfalls

### Pitfall 1: ANSI Regex Catastrophic Backtracking
**What goes wrong:** Naive ANSI regex patterns can exhibit catastrophic backtracking on malformed escape sequences, causing CPU spikes.
**Why it happens:** ANSI sequences have many variations; poorly anchored regexes backtrack exponentially.
**How to avoid:** Use the exact `ansi-regex` pattern (tested against known edge cases). Never write your own ANSI regex from scratch.
**Warning signs:** CPU spike when processing terminal output from crashed or misbehaving processes.

### Pitfall 2: Terminal Output Chunk Boundaries
**What goes wrong:** Claude Code's tool call line `⏺ Bash(npm test)` may be split across two PTY `onData` chunks — the `⏺ Bash(` arrives in one chunk, `)` in the next.
**Why it happens:** PTY delivers data in variable-size chunks based on kernel pipe buffering (macOS: ~4KB).
**How to avoid:** Buffer up to 2KB of incoming text per session, only parse complete lines (terminated by `\n`), flush the buffer when a new `⏺` marker is seen.
**Warning signs:** Tool call events appear with truncated summaries.

### Pitfall 3: strip-ansi ESM Incompatibility
**What goes wrong:** `import stripAnsi from 'strip-ansi'` fails at runtime because strip-ansi@6 (currently installed) is CJS and the project has `"type": "module"`.
**Why it happens:** Node.js ESM loader refuses CJS default imports in ESM projects without `createRequire`.
**How to avoid:** Inline the ANSI regex pattern directly. Do not `npm install strip-ansi@7` (supply chain attack risk per 2025 incident). Use the pattern from ansi-regex@5 already in node_modules.
**Warning signs:** `ERR_REQUIRE_ESM` or `ERR_MODULE_NOT_FOUND` at server startup.

### Pitfall 4: Database Migration Order
**What goes wrong:** Running `CREATE TABLE activity_events` before the migration that creates `instances` causes a foreign key violation on startup.
**Why it happens:** `DatabaseConnection` runs all migrations in `runMigrations()` via a single `this.db.exec()` call — order matters.
**How to avoid:** Add `activity_events` table creation at the END of the existing `runMigrations()` SQL block, after `instances` is already defined.
**Warning signs:** `SQLITE_ERROR: no such table: instances` on startup.

### Pitfall 5: Event Volume from Operator Keyboard Input
**What goes wrong:** Capturing every keystroke creates thousands of rows per minute, defeating the 7-day retention goal.
**Why it happens:** `terminal:input` fires on every keypress; a fast typist generates 5+ events/second.
**How to avoid:** Batch operator input: accumulate keystrokes for 2 seconds, then flush as a single `operator_input` event with the combined string. Skip pure control sequences (arrow keys, Ctrl+C, etc.).
**Warning signs:** `activity_events` table growing faster than expected; many single-character events in the log.

### Pitfall 6: ANSI Security — Log4Shell-style Injection
**What goes wrong:** Malicious terminal output containing crafted ANSI sequences could theoretically exploit the log viewer.
**Why it happens:** ANSI OSC (Operating System Command) sequences can embed URLs and execute actions; 10 CVEs documented.
**How to avoid:** Strip ANSI BEFORE storing in SQLite. Never render raw terminal data in the browser. Display only the `summary` and `detail` text fields from the database.
**Warning signs:** Database stores strings starting with `\x1b[` or `\u001B`.

---

## Code Examples

### ANSI Stripping (Inlined — No Package)
```typescript
// Source: ansi-regex@5.0.1 pattern, inlined to avoid ESM/CJS issue
// Use in ActivityEventService before any SQLite insertion
const ANSI_PATTERN = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
].join('|');
const ANSI_REGEX = new RegExp(ANSI_PATTERN, 'g');

export function stripAnsi(input: string): string {
  return typeof input === 'string' ? input.replace(ANSI_REGEX, '') : input;
}
```

### DatabaseConnection: insertActivityEvent
```typescript
// Add to DatabaseConnection class
insertActivityEvent(params: {
  instanceId: number | null;
  agentId: string;
  sessionName: string;
  eventType: string;
  summary: string;
  detail?: string;
  success?: boolean;
  metadata?: string;
}): void {
  this.db.prepare(`
    INSERT INTO activity_events
      (instance_id, agent_id, session_name, event_type, summary, detail, success, metadata)
    VALUES
      (@instanceId, @agentId, @sessionName, @eventType, @summary, @detail, @success, @metadata)
  `).run({
    instanceId: params.instanceId ?? null,
    agentId: params.agentId,
    sessionName: params.sessionName,
    eventType: params.eventType,
    summary: params.summary,
    detail: params.detail ?? null,
    success: params.success === undefined ? null : params.success ? 1 : 0,
    metadata: params.metadata ?? null,
  });
}

queryActivityEvents(filters: {
  agentId?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): { events: ActivityEventRow[]; total: number } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.agentId) { conditions.push('agent_id = ?'); params.push(filters.agentId); }
  if (filters.eventType) { conditions.push('event_type = ?'); params.push(filters.eventType); }
  if (filters.dateFrom) { conditions.push('timestamp >= ?'); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push('timestamp <= ?'); params.push(filters.dateTo + ' 23:59:59'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const total = (this.db.prepare(
    `SELECT COUNT(*) as count FROM activity_events ${where}`
  ).get(...params) as { count: number }).count;

  const events = this.db.prepare(`
    SELECT id, instance_id as instanceId, agent_id as agentId,
           session_name as sessionName, event_type as eventType,
           timestamp, summary, detail,
           CASE WHEN success IS NULL THEN NULL WHEN success = 1 THEN 1 ELSE 0 END as success,
           metadata
    FROM activity_events ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as ActivityEventRow[];

  return { events, total };
}

purgeOldActivityEvents(): number {
  const result = this.db.prepare(
    `DELETE FROM activity_events WHERE timestamp < datetime('now', '-7 days')`
  ).run();
  return result.changes;
}
```

### ActivityEventService: Chunk Buffer + Pattern Matching
```typescript
// src/server/services/ActivityEventService.ts

// Buffer per session to handle chunk boundaries
const sessionBuffers = new Map<string, string>();
const FLUSH_AFTER_BYTES = 2048;

export function processTerminalChunk(sessionName: string, agentId: string, rawChunk: string): void {
  const clean = stripAnsi(rawChunk);

  // Accumulate in buffer
  const existing = sessionBuffers.get(sessionName) ?? '';
  const combined = existing + clean;

  // Only parse complete lines
  const lastNewline = combined.lastIndexOf('\n');
  if (lastNewline === -1 && combined.length < FLUSH_AFTER_BYTES) {
    sessionBuffers.set(sessionName, combined);
    return;
  }

  const toProcess = lastNewline !== -1 ? combined.slice(0, lastNewline + 1) : combined;
  sessionBuffers.set(sessionName, combined.slice(toProcess.length));

  parseAndCaptureEvents(sessionName, agentId, toProcess);
}

// Claude Code tool call markers — verified from live tmux capture 2026-02-17
const TOOL_CALL_RE = /^[●⏺]\s+([\w]+)\((.{0,200})\)/m;
const RESULT_SUCCESS_RE = /^[⎿]\s+(?:Updated|Created|Wrote)\s+(.{1,200})/m;
const RESULT_ERROR_RE = /^[⎿]\s+Error:/m;
const BASH_EXIT_RE = /exit code[:\s]+(\d+)/i;
```

### API Route: GET /api/activity/events
```typescript
// src/server/routes/activityRoutes.ts
import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';

export const activityRoutes = Router();

activityRoutes.get('/api/activity/events', (request, response) => {
  const { agentId, eventType, dateFrom, dateTo, limit, offset } =
    request.query as Record<string, string | undefined>;

  const result = database.queryActivityEvents({
    agentId,
    eventType,
    dateFrom,
    dateTo,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  response.json(result);
});
```

### ActivityView Filter Component (follows SessionHistory.tsx pattern)
```tsx
// Key filter controls — mirrors SessionHistory pattern
<input
  type="text"
  placeholder="Agent ID"
  value={filters.agentId}
  onChange={(e) => { setFilters({ ...filters, agentId: e.target.value }); setPage(0); }}
  className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text w-32"
/>
<select
  value={filters.eventType}
  onChange={(e) => { setFilters({ ...filters, eventType: e.target.value }); setPage(0); }}
  className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text"
>
  <option value="">All types</option>
  <option value="session_start">Session Start</option>
  <option value="session_stop">Session Stop</option>
  <option value="prompt_sent">Prompt Sent</option>
  <option value="tool_call">Tool Call</option>
  <option value="file_edit">File Edit</option>
  <option value="bash_command">Bash Command</option>
  <option value="operator_input">Operator Input</option>
  <option value="error">Error</option>
</select>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Parsing ANSI with regex from scratch | Use the validated ansi-regex pattern | Stable since 2018 | 10 CVEs exist for naive ANSI parsing |
| OFFSET-based pagination | Keyset cursor pagination | 2020+ | Faster on large tables; simpler for initial phase |
| npm packages for CSV | Browser Blob API | Stable since 2015 | Zero dependencies, native, reliable |
| Storing all terminal output | Selective event extraction only | Current best practice | Prevents exponential storage growth |

**Deprecated/outdated:**
- `strip-ansi@6`: CJS-only, incompatible with ESM projects using `"type": "module"` without createRequire workaround. Supply chain attack in 2025 (v7.1.1 was compromised, v7.1.2 is clean). Solution: inline the regex.
- Full terminal log storage: Flagged in STATE.md as a performance nightmare. The pattern is selective extraction only.

---

## Open Questions

1. **Chunk buffering memory leak risk**
   - What we know: `Map<sessionName, string>` buffers accumulate per session
   - What's unclear: Sessions that crash without producing a newline will hold buffered data indefinitely
   - Recommendation: Clear buffer on `terminal:exit` event; set a max buffer size (4KB) and force-flush with a partial parse if exceeded

2. **Operator input batching window**
   - What we know: Need to batch keystrokes to avoid per-keystroke storage
   - What's unclear: What's the right debounce window? 1s? 2s? On Enter?
   - Recommendation: Flush on `\n` (Enter key) or after 2 seconds of no input; this captures "commands" naturally

3. **Instance ID availability at PTY time**
   - What we know: `TerminalStreamService` knows `sessionName` but not `instanceId` (that's in the DB)
   - What's unclear: Should `ActivityEventService` do a DB lookup by sessionName on every event?
   - Recommendation: Yes — use `database.findInstanceBySessionName(sessionName)?.id` which is a prepared statement lookup by unique column (fast). Cache the result per session.

4. **Success detection from terminal output**
   - What we know: Exit codes appear in text as "exit code: N" for bash commands
   - What's unclear: Claude Code sometimes shows "Error:" without an exit code for tool failures
   - Recommendation: `success=false` if `⎿  Error:` matches; `success=true` if `⎿  Updated/Created` matches; `success=null` for tool calls without a clear result line

---

## Sources

### Primary (HIGH confidence)
- Live tmux capture of warden-main-2 session (2026-02-17) — Claude Code output marker patterns (⏺, ⎿, ●)
- `/home/forge/warden.kingdom.lv/src/server/database/DatabaseConnection.ts` — existing schema and patterns
- `/home/forge/warden.kingdom.lv/src/server/services/TerminalStreamService.ts` — PTY onData integration point
- `/home/forge/warden.kingdom.lv/src/client/components/SessionHistory.tsx` — UI filter/pagination pattern to replicate
- `/home/forge/warden.kingdom.lv/node_modules/ansi-regex/index.js` — exact ANSI regex pattern for inlining
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — tool names, event types, JSON schema

### Secondary (MEDIUM confidence)
- [strip-ansi npm](https://www.npmjs.com/package/strip-ansi) — version 7.1.2 is current; v6.0.1 is installed (CJS)
- [StepSecurity blog — supply chain attack](https://www.stepsecurity.io/blog/20-popular-npm-packages-compromised-chalk-debug-strip-ansi-color-convert-wrap-ansi) — confirmed 2025 incident
- [SQLite event store patterns](https://github.com/mattbishop/sql-event-store) — `version` column as global order key
- [browser CSV/JSON export via Blob](https://blog.logrocket.com/programmatically-downloading-files-browser/) — standard browser API pattern

### Tertiary (LOW confidence)
- Claude Code terminal output markers (⏺, ●, ⎿) — inferred from live capture; exact Unicode codepoints may vary across Claude Code versions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing packages, no new deps needed
- Database schema: HIGH — follows proven SQLite event store patterns, extends existing DatabaseConnection
- Architecture: HIGH — follows existing service and route patterns exactly
- Terminal parsing patterns: MEDIUM — verified from live capture but Claude Code output format may change across versions
- ANSI handling: HIGH — inlining documented regex, avoiding ESM/CJS issue and supply chain risk
- Export: HIGH — browser Blob API is stable and well-documented

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days — SQLite patterns stable; Claude Code output format LOW confidence window shorter)
