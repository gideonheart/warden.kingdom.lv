---
phase: 30-auto-record-per-agent
verified: 2026-03-04T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Open the History view, click the Recordings tab, and verify the 'Auto-record settings' collapsible section appears between the header bar and the recordings table. Click it to expand."
    expected: "Section expands to show a toggle row for each agent from openclaw.json. Toggles default to off (grey). No agent shows as REC."
    why_human: "DOM rendering and visual layout cannot be verified programmatically."
  - test: "Enable auto-record for one agent via the toggle. Reload the page and reopen the section."
    expected: "The toggle remains enabled (red) for that agent after reload, confirming persistence via PUT /api/recordings/auto-record-config/:agentId."
    why_human: "Cross-request state persistence requires a live browser session."
  - test: "With auto-record enabled for an agent, open the Terminals view and connect to a session for that agent (or wait for one to appear)."
    expected: "The REC indicator in the terminal header lights up automatically within a second of the terminal connecting, without the operator clicking Record."
    why_human: "PTY spawn lifecycle and real-time indicator sync require an active tmux session and browser."
  - test: "With a session recording started by auto-record, replay the recording from the recording library."
    expected: "The playback starts from the very first line of output — no blank or truncated first frame."
    why_human: "First-frame capture correctness requires a real PTY spawn and cast file inspection."
  - test: "Start a session for an agent that does NOT have auto-record enabled."
    expected: "The REC indicator does not light up. No recording appears in the library for that session unless the operator manually starts one."
    why_human: "Negative behavior (nothing happens) cannot be verified without a live session."
---

# Phase 30: Auto-Record Per Agent Verification Report

**Phase Goal:** Operators can opt individual agents into automatic recording so every session is captured from the first frame without manual intervention
**Verified:** 2026-03-04
**Status:** human_needed (all automated checks passed; 5 items require live-session human testing)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a per-agent auto-record toggle in the recording library UI and can enable or disable it | VERIFIED | `RecordingLibrary.tsx` lines 152-203: collapsible "Auto-record settings" section with toggle per agent, wired to `handleToggleAutoRecord` which calls `PUT /api/recordings/auto-record-config/:agentId` |
| 2 | When auto-record is enabled for an agent, a new session for that agent begins recording automatically with no operator action | VERIFIED | `TerminalStreamService.ts` lines 184-202: auto-record hook after `ptyProcess.onData()` registration in fresh PTY spawn branch only (exits at line 111 for reuse branch); calls `recordingCaptureService.startRecording()` |
| 3 | The recording captures the first line of terminal output (no missing frames due to race conditions) | VERIFIED | Hook is placed AFTER `ptyProcess.onData()` (line 146) and BEFORE `this.setupSocketInputHandlers()` (line 204). `captureOutput` tap is registered before `startRecording()` is called — no race condition by construction |
| 4 | The recording-active indicator in the terminal header lights up automatically for auto-started recordings | VERIFIED | `useRecordingState.ts` lines 51-69: mount-time `useEffect` fetches `/api/recordings/active`, finds matching session, sets `isRecording=true` and starts the elapsed ticker. Guard `!tickerRef.current` prevents overwriting manual recording state |
| 5 | Auto-record defaults to off for all agents — existing recording behavior is unchanged until the operator explicitly opts in | VERIFIED | Sparse-row strategy in `DatabaseConnection.ts`: `isAutoRecordEnabled()` returns `false` for agents with no row in `auto_record_config`. `setAutoRecord(agentId, false)` deletes the row. `getAllAutoRecordConfigs()` queries `WHERE auto_record = 1` so empty table returns empty list. `showAutoRecordSettings` defaults to `false` in UI |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/types.ts` | `AutoRecordConfig` interface | VERIFIED | Lines 109-112: `export interface AutoRecordConfig { agentId: string; autoRecord: boolean; }` |
| `src/server/database/DatabaseConnection.ts` | `auto_record_config` migration + 3 DB methods | VERIFIED | Migration at lines 507-514; `getAllAutoRecordConfigs()` line 353, `setAutoRecord()` line 364, `isAutoRecordEnabled()` line 376. All substantive, no stubs |
| `src/server/routes/recordingRoutes.ts` | GET + PUT `auto-record-config` endpoints | VERIFIED | Lines 32-47: both endpoints present with real DB calls and validation; route ordering correct (literal before `:id` param) |
| `src/server/services/TerminalStreamService.ts` | Auto-record hook after `onData` registration | VERIFIED | Lines 184-202: hook in fresh PTY branch after `onData` (line 146) and `onExit` (line 157), before `setupSocketInputHandlers` (line 204). `database` imported at line 6 |
| `src/client/hooks/useRecordingState.ts` | Mount-time polling of `/api/recordings/active` | VERIFIED | Lines 51-69: `useEffect` with `sessionName` dep fetches active recordings on mount, syncs `isRecording` state and starts ticker |
| `src/client/components/RecordingLibrary.tsx` | Per-agent auto-record toggle UI section | VERIFIED | Lines 40-93: state variables, mount `useEffect`, `handleToggleAutoRecord` handler all present and substantive. JSX at lines 152-203 renders collapsible section with per-agent toggle rows |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `recordingRoutes.ts` | `DatabaseConnection.ts` | `database.getAllAutoRecordConfigs()` and `database.setAutoRecord()` | WIRED | Lines 33, 45: direct calls to DB methods |
| `TerminalStreamService.ts` | `DatabaseConnection.ts` | `database.findInstanceBySessionName()` and `database.isAutoRecordEnabled()` | WIRED | Lines 185-186: both calls present in auto-record hook. `database` imported at line 6 |
| `TerminalStreamService.ts` | `RecordingCaptureService.ts` | `recordingCaptureService.startRecording()` | WIRED | Line 189: `recordingCaptureService.startRecording({...})` with full params. Import at line 5 |
| `useRecordingState.ts` | `/api/recordings/active` | `fetch` on mount | WIRED | Line 52: `void fetch('/api/recordings/active')` in mount `useEffect` |
| `RecordingLibrary.tsx` | `/api/recordings/auto-record-config` | `fetch` GET + PUT | WIRED | Line 66: GET on mount; line 80: PUT in `handleToggleAutoRecord` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REC-05 | 30-01, 30-02 | User can enable auto-record per agent via toggle in recording library UI | SATISFIED | Toggle UI in `RecordingLibrary.tsx`; GET/PUT API endpoints; DB persistence layer all present and wired |
| REC-06 | 30-02 | Sessions for auto-record-enabled agents begin recording automatically on creation (first frame captured) | SATISFIED | Auto-record hook in `TerminalStreamService.ts` positioned after `onData` registration; `isAutoRecordEnabled` DB lookup; `startRecording` call in fresh PTY branch |

No orphaned requirements found. Both REC-05 and REC-06 are claimed in plan frontmatter and satisfied by implementation.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `DatabaseConnection.ts` | 115 | `placeholders` variable | Info | SQL `?` bind parameters — not a stub, this is idiomatic SQLite usage |

No blockers or warnings found. No TODO/FIXME/HACK comments in any phase 30 modified files. No empty handler implementations. No static return values in routes.

---

### Human Verification Required

#### 1. Auto-record toggle UI renders and collapses

**Test:** Open the History view, click the Recordings tab. Locate the "Auto-record settings" row between the header bar and the recordings table. Click it.
**Expected:** Section expands to show one toggle row per agent from openclaw.json. All toggles default to off (grey/warden-border color). No agent badge shows "REC".
**Why human:** DOM rendering, visual layout, and CSS toggle appearance cannot be verified programmatically.

#### 2. Toggle state persists across page reload

**Test:** Enable auto-record for one agent by clicking its toggle. Reload the page and reopen the "Auto-record settings" section.
**Expected:** The toggle for that agent remains enabled (red, `bg-red-500/70`) after reload, confirming the PUT request persisted to SQLite and the GET on mount restores the state.
**Why human:** Cross-request persistence requires a live browser session and server.

#### 3. REC indicator lights up automatically for auto-started sessions

**Test:** With auto-record enabled for an agent (step 2 above), open the Terminals view and connect to a session for that agent (or wait for InstanceTracker to discover one).
**Expected:** The REC indicator and elapsed timer in the terminal header appear within one second of the terminal connecting, without any operator action.
**Why human:** PTY spawn lifecycle, Socket.IO connection timing, and UI indicator state require an active tmux session and browser.

#### 4. First-frame capture — no blank start in replay

**Test:** After an auto-started recording has run for at least 30 seconds, stop the session or wait for it to end naturally. Replay the recording from the recording library.
**Expected:** The recording starts from the very first line of terminal output — no blank screen or truncated beginning before activity appears.
**Why human:** First-frame correctness requires a real PTY spawn, terminal output, and cast file inspection via playback.

#### 5. Non-auto-record agent sessions are unaffected

**Test:** Start a session for an agent that does NOT have auto-record enabled (all agents by default).
**Expected:** The REC indicator does not appear. No new recording appears in the library for that session unless the operator manually clicks Record.
**Why human:** Negative behavior (recording does not start) requires a live session to confirm absence of auto-start.

---

### Gaps Summary

No gaps found. All five observable truths are verified by the implementation. Both REC-05 and REC-06 are satisfied. The TypeScript compiler passes with zero errors (`npx tsc --noEmit` clean). Five human-testing items remain to confirm real-time behavior in a live environment.

---

_Verified: 2026-03-04_
_Verifier: Claude (gsd-verifier)_
