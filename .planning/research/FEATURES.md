# Feature Research

**Domain:** Mobile terminal UX improvements, auto-record triggers, storage rotation, history navigation — v3.2 milestone additions to Warden Dashboard
**Researched:** 2026-03-04
**Confidence:** HIGH (all features scoped to known codebase; patterns verified against xterm.js issues, mobile web UX literature, and existing implementation code)

---

## Context: What Already Exists

These features are ADDITIVE to a shipping product. The following are already complete and must not be rebuilt:

- MobileKeyToolbar with Copy/Paste/Esc/Tab/arrows/PgUp/PgDn buttons (using `onTouchStart` + `event.preventDefault()` pattern)
- MobilePromptSheet bottom sheet for prompt injection on mobile
- Session recording in asciicast v2 format with in-memory frame buffer
- Recording library with sort, delete, download, and play actions
- Recording player with variable-speed replay (1x/2x/4x/8x)
- SessionHistory component with agent/status/date filters and pagination
- HistoryView with desktop tabs and mobile accordion layout
- EventsTab with source/session filtering and expandable rows
- `onNavigateToSession` prop stub already wired into HistoryView (currently unused)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the operator expects to exist. Missing these makes the product feel broken for daily mobile use.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Enter key in mobile toolbar | Every mobile terminal app (Termius, NewTerm, Blink Shell) includes an Enter button; operators cannot submit commands without it | LOW | Add `{ label: 'Enter', seq: '\r' }` to the `MOBILE_KEYS` array in TerminalView.tsx — one-line change to existing data structure |
| Keyboard stays open after toolbar button tap | Tapping a toolbar button blurs the xterm textarea, closing the soft keyboard; without a fix every key tap requires a re-tap on the terminal to re-open the keyboard | MEDIUM | `onTouchStart` + `event.preventDefault()` already prevents the native tap-to-blur on button press; what is missing is re-focusing the terminal textarea after `sendInput` so the PTY stays keyboard-connected. Pattern: `requestAnimationFrame(() => terminal.focus())` after sendInput |
| Clickable history session rows | Rows in SessionHistory show session data but clicking does nothing — the UI looks interactive but isn't | MEDIUM | Add `cursor-pointer` + hover affordance + chevron icon; active sessions navigate to Terminals tab selecting that session; stopped sessions with a recording open the Recording Player; stopped sessions without a recording show a brief toast |
| Storage cap with auto-prune | Without a cap, recording files grow unbounded on a single-server deployment with no managed storage | MEDIUM | Two-axis policy: (1) max total storage bytes, (2) max recording age in days. Delete oldest `stopped_at` recordings first. Run on server start and after each `stopRecording()` call |
| Auto-record on session start | Manual REC toggle is forgotten; sessions of operational interest go unrecorded unless the operator remembers to click REC for every session | MEDIUM | Per-agent boolean flag in `openclaw.json`. When InstanceTracker discovers a new session for an agent with auto-record enabled, TerminalStreamService calls `recordingCaptureService.startRecording()` at PTY spawn time. Deferred from v3.1 as REC-05 |

### Differentiators (Competitive Advantage)

Features that go beyond standard terminal dashboard behaviour and are specific to Warden's operator context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| History row navigates to recording replay | Closes the loop between "what happened in that session" and "let me watch it" — one tap from history to playback | MEDIUM | Requires SessionHistory to receive `onPlayRecording` callback; RecordingLibrary already supports `onPlayRecording`; need to join sessions to recordings by `tmux_session_name` in history API response |
| Auto-record per agent ("always" trigger) | Zero-friction audit trail — every session for a configured agent is recorded without operator action | MEDIUM | Config in `openclaw.json` per agent; triggers from InstanceTracker discovery path; no client UI changes needed for the auto-start itself |
| Storage rotation UI in RecordingLibrary | Shows current usage vs cap with a visual indicator and a "Prune now" button | LOW | Adds a header strip: "X recordings, Y MB of Z GB cap". Prune button calls `POST /api/recordings/prune`. Operator sees storage health without SSHing into the server |
| Events tab row click navigates to terminal | EventsTab rows show session names; clicking navigates to that terminal, reducing manual tab-switching during investigation | LOW | Same pattern as clickable history rows; EventsTab already has `selectedSession` state; just add a click handler and accept an `onNavigateToSession` prop |
| Auto-record trigger on permission prompt | Record only the interesting moments — saves disk vs always-on per agent | HIGH | Requires permission-prompt detection (exists via detectAgentState()) to emit an event that RecordingCaptureService subscribes to; complex interaction with existing recording state; defer to v3.3 unless trivial to hook in |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Floating keyboard toolbar (InputAccessoryView-style) | Native iOS terminal apps use it; feels more polished | Web browsers do not support inputAccessoryView outside React Native; position:fixed above the keyboard leads to iOS Safari layout bugs (visualViewport resize events unreliable during keyboard transitions, safe-area insets shift mid-animation) | Keep the existing `sticky bottom-0` toolbar — it is already working and tested; just fix the focus-loss bug |
| Auto-record with video output (pixel-perfect) | Operators want to share recordings externally | Video encoding (ffmpeg) is a heavy server-side dependency, complex to manage, and produces large files; asciicast v2 captures all terminal output faithfully | asciicast v2 is the right format for terminal sessions; use asciinema player for external sharing if needed |
| Per-session storage quota | Prevents any one long session from consuming all space | Individual session recordings are naturally bounded by session duration; the total-size cap already solves runaway growth without per-session complexity | Max total size + max age policy is sufficient; prune oldest-first |
| Real-time auto-delete during an active recording | Prevent disk overflow immediately | Risk of deleting a file the operator is currently watching in the Recording Player; also creates a race condition if pruning runs while `stopRecording()` is writing a file | Run pruning only at safe synchronisation points: server start, after `stopRecording()` completes, and on explicit "Prune now" operator action |
| Haptic feedback on mobile toolbar button tap | Mobile terminal apps on Android provide haptic feedback | Web Vibration API is blocked on iOS Safari; Android support is inconsistent and opt-in per browser; adds complexity for zero benefit on the primary iOS target | Skip entirely — focus on functional behaviour |

---

## Feature Dependencies

```
[Enter button in toolbar]
    (standalone — no external dependencies)
    └──enhances──> [Keyboard persistence fix] (Enter button benefits from same re-focus fix)

[Keyboard persistence after toolbar tap]
    └──requires──> [refocusTerminal callback prop from TerminalViewInner to MobileKeyToolbar]
    └──applies to──> [Enter, Esc, Tab, arrow, PgUp, PgDn, Copy, Paste buttons — all need same fix]

[Clickable history session rows]
    └──requires──> [App.tsx onNavigateToSession implementation — prop stub already exists in HistoryView]
    └──requires──> [API: /api/history/sessions response must include recording_id or has_recording field]
    └──enhances──> [History row navigates to recording replay]

[History row navigates to recording replay]
    └──requires──> [Clickable history session rows]
    └──requires──> [App.tsx receives and threads onPlayRecording callback into HistoryView/SessionHistory]

[Auto-record on session start]
    └──requires──> [openclaw.json per-agent autoRecord flag parsed by OpenClawConfigReader]
    └──requires──> [TerminalStreamService PTY spawn path checks agent config and calls startRecording()]
    └──conflicts──> [Manual REC toggle — guard with isRecording() check to prevent double-start]
    └──requires──> [Storage rotation] (auto-record without rotation leads to unbounded disk growth)

[Storage rotation / auto-prune backend]
    └──requires──> [listRecordings() with fileSizeBytes — already exists in DatabaseConnection]
    └──requires──> [deleteRecording() — exists in DatabaseConnection; file deletion is in recordingRoutes.ts and must be extracted to a shared helper]
    └──requires──> [New: RecordingPruneService or method on RecordingCaptureService]

[Storage rotation UI in RecordingLibrary]
    └──requires──> [Storage rotation backend + POST /api/recordings/prune endpoint]
    └──requires──> [GET /api/recordings/storage-stats returning { totalBytes, capBytes, recordingCount }]

[Events tab row click navigates to terminal]
    └──requires──> [App.tsx onNavigateToSession callback threaded into GsdView/EventsTab]
    └──enhances──> [Clickable history session rows] (same navigation pattern, shared App.tsx logic)
```

### Dependency Notes

- **Auto-record requires storage rotation:** Enabling auto-record without a cap creates unbounded disk growth on a single-server deployment. These two features must ship in the same phase.
- **Clickable rows require API join:** The current `/api/history/sessions` response does not include a `recordingId` field. Either extend the SQL query with a LEFT JOIN on `recordings` (preferred — clean, single round-trip), or do a client-side lookup against the `/api/recordings` response (acceptable but wasteful for large recording libraries).
- **Keyboard persistence fix applies to all toolbar buttons:** The re-focus fix must be applied uniformly. Adding Enter without fixing focus loss makes it behave inconsistently with the other buttons.
- **File deletion needs extraction:** `recordingRoutes.ts` currently handles `fs.unlinkSync` on DELETE. This logic must move into a shared helper (or into `RecordingCaptureService`) so the pruning path can also delete files cleanly.

---

## MVP Definition

### Launch With (v3.2)

Minimum scope to address the milestone goal: close daily mobile friction and finish the recording story.

- [ ] Enter button in mobile toolbar — closes the most glaring gap; operators currently cannot submit commands from the mobile toolbar
- [ ] Keyboard persistence after toolbar button tap — without this, every toolbar key tap dismisses the soft keyboard requiring a follow-up tap on the terminal
- [ ] Clickable history session rows — navigate to live terminal if active; open recording player if stopped+recorded; show "no recording" toast if stopped+unrecorded
- [ ] Auto-record on session start (per-agent config) — completes REC-05 deferred from v3.1; config flag per agent in `openclaw.json`
- [ ] Storage rotation with configurable cap — must ship alongside auto-record to prevent unbounded growth; default 2 GB cap, 30-day max age

### Add After Core Is Working (v3.2.x)

- [ ] Storage rotation UI in RecordingLibrary — visual usage bar + "Prune now" button; pruning already runs automatically so this is a polish layer
- [ ] Events tab row click navigates to terminal — low complexity; same pattern as history rows once navigation callback is threaded through App.tsx

### Future Consideration (v3.3+)

- [ ] Auto-record on permission prompt detection — useful but depends on `detectAgentState()` reliability which is flagged as fragile tech debt in PROJECT.md
- [ ] Recording external sharing — asciinema.org upload or S3 presigned URL — out of scope for single-operator tool
- [ ] Session duration column in SessionHistory — requires reliable session end time tracking beyond current `last_active_at` heuristic

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Enter button in toolbar | HIGH | LOW | P1 |
| Keyboard persistence fix | HIGH | LOW | P1 |
| Clickable history rows | HIGH | MEDIUM | P1 |
| Auto-record on session start | HIGH | MEDIUM | P1 |
| Storage rotation / auto-prune | HIGH | MEDIUM | P1 |
| Storage rotation UI | MEDIUM | LOW | P2 |
| Events tab row navigates to terminal | MEDIUM | LOW | P2 |
| Auto-record on permission prompt | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v3.2 launch
- P2: Should have — add when P1s are done
- P3: Future milestone

---

## Implementation Notes by Feature

### Enter Button

The `MOBILE_KEYS` array in `TerminalView.tsx` (lines 78-88) drives all toolbar buttons. Insert `{ label: 'Enter', seq: '\r' }` at the beginning of the array before Tab. The `\r` sequence is correct for terminal Enter (carriage return); tmux handles the newline translation. The button renders identically to existing keys via the existing `onTouchStart` handler.

**Confidence: HIGH** — verified directly from existing MOBILE_KEYS data structure.

### Keyboard Persistence

The current `onTouchStart` pattern for each toolbar button:
```tsx
onTouchStart={(event) => {
  event.preventDefault();   // prevents tap → blur on the button element
  sendInput(key.seq);        // sends escape sequence to PTY via Socket.IO
}}
```

What is missing: after `sendInput`, the xterm.js internal textarea loses focus because `preventDefault` stops the native tap event chain but does not restore PTY focus. Fix:

```tsx
onTouchStart={(event) => {
  event.preventDefault();
  sendInput(key.seq);
  requestAnimationFrame(() => terminalRef.current?.focus());
}}
```

`MobileKeyToolbar` is currently a sibling function component that receives only `sendInput`, `selectMode`, and `onToggleCopyMode` — it does not have access to the xterm Terminal instance. Cleanest fix: add a `refocusTerminal: () => void` callback prop that `TerminalViewInner` provides via `useCallback(() => terminalInstanceRef.current?.focus(), [])`.

This same `refocusTerminal` callback must be called in the existing Copy and Esc button handlers. The Paste button's async clipboard path should call it after the clipboard read resolves.

**Confidence: HIGH** — the `requestAnimationFrame(() => terminal.focus())` pattern is already used in `handleToggleCopyMode` (lines 344-346 of TerminalView.tsx), confirming it works in this codebase. xterm.js issue #5377 confirms focus-loss is the documented root cause for mobile toolbar interactions.

### Clickable History Rows

`HistoryView` already declares `onNavigateToSession?: (sessionName: string) => void` as a prop (line 28) and accepts it but passes it through as `_onNavigateToSession` (unused). Changes needed:

1. Pass `onNavigateToSession` from `HistoryView` down to `SessionHistory`
2. `SessionHistory` calls it with `session.tmuxSessionName` on row click — but only if the session is clickable (i.e., active or has a recording)
3. Extend `/api/history/sessions` SQL to LEFT JOIN `recordings ON tmux_session_name = session_name` and include `recordingId: number | null` in each row result
4. In `App.tsx`, implement `onNavigateToSession(sessionName)`: look up `sessionName` in `activeInstances`; if found and active, switch to Terminals view and select that tab; if not found, call the recording lookup path
5. Add visual affordances to rows: `cursor-pointer` class, hover background change (already present as `hover:bg-warden-border/30`), and a right-pointing chevron icon on the right edge of each row

**Confidence: HIGH** — prop stub already exists; the pattern mirrors how `onRestart` is threaded in the existing codebase.

### Auto-Record Configuration

Recommended approach: add `autoRecord?: boolean` to the `AgentDetails` type in `openclawTypes.ts`. `OpenClawConfigReader` parses `AgentDetails` objects per-agent already; the field falls through as `undefined` (falsy) for agents that do not set it.

When `TerminalStreamService` spawns a new PTY (in `handleConnection` or equivalent), it has access to the session name and agent ID. Look up the agent config from `OpenClawConfigReader`, check `autoRecord`, and if true call `recordingCaptureService.startRecording()` before beginning the PTY data tap.

Guard: `recordingCaptureService.isRecording(sessionName)` check before auto-starting prevents double-recording if the operator already started a manual recording.

Client side: no changes needed for the auto-start path. The client's `useRecordingState` hook polls `/api/recordings/status/:sessionName` to discover if a recording is in progress (already implemented), so the REC indicator in the terminal header will light up automatically when the server starts an auto-recording.

**Confidence: MEDIUM** — `openclaw.json` schema extension is straightforward; the TerminalStreamService hook point needs verification against the actual PTY spawn code path in `TerminalStreamService.ts`.

### Storage Rotation

Policy implementation:
- **Max total size:** configurable via `WARDEN_RECORDING_MAX_GB` env var, default 2 GB
- **Max age:** configurable via `WARDEN_RECORDING_MAX_DAYS` env var, default 30 days
- **Deletion order:** oldest `stopped_at` first (most recordings with least recent value)
- **Safe execution points:** (1) server startup, (2) after each `stopRecording()` completes, (3) explicit `POST /api/recordings/prune`

New method in `RecordingCaptureService` (or a dedicated `RecordingPruneService`):
```typescript
pruneRecordings(): { deletedCount: number; freedBytes: number } {
  const all = database.listRecordings(); // returns RecordingEntry[] ordered by started_at desc
  const completed = all.filter(r => r.stoppedAt !== null);

  // Phase 1: delete by age
  const cutoff = new Date(Date.now() - MAX_AGE_MS);
  const aged = completed.filter(r => new Date(r.stoppedAt!) < cutoff);
  for (const r of aged) deleteRecordingWithFile(r);

  // Phase 2: delete by total size cap (oldest first)
  const remaining = database.listRecordings().filter(r => r.stoppedAt);
  const totalBytes = remaining.reduce((sum, r) => sum + (r.fileSizeBytes ?? 0), 0);
  if (totalBytes > MAX_BYTES) {
    const byAge = [...remaining].sort((a, b) =>
      new Date(a.stoppedAt!).getTime() - new Date(b.stoppedAt!).getTime()
    );
    let excess = totalBytes - MAX_BYTES;
    for (const r of byAge) {
      if (excess <= 0) break;
      deleteRecordingWithFile(r);
      excess -= r.fileSizeBytes ?? 0;
    }
  }
}
```

File deletion extraction: `recordingRoutes.ts` currently does `fs.unlinkSync(recording.filePath)` inline in the DELETE handler. Extract this into a `deleteRecordingWithFile(recording: RecordingEntry)` helper that both the route and the pruning path use.

**Confidence: HIGH** — all required DB methods exist; pattern follows established Node.js log-rotation conventions (age + size cap, oldest-first deletion); verified against better-sqlite3 documentation.

---

## Ecosystem Patterns Observed

### Mobile Terminal Keyboard Toolbar (Industry Pattern)

Reference apps (Termius, NewTerm 2, Blink Shell) all implement keyboard accessory toolbars. Common pattern:
- Always-visible sticky bar at bottom of screen
- Keys: Esc, Tab, Ctrl, arrow keys, Enter, function keys
- Each button uses `touchstart` + `preventDefault` to avoid soft keyboard dismissal
- After each button tap, focus is returned to the terminal input element

Web terminal implementations face the same challenge. iOS Safari does not allow programmatic `focus()` calls to open the keyboard (only user-initiated gestures open the keyboard), but calling `element.focus()` within a `touchstart` handler (where a user gesture is in-progress) does keep the keyboard open. This is the mechanism that the existing `onTouchStart` pattern exploits — the `refocus` call must happen within the same event tick or in a `requestAnimationFrame` to remain within the gesture context.

**Confidence: MEDIUM** — sourced from Termius blog, NewTerm GitHub, and xterm.js issue discussions; iOS Safari gesture-context behaviour is known but not officially documented.

### Storage Rotation (Industry Pattern)

Standard rotation policies for bounded-disk deployments use two axes: time (delete older than N days) and size (delete oldest until under cap). Running on: server start, after write, and manual trigger. This matches PM2 log rotation, winston-daily-rotate-file, and Linux `logrotate` conventions. Size-cap with oldest-first deletion is the dominant pattern because it preserves recent high-value recordings while making room for new ones.

**Confidence: HIGH** — verified against multiple Node.js log rotation implementations; pattern is language-agnostic and well-established.

### Clickable List Row Navigation (Industry Pattern)

Standard UX for data list rows with drilldown:
- Row has `cursor-pointer`, hover background change, right chevron icon
- Clicking navigates to: live view if resource is active, detail/replay view if completed
- Touch target minimum: 44px height (Apple HIG, already met by existing session row `min-h-[44px]`)
- Disambiguation: if multiple targets are possible (live terminal vs recording replay), pick the most recent/relevant one automatically, or show a contextual action sheet

**Confidence: HIGH** — established UX pattern, consistent with Apple HIG and Material Design guidelines.

---

## Sources

- xterm.js issue #5377 — Limited touch support on mobile devices: https://github.com/xtermjs/xterm.js/issues/5377
- xterm.js issue #2403 — Accommodate predictive keyboard on mobile: https://github.com/xtermjs/xterm.js/issues/2403
- Termius blog — Touch Terminal on iOS: https://termius.com/blog/new-touch-terminal-on-ios
- NewTerm GitHub — iOS terminal keyboard toolbar implementation reference: https://github.com/hbang/NewTerm
- MDN HTMLElement.focus() — focus within touchstart gesture context: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus
- MDN VirtualKeyboard API — programmatic keyboard control: https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API
- mobilespoon.net — 10 usability rules for mobile keyboard UX: https://www.mobilespoon.net/2018/12/10-usability-rules-keyboard-mobile-app.html
- Pencil & Paper — Data Table UX Patterns: https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- Warden codebase — TerminalView.tsx, SessionHistory.tsx, HistoryView.tsx, RecordingLibrary.tsx, RecordingCaptureService.ts, DatabaseConnection.ts (direct inspection)

---

*Feature research for: Warden Dashboard v3.2 Mobile Operations & UX Polish*
*Researched: 2026-03-04*
