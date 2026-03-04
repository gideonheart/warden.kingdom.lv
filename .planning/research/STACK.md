# Stack Research

**Domain:** Warden Dashboard v3.2 — Mobile Operations & UX Polish (additive milestone)
**Researched:** 2026-03-04
**Confidence:** HIGH

---

## Context: Milestone v3.2 — Additive Only

This file covers ONLY the new technical capabilities needed for v3.2. The following are the validated production stack — do not re-research:

| Already Present | Version | Notes |
|-----------------|---------|-------|
| Express 5 | ^5.0.0 | Stable |
| Socket.IO 4 | ^4.8.0 | Terminal namespace active |
| React 19 | ^19.0.0 | Hook-based, memo-stabilized |
| xterm.js | 5.3.0 | Non-scoped `xterm` package |
| better-sqlite3 | ^11.0.0 | WAL-mode, inline migrations |
| node-pty | ^1.0.0 | PTY bridge for tmux |
| Tailwind CSS 4 | ^4.0.0 | `warden-*` color tokens |
| TypeScript 5 | ^5.7.0 | Strict ESM |
| MobileKeyToolbar | (component in TerminalView.tsx) | onTouchStart + preventDefault pattern established |
| RecordingCaptureService | (service) | In-memory frame buffer, asciicast v2, auto-stop on PTY exit |
| recordings table | (SQLite) | id, session_name, agent_id, file_path, file_size_bytes, started_at, stopped_at |
| Node.js | 22.22.0 | fs.statfsSync, fs/promises statfs — available |

---

## New Capability Analysis

### Capability 1: Mobile Keyboard Persistence (Enter Button + Keep Keyboard Open)

**Requirement:** Add an Enter button to `MobileKeyToolbar`. Tapping any toolbar button must not dismiss the iOS soft keyboard.

**Decision: `onTouchStart` + `event.preventDefault()` — zero new dependency. Already used in the codebase.**

**Why it works (verified against xterm v5.3.0 source and iOS behavior):**

iOS Safari dismisses the soft keyboard when focus leaves an input element. When a button is tapped, iOS moves focus from the current element (xterm's hidden `textarea`) to the button, which dismisses the keyboard. However, if `event.preventDefault()` is called in `onTouchStart`, iOS does not move focus — the `click` event still fires synthetically, but the focus change is suppressed. The keyboard stays open.

This is exactly the pattern already used by every button in `MobileKeyToolbar`:

```tsx
// Existing pattern — proven working for Ctrl+C, Tab, arrows, etc.
<button
  onTouchStart={(event) => {
    event.preventDefault();   // Suppresses iOS focus-move → keyboard stays open
    sendInput(key.seq);
  }}
  onClick={() => sendInput(key.seq)}  // Fallback for non-touch (desktop)
>
```

**The Enter button is simply missing from `MOBILE_KEYS`:**

```typescript
const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Enter', seq: '\r' },   // ADD THIS — carriage return is correct for PTY
  { label: 'Tab', seq: '\t' },
  // ... rest unchanged
];
```

**Limitation confirmed:** Calling `terminal.focus()` programmatically in `onTouchStart` does NOT re-open the keyboard on iOS — `terminal.focus()` calls `textarea.focus({preventScroll: true})` (confirmed in xterm source at `node_modules/xterm/lib/xterm.js:25971`), but iOS only opens the keyboard in response to a direct user gesture on an input, not a programmatic call. The `preventDefault()` approach is the only reliable way to keep it open.

**Secondary protection — if keyboard is dismissed:**

If the user manages to dismiss the keyboard (e.g. by tapping outside), a subsequent tap on the xterm canvas (which holds `terminal.focus()` on tap) will re-open it because xterm's hidden textarea IS an input element — the re-focus happens as a direct user gesture. No extra code needed for this path.

**Integration point:** `MobileKeyToolbar` in `TerminalView.tsx` — add `{ label: 'Enter', seq: '\r' }` to `MOBILE_KEYS` array at the front. No prop changes, no new hooks, no new files.

---

### Capability 2: Auto-Record Per Agent (Configurable Triggers)

**Requirement:** Each agent can have auto-record enabled. When a session starts (InstanceTracker discovers it), recording begins automatically without operator intervention.

**Decision: SQLite `agent_record_config` table + `RecordingCaptureService.startRecording()` call from `InstanceTracker` — zero new dependency.**

**Why no new dependency:** The recording infrastructure already exists. `RecordingCaptureService.startRecording()` is a synchronous call that returns a recording ID. `InstanceTracker` already runs the session-discovery loop and calls `database.upsertInstance()`. The only additions are:

1. A new `agent_record_config` SQLite table (inline migration — existing pattern)
2. A check in `InstanceTracker` after `upsertInstance()`: if the agent has auto-record enabled and the session is new/just-became-active, call `recordingCaptureService.startRecording()`
3. API endpoints for reading/writing per-agent record config (same pattern as budget_config)
4. A UI toggle in `AgentSidebar` or the terminal header

**SQLite schema (new table — inline migration):**

```sql
CREATE TABLE IF NOT EXISTS agent_record_config (
  agent_id TEXT PRIMARY KEY,
  auto_record INTEGER NOT NULL DEFAULT 0,  -- 1 = enabled
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Why SQLite (not openclaw.json):** Recording config is Warden-specific operator preference, not agent identity. The openclaw.json defines agent identity; the Warden DB defines Warden operator config. Established precedent: `budget_config` table follows the same pattern.

**Trigger logic in `InstanceTracker`:**

```typescript
// After upsertInstance() returns the instance:
const recordConfig = database.getAgentRecordConfig(instance.agentId);
if (recordConfig?.autoRecord && !recordingCaptureService.isRecording(instance.tmuxSessionName)) {
  // Only start if session just became active (new insert or status transition from stopped)
  const isNewlyActive = prevStatus !== 'active';  // track previous status
  if (isNewlyActive) {
    recordingCaptureService.startRecording({
      sessionName: instance.tmuxSessionName,
      agentId: instance.agentId,
      agentName: instance.agentName,
      projectPath: instance.projectPath,
      cols: 220,  // default — PTY will be resized by client on first connect
      rows: 50,
    });
  }
}
```

**Integration points:**
- `DatabaseConnection.ts` — add `agent_record_config` table migration + `getAgentRecordConfig(agentId)` and `setAgentAutoRecord(agentId, enabled)` methods
- `InstanceTracker.ts` — add auto-record check after successful upsert
- `instanceRoutes.ts` or new `recordingRoutes.ts` — add `GET/PUT /api/agents/:agentId/record-config` endpoints
- Client: `AgentSidebar.tsx` — add toggle per agent (or terminal header alongside the manual REC button)

---

### Capability 3: Recording Storage Rotation (Disk Usage Monitoring + Auto-Prune)

**Requirement:** Cap total recording storage (configurable, e.g. 500 MB default). When the cap is exceeded, auto-delete the oldest recordings to bring usage under the cap.

**Decision: `fs.statSync()` for per-file sizes (already used) + `fs/promises.statfs()` for disk-level stats — zero new dependency.**

**Why no external disk-usage library:** Node.js 22 has `fs.statfsSync()` and `fs/promises.statfs()` built in (verified on this server — returns `{blocks, bfree, bsize, ...}`). Per-directory size is computed by summing `fs.statSync(filePath).size` for each `.cast` file — simple and accurate since all recordings are in `data/recordings/`. No `du` subprocess, no `check-disk-space` npm package needed.

**Storage cap config — SQLite table (new):**

```sql
CREATE TABLE IF NOT EXISTS storage_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Keys: 'recordings_max_bytes' (default: 524288000 = 500 MB)
```

Alternative: store in `agent_record_config` as a single global row. Using a key-value `storage_config` table is more flexible for future storage settings.

**Rotation algorithm (pure Node.js, no library):**

```typescript
async function enforceStorageRotation(): Promise<void> {
  const maxBytes = getStorageConfig('recordings_max_bytes') ?? 524_288_000; // 500 MB default

  // Sum all finalised recording sizes from DB (file_size_bytes column already populated)
  const totalBytes = database.getTotalRecordingBytes();  // SUM(file_size_bytes) WHERE stopped_at IS NOT NULL

  if (totalBytes <= maxBytes) return;

  // Get recordings ordered by started_at ASC (oldest first), skip active recordings
  const candidates = database.listRecordingsForPrune();  // stopped_at IS NOT NULL, ORDER BY started_at ASC

  let freed = 0;
  for (const rec of candidates) {
    if (totalBytes - freed <= maxBytes) break;
    freed += rec.fileSizeBytes ?? 0;
    // Delete file + DB row (same logic as DELETE /api/recordings/:id)
    try { fs.unlinkSync(rec.filePath); } catch {}
    database.deleteRecording(rec.id);
    console.log(`[StorageRotation] Pruned recording ${rec.id} (${rec.filePath})`);
  }
}
```

**When to run rotation:**
- On server startup (in `RecordingCaptureService` constructor or `index.ts`)
- After every `stopRecording()` call in `RecordingCaptureService`
- No cron job, no setInterval — event-driven is sufficient

**Disk-level check (optional guard):**

```typescript
import { statfs } from 'fs/promises';

async function isDiskSpaceLow(): Promise<boolean> {
  const stats = await statfs('/home/forge/warden.kingdom.lv/data');
  const freeBytes = stats.bfree * stats.bsize;
  return freeBytes < 1_073_741_824; // warn if < 1 GB free
}
```

Use this as an emergency guard: if disk is low, prune more aggressively regardless of the cap setting. Not required for MVP but useful as a safety net.

**API endpoints needed:**
- `GET /api/storage/status` — returns `{ totalBytes, maxBytes, recordingCount, diskFreeBytes }`
- `PUT /api/storage/config` — body `{ maxBytes: number }` to update the cap
- `POST /api/storage/prune` — manually trigger rotation

**Integration points:**
- `DatabaseConnection.ts` — add `storage_config` table migration + `getTotalRecordingBytes()` + `listRecordingsForPrune()`
- `RecordingCaptureService.ts` — call `enforceStorageRotation()` at end of `stopRecording()`
- New `StorageRotationService.ts` — owns the rotation logic; called by `RecordingCaptureService` and on startup
- `recordingRoutes.ts` or new `storageRoutes.ts` — storage status + config endpoints
- `RecordingLibrary.tsx` — show storage usage summary (total used / cap)

---

### Capability 4: Clickable History Session Rows

**Requirement:** Clicking a row in `SessionHistory` navigates to the terminal tab for that session (if active) or opens the recording replay (if a recording exists for that session).

**Decision: Navigation callback prop + existing `React.useState` in App.tsx — zero new dependency.**

**Why no router library:** Warden is a single-page app with two views (terminals / history) and no URL-based navigation. Adding `react-router-dom` for this would be grossly overengineered. The pattern is:

1. `App.tsx` passes `onNavigateToSession: (sessionName: string) => void` to `HistoryView` → `SessionHistory`
2. `SessionHistory` checks: is `sessionName` in `activeInstances`? If yes, switch to terminals view + select that tab. If no, check if a recording exists for that session — if yes, open `RecordingPlayer` in a modal or navigate to History > Recordings tab.
3. The callback updates existing state: `setCurrentView('terminals')` + `setSelectedSession(sessionName)` already possible via existing App state.

**`HistoryView.tsx` already has the prop stub** (`onNavigateToSession?: (sessionName: string) => void`) but it is unused (`_onNavigateToSession`). This is the wired-but-not-used extension point — confirmed in the file.

**Integration pattern:**

```typescript
// SessionHistory.tsx — row click handler
<tr
  onClick={() => onNavigateToSession?.(session.tmuxSessionName)}
  className="cursor-pointer hover:bg-warden-border/20 transition-colors"
>
```

```typescript
// App.tsx — handler
const handleNavigateToSession = useCallback((sessionName: string) => {
  const activeInstance = activeInstances.find(i => i.tmuxSessionName === sessionName);
  if (activeInstance) {
    setCurrentView('terminals');
    setSelectedSession(sessionName);
  } else {
    // Navigate to History view, Recordings tab, filtered by sessionName
    setCurrentView('history');
    setHistoryTab('recordings');
    setRecordingFilter(sessionName);
  }
}, [activeInstances]);
```

No new dependencies. This is pure React state threading.

---

### Capability 5: History/Events View Cleanup

**Requirement:** Make the Sessions and Events tabs actionable or reduce noise. Sessions tab should be clickable (covered above). Events tab may need filtering/pagination or removal.

**Decision: React state + existing component props — zero new dependency.**

The `EventsTab.tsx` is the GSD event log. If it's noisy, add a filter or collapse inactive agents. This is pure UI work — conditionally render, filter arrays, add a "Show only errors" toggle via `useState`. No new libraries needed.

**Integration point:** `EventsTab.tsx` — add severity filter or time window filter. No new files unless the cleanup is substantial.

---

## Recommended Stack Summary

### Zero New Dependencies

All five capabilities for v3.2 are implementable using existing stack:

| Capability | Implementation Approach | Existing Primitive Used |
|------------|------------------------|------------------------|
| Mobile Enter button | Add to `MOBILE_KEYS` array | `onTouchStart` + `preventDefault()` — already in codebase |
| Keyboard persistence | Same `onTouchStart` + `preventDefault()` | Already used on all other toolbar buttons |
| Auto-record per agent | `agent_record_config` SQLite table + `InstanceTracker` check | `RecordingCaptureService.startRecording()` already exists |
| Storage rotation | `fs.statSync()` + `fs/promises.statfs()` | Node.js 22 built-ins — verified on server |
| Clickable history rows | Callback prop threading `App.tsx` → `SessionHistory` | Existing `onNavigateToSession` prop stub |
| History/Events cleanup | `useState` filter in existing components | React built-ins |

**No npm installs required for v3.2.**

---

## Installation

```bash
# No new dependencies for v3.2.
# All capabilities use existing stack + Node.js built-in fs APIs.
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `onTouchStart` + `preventDefault()` for keyboard persistence | `terminal.focus()` after button tap | Programmatic `.focus()` does NOT open iOS keyboard — verified. iOS only opens keyboard on direct user gesture, not programmatic calls |
| `onTouchStart` + `preventDefault()` for keyboard persistence | `virtualKeyboardPolicy` attribute (VirtualKeyboard API) | Chrome-only as of 2026; not supported in iOS Safari — wrong platform for this use case |
| SQLite `agent_record_config` table for auto-record config | Extend `openclaw.json` with `warden.autoRecord` field | openclaw.json is agent identity config, not Warden operator config. Changes require editing external file. Established project pattern: Warden-specific preferences go in SQLite (see `budget_config`) |
| SQLite `storage_config` table for cap | Hardcode 500 MB default | Makes cap untunable without code changes; operator may want to increase/decrease as disk fills |
| `fs.statSync()` for per-file sizes | `check-disk-space` npm package | Node.js 22 has `fs.statfsSync()` built-in — verified working on this server. No external dependency needed |
| `fs.statSync()` for per-file sizes | `diskusage` npm package (native bindings) | Native bindings require build tools; overkill when built-in `fs.statfsSync()` provides same data |
| `du` subprocess | `du` subprocess (`execFile('du', ['-sb', dir])`) | Spawning a subprocess just to count bytes is wasteful when `readdirSync + statSync` achieves the same result synchronously in <5ms for typical recording volumes |
| Callback prop for session navigation | `react-router-dom` | Single-page app with two views — full router is massively overengineered. The `onNavigateToSession` prop stub already exists in the codebase |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `terminal.focus()` to re-open iOS keyboard | iOS Safari ignores programmatic `.focus()` for keyboard display — works only on direct user gesture. Confirmed in xterm v5.3.0 source: `focus()` calls `textarea.focus({preventScroll: true})` which does not trigger iOS keyboard | `onTouchStart` + `event.preventDefault()` to prevent keyboard dismissal in the first place |
| VirtualKeyboard API (`navigator.virtualKeyboard`) | Chrome 94+ only; not supported in iOS Safari — the primary mobile platform for this use case | `onTouchStart` + `event.preventDefault()` |
| `check-disk-space` npm | External dependency for functionality available in Node.js 22 built-ins | `fs/promises.statfs()` — verified on this server |
| `diskusage` npm | Native bindings require compilation; fragile on managed servers (Laravel Forge) | `fs/promises.statfs()` |
| `react-router-dom` | Overengineered for a two-view SPA with no URL navigation requirement | Callback prop threading through existing component tree |
| `node-cron` or `setInterval` for storage rotation | Storage rotation only needs to run on session stop events, not on a schedule | Event-driven: call `enforceStorageRotation()` in `stopRecording()` |

---

## Key Integration Points

### `TerminalView.tsx` — `MobileKeyToolbar`
- Add `{ label: 'Enter', seq: '\r' }` as first item in `MOBILE_KEYS` array
- All existing buttons already use the correct `onTouchStart` + `preventDefault()` pattern
- No other changes needed for keyboard persistence

### `DatabaseConnection.ts`
- Add `agent_record_config` table migration (idempotent `CREATE TABLE IF NOT EXISTS`)
- Add `storage_config` table migration
- Add methods: `getAgentRecordConfig()`, `setAgentAutoRecord()`, `getTotalRecordingBytes()`, `listRecordingsForPrune()`

### `InstanceTracker.ts`
- After `database.upsertInstance()`: check `agent_record_config` for the agent
- If `autoRecord = 1` and session is newly-active and not currently recording, call `recordingCaptureService.startRecording()`
- Track previous session status in the InstanceTracker poll map to detect "newly active" transitions

### `RecordingCaptureService.ts`
- At end of `stopRecording()`: call `storageRotationService.enforceRotationIfNeeded()`
- On construction: call rotation check once (handles files left by previous server crash)

### New file: `src/server/services/StorageRotationService.ts`
- Owns rotation logic: sum bytes, compare to cap, delete oldest stopped recordings
- Uses `fs.unlinkSync()` + `database.deleteRecording()` (same as existing DELETE route)
- Exposes `enforceRotationIfNeeded()` and `getStorageStatus()`

### `SessionHistory.tsx`
- Accept `onNavigateToSession?: (sessionName: string) => void` prop
- Add `onClick` to table rows with `cursor-pointer hover:bg-warden-border/20`

### `HistoryView.tsx`
- Thread `onNavigateToSession` through to `SessionHistory`
- Remove the `_` prefix (the prop is already declared but unused)

### `App.tsx`
- Implement `handleNavigateToSession` callback
- If session is active: switch to terminals view + select tab
- If session is stopped but has recording: switch to history view, recordings tab, filtered

---

## Version Compatibility

All capabilities use existing packages. No version compatibility concerns.

| API | Node.js Requirement | Status on This Server |
|-----|---------------------|----------------------|
| `fs.statfsSync()` | Node.js 19+ | Available — Node.js 22.22.0 verified |
| `fs/promises.statfs()` | Node.js 19+ | Available — verified returns disk stats |
| `readdirSync({ recursive: true })` | Node.js 18.17+ | Available — verified returns flat file list |

---

## Sources

- `/home/forge/warden.kingdom.lv/src/client/components/TerminalView.tsx` — confirmed `onTouchStart` + `event.preventDefault()` pattern already used on all `MobileKeyToolbar` buttons; `MOBILE_KEYS` array does not contain Enter; `terminal.focus()` is `textarea.focus({preventScroll:true})` (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/node_modules/xterm/lib/xterm.js:25971` — confirmed `focus(){this.textarea&&this.textarea.focus({preventScroll:!0})}` — programmatic focus does not trigger iOS keyboard (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/services/RecordingCaptureService.ts` — confirmed `startRecording()` API, in-memory frame buffer pattern, auto-stop on PTY exit (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/server/database/DatabaseConnection.ts` — confirmed `budget_config` table as precedent for per-agent config, inline migration pattern, `file_size_bytes` column on recordings table (HIGH confidence, read directly)
- `/home/forge/warden.kingdom.lv/src/client/components/HistoryView.tsx` — confirmed `onNavigateToSession` prop exists as `_onNavigateToSession` (declared but unused — extension point ready) (HIGH confidence, read directly)
- Node.js 22.22.0 on server — `fs.statfsSync('/')` and `fs/promises.statfs('/')` both verified working, returning `{blocks, bfree, bsize, ...}` (HIGH confidence, executed)
- `readdirSync({ recursive: true })` — verified working on Node.js 22 for directory size sum (HIGH confidence, executed)
- iOS Safari keyboard behavior — `onTouchStart` + `event.preventDefault()` is the established technique to prevent focus-move on button tap; programmatic `focus()` cannot re-open iOS keyboard (MEDIUM confidence, multiple WebSearch sources consistent)
- MDN VirtualKeyboard API — Chrome 94+ only, not iOS Safari (MEDIUM confidence, WebSearch)

---

*Stack research for: Warden Dashboard v3.2 — Mobile Operations & UX Polish*
*Researched: 2026-03-04*
