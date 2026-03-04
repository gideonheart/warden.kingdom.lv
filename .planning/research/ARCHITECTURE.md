# Architecture Research

**Domain:** Warden Dashboard v3.2 — mobile terminal UX, auto-record triggers, storage rotation
**Researched:** 2026-03-04
**Confidence:** HIGH — direct source code analysis of the shipped v3.1 codebase

---

## System Overview

The five v3.2 feature areas all integrate into the existing two-tier architecture. No new infrastructure is required. The diagram below shows where each feature lands, with v3.2 additions marked `[NEW]` or `[MOD]`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React 19 Client (SPA)                          │
├────────────────────────────────────────────────────────────────────────┤
│  App.tsx (view router, hash nav, stable prop refs, recording state)     │
│  [MOD: session-click routing logic, recording lookup]                   │
│                                                                         │
│  ┌──────────────────────────────┐  ┌────────────────────────────────┐  │
│  │TerminalView (xterm.js)       │  │HistoryView                     │  │
│  │[MOD] MobileKeyToolbar:       │  │[MOD] SessionHistory rows       │  │
│  │  + Enter key in MOBILE_KEYS  │  │  + clickable with onSessionClick│  │
│  │  + onAfterInput re-focus     │  │[MOD] onNavigateToSession wired │  │
│  └──────────────────────────────┘  └────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────┐                                       │
│  │RecordingLibrary              │  [MOD: auto-record + rotation        │
│  │[NEW] RecordingSettings panel │   config UI added inside library]    │
│  └──────────────────────────────┘                                       │
│                                                                         │
│  Hooks: useTerminalSocket, useRecordingState, useActiveInstances        │
│  useSessionSelection, useAgentLiveStatus, useBudgetAlerts               │
├─────────────────────────────────┬──────────────────────────────────────┤
│       Socket.IO /terminal       │     REST /api/*                       │
├─────────────────────────────────┼──────────────────────────────────────┤
│                         Express 5 Server                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │TerminalStream    │  │InstanceTracker   │  │RecordingCapture     │  │
│  │Service           │  │(10s poll loop)   │  │Service              │  │
│  │[MOD] check auto- │  │                  │  │[MOD] call rotation  │  │
│  │record after spawn│  │                  │  │after stopRecording  │  │
│  └────────┬─────────┘  └──────────────────┘  └──────┬──────────────┘  │
│           │ PTY onData tap (existing)                │                 │
│           └──────────────────────────────────────────┘                 │
│  ┌──────────────────────┐  ┌────────────────────────────────────────┐  │
│  │AutoRecordConfig      │  │RecordingRotation                       │  │
│  │Service [NEW]         │  │Service [NEW]                           │  │
│  └──────────────────────┘  └────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  DatabaseConnection (better-sqlite3, WAL)                        │   │
│  │  Tables: instances · session_logs · token_usage · recordings     │   │
│  │  [NEW] auto_record_config · recording_rotation_config            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────┐                                          │
│  │  data/recordings/*.cast  │  (asciicast v2, subject to rotation)    │
│  └──────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Existing Components (modified)

| Component | File | Change for v3.2 |
|-----------|------|-----------------|
| `MobileKeyToolbar` | inside `TerminalView.tsx` | Add Enter key to `MOBILE_KEYS`; add `onAfterInput` prop; call it from each button's `onTouchStart` |
| `TerminalView` | `src/client/components/TerminalView.tsx` | Provide stable `onAfterInput` callback that calls `terminalInstanceRef.current?.focus()` |
| `SessionHistory` | `src/client/components/SessionHistory.tsx` | Add `onSessionClick?: (session: AgentInstance) => void` prop; make rows `role="button"` with click handler |
| `HistoryView` | `src/client/components/HistoryView.tsx` | Route `onSessionClick` up to App.tsx via existing `onNavigateToSession` prop (remove `_` prefix) |
| `App.tsx` | `src/client/App.tsx` | Implement session-click routing: active → terminal, has-recording → player, stopped → terminal+overlay |
| `RecordingLibrary` | `src/client/components/RecordingLibrary.tsx` | Add settings panel UI for auto-record trigger and rotation config |
| `RecordingCaptureService` | `src/server/services/RecordingCaptureService.ts` | Call `RecordingRotationService.runRotation()` (fire-and-forget) after `stopRecording` |
| `TerminalStreamService` | `src/server/services/TerminalStreamService.ts` | Call `AutoRecordConfigService.shouldRecord()` after PTY spawn; start recording if true |
| `DatabaseConnection` | `src/server/database/DatabaseConnection.ts` | Add migrations for 2 new config tables; add 3 new query methods for rotation |

### New Components / Services

| Component | File | Responsibility |
|-----------|------|----------------|
| `AutoRecordConfigService` | `src/server/services/AutoRecordConfigService.ts` | Singleton config (trigger mode, agent IDs); `shouldRecord(sessionName, agentId): boolean` |
| `RecordingRotationService` | `src/server/services/RecordingRotationService.ts` | Prune recordings by size/age/count using `deleteRecording()` + `fs.unlinkSync()` |
| `autoRecordRoutes` | `src/server/routes/autoRecordRoutes.ts` | `GET /api/auto-record/config` and `PUT /api/auto-record/config` |

---

## Detailed Integration Points

### 1. Mobile Enter Button

**Location:** `MOBILE_KEYS` constant array in `TerminalView.tsx` (line 78–88).

**Change:** Add one entry:
```typescript
const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: 'Enter', seq: '\r' },        // [NEW]
  { label: '\u2191', seq: '\x1b[A' },
  // ... existing arrows, PgUp, PgDn
];
```

The existing `onTouchStart` map in `MobileKeyToolbar` handles all keys uniformly — no additional wiring.

**Scope:** 1 line added to a constant array.

---

### 2. Keyboard Persistence (Re-focus xterm After Toolbar Button)

**Root cause:** On iOS Safari, tapping a button can briefly shift focus away from xterm.js. Calling `event.preventDefault()` on `onTouchStart` prevents the default focus change, but if xterm.js still loses focus for any reason (browser inconsistency), the soft keyboard dismisses.

**Current pattern:** Every toolbar button already uses:
```typescript
onTouchStart={(event) => {
  event.preventDefault();
  sendInput(key.seq);
}}
```

**Missing:** Explicit `terminal.focus()` call after each input send.

**Integration approach:** `MobileKeyToolbar` receives a new optional prop `onAfterInput?: () => void`. `TerminalView` provides a stable callback:

```typescript
// In TerminalView (stable via useCallback with no deps, reads ref)
const handleAfterMobileInput = useCallback(() => {
  terminalInstanceRef.current?.focus();
}, []); // no deps — terminalInstanceRef is a ref, not reactive

// Passed to MobileKeyToolbar:
<MobileKeyToolbar
  sendInput={sendInput}
  selectMode={selectMode}
  onToggleCopyMode={handleToggleCopyMode}
  onAfterInput={handleAfterMobileInput}   // [NEW]
/>
```

Each `onTouchStart` in `MobileKeyToolbar`:
```typescript
onTouchStart={(event) => {
  event.preventDefault();
  sendInput(key.seq);
  onAfterInput?.();     // [NEW]
}}
```

**Important:** `onAfterInput` must be called synchronously inside `onTouchStart`, before the browser evaluates whether to dismiss the keyboard. Do not defer with `setTimeout` or `requestAnimationFrame`.

**Scope:** `MobileKeyToolbar` gains 1 prop. All 12 button handlers get 1 line added. `TerminalView` gains 1 `useCallback`. Zero server changes.

---

### 3. Clickable History Session Rows

**Location:** `SessionHistory.tsx` rows, `HistoryView.tsx` prop wiring, `App.tsx` routing.

**Current state:** Session rows are plain `<div>` elements. `HistoryView` has `onNavigateToSession` prop but it is named `_onNavigateToSession` (unused, passed to `SessionHistory` via a dead code path).

**New prop chain:**

```
SessionHistory
  onSessionClick?: (session: AgentInstance) => void
    ↓ (row click)
HistoryView
  onNavigateToSession?: (sessionName: string) => void   [rename from _onNavigateToSession]
    ↓ (wrapped in adapter)
App.tsx
  handleHistorySessionClick(session: AgentInstance)
    → navigate based on session.status + recording lookup
```

**Row click pattern (following EventsTab.tsx precedent for accessibility):**

```tsx
<div
  key={session.id}
  role="button"
  tabIndex={0}
  onClick={() => onSessionClick?.(session)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSessionClick?.(session); }}
  className="... cursor-pointer hover:bg-warden-border/40 ..."
>
```

**Navigation logic in App.tsx:**

```typescript
const handleHistorySessionClick = useCallback((session: AgentInstance) => {
  if (session.status === 'active' || session.status === 'idle') {
    selectSession(session.tmuxSessionName);
    setCurrentView('terminals');
    return;
  }
  // Check if stopped session has a recording
  const matchingRecording = recordingsList.find(
    (r) => r.sessionName === session.tmuxSessionName && r.stoppedAt !== null
  );
  if (matchingRecording) {
    setActiveRecording(matchingRecording);
    setCurrentView('recordings');
    return;
  }
  // No recording — navigate to terminal view (shows stopped overlay)
  selectSession(session.tmuxSessionName);
  setCurrentView('terminals');
}, [selectSession, recordingsList]);
```

**Recording list source:** `App.tsx` needs access to the recordings list for the lookup. Options:
- Option A (recommended, zero new endpoints): `App.tsx` fetches `GET /api/recordings` once and caches it locally (a `useState` + `useEffect` at the App level). This is the same list `RecordingLibrary` fetches — small duplication but clean.
- Option B: Add `?sessionName=X` filter to `GET /api/recordings`. Server-side filter; slightly cleaner but requires route change.

Start with Option A. The recordings list is small (single-server, controlled retention) and fetching once on mount is acceptable.

**Scope:** `SessionHistory.tsx` ~15 lines, `HistoryView.tsx` ~5 lines, `App.tsx` ~30 lines. No server changes required for the basic flow.

---

### 4. Auto-Record with Configurable Triggers

**Location:** New `AutoRecordConfigService`, `TerminalStreamService` hook point, new SQLite table, new route.

**New SQLite table:**

```sql
CREATE TABLE IF NOT EXISTS auto_record_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  trigger_mode TEXT NOT NULL DEFAULT 'manual',
  -- 'manual' | 'on_session_start' | 'on_agent_ids'
  agent_ids TEXT,
  -- JSON array of agent ID strings, e.g. '["gideon","scout"]'
  -- null means apply to all agents (when trigger_mode = 'on_session_start')
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**`AutoRecordConfigService` interface:**

```typescript
export class AutoRecordConfigService {
  getConfig(): { triggerMode: 'manual' | 'on_session_start' | 'on_agent_ids'; agentIds: string[] }
  setConfig(triggerMode: string, agentIds: string[]): void
  shouldRecord(sessionName: string, agentId: string): boolean
}
```

`shouldRecord` logic:
- `'manual'` → always false
- `'on_session_start'` → always true
- `'on_agent_ids'` → true if `agentId` is in `agentIds` array

**Hook point in `TerminalStreamService.attachSocketToSession()`:**

```typescript
// After ptyProcess = pty.spawn(...), inside the new-PTY branch only
const cols = ptyProcess.cols;
const rows = ptyProcess.rows;
if (autoRecordConfigService.shouldRecord(sessionName, derivedAgentId)) {
  try {
    recordingCaptureService.startRecording({
      sessionName,
      agentId: derivedAgentId,
      agentName: '',           // no agentName in TerminalStreamService scope
      projectPath: '',
      cols,
      rows,
    });
  } catch (error) {
    console.warn(`[TerminalStream] Auto-record start failed for ${sessionName}:`, error);
  }
}
```

Note: `TerminalStreamService` does not currently have access to `agentId` from the session name parsing. `TmuxSessionManager` splits session names by the `{agentId}-{projectSlug}-{shortUuid}` convention. The `agentId` can be extracted from `sessionName.split('-')[0]` for this purpose (already done in `TmuxSessionManager.listAgentSessions()`).

**New routes (`autoRecordRoutes.ts`):**

```
GET  /api/auto-record/config    → return current config
PUT  /api/auto-record/config    → update config (body: { triggerMode, agentIds })
```

**Client settings UI:** A small form section at the top or bottom of `RecordingLibrary`, showing:
- Trigger mode selector (Manual / All sessions / Specific agents)
- Agent ID multi-select (shown only when mode is "Specific agents")
- Save button

**Scope:** 1 new service, 1 new route file, 1 migration in `DatabaseConnection`, ~5 lines in `TerminalStreamService`, small UI in `RecordingLibrary`.

---

### 5. Storage Rotation

**Location:** New `RecordingRotationService`, new SQLite table, `RecordingCaptureService` trigger point, extended routes.

**New SQLite table:**

```sql
CREATE TABLE IF NOT EXISTS recording_rotation_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  max_storage_bytes INTEGER DEFAULT 0,    -- 0 = disabled
  max_age_days INTEGER DEFAULT 0,         -- 0 = disabled
  max_count INTEGER DEFAULT 0,            -- 0 = disabled
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**New query methods on `DatabaseConnection`:**

```typescript
getTotalRecordingStorageBytes(): number
// SELECT COALESCE(SUM(file_size_bytes), 0) FROM recordings WHERE stopped_at IS NOT NULL

getOldestFinishedRecordings(limit: number): RecordingEntry[]
// SELECT * FROM recordings WHERE stopped_at IS NOT NULL ORDER BY started_at ASC LIMIT ?

getRecordingsOlderThan(ageDays: number): RecordingEntry[]
// SELECT * FROM recordings
// WHERE stopped_at IS NOT NULL
//   AND started_at < datetime('now', '-' || ? || ' days')
// ORDER BY started_at ASC

countFinishedRecordings(): number
// SELECT COUNT(*) FROM recordings WHERE stopped_at IS NOT NULL
```

**`RecordingRotationService` interface:**

```typescript
export class RecordingRotationService {
  runRotation(): void   // synchronous, fire-and-forget
}
```

Rotation algorithm:

```
runRotation():
  config = get rotation config (cached in memory, refreshed every call or on config update)

  if config.maxAgeDays > 0:
    old = getRecordingsOlderThan(config.maxAgeDays)
    for each: deleteFile + database.deleteRecording(id)

  if config.maxCount > 0:
    total = countFinishedRecordings()
    if total > config.maxCount:
      oldest = getOldestFinishedRecordings(total - config.maxCount)
      for each: deleteFile + database.deleteRecording(id)

  if config.maxStorageBytes > 0:
    while getTotalRecordingStorageBytes() > config.maxStorageBytes:
      oldest = getOldestFinishedRecordings(10)  // batch of 10
      if oldest is empty: break
      for each: deleteFile + database.deleteRecording(id)
```

**Trigger point in `RecordingCaptureService.stopRecording()`:**

```typescript
// After database.finaliseRecording(...)
setImmediate(() => {
  try {
    recordingRotationService.runRotation();
  } catch (error) {
    console.warn('[RecordingCapture] Rotation failed:', error);
  }
});
```

Using `setImmediate` keeps rotation off the PTY data path and ensures `stopRecording` returns promptly.

**New routes (extend `recordingRoutes.ts` or add `recordingRotationRoutes.ts`):**

```
GET  /api/recordings/rotation-config    → return current rotation config
PUT  /api/recordings/rotation-config    → update rotation config
POST /api/recordings/rotate             → manually trigger rotation (for admin use)
```

**Client settings UI:** Section in `RecordingLibrary` showing:
- Max storage (input, MB units, converts to bytes before saving)
- Max age (input, days)
- Max count (input)
- Save + "Run Now" buttons

**Scope:** 1 new service, 3 new DB methods + 1 migration, ~3 lines in `RecordingCaptureService`, extended routes, small config UI.

---

### 6. History/Events View Cleanup

**Current issues:**
- `_onNavigateToSession` prop in `HistoryView` is prefixed with `_` (unused). Fixed by Feature 3.
- Session rows are non-interactive. Fixed by Feature 3.
- `EventsTab` lives in `GsdView` (correct conceptual home — keep it there).
- Mobile accordion `max-h-[60vh]` on `MobileAccordionSection` is tight on phones. Bump to `max-h-[80vh]`.

**Scope:** CSS change in `HistoryView.tsx` (1 line). Prop rename fix is part of Feature 3.

---

## Data Flow Diagrams

### Mobile Enter / Re-focus Flow

```
User taps Enter button on mobile toolbar
  onTouchStart fires:
    event.preventDefault()            → prevents browser from shifting focus
    sendInput('\r')                   → Socket.IO terminal:input to PTY
    onAfterInput?.()                  → [NEW] calls terminalInstanceRef.current?.focus()
    terminal.focus()                  → xterm.js re-claims focus synchronously
    iOS soft keyboard stays open
```

### Clickable Session Navigation Flow

```
User taps session row in SessionHistory
  onClick(session: AgentInstance)
  → onSessionClick(session) [new prop]
  → HistoryView passes to App.tsx
  → App.tsx handleHistorySessionClick(session):

      session.status in ['active', 'idle']:
        selectSession(session.tmuxSessionName) + setCurrentView('terminals')
        → xterm.js terminal shows live session

      session.status in ['stopped', 'error']:
        recordingsList.find(r => r.sessionName === session.tmuxSessionName)
          match found:
            setActiveRecording(recording) + setCurrentView('recordings')
            → RecordingPlayer renders with that recording
          no match:
            selectSession(session.tmuxSessionName) + setCurrentView('terminals')
            → TerminalView shows "Session stopped" overlay
```

### Auto-Record Start Flow

```
Client connects to socket → TerminalStreamService
  session is new (no existing PTY):
    ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], ...)
    agentId = sessionName.split('-')[0]         // extract from naming convention
    [NEW] AutoRecordConfigService.shouldRecord(sessionName, agentId)
      trigger_mode = 'on_session_start' OR
      trigger_mode = 'on_agent_ids' AND agentId in agentIds list:
        → RecordingCaptureService.startRecording({ sessionName, agentId, cols, rows })
        → DB inserts recording row (started_at, file_path)
        → PTY onData tap already wired → captureOutput() fills frameBuffer
      trigger_mode = 'manual': no-op

Client receives 'terminal:reset' and begins receiving PTY output (unchanged)
```

### Storage Rotation Flow

```
RecordingCaptureService.stopRecording(sessionName, reason)
  writeAsciicastFile(recording)              // write .cast to disk
  database.finaliseRecording(id, { ... })   // update row with size + duration
  setImmediate(() => {                       // [NEW] fire-and-forget
    RecordingRotationService.runRotation()
      [Age check] getRecordingsOlderThan(maxAgeDays)
        → fs.unlinkSync(filePath) + database.deleteRecording(id) for each
      [Count check] countFinishedRecordings() > maxCount
        → getOldestFinishedRecordings(excess count)
        → fs.unlinkSync + deleteRecording for each
      [Size check] loop while getTotalRecordingStorageBytes() > maxStorageBytes
        → getOldestFinishedRecordings(10)
        → fs.unlinkSync + deleteRecording for each
  })
```

---

## New vs Modified: Explicit Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/server/services/AutoRecordConfigService.ts` | Singleton config for auto-record trigger mode + agent IDs; `shouldRecord()` method |
| `src/server/services/RecordingRotationService.ts` | Prune recordings by size/age/count; called fire-and-forget after each stop |
| `src/server/routes/autoRecordRoutes.ts` | `GET /PUT /api/auto-record/config` |

### Modified Files

| File | Change | Estimated Lines |
|------|--------|-----------------|
| `src/client/components/TerminalView.tsx` | Add Enter to `MOBILE_KEYS`; add `onAfterInput` prop + stable callback; wire to all toolbar buttons | ~12 |
| `src/client/components/SessionHistory.tsx` | Add `onSessionClick` prop; make rows `role="button"` with click + keydown | ~20 |
| `src/client/components/HistoryView.tsx` | Remove `_` prefix from `onNavigateToSession`; route `onSessionClick` to App; CSS tweak | ~8 |
| `src/client/components/RecordingLibrary.tsx` | Add auto-record + rotation config UI sections | ~60 |
| `src/client/App.tsx` | `handleHistorySessionClick` routing; fetch recordings list for lookup | ~35 |
| `src/server/services/RecordingCaptureService.ts` | Call `RecordingRotationService.runRotation()` in `setImmediate` after `stopRecording` | ~5 |
| `src/server/services/TerminalStreamService.ts` | Extract `agentId` from `sessionName`; call `AutoRecordConfigService.shouldRecord()`; start recording if true | ~15 |
| `src/server/routes/recordingRoutes.ts` | Add rotation config endpoints (`GET/PUT /api/recordings/rotation-config`, `POST /api/recordings/rotate`) | ~40 |
| `src/server/database/DatabaseConnection.ts` | Add migrations for `auto_record_config` and `recording_rotation_config`; add 4 new query methods | ~60 |
| `src/server/index.ts` | Mount `autoRecordRoutes`; instantiate and export new services | ~6 |

### No New Shared Types Required

All new data shapes (config objects) are simple enough to type inline in route files and components. No additions to `src/shared/types.ts` are necessary for v3.2.

---

## Recommended Build Order

Build order driven by: (1) server changes before client consumption, (2) independent features parallizable, (3) rotation safe to build after auto-record is verified.

**Phase 1 — Toolbar fixes (zero dependencies, ship first)**

Step 1: Add Enter to `MOBILE_KEYS` constant — 1 line, verifiable on mobile immediately.
Step 2: Add `onAfterInput` prop + wire to all toolbar buttons in `MobileKeyToolbar`.

Rationale: Client-only. No API changes. Zero risk of breaking existing behavior. Can be tested immediately on iOS without any server changes.

**Phase 2 — Clickable history sessions (client-only)**

Step 3: `SessionHistory.tsx` — add `onSessionClick` prop; make rows `role="button"` with handler.
Step 4: `HistoryView.tsx` — remove `_` prefix, wire `onSessionClick` up.
Step 5: `App.tsx` — add recordings list fetch; implement `handleHistorySessionClick`.

Rationale: Client-only. The recording lookup works against the existing `GET /api/recordings` endpoint. No server changes. Can be tested against real session data immediately.

**Phase 3 — Auto-record config service and triggers**

Step 6: `DatabaseConnection.ts` migration — `auto_record_config` table.
Step 7: `AutoRecordConfigService.ts` — read/write/query.
Step 8: `autoRecordRoutes.ts` — REST endpoints.
Step 9: `src/server/index.ts` — mount routes, wire service.
Step 10: `TerminalStreamService.ts` — hook point after PTY spawn.
Step 11: `RecordingLibrary.tsx` — auto-record settings UI.

Rationale: Server migration first, then service, then route, then hook point, then UI. The `TerminalStreamService` change is additive (no existing code removed). Safe to ship with `trigger_mode = 'manual'` default so existing behavior is unchanged.

**Phase 4 — Storage rotation (build after auto-record so rotation has recordings to prune)**

Step 12: `DatabaseConnection.ts` migration — `recording_rotation_config` table + 4 new query methods.
Step 13: `RecordingRotationService.ts` — pruning algorithm.
Step 14: `RecordingCaptureService.ts` — fire-and-forget call after stop.
Step 15: `recordingRoutes.ts` — rotation config endpoints.
Step 16: `RecordingLibrary.tsx` — rotation config UI.

Rationale: With auto-record running for a day first, there will be real recordings to test rotation against. The rotation config defaults to all-zeros (all policies disabled), so shipping Step 14 before the config UI is safe.

---

## Architecture Patterns to Follow

### Pattern 1: Singleton Row Config (budget_config precedent)

**What:** Store a single-row config in SQLite using `CHECK (id = 1)` constraint with upsert.
**When to use:** Any global-scope Warden configuration needing persistence across restarts.
**Existing precedent:** `budget_config` table in `DatabaseConnection.ts`.

```typescript
this.db.prepare(`
  INSERT INTO auto_record_config (id, trigger_mode, agent_ids)
  VALUES (1, @triggerMode, @agentIds)
  ON CONFLICT(id) DO UPDATE SET
    trigger_mode = excluded.trigger_mode,
    agent_ids = excluded.agent_ids,
    updated_at = CURRENT_TIMESTAMP
`).run({ triggerMode, agentIds: JSON.stringify(agentIds) });
```

### Pattern 2: onTouchStart + preventDefault for Mobile Toolbar Buttons

**What:** Use `onTouchStart` (not `onClick`) with `event.preventDefault()` for all mobile toolbar buttons.
**When to use:** Every button in `MobileKeyToolbar`, including the new Enter button.
**Why not onClick:** `onClick` fires after `touchend`, by which point iOS has already decided to dismiss the keyboard. `onTouchStart` fires before that decision.

```tsx
onTouchStart={(event) => {
  event.preventDefault();   // prevent focus shift
  sendInput(key.seq);
  onAfterInput?.();         // re-focus xterm synchronously
}}
```

### Pattern 3: Fire-and-Forget Service Call with setImmediate

**What:** Use `setImmediate()` to defer non-critical work after a synchronous operation completes.
**When to use:** Rotation after recording stop — should not block the stop response.
**Existing precedent:** The recording tap in `TerminalStreamService.onData` is also a zero-overhead side effect.

```typescript
setImmediate(() => {
  try {
    recordingRotationService.runRotation();
  } catch (error) {
    console.warn('[RecordingCapture] Rotation failed:', error);
  }
});
```

### Pattern 4: Stable Callbacks via useCallback + ref for React.memo Boundaries

**What:** Any new callback passed into `TerminalView` must be stable — `useCallback` with no deps (reading from a ref internally), not an inline arrow function.
**When to use:** The `onAfterInput` callback added to `MobileKeyToolbar` via `TerminalView`.
**Existing precedent:** `handleRestartSelectedInstance` in `App.tsx` uses a ref to avoid TerminalView re-renders.

```typescript
// Stable — reads terminalInstanceRef (a ref, not reactive)
const handleAfterMobileInput = useCallback(() => {
  terminalInstanceRef.current?.focus();
}, []);
```

### Pattern 5: Accessible Row Buttons (EventsTab precedent)

**What:** Interactive list rows use `role="button"`, `tabIndex={0}`, and `onKeyDown` for Enter/Space.
**When to use:** Any list row that gains click-to-navigate behavior (SessionHistory rows).
**Existing precedent:** `EventsTab.tsx` event rows already implement this correctly.

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={() => onSessionClick?.(session)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSessionClick?.(session); }}
  className="... cursor-pointer ..."
>
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling terminal.focus() in rAF or setTimeout After Toolbar Tap

**What people do:** `requestAnimationFrame(() => terminal.focus())` or `setTimeout(() => terminal.focus(), 0)`.
**Why it's wrong:** On iOS, the browser evaluates keyboard dismissal before the next frame. By the time rAF fires, the dismiss decision has already been made.
**Do this instead:** Call `terminal.focus()` synchronously inside the `onTouchStart` handler, after `sendInput`.

### Anti-Pattern 2: Blocking PTY onData for Rotation or Config Reads

**What people do:** Running `runRotation()` synchronously inside the PTY's `onData` callback or `stopRecording`.
**Why it's wrong:** `stopRecording` is called from `ptyProcess.onExit` which is on the node-pty callback chain. Blocking here delays all subsequent PTY processing.
**Do this instead:** Use `setImmediate()` to defer rotation out of the callback.

### Anti-Pattern 3: Writing Warden Config to openclaw.json

**What people do:** Store auto-record or rotation config in `~/.openclaw/openclaw.json`.
**Why it's wrong:** `openclaw.json` is read-only from Warden's perspective (`OpenClawConfigReader` only reads it, does not write). It is owned by the OpenClaw ecosystem.
**Do this instead:** Use SQLite singleton-row pattern (as done for `budget_config`).

### Anti-Pattern 4: Adding onClick Without Keyboard Support to Session Rows

**What people do:** Only wire `onClick`, no `onKeyDown`.
**Why it's wrong:** Keyboard-only users and accessibility tooling cannot activate the row.
**Do this instead:** Follow the `EventsTab.tsx` row pattern — `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.

### Anti-Pattern 5: Deleting Recordings Synchronously in a Loop Without Checking Existence

**What people do:** Iterating over a list of recordings to delete and calling `fs.unlinkSync` without first checking `fs.existsSync`.
**Why it's wrong:** If a file was already deleted manually (or a previous rotation run failed midway), `unlinkSync` throws `ENOENT` which surfaces as an unhandled exception.
**Do this instead:** Use try/catch around `fs.unlinkSync`, log the error, and continue. The DB row should be deleted regardless of whether the file existed.

---

## Integration Boundaries Summary

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `MobileKeyToolbar` ↔ `TerminalView` | Props (`sendInput`, new `onAfterInput`) | Keep `terminalInstanceRef` private to `TerminalView` — do not pass it down |
| `SessionHistory` ↔ `HistoryView` ↔ `App.tsx` | Props (callback chain) | `onSessionClick(session)` bubbles up unchanged; navigation logic lives in `App.tsx` only |
| `App.tsx` ↔ recordings for lookup | `GET /api/recordings` fetch at App level | Small list, fetch once on mount; re-fetch after `onRecordingComplete` |
| `TerminalStreamService` ↔ `AutoRecordConfigService` | Direct synchronous method call at PTY spawn | `shouldRecord()` is pure/fast; no await needed |
| `RecordingCaptureService` ↔ `RecordingRotationService` | `setImmediate` fire-and-forget after `stopRecording` | Wrapped in try/catch; failures are logged and non-fatal |
| `RecordingRotationService` ↔ `DatabaseConnection` | Direct synchronous calls (better-sqlite3) | 4 new query methods on `DatabaseConnection` |
| `AutoRecordConfigService` ↔ `DatabaseConnection` | Direct synchronous calls | Singleton row reads/writes |
| Client ↔ `AutoRecordConfigService` | REST `GET/PUT /api/auto-record/config` | JSON body, no real-time subscription needed |
| Client ↔ rotation config | REST `GET/PUT /api/recordings/rotation-config` | Extend `recordingRoutes.ts` (or new file) |

---

## Scaling Considerations

This is a single-operator dashboard. These considerations are informational only.

| Concern | Approach |
|---------|----------|
| Rotation loop blocking | `setImmediate` defers out of PTY callback chain; SQLite queries are synchronous but fast (small table) |
| Auto-record storage growth | Rotation policy caps it; default is all-zeros (unlimited) — operator must configure |
| Re-focus on non-iOS | Desktop browsers: `terminal.focus()` after toolbar tap is a no-op since keyboard is always visible; safe |
| Concurrent rotation runs | `runRotation()` is synchronous (better-sqlite3); no concurrency risk |
| SessionHistory recording lookup | Linear scan of recordings list is fine for < 1,000 recordings |

---

## Sources

All findings from direct source code analysis (HIGH confidence):

- `src/client/components/TerminalView.tsx` — `MOBILE_KEYS` constant, `MobileKeyToolbar` props, `onTouchStart` pattern, `terminalInstanceRef`, `handleAfterMobileInput` hook point
- `src/client/components/SessionHistory.tsx` — row structure, absence of click handlers, `AgentInstance` data shape
- `src/client/components/HistoryView.tsx` — `_onNavigateToSession` unused prop, `MobileAccordionSection` max-h CSS
- `src/client/components/EventsTab.tsx` — accessible row pattern (`role="button"`, `tabIndex`, `onKeyDown`) to replicate in `SessionHistory`
- `src/client/App.tsx` — view routing, `setActiveRecording`, `recordingLibraryRefreshKey`, stable callback patterns, `selectedInstanceRef` precedent
- `src/server/services/TerminalStreamService.ts` — PTY spawn branch (`pty.spawn`), `onData` tap for recording, `recordingCaptureService.captureOutput()` call
- `src/server/services/RecordingCaptureService.ts` — `stopRecording()` control flow, `writeAsciicastFile()`, `database.finaliseRecording()` call
- `src/server/database/DatabaseConnection.ts` — `budget_config` singleton-row migration pattern, `deleteRecording()` method, `recordings` table schema
- `src/server/routes/recordingRoutes.ts` — existing recording endpoints, `DELETE` implementation pattern for file + DB row
- `src/shared/types.ts` — `RecordingEntry` interface, `AgentInstance` interface
- `.planning/PROJECT.md` — v3.2 milestone scope, constraints, out-of-scope items

---

*Architecture research for: Warden v3.2 — mobile toolbar, clickable history, auto-record, storage rotation*
*Researched: 2026-03-04*
