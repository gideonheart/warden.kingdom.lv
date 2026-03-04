---
phase: 30-auto-record-per-agent
plan: "02"
subsystem: fullstack
tags: [recordings, auto-record, terminal-stream, react, socket.io]
dependency_graph:
  requires: [30-01]
  provides: [auto-record PTY hook, useRecordingState mount-sync, RecordingLibrary toggle UI]
  affects:
    - src/server/services/TerminalStreamService.ts
    - src/client/hooks/useRecordingState.ts
    - src/client/components/RecordingLibrary.tsx
tech_stack:
  added: []
  patterns: [PTY lifecycle hook, mount-time fetch sync, collapsible settings panel, sparse-toggle UI]
key_files:
  created: []
  modified:
    - src/server/services/TerminalStreamService.ts
    - src/client/hooks/useRecordingState.ts
    - src/client/components/RecordingLibrary.tsx
decisions:
  - "Auto-record hook placed after ptyProcess.onData() and ptyProcess.onExit() registration — ensures captureOutput tap is wired before startRecording is called, preventing missed first frames"
  - "Hook placed in fresh PTY spawn branch only (not reuse-existing-PTY branch) — auto-record fires exactly once per PTY lifecycle"
  - "tickerRef.current guard in mount-time fetch prevents overwriting existing recording state if user manually started recording before the fetch resolves"
  - "Auto-record settings section defaults to collapsed (showAutoRecordSettings=false) so it does not overwhelm the recordings table"
metrics:
  duration: "2 minutes"
  completed: "2026-03-04"
  tasks: 2
  files_modified: 3
requirements_satisfied: [REC-05, REC-06]
---

# Phase 30 Plan 02: Auto-Record Hook and Toggle UI Summary

**One-liner:** Auto-record hook wired into fresh PTY spawn after onData registration, with mount-time REC indicator sync and collapsible per-agent toggle UI in RecordingLibrary.

## What Was Built

### Auto-Record Hook in TerminalStreamService (`src/server/services/TerminalStreamService.ts`)

Added `database` import and an auto-record hook in the fresh PTY spawn branch of `attachSocketToSession()`.

**Placement:** After `ptyProcess.onData()` and `ptyProcess.onExit()` registration, before `setupSocketInputHandlers()`. This ensures:
- The `captureOutput` tap (inside `onData`) is registered before `startRecording()` is called
- No first-frame race condition — all output from the first event-loop tick is captured
- Hook fires only on fresh PTY spawn (not the `if (existing && existing.isAlive)` reuse branch)

```typescript
const instanceForAutoRecord = database.findInstanceBySessionName(sessionName);
if (instanceForAutoRecord && database.isAutoRecordEnabled(instanceForAutoRecord.agentId)) {
  if (!recordingCaptureService.isRecording(sessionName)) {
    recordingCaptureService.startRecording({ sessionName, agentId, agentName, projectPath, cols, rows });
  }
}
```

If `findInstanceBySessionName` returns null (session not yet in DB), the hook is a silent no-op.

### Mount-Time Recording Sync in useRecordingState (`src/client/hooks/useRecordingState.ts`)

Added a new `useEffect` that fetches `/api/recordings/active` on component mount and syncs the REC indicator for auto-started recordings.

```typescript
useEffect(() => {
  void fetch('/api/recordings/active')
    .then(r => r.json())
    .then((active) => {
      const found = active.find(a => a.sessionName === sessionName);
      if (found && !tickerRef.current) {
        setRecordingId(found.recordingId);
        setIsRecording(true);
        // ... start elapsed ticker
      }
    })
    .catch(() => { /* non-fatal */ });
}, [sessionName]);
```

The `!tickerRef.current` guard prevents overwriting state if user manually started a recording before the fetch completes.

### Per-Agent Auto-Record Toggle UI in RecordingLibrary (`src/client/components/RecordingLibrary.tsx`)

Added a collapsible "Auto-record settings" section between the library header bar and the recordings table.

**State variables added:**
- `autoRecordAgentIds: Set<string>` — set of agentIds with auto-record enabled
- `agents: Array<{ id: string; name: string }>` — agent list from `/api/agents`
- `showAutoRecordSettings: boolean` — controls collapse state (defaults to `false`)

**Data fetching:** On mount, fetches both `/api/agents` and `/api/recordings/auto-record-config` in parallel.

**Toggle handler:** `handleToggleAutoRecord(agentId)` calls `PUT /api/recordings/auto-record-config/:agentId` and updates local state optimistically.

**Visual design:**
- Toggle uses `bg-red-500/70` (enabled, matching REC indicator color) / `bg-warden-border` (disabled)
- Per-agent "REC" badge appears when auto-record is enabled
- Section collapsed by default — does not overwhelm primary recordings table
- Uses warden-* color tokens throughout

## Verification Results

- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds (vite client build + tsc server build)
- Auto-record hook placed after onData registration in fresh PTY spawn branch — first frame captured
- Hook does NOT fire in reuse-existing-PTY branch
- useRecordingState syncs with active recordings on mount
- RecordingLibrary shows collapsible per-agent toggle section
- Toggle persists via PUT /api/recordings/auto-record-config/:agentId

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `/home/forge/warden.kingdom.lv/src/server/services/TerminalStreamService.ts` — database import + auto-record hook present, positioned after onData/onExit, before setupSocketInputHandlers
- `/home/forge/warden.kingdom.lv/src/client/hooks/useRecordingState.ts` — mount-time fetch useEffect present with tickerRef guard
- `/home/forge/warden.kingdom.lv/src/client/components/RecordingLibrary.tsx` — auto-record state, useEffect, handleToggleAutoRecord, and collapsible section all present
- Commit `b503c0d` — Task 1 (TerminalStreamService hook + useRecordingState sync)
- Commit `a87c9af` — Task 2 (RecordingLibrary toggle UI)
