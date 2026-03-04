# Pitfalls Research

**Domain:** Adding mobile toolbar fixes, auto-record triggers, storage rotation, and clickable history to existing Warden dashboard (v3.2)
**Researched:** 2026-03-04
**Confidence:** HIGH — based on reading full codebase + cross-referencing xterm.js issue tracker, MDN, prior phase research

---

## Critical Pitfalls

### Pitfall 1: iOS Safari Dismisses Soft Keyboard When Toolbar Button Is Tapped

**What goes wrong:**
Tapping any toolbar button (Tab, Ctrl+C, arrows, the new Enter button) collapses the iOS soft keyboard. No amount of `terminal.focus()` in the button handler brings it back. The operator expects to tap a key, the input is sent, and the keyboard stays open for continued typing. Instead, the keyboard disappears and they must tap the terminal area again to restore it — making the toolbar nearly unusable on iPhone.

**Why it happens:**
iOS Safari only shows the soft keyboard in response to a trusted user gesture on a focusable element. xterm.js receives input through a hidden `<textarea class="xterm-helper-textarea">` positioned off-screen. When a toolbar button is tapped:

1. The browser briefly transfers focus to the button (keyboard starts to close)
2. The button's `onTouchStart` handler fires with `event.preventDefault()` (prevents the click, prevents default refocus)
3. The handler calls `sendInput(seq)` and then `terminal.focus()` to restore focus

The problem is that `terminal.focus()` routes through xterm.js's internal focus dispatch, which ends up calling `.focus()` on the terminal container `<div>` — not the `xterm-helper-textarea` directly. iOS requires the `<textarea>` itself to be focused synchronously within the original gesture event to keep the keyboard open. Calling `focus()` on a div, or after any async hop, does not satisfy this requirement.

**How to avoid:**
Access `terminal.textarea` directly (xterm.js 5 exposes it as a public getter on `Terminal`) and call `.focus()` synchronously inside the same `onTouchStart` handler, before any other action:

```typescript
// MobileKeyToolbar receives terminalRef: React.MutableRefObject<Terminal | null>
onTouchStart={(event) => {
  event.preventDefault();
  // Focus the xterm hidden textarea synchronously — this is the iOS-compatible path
  terminalRef.current?.textarea?.focus();
  sendInput(key.seq);
}}
```

The `terminalRef` must be passed from `TerminalView` where `terminalInstanceRef.current` is accessible. This is a one-line addition to each button in `MobileKeyToolbar`. The `terminal.textarea` property is `HTMLTextAreaElement | undefined` — check for existence before calling `.focus()`.

Do NOT use `requestAnimationFrame` or `setTimeout` wrappers — any async hop breaks the iOS user-gesture requirement.

**Warning signs:**
- Keyboard collapses after tapping any toolbar button on a real iPhone (not simulator — simulator behaves differently)
- Android works fine, only iOS exhibits the issue
- `terminal.focus()` called in console shows no keyboard effect on iOS

**Phase to address:**
Phase covering mobile toolbar Enter button and keyboard persistence (first phase of v3.2). Include this in acceptance criteria: "after tapping Tab/Ctrl+C/arrows/Enter buttons on iOS, the keyboard remains visible."

---

### Pitfall 2: Auto-Record Trigger Races the PTY onData Registration

**What goes wrong:**
When auto-record is configured to start on session creation, the recording start call reaches `RecordingCaptureService.startRecording()` before the PTY's `onData` callback is producing output. The first seconds of terminal output are dropped from the recording because `captureOutput()` is wired after `startRecording()` registers the session name in `activeRecordings` — but the PTY itself may not exist yet if no browser client has connected.

A more serious variant: auto-record is triggered from an external event (e.g. InstanceTracker detecting a new tmux session). At that moment, no Socket.IO client is connected, so no PTY exists in `TerminalStreamService`. The recording DB entry is created, `activeRecordings.set(sessionName, ...)` is called, but `captureOutput()` is never invoked because there is no PTY `onData` tap. When the client eventually connects and the PTY spawns, the 30-second keep-alive timer has not yet fired, but recording state is inconsistent — `isRecording()` returns true but the `frameBuffer` is empty. When the session ends, a 0-byte asciicast file is written to disk.

**Why it happens:**
`RecordingCaptureService` and `TerminalStreamService` are decoupled by design — capture is a "tap" on the PTY output stream. The tap only exists while a PTY is running. Auto-record triggered before PTY existence has no output channel.

Looking at `TerminalStreamService.attachSocketToSession()`: the sequence is:
1. `socket.emit('terminal:reset')` — signal client to clear display
2. `pty.spawn(...)` — create PTY process
3. `ptyProcess.onData(...)` — register output tap (includes `captureOutput()` call)

Any recording started before step 3 completes will miss all output produced in that window.

**How to avoid:**
Tie auto-record start to the PTY spawn event, not to the tmux session detection event. The only correct hook is inside `TerminalStreamService.attachSocketToSession()`, immediately after `ptyProcess.onData()` is registered:

```typescript
// In TerminalStreamService, after onData tap is live:
ptyProcess.onData((terminalOutput: string) => {
  // Broadcast to subscribers...
  recordingCaptureService.captureOutput(session.sessionName, terminalOutput);
});

// Auto-record: check config AFTER onData is live — no race window
if (shouldAutoRecord(params.sessionName)) {
  recordingCaptureService.startRecordingIfNotActive({
    sessionName: params.sessionName,
    cols: params.cols,
    rows: params.rows,
    agentId: ...,
    agentName: ...,
    projectPath: ...,
  });
}
```

The `startRecordingIfNotActive()` method is a guard-wrapped version of `startRecording()` that no-ops if already recording.

Do NOT trigger auto-record from:
- `InstanceTracker` poll callbacks (no PTY guarantee)
- Socket.IO connection event before PTY spawn completes
- Any code path outside `TerminalStreamService`

**Warning signs:**
- Auto-recordings in the library show 0 bytes or 0 seconds duration
- Replaying an auto-recording shows a blank terminal for the first 5-30 seconds
- `stop_reason = 'session_ended'` in DB but `duration_secs = 0`

**Phase to address:**
Auto-record feature phase. Acceptance criteria must include: "replay of auto-recorded session shows output from the first second of the session."

---

### Pitfall 3: Storage Rotation Deletes Files Being Streamed for Playback

**What goes wrong:**
The storage rotation job identifies `.cast` files exceeding the cap (oldest first, or by total directory size) and calls `fs.unlinkSync()` on them. At the same moment, another request is streaming the same file via `GET /api/recordings/:id/content` → `res.sendFile(entry.filePath)`. Express `sendFile` opens a file descriptor and streams chunks. On Linux, unlinking a file while it has an open fd allows the data to continue reading (the inode is not freed until all fds close), but the DB row is deleted atomically with the file — subsequent requests fail with 404 even though the player might still be mid-stream.

More critically: if rotation runs `database.deleteRecording(id)` BEFORE `fs.unlink()`, the DB entry is gone but the file persists on disk as an orphan. The opposite order (file deleted first, then DB row) causes the content route to return 404 for in-flight requests.

**Why it happens:**
`deleteRecording()` currently does both operations in sequence (delete DB row, then delete file) without any concurrency guard. The `recordingRoutes.ts` `DELETE /api/recordings/:id` handler mirrors this. Rotation would use the same path. There is no locking between the rotation writer and the content reader.

**How to avoid:**
Two-phase deletion:

1. Add a `deletion_pending INTEGER DEFAULT 0` column to the `recordings` table.
2. Rotation marks candidates as `deletion_pending = 1` first (one SQL UPDATE, fast).
3. The `/api/recordings/:id/content` route checks `deletion_pending` and returns `410 Gone` immediately for marked recordings — preventing new file descriptor opens.
4. Rotation then deletes the file (async `fs.promises.unlink()`) and removes the DB row after a brief delay (next rotation cycle or a `setTimeout(5000)`).

```typescript
// In rotation job:
database.markRecordingForDeletion(recordingId);  // sets deletion_pending = 1

// 5s later (or next cycle):
const entry = database.findRecordingById(recordingId);
if (entry?.deletionPending) {
  await fs.promises.unlink(entry.filePath).catch(() => {});
  database.deleteRecording(recordingId);
}
```

Additionally, never call rotation on sessions currently in `recordingCaptureService.activeRecordings` — those files are actively being written.

**Warning signs:**
- Recording player shows partial content or blank terminal mid-playback
- Server logs show `ENOENT` errors from `res.sendFile`
- DB has `deletion_pending = 1` rows that never get cleaned up (rotation incomplete)

**Phase to address:**
Storage rotation phase. Must be spec'd before any file deletion is implemented.

---

### Pitfall 4: Clickable History Rows Navigate to Terminals View for Non-Existent Sessions

**What goes wrong:**
The operator clicks a session row in `SessionHistory`. The history table (`/api/history/sessions`) returns all historical sessions, including those with `status: stopped` from months ago. The click handler calls `selectSession(tmuxSessionName)` + `setCurrentView('terminals')`. But `useSessionSelection` validates the selection against `activeInstances`, which only includes sessions passing the 30-minute retention filter. For sessions older than 30 minutes, the session name is not in `activeInstances`. The selection falls back to the first active instance (hysteresis behavior in `useSessionSelection`). The operator lands on the Terminals view watching a completely different session — no error, no explanation.

**Why it happens:**
`SessionHistory` was built as a display-only list. Navigation was added as a later feature request but the session validity check was not added. `useSessionSelection` treats unknown session names as invalid and silently substitutes the first valid session. This "smart fallback" is correct for polling races but wrong for deliberate user navigation to a historical session.

**How to avoid:**
Before calling `selectSession()`, inspect the session:

1. Is it in `activeInstances` (status active/idle/stopping/starting, or stopped within 30 min)? → Navigate to Terminals view, select that session.
2. Does it have a completed recording in the recordings table? → Navigate to Recordings view and auto-open the player.
3. Neither? → Show a toast "Session ended [timestamp], no recording available" and stay on History view.

This requires the history API to return recording metadata per session, or a second lightweight fetch. Add a `recordingId` field to the history query result (LEFT JOIN on recordings table by session_name).

```typescript
// In SessionHistory row click handler:
const handleRowClick = (session: AgentInstance) => {
  const isActive = activeInstances.some(i => i.tmuxSessionName === session.tmuxSessionName);
  if (isActive) {
    onNavigateToSession(session.tmuxSessionName);
    return;
  }
  if (session.recordingId) {
    onNavigateToRecording(session.recordingId);
    return;
  }
  // Show informative toast — do not navigate
  showToast(`Session ended ${formatRelative(session.lastActiveAt)}, no recording available`);
};
```

**Warning signs:**
- Clicking a stopped session row navigates to Terminals but displays a different session
- No visual distinction between clickable (has terminal/recording) and non-clickable rows
- `cursor: pointer` on all rows regardless of availability

**Phase to address:**
Clickable history sessions phase. History query must be updated to include `recordingId` in the response before the UI is built.

---

### Pitfall 5: In-Memory Frame Buffer Grows Unbounded During Long Agent Sessions

**What goes wrong:**
`RecordingCaptureService` accumulates all PTY output in `frameBuffer: Array<[number, string]>` until `stopRecording()` is called. Claude Code sessions can run for 4-12 hours. During active file editing or npm install operations, PTY output can reach 50-200KB/minute. A 4-hour session generates approximately:

- Low activity: 50KB/min × 240min = ~12MB per recording
- High activity (builds, file writes): 200KB/min × 240min = ~48MB per recording

With 5 agents all auto-recording simultaneously (the intended auto-record use case), this creates 60-240MB of heap pressure that is never garbage-collected until each session ends. On the production Ubuntu server with `node --max-old-space-size` at its default 1.5GB, this is manageable today but becomes a production risk as sessions lengthen.

**Why it happens:**
The in-memory buffer was chosen for simplicity: "no intermediate disk writes, full asciicast v2 on stop." This is noted in `PROJECT.md` decision table as "Good — clean files, no partial writes." It is correct for manually-triggered recordings of bounded length. Auto-record changes the assumption: sessions are now long-running without operator intervention.

**How to avoid:**
Add a frame buffer size warning threshold. When `frameBuffer` exceeds 50MB (estimated via `frameBuffer.length * avgFrameSize`), emit a server log warning. Do not implement streaming write in v3.2 — it is a significant refactor — but add monitoring:

```typescript
// In captureOutput(), after push:
if (recording.frameBuffer.length % 10_000 === 0) {
  const estimatedMB = recording.frameBuffer.length * 200 / 1_000_000; // rough estimate
  if (estimatedMB > 50) {
    console.warn(`[RecordingCapture] Large frame buffer for ${sessionName}: ~${estimatedMB.toFixed(0)}MB`);
  }
}
```

For v3.2, document this as a known limitation. For v3.3+, implement streaming write mode (append to file as frames arrive, write final header on stop).

Also: auto-record should default to `false` (opt-in), not `true`, to prevent accidental 12-hour recordings eating all available heap.

**Warning signs:**
- Node.js process RSS grows steadily and never drops while sessions are active
- `process.memoryUsage().heapUsed` exceeds 500MB during multi-agent recording
- Server OOM-killed or becomes unresponsive after 6+ hours of auto-recording

**Phase to address:**
Auto-record phase (add size warning) and storage rotation phase (add hard cap or streaming write for v3.3 planning note).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory frame buffer for all recordings | No intermediate disk I/O, clean final files | 50-240MB heap growth per 4-hour session; OOM risk with 5+ auto-recording agents | Acceptable now for manual recordings; not for auto-record without buffer cap |
| Auto-record config in memory only (not SQLite) | Simple to implement | Config lost on server restart; operator must re-enable after every deployment | Never acceptable for production; persist to SQLite from day one |
| `fs.unlinkSync()` for rotation deletion | Synchronous, simple | Blocks event loop; fails silently on concurrent read; no recovery path | Never — use `fs.promises.unlink()` and two-phase deletion |
| `IS_TOUCH_DEVICE` module-load detection | No per-render overhead | Fails for Surface/hybrid devices; cannot change at runtime | Acceptable — single-operator, consistent environment |
| History query with no recording join | Simple initial implementation | Row click navigation cannot distinguish "has recording" from "no recording" | Never acceptable if clickable rows are a feature — join must be in initial query |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| xterm.js `terminal.textarea` (mobile keyboard) | Calling `terminal.focus()` to restore keyboard after button tap | Access `terminal.textarea` directly and call `.focus()` synchronously in `onTouchStart`; `terminal.focus()` dispatches to a container div — insufficient for iOS keyboard |
| `RecordingCaptureService` auto-record trigger | Triggering from `InstanceTracker` poll or Socket.IO connection event | Only trigger from inside `TerminalStreamService.attachSocketToSession()` after `ptyProcess.onData()` is registered — no race window |
| Storage rotation + active recordings | Running rotation scan over `data/recordings/` including actively-written files | Exclude sessions where `recordingCaptureService.isRecording(sessionName) === true` from deletion candidates |
| Storage rotation + concurrent playback | Deleting file while client is streaming | Use `deletion_pending` flag in DB; content route returns 410 if flag is set; actual file deletion deferred |
| `SessionHistory` + `useSessionSelection` | Passing session name of a stopped/old session to `selectSession()` | Check session existence in `activeInstances` and recording availability before deciding navigation target |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `frameBuffer` unbounded growth | Node.js heap grows ~50-200KB/min per auto-recording session; server becomes slow or OOM after hours | Add 50MB warning log; document limit; implement streaming write in future milestone | With 5 agents auto-recording for 4+ hours simultaneously |
| `fs.readdirSync` + `fs.statSync` in rotation loop | Event loop blocked 50-200ms when `data/recordings/` has 1000+ files | Use `fs.promises.readdir()` + `fs.promises.stat()` async throughout; add overlap-prevention flag to prevent concurrent rotation runs | Directory exceeds ~500 files (~each 30-minute session = 1 file; 500 days of daily auto-recording) |
| `listRecordings()` with no pagination | `RecordingLibrary` renders all rows; mobile browser sluggish at 200+ recordings | Add `LIMIT/OFFSET` to `listRecordings()` + pagination to `RecordingLibrary` before hitting production volume | At ~100-200 recordings on mobile |
| Storage size check via `SUM(file_size_bytes)` SQL | Slightly stale — value frozen at recording-stop time | This is acceptable for rotation decisions; document that active recording sizes are excluded from the sum | Never a correctness problem; just a documentation note |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Enter button sends `\r` not `\r\n` | Enter does nothing in some CLIs (Python REPL, some shells) | Send `\r` — PTY normalizes it to the appropriate line ending; but test with bash, Python, and vim explicitly before shipping |
| Auto-record indicator not visible from History/Recordings view | Operator navigates away, doesn't realize recording is running, cannot stop it | Add a global recording badge in the page header (like the budget alert dot) when any session is actively recording |
| Storage cap prunes recordings operator wanted to keep | Operator loses a critical debug session to rotation | Add a "pin" flag per recording before implementing auto-prune; auto-prune only removes unpinned recordings |
| All history rows appear clickable but most lead nowhere | Operator clicks frequently, gets "no terminal" result, loses trust | Style rows with `cursor: pointer` only when a terminal or recording is available; others `cursor: default` + grayed appearance |
| Font size change mid-recording alters terminal dimensions | Replay shows layout shift at arbitrary timestamp | Warn "Changing font size may affect recording layout" while a recording is active, or disable the font size button during recording |

---

## "Looks Done But Isn't" Checklist

- [ ] **Enter button:** Test `\r` works with bash readline, Python interactive, and vim insert mode. On a real iOS device: tap Enter, keyboard stays open, `\n` appears in terminal.
- [ ] **Mobile keyboard persistence:** Test on real iPhone (not Simulator). Sequence: tap Tab, type a character without re-tapping terminal. Keyboard must remain visible throughout.
- [ ] **Clickable history rows:** Click a session stopped 45 minutes ago (outside 30-minute retention). Verify outcome is either: recording player opens, or toast explains "no recording available" — NOT a silent redirect to a different session.
- [ ] **Auto-record first frame:** Start a session with auto-record enabled. Stop it after 5 seconds. Replay — the very first line of PTY output must be present.
- [ ] **Auto-record persists across restart:** Restart the Node.js server. Confirm auto-record config is restored from SQLite.
- [ ] **Rotation vs. active recording:** Trigger rotation while an active recording is running. Confirm the active recording is NOT deleted. Verify `isRecording()` guard is in the rotation code path.
- [ ] **Rotation vs. concurrent playback:** Open a recording in the player, then trigger rotation that would delete it. Player either completes or shows graceful "recording deleted" error — not a blank screen crash.
- [ ] **Recording library pagination:** Seed or accumulate 50+ recordings. Confirm library renders and scrolls without browser lag on mobile.
- [ ] **Global auto-record indicator:** Start auto-recording, navigate to History view. Confirm a visible indicator exists that recording is active somewhere in the header.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| iOS keyboard dismissal on button tap | LOW | Add `terminal.textarea?.focus()` call synchronously in each toolbar button's `onTouchStart`; one line per button, no architecture change |
| Auto-record race (missing first frames) | MEDIUM | Move trigger inside `TerminalStreamService.attachSocketToSession()` after `onData` is registered; requires modifying two files |
| Rotation deletes in-use file (player crash) | LOW | Add `deletion_pending` column (one migration); update content route to check flag; defer actual deletion |
| Orphaned recordings (no frames, never stopped) | LOW | Add cleanup job: `recordings WHERE stoppedAt IS NULL AND startedAt < NOW - 2 hours` → auto-stop with `stop_reason = 'orphaned'`; write empty asciicast |
| History navigation to unavailable session | LOW | Client-side only; check `activeInstances` + `recordingId` in click handler before calling `selectSession()` |
| Frame buffer OOM with long auto-recording | HIGH | Requires streaming write mode refactor for `RecordingCaptureService`; mitigate in v3.2 with buffer size warning + 50MB soft cap that stops recording |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| iOS keyboard dismissal on button tap | Mobile toolbar phase (keyboard persistence) | Real iPhone test: tap toolbar button, keyboard stays open |
| Auto-record race (missing first frames) | Auto-record feature phase | Replay 5-second auto-recording, confirm first line of output present |
| Rotation deletes in-use file | Storage rotation phase | Concurrent playback + rotation manual test; no ENOENT in server logs |
| History navigation to unavailable session | Clickable history sessions phase | Click 45-min-old stopped session; verify recording player or explanatory toast |
| Frame buffer OOM | Auto-record phase | Monitor heap during 1-hour auto-recorded session; warning logged at 50MB |
| Auto-record config lost on restart | Auto-record phase | Restart server, verify auto-record setting is preserved in SQLite |
| Rotation deletes active recording | Storage rotation phase | Rotation code checked for `isRecording()` guard; automated assertion or code review |

---

## Sources

- xterm.js issue #1101 "Support mobile platforms" — https://github.com/xtermjs/xterm.js/issues/1101 (iOS keyboard behavior, hidden textarea mechanism)
- xterm.js issue #2403 "Accommodate predictive keyboard on mobile" — https://github.com/xtermjs/xterm.js/issues/2403
- xterm.js discussion #5227 "Allow selection without focusing for input?" — https://github.com/xtermjs/xterm.js/discussions/5227
- MDN: VisualViewport API — https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- Apple WebKit bug #195884 "Autofocus on text input does not show keyboard" — https://bugs.webkit.org/show_bug.cgi?id=195884
- iOS Safari focus() constraints (Tommy Brunn, Medium) — https://medium.com/@brunn/autofocus-in-ios-safari-458215514a5f
- Mobiscroll: Annoying iOS Safari input issues with workarounds — https://blog.mobiscroll.com/annoying-ios-safari-input-issues-with-workarounds/
- Prior Warden phase research: `.planning/phases/11.1-fix-tmux-visibility-when-mobile-keyboard-opens/11.1-RESEARCH.md` (HIGH confidence, 2026-02-17)
- Codebase: `src/server/services/RecordingCaptureService.ts` — in-memory frame buffer, `captureOutput()` tap
- Codebase: `src/server/services/TerminalStreamService.ts` — PTY spawn sequence, `onData` registration order
- Codebase: `src/client/components/TerminalView.tsx` — `MobileKeyToolbar`, `IS_TOUCH_DEVICE`, current `onTouchStart` pattern
- Codebase: `src/client/components/SessionHistory.tsx` — no recording join in current history query
- Codebase: `src/client/App.tsx` — `useSessionSelection` validation against `activeInstances`, hash-based navigation

---
*Pitfalls research for: v3.2 Mobile Operations & UX Polish (mobile toolbar, auto-record, storage rotation, clickable history)*
*Researched: 2026-03-04*
*Confidence: HIGH — full codebase read + cross-referenced with xterm.js issue tracker, MDN, prior phase research*
