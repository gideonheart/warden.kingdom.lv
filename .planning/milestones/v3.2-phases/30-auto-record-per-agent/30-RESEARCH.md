# Phase 30: Auto-Record Per Agent - Research

**Researched:** 2026-03-04
**Domain:** Per-agent configuration persistence + server-side auto-start hook in PTY lifecycle
**Confidence:** HIGH

## Summary

Phase 30 adds a per-agent opt-in to automatic recording. When enabled, every new PTY session for that agent begins recording immediately — from the very first onData frame — with no operator action required. The feature is purely additive: existing manual recording via the REC button in TerminalView is untouched.

The implementation has two distinct parts. Part one (plan 30-01) is a thin backend service: a new `auto_record_config` table (one row per agentId), DB methods, and a REST endpoint (`GET/PUT /api/recordings/auto-record-config`). Part two (plan 30-02) is the auto-start hook in `TerminalStreamService.attachSocketToSession` — called synchronously on new PTY spawn, before any onData arrives — plus a toggle UI row in `RecordingLibrary`.

The critical race-condition constraint is already documented in STATE.md: "Auto-record hook must fire AFTER `ptyProcess.onData()` is registered (prevents missing first frames)." This is achievable because `startRecording` is synchronous (it writes to an in-memory Map and a SQLite row), so it can be called between `ptyProcess.onData()` registration and the first tick of the event loop.

No new npm packages are needed. The entire feature uses existing dependencies: better-sqlite3, Express 5, React 19, Tailwind CSS 4.

**Primary recommendation:** Model auto_record_config exactly after budget_config — same upsert/delete pattern in DatabaseConnection, same GET/PUT endpoint pattern in recordingRoutes. Hook the auto-start logic inside `attachSocketToSession`, immediately after `ptyProcess.onData(...)` is registered, only for fresh PTY spawns (not the "reuse existing PTY" branch).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REC-05 | User can enable auto-record per agent via toggle in recording library UI | Toggle UI in RecordingLibrary component, backed by GET/PUT /api/recordings/auto-record-config endpoint |
| REC-06 | Sessions for auto-record-enabled agents begin recording automatically on creation (first frame captured) | Hook inside attachSocketToSession after ptyProcess.onData() registration; synchronous startRecording() call avoids missing first frame |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing in project | SQLite persistence for auto_record_config table | Already the project DB layer; synchronous API fits the server singleton pattern |
| Express 5 | existing in project | REST endpoints for auto-record config CRUD | Project's established API framework |
| React 19 | existing in project | Toggle UI in RecordingLibrary | Project's frontend framework |
| Tailwind CSS 4 | existing in project | Toggle button styling | Project's established styling system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-pty | existing in project | PTY spawning — the hook site lives here | The ptyProcess.onData callback is already used for captureOutput; auto-start fires just before this registration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite auto_record_config table | In-memory Map or JSON file | SQLite is already the project's config store (budget_config). Survives server restart. Consistent pattern. No reason to deviate. |
| Hooking in TerminalStreamService | Hooking in InstanceTracker or a new polling loop | TerminalStreamService is the only place where PTY spawn happens. Polling would miss the first frame. InstanceTracker doesn't spawn PTYs. |

**Installation:**
No new packages needed — all dependencies already present.

## Architecture Patterns

### Recommended Project Structure

No new files needed beyond what the plan outlines:

```
src/server/
├── database/DatabaseConnection.ts   # add auto_record_config table migration + 2 methods
├── routes/recordingRoutes.ts        # add 2 new endpoints (GET + PUT auto-record-config)
└── services/TerminalStreamService.ts  # add auto-start hook in attachSocketToSession

src/client/components/
└── RecordingLibrary.tsx             # add agent list + per-agent toggle row
```

### Pattern 1: auto_record_config Table (mirrors budget_config)
**What:** A simple key-value table: `agent_id TEXT PRIMARY KEY, auto_record INTEGER NOT NULL DEFAULT 0`. Uses `1`/`0` for boolean (SQLite has no native boolean). Upsert sets auto_record=1; delete (or upsert with 0) removes the opt-in.
**When to use:** Same pattern as budget_config — sparse rows, only store when non-default.
**Example:**
```typescript
// Migration — append to runMigrations() in DatabaseConnection.ts
this.db.exec(`
  CREATE TABLE IF NOT EXISTS auto_record_config (
    agent_id TEXT PRIMARY KEY,
    auto_record INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Getter
getAllAutoRecordConfigs(): AutoRecordConfig[] {
  return this.db.prepare(`
    SELECT agent_id AS agentId, auto_record AS autoRecord
    FROM auto_record_config
    WHERE auto_record = 1
  `).all() as AutoRecordConfig[];
}

// Upsert / delete
setAutoRecord(agentId: string, enabled: boolean): void {
  if (!enabled) {
    this.db.prepare('DELETE FROM auto_record_config WHERE agent_id = ?').run(agentId);
    return;
  }
  this.db.prepare(`
    INSERT INTO auto_record_config (agent_id, auto_record, updated_at)
    VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(agent_id) DO UPDATE SET auto_record = 1, updated_at = CURRENT_TIMESTAMP
  `).run(agentId);
}
```

### Pattern 2: REST Endpoints for Auto-Record Config
**What:** Two endpoints added to `recordingRoutes.ts`:
- `GET /api/recordings/auto-record-config` — returns `{ configs: AutoRecordConfig[] }` (list of agentIds with auto_record=1)
- `PUT /api/recordings/auto-record-config/:agentId` — body `{ enabled: boolean }`, calls `database.setAutoRecord(agentId, enabled)`

**Example:**
```typescript
// GET /api/recordings/auto-record-config
recordingRoutes.get('/api/recordings/auto-record-config', (_req, res) => {
  const configs = database.getAllAutoRecordConfigs();
  res.json({ configs });
});

// PUT /api/recordings/auto-record-config/:agentId
recordingRoutes.put('/api/recordings/auto-record-config/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) is required' });
    return;
  }
  database.setAutoRecord(agentId, enabled);
  res.json({ agentId, autoRecord: enabled });
});
```

### Pattern 3: Auto-Start Hook in TerminalStreamService
**What:** After `ptyProcess.onData(...)` is registered and before `this.setupSocketInputHandlers(socket, session)`, check if the session's agentId has auto-record enabled. If yes, call `recordingCaptureService.startRecording(...)`.

**Critical constraint from STATE.md:** Hook fires AFTER onData registration to avoid missing first frames. `startRecording()` is synchronous (writes to in-memory Map + SQLite), so no async gap exists.

**Where to add it:** Inside the `attachSocketToSession` method, in the NEW PTY spawn branch only (not the "reuse existing PTY" branch). The reuse branch does not re-spawn a PTY, so auto-record would have already started on the original spawn or the session is already running.

**How to get agentId in TerminalStreamService:** `sessionName` is already available (e.g., `warden-myproject-abc123`). The `agentId` is the first segment before the first `-` when the session follows the `{agentId}-{projectSlug}-{shortUuid}` format — but we should look up the instance from the database to get the authoritative `agentId`, `agentName`, and `projectPath`.

**Approach:** Inject `database` import into `TerminalStreamService.ts` (it's already a singleton). Call `database.findInstanceBySessionName(sessionName)` to get the full instance record. Then check `database.isAutoRecordEnabled(agentId)` (a new DB method).

**Example:**
```typescript
// In attachSocketToSession, after ptyProcess.onData() registration:

// Auto-record: start recording if the agent has auto-record enabled
const instance = database.findInstanceBySessionName(sessionName);
if (instance && database.isAutoRecordEnabled(instance.agentId)) {
  if (!recordingCaptureService.isRecording(sessionName)) {
    try {
      recordingCaptureService.startRecording({
        sessionName,
        agentId: instance.agentId,
        agentName: instance.agentName,
        projectPath: instance.projectPath,
        cols,
        rows,
      });
      console.log(`[TerminalStream] Auto-record started for ${sessionName} (agent: ${instance.agentId})`);
    } catch (error) {
      console.warn(`[TerminalStream] Auto-record failed to start for ${sessionName}:`, error);
    }
  }
}
```

**New DB helper needed:**
```typescript
isAutoRecordEnabled(agentId: string): boolean {
  const row = this.db.prepare(
    'SELECT auto_record FROM auto_record_config WHERE agent_id = ?'
  ).get(agentId) as { auto_record: number } | null;
  return row?.auto_record === 1;
}
```

### Pattern 4: RecordingLibrary Toggle UI
**What:** Add a "Per-agent auto-record settings" section to `RecordingLibrary.tsx`. Fetch the agent list from `/api/agents` (existing endpoint) and the auto-record configs from `/api/recordings/auto-record-config`. Render a toggle (checkbox or toggle button) per agent.

**Where to fetch agents:** The existing `useAgentConfig` hook fetches from `/api/agents`. RecordingLibrary is a component, not a hook consumer — so it should call `fetch('/api/agents')` directly (same pattern as `fetch('/api/recordings')`).

**UI placement:** Below the recordings table, or as a collapsible "Auto-record settings" panel at the top of RecordingLibrary. The toggle must be visible without being overwhelming — a compact list of agents with a toggle per row works well.

**Toggle state management:** Local `useState<Set<string>>` for enabled agentIds. On toggle, call `PUT /api/recordings/auto-record-config/:agentId` with `{ enabled: !currentState }`.

**Example (abbreviated):**
```tsx
const [autoRecordAgentIds, setAutoRecordAgentIds] = useState<Set<string>>(new Set());
const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

// On mount: fetch both
useEffect(() => {
  void Promise.all([
    fetch('/api/agents').then(r => r.json()),
    fetch('/api/recordings/auto-record-config').then(r => r.json()),
  ]).then(([agentsData, configData]) => {
    setAgents(agentsData.agents ?? []);
    const enabled = new Set<string>(
      (configData.configs ?? []).map((c: { agentId: string }) => c.agentId)
    );
    setAutoRecordAgentIds(enabled);
  });
}, []);

const handleToggleAutoRecord = async (agentId: string) => {
  const enabled = !autoRecordAgentIds.has(agentId);
  await fetch(`/api/recordings/auto-record-config/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  setAutoRecordAgentIds(prev => {
    const next = new Set(prev);
    enabled ? next.add(agentId) : next.delete(agentId);
    return next;
  });
};
```

### Pattern 5: Recording Indicator Auto-Activates
**What:** `TerminalView` uses `useRecordingState` which manages `isRecording` based on explicit `startRecording()` / `stopRecording()` calls from the client. When auto-record fires server-side, the client `isRecording` state starts as `false` — the REC indicator won't light up automatically unless the client is notified.

**Solution options (ranked):**
1. **Poll `/api/recordings/active` on mount in `useRecordingState`** — On component mount, check if the session is already being recorded. If yes, set `isRecording=true` and `recordingId` from the active recording list. This is the simplest approach and consistent with existing `/api/recordings/active` endpoint.
2. Socket.IO event from server on auto-start — more complex, adds a new event type across namespace.
3. Check on PTY connect — server sends recording state with the socket handshake response.

**Recommendation:** Option 1. Add a `useEffect` in `useRecordingState` that calls `GET /api/recordings/active` on mount and sets `isRecording=true` if the session is in the active list. This is a one-time check, adds minimal network overhead, and the endpoint already exists.

```typescript
// In useRecordingState — add to initial mount effect
useEffect(() => {
  void fetch('/api/recordings/active')
    .then(r => r.json())
    .then((active: Array<{ sessionName: string; recordingId: number; startedAt: string }>) => {
      const found = active.find(a => a.sessionName === sessionName);
      if (found) {
        setRecordingId(found.recordingId);
        setIsRecording(true);
        startedAtRef.current = new Date(found.startedAt).getTime();
        tickerRef.current = setInterval(() => {
          if (startedAtRef.current !== null) {
            setElapsedMs(Date.now() - startedAtRef.current);
          }
        }, 1000);
      }
    })
    .catch(() => { /* non-fatal — indicator just won't light up */ });
}, [sessionName]);
```

### Anti-Patterns to Avoid
- **Hooking auto-start before onData registration:** The first terminal output will be lost. The `ptyProcess.onData` must be registered BEFORE `startRecording` is called so the capture tap is in place.
- **Hooking in the "reuse existing PTY" branch:** Auto-record should only fire for fresh PTY spawns. If a session is reused (subscriber re-attaches within PTY_KEEPALIVE_MS=30s), auto-record was already started (or not) at the original spawn.
- **Adding async to the auto-start hook:** `startRecording` is synchronous. Don't make it async — that would introduce a race window where the first onData event arrives before the recording state is set.
- **Relying on parseAgentId from session name:** Session names are `{agentId}-{slug}-{uuid}`. Parsing the prefix is fragile. Always use `database.findInstanceBySessionName(sessionName)` for authoritative agentId.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config persistence | Custom JSON file or in-memory Map | SQLite via better-sqlite3 (existing) | Survives server restart; consistent with budget_config pattern |
| Agent list in RecordingLibrary | New hook or service | `fetch('/api/agents')` directly | Existing endpoint returns what we need; no over-engineering |
| Active recording detection on client | WebSocket subscription | Poll `/api/recordings/active` on mount | Endpoint already exists; one-time check on mount is sufficient |
| Boolean in SQLite | TEXT 'true'/'false' | INTEGER 1/0 | SQLite's idiomatic boolean; consistent with existing schema |

**Key insight:** Every building block already exists. This phase is about wiring them together — not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Missing First Frame (Race Condition)
**What goes wrong:** If `startRecording()` is called BEFORE `ptyProcess.onData()` is registered, the `captureOutput` tap is already in place but no recording entry exists in the Map — or vice versa: the recording entry is created but `captureOutput` isn't wired yet.
**Why it happens:** The Map lookup in `captureOutput` requires `activeRecordings.has(sessionName)` to be true, which only happens after `startRecording` sets it. The tap function `captureOutput` is called from inside `ptyProcess.onData`. Therefore: register `onData` FIRST, THEN call `startRecording`.
**How to avoid:** In `attachSocketToSession`, the order must be: (1) register `ptyProcess.onData(...)`, (2) register `ptyProcess.onExit(...)`, (3) auto-record check + `startRecording()`, (4) `setupSocketInputHandlers()`. This way the tap is in the closure before the first output frame can arrive.
**Warning signs:** First-frame content missing from replayed recordings; recordings that start with a blank screen.

### Pitfall 2: Auto-Starting on PTY Reuse
**What goes wrong:** If the auto-record logic fires in the "reuse existing PTY" branch of `attachSocketToSession`, a second recording starts for an already-running session — or `startRecording()` throws "Already recording session".
**Why it happens:** The reuse branch is hit when `existing && existing.isAlive`. A previous subscriber opened the session, auto-record started. A new subscriber re-attaches. Auto-record fires again.
**How to avoid:** Place the auto-record check ONLY in the new PTY spawn code path (after `pty.spawn(...)`), not in the early-return reuse block.
**Warning signs:** `[RecordingCapture] Already recording session` errors in server logs; duplicate recording entries for the same session.

### Pitfall 3: Recording Indicator Doesn't Light Up
**What goes wrong:** Auto-record starts server-side, but `TerminalView` shows the REC button in the "not recording" state because `useRecordingState.isRecording` is false.
**Why it happens:** `useRecordingState` initializes `isRecording=false` and only flips it when the client explicitly calls `startRecording()`. The server-side auto-start doesn't notify the client.
**How to avoid:** Add a mount-time `GET /api/recordings/active` check in `useRecordingState`. If the session is in the active list, initialize `isRecording=true` with the elapsed time from `startedAt`.
**Warning signs:** REC indicator is off even though `GET /api/recordings/active` returns the session; recordings exist in the library but terminal header showed no indicator.

### Pitfall 4: Instance Not Yet in DB When PTY Spawns
**What goes wrong:** `database.findInstanceBySessionName(sessionName)` returns `null` inside `attachSocketToSession`, so auto-record can't fire.
**Why it happens:** `InstanceTracker.syncWithTmux()` runs on a 10s interval. A new session might be in tmux but not yet upserted to the DB. However, when sessions are started via `POST /api/instances/start`, `database.upsertInstance()` is called synchronously BEFORE the tmux session is created — so the DB row exists before any PTY connects.
**For externally-created sessions** (sessions started outside Warden, discovered by InstanceTracker): the DB row is populated by `syncWithTmux()` which runs every 10s. The PTY connects when a user first opens TerminalView — by that time, the 10s sync has almost certainly run. This is not a critical issue.
**How to avoid:** Treat `null` from `findInstanceBySessionName` as "auto-record not applicable" — no-op. Log a debug message but don't fail the PTY connection.

### Pitfall 5: agentId Not Available in TerminalStreamService
**What goes wrong:** TerminalStreamService currently doesn't import `database`. Adding the import creates a circular dependency concern.
**Why it doesn't apply here:** `database` is a singleton exported from `DatabaseConnection.ts`. `TerminalStreamService.ts` already imports `recordingCaptureService`. Adding `database` import mirrors this pattern. No circular dependency.
**How to avoid:** Add `import { database } from '../database/DatabaseConnection.js';` at the top of `TerminalStreamService.ts`.

## Code Examples

### Full Auto-Start Hook in attachSocketToSession
```typescript
// Source: project codebase analysis (TerminalStreamService.ts lines 126-183)
// Place this block after ptyProcess.onData() and ptyProcess.onExit() registration,
// before setupSocketInputHandlers():

// Auto-record: start recording if agent has auto-record enabled for fresh PTY spawns
const instanceForAutoRecord = database.findInstanceBySessionName(sessionName);
if (instanceForAutoRecord && database.isAutoRecordEnabled(instanceForAutoRecord.agentId)) {
  if (!recordingCaptureService.isRecording(sessionName)) {
    try {
      recordingCaptureService.startRecording({
        sessionName,
        agentId: instanceForAutoRecord.agentId,
        agentName: instanceForAutoRecord.agentName,
        projectPath: instanceForAutoRecord.projectPath,
        cols,
        rows,
      });
      console.log(`[TerminalStream] Auto-record started for ${sessionName}`);
    } catch (error) {
      console.warn(`[TerminalStream] Auto-record failed to start for ${sessionName}:`, error);
    }
  }
}
```

### DB Migration (append to runMigrations)
```typescript
// Source: project pattern from budget_config migration (DatabaseConnection.ts line 428)
this.db.exec(`
  CREATE TABLE IF NOT EXISTS auto_record_config (
    agent_id TEXT PRIMARY KEY,
    auto_record INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### shared/types.ts addition
```typescript
export interface AutoRecordConfig {
  agentId: string;
  autoRecord: boolean;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual REC toggle only | Manual REC + auto-record per agent | Phase 30 | Operators no longer miss session starts for opted-in agents |
| Client-only recording state | Server-side auto-start + client sync via active poll | Phase 30 | Recording starts on first PTY frame regardless of when operator opens the terminal |

**No deprecated features in scope.** The manual REC toggle in TerminalView is preserved as-is.

## Open Questions

1. **What happens if an auto-recording session is restarted (PTY killed, new PTY spawned)?**
   - What we know: `ptyProcess.onExit` already calls `stopRecording(sessionName, 'session_ended')`. When a new PTY spawns for the same `sessionName` (restart), `attachSocketToSession` is called again and the auto-record check fires again.
   - What's unclear: Session names include a short UUID (`{agentId}-{slug}-{shortUuid}`), so restart creates a NEW session name. No issue — each restart gets a fresh session name.
   - Recommendation: Document in plan that restart creates a new session name and thus a new auto-recording. No special handling needed.

2. **Should auto-record apply to externally-created sessions (not started via Warden UI)?**
   - What we know: Sessions discovered via `InstanceTracker.syncWithTmux()` get DB rows. `findInstanceBySessionName` will return the row. Auto-record would fire if the agentId has the flag set.
   - What's unclear: Operator intent for external sessions.
   - Recommendation: Allow it — if the operator has opted the agent into auto-record, any session for that agent should be recorded. This is the expected behavior per REC-06 ("Sessions for auto-record-enabled agents begin recording automatically on creation").

3. **Where in RecordingLibrary should the toggle UI live?**
   - What we know: The library has a header bar (refresh button, total count) and a sortable table.
   - Recommendation: Add a collapsible "Auto-record settings" section above the recordings table, or as a secondary panel below the header. A compact list of agents with a toggle per row. Keep it visually subordinate to the recordings table so it doesn't overwhelm the primary use case.

## Sources

### Primary (HIGH confidence)
- Project codebase — `src/server/services/TerminalStreamService.ts` — PTY lifecycle, onData registration order, attachSocketToSession structure
- Project codebase — `src/server/services/RecordingCaptureService.ts` — startRecording() is synchronous, in-memory Map
- Project codebase — `src/server/database/DatabaseConnection.ts` — budget_config pattern, migration style, better-sqlite3 usage
- Project codebase — `src/server/routes/recordingRoutes.ts` — existing recording endpoints, REST pattern
- Project codebase — `src/client/hooks/useRecordingState.ts` — client recording state initialization
- Project codebase — `src/client/components/RecordingLibrary.tsx` — component structure, fetch pattern
- Project codebase — `.planning/STATE.md` — "Auto-record hook must fire AFTER ptyProcess.onData() is registered" decision

### Secondary (MEDIUM confidence)
- Project codebase — `src/server/routes/historyRoutes.ts` — budget_config endpoint pattern (GET + PUT) used as model for auto-record endpoints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all technologies are existing project dependencies; no new packages needed
- Architecture: HIGH — directly mirrors established patterns (budget_config, recordingRoutes) with no speculative design
- Pitfalls: HIGH — race condition concern is well-understood from codebase analysis and documented in STATE.md; others derived from code inspection

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack, internal codebase — changes only when codebase changes)
