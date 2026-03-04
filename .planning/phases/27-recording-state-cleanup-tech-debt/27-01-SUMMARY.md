---
phase: 27-recording-state-cleanup-tech-debt
plan: 01
subsystem: recording-state, server-services, planning-docs
tags: [recording, state-management, tech-debt, cleanup, flow-d]
dependency_graph:
  requires: [24-01, 24-02]
  provides: [clean-recording-state-on-pty-exit, flow-d-session-ended]
  affects: [useRecordingState, TerminalView, RecordingCaptureService]
tech_stack:
  added: []
  patterns: [useCallback-stable-identity, hook-ordering-correctness]
key_files:
  created: []
  modified:
    - src/client/hooks/useRecordingState.ts
    - src/client/components/TerminalView.tsx
    - src/server/services/RecordingCaptureService.ts
    - .planning/phases/23-token-analytics-export/23-VERIFICATION.md
key_decisions:
  - sessionExited() does not make an HTTP call — server auto-stops recording via TerminalStreamService.ptyProcess.onExit, client only resets local state
  - useRecordingState hook call moved before handleSessionExit in TerminalView to satisfy JavaScript scoping (sessionExited must be available before handleSessionExit captures it in useCallback deps)
  - onRecordingStoppedRef pattern preserved — sessionExited calls onRecordingStoppedRef.current('session_ended') through the ref, keeping parent callback stable
metrics:
  duration: 3m 10s
  completed: 2026-03-04T09:31:15Z
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 27 Plan 01: Recording State Cleanup & Tech Debt Summary

**One-liner:** sessionExited() hook resets REC state on PTY exit (Flow D), unused __dirname removed from RecordingCaptureService, 23-VERIFICATION updated to 8/8

## What Was Implemented

### Task 1: Fix useRecordingState terminal:exit state desync (REC-02-STATE-DESYNC)

**Problem:** When a PTY exits, the `terminal:exit` Socket.IO event was routed to `handleSessionExit` in TerminalView, but `useRecordingState` had no knowledge of the exit. The `isRecording` state stayed `true` indefinitely, leaving the REC button pulsing red after the session ended.

**Fix:**

In `src/client/hooks/useRecordingState.ts`:
- Added `sessionExited: () => void` to the `UseRecordingStateResult` interface
- Implemented `sessionExited` as a `useCallback` with empty dependency array (stable identity):
  - Clears the elapsed ticker (`clearInterval(tickerRef.current)`)
  - Resets `startedAtRef.current = null`
  - Resets all state: `setIsRecording(false)`, `setElapsedMs(0)`, `setRecordingId(null)`
  - Calls `onRecordingStoppedRef.current?.('session_ended')` to notify parent
  - Makes NO HTTP call — server already auto-stopped via `RecordingCaptureService.stopRecording(..., 'session_ended')` in `TerminalStreamService.ptyProcess.onExit`
- Added `sessionExited` to the return object

In `src/client/components/TerminalView.tsx`:
- Moved `useRecordingState` hook call before `handleSessionExit` definition (JavaScript scoping requirement)
- Destructured `sessionExited` from the hook
- Updated `handleSessionExit` to call `sessionExited()` before `onSessionExit`, with `sessionExited` in the dependency array

**Result:** Flow D session_ended variant now completes cleanly: PTY dies → server auto-stops recording → `terminal:exit` fires → `handleSessionExit` calls `sessionExited()` → REC button returns to default grey state.

### Task 2: Remove unused __dirname from RecordingCaptureService.ts

**Problem:** Lines 3 and 6 of `RecordingCaptureService.ts` imported `fileURLToPath` and declared `const __dirname`, but `__dirname` was never referenced anywhere. `RECORDINGS_DIR` uses `process.cwd()` directly and requires no `__dirname`.

**Fix:** Removed `import { fileURLToPath } from 'url';` and `const __dirname = path.dirname(fileURLToPath(import.meta.url));`. No other lines modified. `RECORDINGS_DIR` unchanged and still correct.

### Task 3: Fix 23-VERIFICATION.md body score to match frontmatter

**Problem:** The frontmatter had `score: 8/8` (already corrected after commit e6325f0 fixed the json.data → json.modelComparison mismatch), but the body still showed the pre-fix state: score 7/8, Truths 5-8 as FAILED, TOKN-12 as BLOCKED, ModelComparisonView as STUB.

**Fix:** Updated all affected sections in the body:
- Score line: `7/8` → `8/8 plan truths verified (... fixed inline in commit e6325f0)`
- Truths 5-8: `FAILED` → `VERIFIED` with evidence citing commit e6325f0
- ModelComparisonView artifact: `STUB (wiring)` → `VERIFIED`
- ModelComparisonView key link: `PARTIAL` → `WIRED`
- TOKN-12 requirement: `BLOCKED` → `SATISFIED`
- Anti-Patterns severity: `Blocker` → `Fixed` (no open anti-patterns remain)
- Gaps Summary: Updated to state no open gaps remain after inline fix

## Files Modified

| File | Change |
|------|--------|
| `src/client/hooks/useRecordingState.ts` | Added `sessionExited()` function and interface entry |
| `src/client/components/TerminalView.tsx` | Destructure `sessionExited`, call from `handleSessionExit`, reordered hook calls |
| `src/server/services/RecordingCaptureService.ts` | Removed `fileURLToPath` import and `__dirname` declaration |
| `.planning/phases/23-token-analytics-export/23-VERIFICATION.md` | Updated body to be consistent with frontmatter (8/8 score, all VERIFIED) |

## Decisions Made

1. **sessionExited() does not HTTP-stop the recording** — The server auto-stops on ptyProcess.onExit via `RecordingCaptureService.stopRecording(..., 'session_ended')`. Making a redundant HTTP call would race against the server's own stop action and could cause double-stop errors.

2. **useRecordingState moved before handleSessionExit** — JavaScript requires `sessionExited` to be in scope when `handleSessionExit`'s `useCallback` closure captures it. Moving `useRecordingState` up (before `handleSessionExit` and `useTerminalSocket`) satisfies this without any behavior change.

3. **useCallback([]) empty deps for sessionExited** — `sessionExited` only uses refs and setter functions (stable across renders). The empty dep array guarantees stable identity, which is why `handleSessionExit` can safely include it in its dependency array without causing unnecessary recreations.

## v3.1 Milestone Status

After this plan:
- **Flow D session_ended variant:** COMPLETE — PTY exit resets REC button to default state
- **REC-02-STATE-DESYNC gap:** CLOSED
- **RecordingCaptureService tech debt:** CLEAN
- **23-VERIFICATION.md consistency:** RESOLVED

v3.1 milestone is clean: 22/22 integrations, 4/4 flows.

## Verification Results

- `npm run typecheck`: PASSED (zero errors)
- `npm run build`: PASSED (Vite + tsc, zero errors)
- `grep sessionExited useRecordingState.ts`: function definition (line 96), interface (line 17), return (line 114)
- `grep sessionExited TerminalView.tsx`: destructure (line 293), call in handleSessionExit (line 303), dep array (line 305)
- `grep fileURLToPath|__dirname RecordingCaptureService.ts`: no matches
- `grep "Score:" 23-VERIFICATION.md`: "8/8 plan truths verified"

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `832a102` | fix(27-01): resolve REC-02-STATE-DESYNC — reset recording state on PTY exit |
| Task 2 | `1d4910f` | chore(27-01): remove unused fileURLToPath import and __dirname declaration |
| Task 3 | `3651e71` | docs(27-01): update 23-VERIFICATION.md body to match frontmatter score 8/8 |

## Self-Check: PASSED

All files verified present. All commits verified in git log.

| Check | Result |
|-------|--------|
| src/client/hooks/useRecordingState.ts | FOUND |
| src/client/components/TerminalView.tsx | FOUND |
| src/server/services/RecordingCaptureService.ts | FOUND |
| .planning/phases/23-token-analytics-export/23-VERIFICATION.md | FOUND |
| .planning/phases/27-recording-state-cleanup-tech-debt/27-01-SUMMARY.md | FOUND |
| Commit 832a102 | FOUND |
| Commit 1d4910f | FOUND |
| Commit 3651e71 | FOUND |
