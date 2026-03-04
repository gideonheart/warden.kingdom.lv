# Phase 24: Session Recording & Replay - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Record any terminal session as a standard asciicast v2 file and replay it later at variable speed. Covers: recording capture backend, start/stop controls, replay player with speed controls, and a recording library. Does NOT include: scheduled/automatic recording, recording annotations, or sharing features.

</domain>

<decisions>
## Implementation Decisions

### Recording controls
- One-click to start recording — no naming dialog, auto-generate name from agent + timestamp
- One-click to stop — no confirmation step, recording saves immediately
- Auto-stop and save when tmux session ends, with a toast notification ("Recording stopped — session ended")
- Red pulse indicator in terminal view header + elapsed duration timer (e.g., "REC 02:34") visible while recording

### Replay player UX
- Full seek/scrub timeline bar — horizontal progress bar, click/drag to seek, shows elapsed/total time (standard video player feel like asciinema.org)
- Replay opens by replacing the terminal view in-place with a "back to live" / "close replay" button — not a modal or separate route
- Speed badge visible on controls showing current speed (e.g., "2x"), highlighted when not at 1x
- Full keyboard shortcuts: Space = play/pause, Left/Right = skip 5s, 1/2/4/8 keys = set speed

### Recording library layout
- New top-level view tab ("Recordings") alongside Terminals and History — first-class citizen in navigation
- Table rows: agent icon, name, project, date, duration, file size — sortable columns, consistent with existing session history pattern
- Simple chronological list with column sorting — no search bar or filters for v1
- Metadata only per row (no thumbnails or previews)

### Recording lifecycle
- No maximum recording duration — let recordings run indefinitely (asciicast v2 is text-based, compresses well)
- Manual delete only — recordings persist until operator explicitly deletes from library, delete button per recording
- Total size summary in library header: "12 recordings, 45 MB"
- Download button per recording — exports .cast file (standard asciicast v2, playable in asciinema player anywhere)

### Claude's Discretion
- Exact seek/skip increment for arrow keys (suggested 5s but open to tuning)
- Loading states and error handling in replay player
- Exact styling of timeline bar, speed controls, and recording indicator
- How to handle very large recordings in the replay player (buffering strategy)
- Database migration details for recordings table
- File naming scheme for .cast files on disk

</decisions>

<specifics>
## Specific Ideas

- Recording indicator should feel like a camera/screen recorder: red pulsing dot with elapsed time, unmistakable "you're recording" signal
- Replay player should feel like asciinema.org — familiar to anyone who's used asciicast players
- Table layout in library should match the existing session history view's visual language (same column patterns, row density)
- Download produces standard .cast files that work with `asciinema play` CLI and asciinema.org embed — full interop with the asciicast ecosystem

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-session-recording-replay*
*Context gathered: 2026-03-04*
