---
phase: 24-session-recording-replay
plan: 02
subsystem: ui
tags: [recording, asciicast, xterm, react, replay, timeline]

requires:
  - phase: 24-01
    provides: recording-capture-service, recording-rest-api, recordings-db-table, RecordingEntry type

provides:
  - useRecordingState hook with optimistic elapsed timer
  - REC button with red pulse indicator in TerminalView header
  - RecordingLibrary sortable table view with play/download/delete
  - RecordingPlayer with asciicast v2 parser, RAF playback engine, seek timeline, speed controls

affects: [App.tsx, TerminalView, recording-library-ui, recording-replay-ui]

tech-stack:
  added: []
  patterns: [raf-playback-loop, optimistic-recording-state, asciicast-v2-json-lines-parser, timeline-drag-seek]

key-files:
  created:
    - src/client/hooks/useRecordingState.ts
    - src/client/components/RecordingLibrary.tsx
    - src/client/components/RecordingPlayer.tsx
  modified:
    - src/client/components/TerminalView.tsx
    - src/client/App.tsx

key-decisions:
  - "useRecordingState uses optimistic local state with elapsed ticker — no polling, server call only on start/stop"
  - "RecordingPlayer uses requestAnimationFrame loop for playback — writes all frames up to current virtual time per tick, naturally handles any speed multiplier"
  - "seekTo() resets terminal and replays all frames from start to target time — ensures seek correctness at cost of full replay (acceptable for recording lengths)"
  - "RecordingLibrary only shows Play button for recordings with stoppedAt — prevents attempting to play still-recording sessions"
  - "Recordings nav tab renders RecordingPlayer inline (replacing RecordingLibrary) rather than as modal — consistent with plan spec"

patterns-established:
  - "RAF playback pattern: wallStart + virtualStart + speed multiplier to compute virtualTime, write frames while frameIndex.time <= virtualTime"
  - "Speed change pattern: snapshot virtualTime mid-play, cancel RAF, update speed ref, restart RAF from snapshot"

requirements-completed: [REC-02, REC-03, REC-04]

duration: 4min
completed: 2026-03-04
---

# Phase 24 Plan 02: Recording UI Layer Summary

**REC button with red pulse + elapsed timer in TerminalView, sortable RecordingLibrary tab with play/download/delete, and RecordingPlayer with asciicast v2 RAF playback, seek timeline, speed controls (1x/2x/4x/8x), and keyboard shortcuts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T08:59:18Z
- **Completed:** 2026-03-04T09:03:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- useRecordingState hook tracks recording state optimistically with server confirmation; elapsed ticker fires every second
- TerminalView header now shows REC button: red circle + "REC MM:SS" elapsed with pulse animation while recording, dimmed circle + "REC" label otherwise
- RecordingLibrary renders sortable table (agent, project, date, duration, size) with column sort indicators, N recordings / X MB header, play/download/delete per row (delete requires confirmation)
- RecordingPlayer parses asciicast v2 JSON Lines, drives xterm.js writes via RAF loop, supports seek/scrub timeline with drag, 1x/2x/4x/8x speed, Space/arrow/1248 keyboard shortcuts, Back to live button
- Recordings is a first-class nav tab in both desktop and mobile menus

## Task Commits

Each task was committed atomically:

1. **Task 1: useRecordingState hook + REC button in TerminalView header** - `9287c30` (feat)
2. **Task 2: RecordingLibrary, RecordingPlayer, and Recordings nav tab in App.tsx** - `35c79ce` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/client/hooks/useRecordingState.ts` - Hook managing recording start/stop/elapsed state with REST API calls
- `src/client/components/RecordingLibrary.tsx` - Recordings tab: sortable table, totals header, play/download/delete actions
- `src/client/components/RecordingPlayer.tsx` - Asciicast v2 replay player with xterm.js, RAF engine, timeline, speed controls
- `src/client/components/TerminalView.tsx` - Added recording props, useRecordingState hook, REC button in header
- `src/client/App.tsx` - Added 'recordings' AppView, RecordingLibrary/RecordingPlayer imports, Recordings nav buttons, inline player mount, recording props passed to TerminalView

## Decisions Made

- useRecordingState uses optimistic local state with elapsed ticker — no polling needed; server call only on start/stop
- RecordingPlayer uses requestAnimationFrame loop for playback, writes all frames up to current virtual time per tick, naturally handles any speed multiplier
- seekTo() resets terminal and replays all frames from start to target time — ensures correctness; full replay acceptable for session recording lengths
- RecordingLibrary only shows Play button for recordings with stoppedAt — prevents attempting to play still-active recordings
- Recordings nav tab renders RecordingPlayer inline (replacing RecordingLibrary content) rather than as modal — per plan spec

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
npm run typecheck   → clean (zero errors)
npm run build       → exit 0 (vite + tsc both succeeded)
```

## Self-Check

### Files Created
- [x] `src/client/hooks/useRecordingState.ts` — exists
- [x] `src/client/components/RecordingLibrary.tsx` — exists
- [x] `src/client/components/RecordingPlayer.tsx` — exists

### Files Modified
- [x] `src/client/components/TerminalView.tsx` — useRecordingState + REC button added
- [x] `src/client/App.tsx` — recordings view, nav tab, TerminalView props

### Commits
- [x] 9287c30 — feat(24-02): add useRecordingState hook and REC button with pulse indicator in TerminalView header
- [x] 35c79ce — feat(24-02): add RecordingLibrary, RecordingPlayer, and Recordings nav tab in App.tsx

## Next Phase Readiness

- Phase 24 Plans 01 and 02 complete — full recording and replay pipeline operational
- Plan 03 (if any) can build on the library and player components
- RecordingLibrary's `refreshKey` prop and `onRecordingComplete` callback are wired — library auto-refreshes when a recording completes

---
*Phase: 24-session-recording-replay*
*Completed: 2026-03-04*
