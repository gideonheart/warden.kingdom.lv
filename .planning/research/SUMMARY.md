# Project Research Summary

**Project:** Warden Dashboard v3.2 — Mobile Operations & UX Polish
**Domain:** Additive milestone on a shipping browser-based terminal multiplexer dashboard
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

Warden v3.2 is a tightly scoped additive milestone on a stable, production-shipping application. The research confirms that all five feature areas — mobile Enter button, keyboard persistence, clickable history rows, auto-record per agent, and storage rotation — can be completed without adding any new npm dependencies. Every capability builds on existing primitives: the `onTouchStart` + `preventDefault()` pattern already used in `MobileKeyToolbar`, the `RecordingCaptureService` and `DatabaseConnection` services already in production, and callback prop chains already stubbed in `HistoryView`. This is execution work, not exploration work.

The recommended implementation approach is additive and sequential: fix mobile toolbar friction first (zero-risk, client-only changes), then wire up the history navigation (also client-only against existing API), then implement auto-record server-side, then add storage rotation as a safety layer for auto-record. Each phase is independently shippable. The dependency that matters most is that auto-record and storage rotation must ship together — enabling auto-record without a storage cap creates unbounded disk growth. No phase requires a major refactor or new infrastructure.

The primary risks are all well-defined and avoidable with explicit acceptance criteria. The two most consequential pitfalls are (1) the iOS keyboard dismissal problem — `terminal.focus()` does not work; `terminal.textarea?.focus()` called synchronously in `onTouchStart` is the only correct path — and (2) the auto-record race condition where recording starts before the PTY `onData` tap is registered, causing missing first frames. Both are point-in-code fixes, not architectural problems. The frame buffer memory growth risk under long auto-recorded sessions is a known limitation to document and monitor, not a blocker.

## Key Findings

### Recommended Stack

All v3.2 capabilities use the existing stack with zero new npm dependencies. The production base — Express 5, Socket.IO 4, React 19, xterm.js 5.3.0, better-sqlite3 with WAL mode, node-pty, Tailwind CSS 4, TypeScript 5 — is unchanged. The only new server-side I/O primitives used are `fs.statSync()` and `fs/promises.statfs()`, both verified available on Node.js 22.22.0 running on this server.

See: `.planning/research/STACK.md`

**Core technologies:**
- `onTouchStart` + `terminal.textarea?.focus()`: mobile keyboard control — pattern already used on all toolbar buttons; the only gap is the missing Enter entry and the explicit `textarea` re-focus call
- `better-sqlite3` singleton-row pattern: configuration persistence — all new config (auto-record trigger, rotation policy) follows the established `budget_config` table precedent
- `fs.statSync()` + `fs/promises.statfs()`: storage accounting — Node.js 22 built-ins verified on this server; no external disk-usage package needed
- `setImmediate()` + `try/catch`: fire-and-forget side effects — defers storage rotation off the PTY callback chain without blocking
- React `useCallback` with ref: stable callback props at `TerminalView` boundary — mandatory to preserve `React.memo` effectiveness

### Expected Features

See: `.planning/research/FEATURES.md`

**Must have (P1 — v3.2 launch blockers):**
- Enter button in mobile toolbar — operators cannot submit commands without it; one-line addition to `MOBILE_KEYS` array
- Keyboard persistence after toolbar button tap — current behavior dismisses keyboard on every tap; fix via `terminal.textarea?.focus()` synchronously in `onTouchStart`
- Clickable history session rows — active sessions navigate to terminal tab; stopped sessions with recording open player; stopped sessions without recording show explanatory toast
- Auto-record on session start (per-agent config) — deferred REC-05 from v3.1; stored in SQLite `auto_record_config` table; triggered from `TerminalStreamService` after PTY `onData` is registered
- Storage rotation with configurable cap — must co-ship with auto-record; two-axis policy: max total bytes + max age days; oldest-first deletion; runs on stop and server start

**Should have (P2 — add when P1s are done):**
- Storage rotation UI in `RecordingLibrary` — visual usage bar, current stats, "Run Now" button
- Events tab row click navigates to terminal — same navigation pattern as history rows once App.tsx callback is threaded

**Defer (v3.3+):**
- Auto-record on permission-prompt detection — depends on `detectAgentState()` reliability flagged as fragile tech debt
- Recording external sharing (S3, asciinema.org) — out of scope for single-operator tool
- Streaming write mode for frame buffer — significant refactor; mitigate in v3.2 with buffer-size warning log only

### Architecture Approach

V3.2 makes surgical additions to the existing two-tier architecture (React 19 SPA + Express 5 server). Three new server-side files are needed: `AutoRecordConfigService.ts` (singleton config + `shouldRecord()` method), `RecordingRotationService.ts` (pruning algorithm), and `autoRecordRoutes.ts` (REST endpoints). No new shared types are required — all new data shapes are simple enough to type inline. The correct build order within each server feature is: database migration first, then service, then route, then integration hook point, then client UI.

See: `.planning/research/ARCHITECTURE.md`

**Major components (modified or new):**
1. `MobileKeyToolbar` in `TerminalView.tsx` — add Enter key to `MOBILE_KEYS`; add `onAfterInput` prop; call `terminal.textarea?.focus()` synchronously in every `onTouchStart` handler
2. `SessionHistory.tsx` + `HistoryView.tsx` + `App.tsx` — wire the already-stubbed `onNavigateToSession` callback; add recording lookup in `App.tsx` to decide navigation target per session state
3. `AutoRecordConfigService.ts` (new) — singleton SQLite config; `shouldRecord(sessionName, agentId)` method; hooked into `TerminalStreamService.attachSocketToSession()` after `ptyProcess.onData()` registration
4. `RecordingRotationService.ts` (new) — age + size + count policy; called via `setImmediate()` after `stopRecording()`; two-phase deletion with `deletion_pending` DB flag protects concurrent playback
5. `DatabaseConnection.ts` — two new inline migrations (`auto_record_config`, `recording_rotation_config`); four new query methods for rotation

### Critical Pitfalls

See: `.planning/research/PITFALLS.md`

1. **iOS keyboard dismissal via `terminal.focus()`** — xterm.js `terminal.focus()` calls `textarea.focus({preventScroll:true})` on the container div, not the `<textarea>` element iOS requires. Fix: use `terminal.textarea?.focus()` synchronously inside `onTouchStart`, never in `requestAnimationFrame` or `setTimeout`. Must test on a real iPhone — Simulator behaves differently.

2. **Auto-record race (missing first PTY frames)** — triggering auto-record from `InstanceTracker` or Socket.IO connection before the PTY `onData` tap is registered means the capture tap does not yet exist. Only trigger from inside `TerminalStreamService.attachSocketToSession()` immediately after `ptyProcess.onData()` is registered. Acceptance criteria: replay of a 5-second auto-recorded session must show first-line output.

3. **Storage rotation deletes files being streamed for playback** — `fs.unlinkSync()` while `res.sendFile()` has an open fd causes inconsistency. Prevention: add `deletion_pending` column to `recordings` table; content route returns `410 Gone` if flag is set; actual file deletion deferred to next cycle. Never rotate sessions where `isRecording()` is true.

4. **Clickable history rows navigating to unavailable sessions** — `useSessionSelection` silently substitutes the first valid session when an unknown session name is passed. Prevention: check `activeInstances` membership and `recordingId` presence before any navigation call; show a toast ("Session ended, no recording available") for the dead-end case.

5. **Frame buffer OOM with long auto-recorded sessions** — `frameBuffer` grows unbounded; a 4-hour high-activity session can accumulate ~48MB per agent; 5 agents simultaneously = ~240MB heap pressure. Mitigation for v3.2: add `console.warn` at 50MB threshold; default auto-record to `false` (opt-in). Streaming write mode deferred to v3.3.

## Implications for Roadmap

Based on combined research, the following phase structure is recommended. All four phases are independently shippable; phases 1 and 2 can be developed in parallel.

### Phase 1: Mobile Toolbar Fixes

**Rationale:** Client-only changes with zero server dependencies. Zero risk of breaking existing behavior. Highest daily operator friction in current state. Can be tested on a real iPhone immediately after deploy.
**Delivers:** Enter button in toolbar; keyboard stays open after every toolbar tap (Enter, Tab, Ctrl+C, arrows, PgUp/PgDn, Copy, Paste).
**Addresses:** "Enter button" and "Keyboard persistence" P1 features.
**Avoids:** Pitfall 1 (iOS keyboard dismissal) — use `terminal.textarea?.focus()` synchronously in `onTouchStart`; do NOT use `requestAnimationFrame`, `setTimeout`, or `terminal.focus()`.
**Scope estimate:** ~12 lines in `TerminalView.tsx`; no server changes; no new files.

### Phase 2: Clickable History Session Rows

**Rationale:** Client-only against existing API endpoints. The `onNavigateToSession` prop stub already exists in `HistoryView` with an `_` prefix (declared but unused). This phase activates it. The recording lookup in `App.tsx` must handle the stopped-session case explicitly to avoid Pitfall 4's silent navigation to the wrong session.
**Delivers:** Session rows in `SessionHistory` navigate to live terminal, recording player, or explanatory toast depending on session state. `_onNavigateToSession` dead-code resolved.
**Addresses:** "Clickable history session rows" P1 feature; UX cleanup of history view.
**Avoids:** Pitfall 4 (silent redirect to wrong session) — check `activeInstances` membership and `recordingId` before any navigation call.
**Scope estimate:** ~15 lines `SessionHistory.tsx`, ~8 lines `HistoryView.tsx`, ~35 lines `App.tsx`; no server changes.

### Phase 3: Auto-Record Per Agent

**Rationale:** Server-side feature with new SQLite table, new service, new route, and a hook into `TerminalStreamService`. Default trigger mode is `manual` so existing behavior is unchanged until the operator explicitly opts in. Must be built in dependency order: migration → service → route → hook point → client UI.
**Delivers:** Per-agent auto-record config via UI toggle in `RecordingLibrary`; sessions for configured agents start recording automatically on PTY spawn; `isRecording()` indicator in terminal header lights up automatically via existing polling.
**Addresses:** "Auto-record on session start" P1 feature (completes deferred REC-05 from v3.1).
**Avoids:** Pitfall 2 (auto-record race) — trigger exclusively from inside `TerminalStreamService.attachSocketToSession()` after `ptyProcess.onData()` is registered; Pitfall 5 (frame buffer OOM) — add 50MB warning log, default to `false`.
**Scope estimate:** 1 new service file, 1 new route file, 1 migration, ~15 lines `TerminalStreamService.ts`, ~60 lines `RecordingLibrary.tsx` for config UI.

### Phase 4: Storage Rotation

**Rationale:** Safety layer for auto-record. Build after Phase 3 so there are real auto-generated recordings to test rotation behavior against. All rotation policies default to zero (all axes disabled), so shipping the service before the config UI is safe — no recordings are deleted until the operator sets a cap. Two-phase deletion must be spec'd before any file deletion code is written.
**Delivers:** Configurable storage cap (bytes, age, count); oldest-first pruning on server start and after each recording stop; manual "Run Now" API endpoint; storage stats UI in `RecordingLibrary`.
**Addresses:** "Storage rotation" P1 feature; "Storage rotation UI" P2 feature.
**Avoids:** Pitfall 3 (rotation deletes in-use files) — `deletion_pending` flag in DB; content route checks flag; async `fs.promises.unlink()` only; active recordings excluded from rotation candidates via `isRecording()` check.
**Scope estimate:** 1 new service file, 4 new DB methods + 2 migrations, ~5 lines `RecordingCaptureService.ts`, ~40 lines `recordingRoutes.ts`, ~40 lines `RecordingLibrary.tsx` for settings UI.

### Phase Ordering Rationale

- Phases 1 and 2 are fully client-only and have no mutual dependencies — they can be built and tested independently or in parallel.
- Phase 3 (auto-record) before Phase 4 (rotation) because: (a) rotation test coverage needs real auto-generated recordings to verify prune behavior against; (b) the hard dependency is explicit — auto-record without rotation causes unbounded disk growth — but rotation defaults to disabled so Phase 3 ships safely before Phase 4 is complete.
- The `deletion_pending` two-phase flag in Phase 4 requires a DB migration; this schema decision should be made before writing any file-deletion code so the migration is not altered later.

### Research Flags

All four phases have well-documented patterns with implementation-level detail already in the research files. No phase requires a `/gsd:research-phase` invocation.

**Standard patterns — skip research-phase for all phases:**
- **Phase 1:** Pattern fully documented in codebase; `onTouchStart` + `terminal.textarea?.focus()` is the complete implementation. `MOBILE_KEYS` array structure and button handler shape confirmed by direct source read.
- **Phase 2:** Callback threading against existing prop stubs; no new API endpoints needed for basic flow; recording lookup uses existing `GET /api/recordings`.
- **Phase 3:** Singleton-row SQLite config pattern established (`budget_config` table precedent); `TerminalStreamService` hook point identified with file + approximate line number in ARCHITECTURE.md; `agentId` extraction via `sessionName.split('-')[0]` is the existing convention.
- **Phase 4:** Two-phase deletion pattern fully specified in PITFALLS.md; all DB query method signatures specified in ARCHITECTURE.md; `setImmediate()` fire-and-forget pattern established in codebase.

**Needs verification during Phase 3 implementation:**
- `TerminalStreamService.attachSocketToSession()` exact PTY spawn sequence — confirm `ptyProcess.onData()` registration position and that `agentId` extraction from `sessionName.split('-')[0]` is correct before writing the hook.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All capabilities use verified existing stack; `fs.statfsSync()` and `fs/promises.statfs()` verified on Node.js 22.22.0 on this server; no new dependencies required |
| Features | HIGH | Scope derived from direct codebase inspection; prop stubs confirmed; existing patterns confirmed; REC-05 deferred ticket confirmed in project docs |
| Architecture | HIGH | Direct source code analysis of all modified files; hook points, prop names, integration boundaries, and scope estimates all identified from source |
| Pitfalls | HIGH | Three pitfalls sourced from direct xterm.js source reading + iOS behavior verification (multiple consistent sources); two from codebase control-flow analysis; all have specific, testable acceptance criteria |

**Overall confidence: HIGH**

### Gaps to Address

- **`terminal.textarea?.focus()` on Android Chrome:** The fix is confirmed correct for iOS Safari. Android behavior has MEDIUM confidence (community sources, not device-verified). Low priority — Android is not the primary target, but include in the test matrix for Phase 1 acceptance.

- **`RecordingLibrary.tsx` settings UI scope:** ARCHITECTURE.md estimates ~60 lines for auto-record config and ~40 lines for rotation config added to `RecordingLibrary`. Actual scope may be larger depending on UX layout decisions. Treat as rough estimate during task breakdown.

- **`TerminalStreamService` agentId extraction path:** `agentId = sessionName.split('-')[0]` is the documented convention used in `TmuxSessionManager.listAgentSessions()`, but has not been verified against the actual `TerminalStreamService.ts` service code path. Verify before writing the Phase 3 hook point.

- **Frame buffer memory monitoring:** Pitfall 5 documents the risk but v3.2 mitigation is a warning log only. If any agent runs long auto-recorded sessions before the warning is tested in production, OOM is possible. Document the limitation explicitly in the Phase 3 implementation notes.

- **Recording library pagination:** PITFALLS.md flags potential sluggishness at 100-200 recordings on mobile. Not in v3.2 scope but worth noting: if any new `listRecordings()` calls are added without `LIMIT`, add a comment to track this as v3.3 work.

## Sources

### Primary (HIGH confidence — direct source inspection)

- `src/client/components/TerminalView.tsx` — MOBILE_KEYS array, MobileKeyToolbar onTouchStart pattern, terminalInstanceRef, focus chain
- `src/client/components/HistoryView.tsx` — `_onNavigateToSession` unused prop confirmed; MobileAccordionSection max-h CSS
- `src/client/components/SessionHistory.tsx` — row structure, absence of click handlers, AgentInstance data shape
- `src/client/components/EventsTab.tsx` — accessible row pattern (role="button", tabIndex, onKeyDown) as precedent for SessionHistory
- `src/client/App.tsx` — view routing, setActiveRecording, stable callback patterns, useSessionSelection behavior
- `src/server/services/TerminalStreamService.ts` — PTY spawn branch, onData tap sequence, attachSocketToSession control flow
- `src/server/services/RecordingCaptureService.ts` — stopRecording flow, writeAsciicastFile, database.finaliseRecording
- `src/server/database/DatabaseConnection.ts` — budget_config singleton-row migration pattern, deleteRecording method, recordings schema
- `src/server/routes/recordingRoutes.ts` — existing DELETE handler pattern for file + DB row deletion
- `node_modules/xterm/lib/xterm.js:25971` — confirmed `focus(){this.textarea&&this.textarea.focus({preventScroll:!0})}` (programmatic focus does not trigger iOS keyboard)
- Node.js 22.22.0 on server — `fs.statfsSync('/')` and `fs/promises.statfs('/')` both verified returning `{blocks, bfree, bsize, ...}`

### Secondary (MEDIUM confidence — official docs and issue tracker)

- xterm.js issue #5377 — Limited touch support on mobile; focus-loss root cause for mobile toolbar interactions
- xterm.js issue #2403 — Accommodate predictive keyboard on mobile
- xterm.js issue #1101 — Support mobile platforms; iOS hidden textarea mechanism
- MDN HTMLElement.focus() — focus within touchstart gesture context requirements
- Apple WebKit bug #195884 — Autofocus on text input does not show keyboard
- iOS Safari keyboard behavior — `onTouchStart` + `preventDefault()` established technique; multiple WebSearch sources consistent
- Prior Warden phase research: `.planning/phases/11.1-fix-tmux-visibility-when-mobile-keyboard-opens/11.1-RESEARCH.md`

### Tertiary (MEDIUM confidence — community/blog sources)

- Termius, NewTerm, Blink Shell toolbar implementation patterns — consistent with codebase approach
- MDN VirtualKeyboard API — Chrome 94+ only; confirmed not applicable to iOS Safari target
- Node.js log rotation conventions — age + size two-axis policy is the established pattern (PM2, winston-daily-rotate-file, logrotate)

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
