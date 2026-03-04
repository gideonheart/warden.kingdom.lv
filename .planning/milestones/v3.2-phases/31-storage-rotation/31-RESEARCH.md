# Phase 31: Storage Rotation - Research

**Researched:** 2026-03-04
**Domain:** Server-side storage lifecycle management — SQLite migration, Node.js fs module, in-process scheduler, React settings UI
**Confidence:** HIGH

## Summary

Phase 31 introduces a recording storage cap so that auto-record (shipped in Phase 30) cannot cause unbounded disk growth. The system must: (1) persist a configurable cap in bytes to the DB, (2) periodically compare total `file_size_bytes` in the `recordings` table against the cap and prune the oldest completed recordings until usage is below cap, and (3) never delete a recording that is actively being played back or currently being captured.

The two-phase deletion pattern is the key safety mechanism. A `deletion_pending` flag is set on rows selected for rotation; the actual file unlink and DB row delete happen only after confirming no active playback is happening for that recording ID. Active capture is guarded by checking `recordingCaptureService.isRecording(sessionName)` — a recording that is still being captured will not have a `stopped_at` timestamp, so it naturally falls outside the rotation candidate set (rotation only touches completed recordings).

The UI work is small: a new collapsible settings panel in `RecordingLibrary.tsx` (mirroring the existing "Auto-record settings" panel pattern) shows current usage vs. cap, a numeric input for the cap, and a "Prune now" button that calls the REST endpoint.

**Primary recommendation:** Implement `RecordingRotationService` as a pure server-side service (no new npm packages required), triggered by a `setInterval` every 5 minutes plus an on-demand REST endpoint. Use the existing `better-sqlite3` migration pattern for new columns and the `budget_config` sparse-row pattern for the rotation policy config table.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROT-01 | Operator can set a maximum total storage cap for recordings (configurable in MB/GB) | New `rotation_config` table (single-row) stores cap in bytes; REST PUT /api/recordings/rotation-config; UI numeric input with MB/GB toggle |
| ROT-02 | System auto-deletes oldest recordings when storage cap is exceeded — two-phase deletion safe for concurrent playback | `deletion_pending` column in `recordings` table; `RecordingRotationService` prunes completed recordings not currently being captured; phase-1 marks flag, phase-2 checks active playback via in-memory tracking, then unlinkSync + DB delete |
| ROT-03 | Storage rotation UI shows current usage stats and manual prune button in recording library | New collapsible panel in `RecordingLibrary.tsx` fetches GET /api/recordings/storage-stats; "Prune now" button calls POST /api/recordings/rotation/prune |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.0.0 | DB migration + queries (already in project) | Synchronous SQLite, already used for all storage |
| Node.js `fs` | built-in | File deletion (`fs.unlinkSync`) and directory stat | No extra deps needed |
| Node.js `setInterval` | built-in | Periodic rotation check | Already used by `InstanceTracker` and `SessionUsageReader` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React `useState` / `useEffect` | ^19.0.0 | Storage stats UI state | Already the pattern in `RecordingLibrary.tsx` |
| Express 5 Router | ^5.0.0 | REST endpoints for rotation config + prune | Already used throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process setInterval | node-cron or agenda | Overkill — simple interval is what InstanceTracker and SessionUsageReader already use; no persistence needed for a schedule |
| deletion_pending DB flag | In-memory Set of IDs pending deletion | DB flag survives server restart; in-memory Set would leave orphan files if server restarts mid-rotation |

**Installation:** No new packages required. Everything is built on existing stack.

---

## Architecture Patterns

### Recommended Project Structure

```
src/server/services/
└── RecordingRotationService.ts   # new service: rotation logic + scheduler

src/server/routes/
└── recordingRoutes.ts             # extend with 3 new endpoints

src/server/database/
└── DatabaseConnection.ts          # add migration + 6 new DB methods

src/client/components/
└── RecordingLibrary.tsx           # extend with storage stats panel

src/shared/
└── types.ts                       # add RotationConfig + StorageStats types
```

### Pattern 1: Single-Row Policy Config Table (mirrors budget_config)

**What:** A single-row `rotation_config` table storing the cap in bytes. Only one row ever exists (or zero = disabled). Use `INSERT OR REPLACE` on the single primary key.

**When to use:** Config that applies globally (not per-agent). Rotation cap is global.

**Example:**
```typescript
// Migration in DatabaseConnection.ts runMigrations()
this.db.exec(`
  CREATE TABLE IF NOT EXISTS rotation_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),   -- enforce single row
    cap_bytes INTEGER NOT NULL DEFAULT 0,    -- 0 = disabled
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

```typescript
// Upsert pattern — same as budget_config
getRotationConfig(): { capBytes: number } {
  const row = this.db.prepare(
    'SELECT cap_bytes AS capBytes FROM rotation_config WHERE id = 1'
  ).get() as { capBytes: number } | undefined;
  return { capBytes: row?.capBytes ?? 0 };
}

setRotationConfig(capBytes: number): void {
  this.db.prepare(`
    INSERT INTO rotation_config (id, cap_bytes, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET cap_bytes = excluded.cap_bytes, updated_at = CURRENT_TIMESTAMP
  `).run(capBytes);
}
```

### Pattern 2: deletion_pending Column Migration (idempotent ADD COLUMN)

**What:** Add `deletion_pending INTEGER NOT NULL DEFAULT 0` to the `recordings` table. Use the same try/catch idempotent `ALTER TABLE ADD COLUMN` pattern already used for cache token columns.

**Example:**
```typescript
// In runMigrations(), after the recordings table CREATE IF NOT EXISTS block:
try {
  this.db.exec('ALTER TABLE recordings ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — safe to ignore
}
```

### Pattern 3: RecordingRotationService

**What:** A new service class that:
1. Queries total storage usage from DB
2. Compares against cap
3. If over cap: selects oldest completed recordings (by `started_at ASC`) excluding any currently being captured, marks them `deletion_pending = 1`
4. For each `deletion_pending` row: checks if a playback socket is active (via a callback/injected function), then deletes file + DB row

**Playback active-check strategy:** The service needs to know if a recording is currently being played back. Since `RecordingPlayer.tsx` fetches `/api/recordings/:id/content` via HTTP (not a long-lived socket), there is no persistent server-side playback session to track. The simplest safe approach: treat `deletion_pending` as a "soft delete" — set flag in phase 1, then in phase 2 (next rotation cycle, ~5 minutes later) delete unconditionally. This 5-minute grace window is sufficient since playback of a .cast file is a one-shot HTTP file download (not streaming). The content is buffered in the browser from the first request, so even if the file is deleted after download starts, the playback completes.

**Alternative:** Track active content-fetch requests using a counter in `recordingRoutes.ts`. Increment on `GET /api/recordings/:id/content` start, decrement on response finish. Check counter before deletion. This is more precise but adds complexity.

**Recommended approach:** Use the two-minute grace window: phase 1 marks `deletion_pending`, phase 2 (on next interval run) deletes. A simpler "one-shot" variant: run phase 1 and phase 2 in the same rotation run but with a Set of IDs known to be currently being captured (from `recordingCaptureService`) excluded. For playback safety, check `deletion_pending` in the content-serve route and return 404 early if set.

**When to use:** Called from `setInterval` every 5 minutes (same pattern as `InstanceTracker`), and on demand via REST POST.

**Example skeleton:**
```typescript
// Source: project patterns from InstanceTracker.ts + RecordingCaptureService.ts
export class RecordingRotationService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;

  constructor(
    private readonly recordingCaptureService: { isRecording: (s: string) => boolean }
  ) {}

  startPeriodicRotation(): void {
    this.intervalHandle = setInterval(() => {
      void this.runRotation();
    }, this.CHECK_INTERVAL_MS);
  }

  stopPeriodicRotation(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runRotation(): Promise<{ deletedCount: number; freedBytes: number }> {
    const config = database.getRotationConfig();
    if (config.capBytes === 0) return { deletedCount: 0, freedBytes: 0 };

    const stats = database.getStorageStats();
    if (stats.totalBytes <= config.capBytes) return { deletedCount: 0, freedBytes: 0 };

    // Phase 1: mark candidates deletion_pending
    const overage = stats.totalBytes - config.capBytes;
    const candidates = database.getRotationCandidates(); // oldest completed, not deletion_pending

    let freedBytes = 0;
    let deletedCount = 0;

    for (const candidate of candidates) {
      if (freedBytes >= overage) break;
      if (this.recordingCaptureService.isRecording(candidate.sessionName)) continue;

      // Two-phase: mark pending first
      database.markDeletionPending(candidate.id);

      // Then delete file and DB row
      try {
        if (fs.existsSync(candidate.filePath)) {
          fs.unlinkSync(candidate.filePath);
        }
      } catch (error) {
        console.warn(`[RotationService] Failed to delete file ${candidate.filePath}:`, error);
      }
      database.deleteRecording(candidate.id);

      freedBytes += candidate.fileSizeBytes ?? 0;
      deletedCount++;
    }

    return { deletedCount, freedBytes };
  }
}
```

### Pattern 4: Storage Stats Query

**What:** Sum `file_size_bytes` from all non-`deletion_pending` completed recordings.

```typescript
getStorageStats(): { totalBytes: number; recordingCount: number } {
  const row = this.db.prepare(`
    SELECT
      COALESCE(SUM(file_size_bytes), 0) AS totalBytes,
      COUNT(*) AS recordingCount
    FROM recordings
    WHERE stopped_at IS NOT NULL AND deletion_pending = 0
  `).get() as { totalBytes: number; recordingCount: number };
  return row;
}

getRotationCandidates(): RecordingEntry[] {
  return this.db.prepare(`
    SELECT id, session_name AS sessionName, agent_id AS agentId, agent_name AS agentName,
           project_path AS projectPath, file_path AS filePath,
           started_at AS startedAt, stopped_at AS stoppedAt,
           duration_secs AS durationSecs, file_size_bytes AS fileSizeBytes,
           stop_reason AS stopReason
    FROM recordings
    WHERE stopped_at IS NOT NULL
      AND deletion_pending = 0
      AND file_size_bytes IS NOT NULL
    ORDER BY started_at ASC
  `).all() as RecordingEntry[];
}

markDeletionPending(id: number): void {
  this.db.prepare(
    'UPDATE recordings SET deletion_pending = 1 WHERE id = ?'
  ).run(id);
}
```

### Pattern 5: REST Endpoints (follow existing recordingRoutes.ts naming)

Three new endpoints to add to `recordingRoutes.ts`:

```
GET  /api/recordings/storage-stats        — { totalBytes, recordingCount, capBytes }
GET  /api/recordings/rotation-config      — { capBytes }
PUT  /api/recordings/rotation-config      — body: { capBytes: number } → { capBytes }
POST /api/recordings/rotation/prune       — triggers runRotation(), returns { deletedCount, freedBytes }
```

**CRITICAL — ordering:** All four new literal-path endpoints MUST be placed BEFORE any `/:id` Express route to prevent param capture (same lesson as Phase 30 for `/auto-record-config`).

### Pattern 6: UI Panel in RecordingLibrary

Follow the existing "Auto-record settings" collapsible panel pattern:
- Add a second collapsible section: "Storage settings"
- Show: current usage (formatted bytes), cap setting (numeric input + MB/GB select), Prune Now button
- On Prune Now: POST /api/recordings/rotation/prune → show result toast or inline feedback
- Cap input: store internally in MB or GB, convert to bytes before PUT

**Anti-Patterns to Avoid**
- **Rotating active captures:** Never rotate a recording whose `sessionName` is returned by `recordingCaptureService.isRecording()` — it has no `stopped_at` timestamp yet, so the query filter `WHERE stopped_at IS NOT NULL` protects against this automatically.
- **Deleting without the DB row cleanup first:** Always delete DB row after file unlink (or vice versa in a predictable order). File may not exist (edge case), but DB row must be cleaned to prevent phantom entries.
- **Skipping deletion_pending on restart:** If server crashes mid-rotation, rows with `deletion_pending = 1` will remain. On startup, the service should clean up any `deletion_pending` rows (attempt file delete + DB row delete) as part of initialization or first rotation run.
- **Routing order:** New literal endpoints (`/storage-stats`, `/rotation-config`, `/rotation/prune`) must be registered BEFORE `/:id` routes in `recordingRoutes.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled job runner | Custom cron system | `setInterval` (Node.js built-in) | InstanceTracker and SessionUsageReader already use this pattern — consistent with project |
| File size calculation | Walk filesystem with recursive stat | Query `SUM(file_size_bytes)` from SQLite | DB already tracks bytes via `finaliseRecording()`; filesystem walk is slow and risky |
| Playback session tracking | WebSocket session registry | HTTP content-serve is stateless; two-phase deletion provides sufficient grace | RecordingPlayer fetches content once, buffers in browser — no long-lived server state |

**Key insight:** `file_size_bytes` is already stored in the `recordings` table by `finaliseRecording()`. Storage accounting is a free DB query — no filesystem scanning needed.

---

## Common Pitfalls

### Pitfall 1: Rotating Recordings Being Actively Captured
**What goes wrong:** Rotation deletes the .cast file for a session that is still recording (frame buffer not yet written to disk). The next `stopRecording()` call attempts `writeAsciicastFile()` to a path that was just deleted — the write succeeds (creates a new file), but the DB row was already deleted, so the recording becomes an orphan file.
**Why it happens:** The rotation query looks at `file_size_bytes IS NOT NULL` but an active recording doesn't have `stopped_at` set, so it IS correctly excluded. However, if someone manually calls the prune endpoint while recording is active, the timing could create issues.
**How to avoid:** Filter by `stopped_at IS NOT NULL` in `getRotationCandidates()`. This ensures only completed recordings are ever considered. Additionally check `recordingCaptureService.isRecording(sessionName)` as a defense-in-depth guard.

### Pitfall 2: Express Route Ordering — Literal Path Before :id Param
**What goes wrong:** Express matches `/storage-stats` against `/:id` route and tries `parseInt('storage-stats', 10)` → NaN → 404.
**Why it happens:** Express evaluates routes in registration order; `:id` is greedy.
**How to avoid:** Register all four new literal-path endpoints before the `/:id` routes in `recordingRoutes.ts`. This is already documented in STATE.md from Phase 30 for `/auto-record-config`.
**Warning signs:** GET /api/recordings/storage-stats returns 404 "Recording not found" in testing.

### Pitfall 3: Orphaned deletion_pending Rows After Server Restart
**What goes wrong:** Server marks rows `deletion_pending = 1` then crashes before completing file deletion. On restart, those rows are in limbo — not deleted, but flagged.
**Why it happens:** Two-phase deletion is not atomic with the file system operation.
**How to avoid:** In `RecordingRotationService` startup/init (or at start of each `runRotation()`), first sweep any existing `deletion_pending` rows and complete their deletion. This is a cleanup-on-boot pattern.

### Pitfall 4: Cap in Bytes vs. UI in MB/GB
**What goes wrong:** User enters "500" thinking it's MB, but the value is stored/interpreted as bytes (very small cap), causing mass deletion.
**Why it happens:** Unit conversion mismatch between UI and storage.
**How to avoid:** Store cap in bytes in DB (integer, precise). UI always shows the unit label (MB or GB) and converts before PUT. Never store raw user input directly.

### Pitfall 5: fileSizeBytes null for Active Recordings
**What goes wrong:** An in-progress recording has `file_size_bytes = NULL` (set to null in `insertRecording`, only written in `finaliseRecording`). If included in SUM, it's ignored by COALESCE but the count is inflated.
**Why it happens:** Recording finalization happens asynchronously on stopRecording.
**How to avoid:** Use `WHERE stopped_at IS NOT NULL` in storage stats query — active recordings are excluded from both stats and rotation candidates.

---

## Code Examples

Verified patterns from codebase:

### Idempotent ALTER TABLE ADD COLUMN (from DatabaseConnection.ts lines 447-456)
```typescript
// Source: DatabaseConnection.ts existing migration pattern
try {
  this.db.exec('ALTER TABLE recordings ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — safe to ignore
}
```

### Single-Row Config Table with CHECK constraint (enforces at most one row)
```typescript
// New rotation_config table
this.db.exec(`
  CREATE TABLE IF NOT EXISTS rotation_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cap_bytes INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### Periodic Service Lifecycle (from InstanceTracker.ts pattern)
```typescript
// Pattern: start/stop with setInterval, same as InstanceTracker.startPeriodicSync()
startPeriodicRotation(): void {
  this.runRotation().catch(err => console.error('[RotationService] Initial rotation failed:', err));
  this.intervalHandle = setInterval(() => {
    void this.runRotation();
  }, this.CHECK_INTERVAL_MS);
}
```

### Storage Stats UI (format bytes, mirrors RecordingLibrary formatFileSize)
```typescript
// Already exists in RecordingLibrary.tsx — reuse formatFileSize()
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

### New API endpoint (mirrors auto-record-config endpoint placement)
```typescript
// Source: recordingRoutes.ts lines 30-35 (literal route before /:id)
// Must be placed BEFORE any /:id routes
recordingRoutes.get('/api/recordings/storage-stats', (_req, res) => {
  const stats = database.getStorageStats();
  const config = database.getRotationConfig();
  res.json({ ...stats, capBytes: config.capBytes });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual delete only (Phase 27) | Auto-prune with cap (Phase 31) | Phase 31 | Enables safe auto-record for production use |
| No `deletion_pending` flag | Two-phase deletion | Phase 31 | Safe concurrent playback during rotation |

**Deprecated/outdated:**
- Nothing deprecated; this phase extends the recordings table and routes.

---

## Open Questions

1. **What constitutes "active playback" for deletion safety?**
   - What we know: `RecordingPlayer.tsx` fetches `/api/recordings/:id/content` once and buffers the whole .cast file in the browser. There is no persistent server-side playback session. The HTTP response for a small recording completes in <100ms.
   - What's unclear: Whether a very large .cast file could be streamed and thus mid-stream when the file is deleted.
   - Recommendation: Currently `res.sendFile()` is used, which streams from disk. If the file is deleted mid-stream, the client may get a truncated response. The `deletion_pending` flag + grace window (next rotation cycle = 5 minutes later) ensures the file is never deleted while a recent content request was served. For additional safety, the `/content` route could return 404 early if `deletion_pending = 1`. This is LOW complexity and HIGH safety value — include it.

2. **Should rotation run on server startup?**
   - What we know: If auto-record ran while server was offline-then-back-online with a very small cap, the cap could already be exceeded.
   - What's unclear: Whether running rotation immediately on startup (before PTY sessions are re-attached) is safe.
   - Recommendation: Yes, run an initial rotation pass in `startPeriodicRotation()` — all PTYs are not yet attached on startup, and `recordingCaptureService.isRecording()` will return false for all sessions, so only completed recordings will be pruned. Safe to run immediately.

3. **What is a sensible default cap?**
   - What we know: 0 = disabled. Cap of 0 means rotation is opt-in.
   - Recommendation: Default = 0 (disabled). User must explicitly set a cap. Show "No cap set — auto-record may use unlimited disk" in the UI when cap is 0.

---

## Implementation Scope Summary

### Plan 31-01: Backend (RecordingRotationService + DB migration + REST endpoints)
1. DB migration: `rotation_config` table + `deletion_pending` column on `recordings`
2. New DB methods: `getRotationConfig`, `setRotationConfig`, `getStorageStats`, `getRotationCandidates`, `markDeletionPending`
3. New shared types: `RotationConfig`, `StorageStats`
4. `RecordingRotationService`: `runRotation()`, `startPeriodicRotation()`, `stopPeriodicRotation()`
5. 4 new REST endpoints in `recordingRoutes.ts` (before `/:id` routes)
6. Mount service in `server/index.ts` shutdown handler

### Plan 31-02: Frontend (Storage stats UI in RecordingLibrary)
1. Fetch `GET /api/recordings/storage-stats` on mount
2. New collapsible "Storage settings" panel in `RecordingLibrary.tsx`
3. Cap input (number field + MB/GB toggle) → PUT on change
4. Usage bar / usage text
5. "Prune now" button → POST + refresh recordings list

---

## Sources

### Primary (HIGH confidence)
- Project codebase (`/home/forge/warden.kingdom.lv/src/server/database/DatabaseConnection.ts`) — existing migration patterns, better-sqlite3 API usage
- Project codebase (`/home/forge/warden.kingdom.lv/src/server/services/RecordingCaptureService.ts`) — recording lifecycle, file path patterns
- Project codebase (`/home/forge/warden.kingdom.lv/src/server/routes/recordingRoutes.ts`) — route ordering, REST endpoint patterns
- Project codebase (`/home/forge/warden.kingdom.lv/src/client/components/RecordingLibrary.tsx`) — existing UI patterns for collapsible panels
- Project STATE.md — Phase 30 decisions (auto-record hook ordering, sparse row strategy, route placement)

### Secondary (MEDIUM confidence)
- SQLite `CHECK (id = 1)` constraint — standard SQLite technique for enforcing single-row tables; verified against SQLite documentation principles

### Tertiary (LOW confidence)
- None — all patterns derived directly from existing codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing project tools
- Architecture: HIGH — patterns directly mirror existing code (budget_config, InstanceTracker, auto-record-config)
- Pitfalls: HIGH — sourced from direct codebase reading plus Phase 30 STATE.md decisions
- UI patterns: HIGH — directly cloned from existing RecordingLibrary collapsible panel

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack; project-internal patterns don't expire)
