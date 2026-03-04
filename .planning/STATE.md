# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab
**Current focus:** v3.2 Mobile Operations & UX Polish — Phase 30: Auto-Record Per Agent

## Current Position

Phase: 31 of 31 (Recording Storage Rotation)
Plan: 1 of 2 complete in current phase
Status: Phase 31 Plan 01 complete — backend rotation system shipped
Last activity: 2026-03-04 — Phase 31 Plan 01 complete: rotation_config table, deletion_pending two-phase safety, RecordingRotationService with 5-minute periodic scheduler, 4 REST endpoints

Progress: [█████████████████████] 30/31 phases complete (97%)

## Performance Metrics

**Completed milestones:** v1.0 (6 phases), v1.1 (2), v2.0 (3), v2.1 (3), v2.3 (4), v3.0 (2), v3.1 (6), v3.2 in progress (1 phase) = 27 phases shipped

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 28-mobile-toolbar-fixes | 01 | 2min | 2 | 1 |
| 29-session-navigation | 01 | 2min | 2 | 3 |
| 30-auto-record-per-agent | 01 | 2min | 2 | 3 |
| 30-auto-record-per-agent | 02 | 2min | 2 | 3 |
| Phase 31-storage-rotation P01 | 2 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.

**v3.2 key constraints carried from research:**
- Phase 28/29: Client-only changes — zero server dependencies, can run in parallel
- Phase 30: Auto-record hook must fire AFTER `ptyProcess.onData()` is registered (prevents missing first frames)
- Phase 31: Must co-ship with Phase 30 — auto-record without storage cap causes unbounded disk growth
- Phase 31: Two-phase deletion required — `deletion_pending` DB flag prevents deleting files mid-playback
- iOS fix: Use `terminal.textarea?.focus()` synchronously in `onTouchStart`, never `terminal.focus()` or deferred calls
- [Phase 28-mobile-toolbar-fixes]: Use terminal.textarea?.focus() (DOM) not terminal.focus() (xterm API) for iOS keyboard retention
- [Phase 28-mobile-toolbar-fixes]: Call refocusTerminal() synchronously in onTouchStart — deferred calls ignored by iOS Safari
- [Phase 28-mobile-toolbar-fixes]: Enter key placed at MOBILE_KEYS[0] for always-visible position on narrow phone screens
- [Phase 29-session-navigation]: NAVIGABLE_STATUSES checks session.status field directly (not active instances list) — status is authoritative signal
- [Phase 29-session-navigation]: recordings.find() requires r.stoppedAt !== null — only completed recordings are playable
- [Phase 29-session-navigation]: Recordings fetched once on mount (not polled) — stable reference data doesn't need per-render polling
- [Phase 30-auto-record-per-agent]: Sparse row strategy for auto_record_config — only store row when enabled (delete on disable), mirrors budget_config pattern
- [Phase 30-auto-record-per-agent]: GET /api/recordings/auto-record-config placed before /:id routes to prevent Express param capture of literal string
- [Phase 30-auto-record-per-agent]: Auto-record hook placed after ptyProcess.onData() registration to prevent first-frame race condition — captureOutput tap must be wired before startRecording is called
- [Phase 30-auto-record-per-agent]: Hook placed in fresh PTY spawn branch only (not reuse-existing-PTY) — auto-record fires exactly once per PTY lifecycle
- [Phase 31-storage-rotation]: rotation_config uses single-row table with CHECK(id=1) constraint + INSERT OR REPLACE upsert (mirrors budget_config pattern)
- [Phase 31-storage-rotation]: Two-phase deletion: markDeletionPending -> fs.unlinkSync -> deleteRecording; getDeletionPendingRecordings queries deletion_pending=1 for orphan crash recovery on startup
- [Phase 31-storage-rotation]: capBytes=0 means disabled; orphan cleanup always runs regardless of cap setting (happens before the cap=0 early-return check)
- [Phase 31-storage-rotation]: Literal-path routes /storage-stats, /rotation-config, /rotation/prune placed before /:id param routes (same ordering lesson from Phase 30)

### Pending Todos

None

### Blockers/Concerns

None — v3.1 shipped cleanly. v3.2 scope is well-researched with HIGH confidence across all four phases.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2039 | Review Phase 21 commits and confirm milestone completion readiness | 2026-03-04 | 494482e | [2039-review-phase-21-commits-and-confirm-mile](./quick/2039-review-phase-21-commits-and-confirm-mile/) |
| 2040 | Fix Phase 22 verification gaps — API response key mismatches in TokenUsageView | 2026-03-04 | 24ddd1d | [2040-fix-phase-22-verification-gaps-inline-in](./quick/2040-fix-phase-22-verification-gaps-inline-in/) |
| 2041 | Re-run Phase 22 verification — confirm all must-haves pass after quick-2040 fixes | 2026-03-04 | b73bf54 | [2041-re-run-phase-22-verification-after-quick](./quick/2041-re-run-phase-22-verification-after-quick/) |
| 2042 | Propose top 3 concrete next milestone options | 2026-03-04 | aed4d8d | [2042-propose-top-3-concrete-next-milestone-op](./quick/2042-propose-top-3-concrete-next-milestone-op/) |

## Session Continuity

Last session: 2026-03-04 (Plan 31-01)
Stopped at: Completed 31-01-PLAN.md — Phase 31 Plan 01 complete (storage rotation backend: rotation_config table, RecordingRotationService, 4 REST endpoints)
Next step: Execute Phase 31 Plan 02 (storage rotation UI)
