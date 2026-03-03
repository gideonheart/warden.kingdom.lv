---
phase: quick-21
plan: "01"
subsystem: client/hooks
tags: [polling, terminal-stability, session-selection, vitest, hysteresis]
dependency_graph:
  requires: []
  provides: [stable-session-selection, poll-dedup, unit-test-infrastructure]
  affects: [App.tsx, useActiveInstances, TerminalView]
tech_stack:
  added: [vitest, jsdom, @testing-library/react, @testing-library/jest-dom]
  patterns: [signature-based-dedup, hysteresis, pure-function-extraction]
key_files:
  created:
    - src/client/hooks/useSessionSelection.ts
    - vitest.config.ts
    - tests/unit/useSessionSelection.test.ts
    - tests/unit/useActiveInstances.test.ts
    - tests/unit/useTerminalSocket.test.ts
  modified:
    - src/client/hooks/useActiveInstances.ts
    - src/client/App.tsx
    - package.json
decisions:
  - "computeInstanceSignature tracks id+tmuxSessionName+status only — lightweight 3-field tuple, negligible cost for 3-8 instances"
  - "Hysteresis threshold set at 2 consecutive misses before fallback — tolerates 1 transient poll hiccup"
  - "resolveSessionFallback and computeInstanceSignature exported as pure functions — independently testable without React"
  - "activeSessionNamesKey as comma-joined string — stable useEffect dependency that avoids re-running on same session list"
  - "URL hash sync moved to dedicated useEffect — eliminates last render-body side-effect"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-03"
  tasks_completed: 2
  tasks_total: 3
  files_created: 5
  files_modified: 3
---

# Quick Task 21: Stabilize Terminal Polling to Prevent Session Reconnection

**One-liner:** Poll dedup via signature comparison + useSessionSelection hook with 2-miss hysteresis eliminates terminal reconnection caused by 5s polling cycle re-renders.

## What Was Built

### Task 1: Vitest + useActiveInstances dedup + useSessionSelection hook

**useActiveInstances.ts** — Added `computeInstanceSignature()` that produces a JSON-serialized array of `id:tmuxSessionName:status` tuples sorted by id. `fetchInstances` compares the new signature against `previousSignatureRef.current` and skips `setInstances()` when unchanged. This means the `instances` array reference is only replaced when actual session data changes, preventing downstream re-renders.

**useSessionSelection.ts** — New hook that encapsulates all session selection policy:
- Auto-selects first session when none is selected and loading completes
- Preserves user-selected session across poll cycles
- Hysteresis: requires 2 consecutive missed polls before falling back to another session
- `selectSession()` / `clearSelection()` for explicit user actions

Exported `resolveSessionFallback()` pure function enables isolated unit testing.

**Vitest configured** with jsdom environment and `@shared` path alias.

### Task 2: App.tsx refactor + unit tests + build verification

**App.tsx** — Removed all render-body setState calls:
- `selectedSessionName` management moved to `useSessionSelection` hook
- Sidebar agent auto-select moved from render body to `useEffect`
- URL hash sync moved from inline setState updater to dedicated `useEffect`
- `handleViewChange` simplified (no longer needs setState updater pattern)
- `handleSelectSession` calls `selectSession()` instead of `setSelectedSessionName()`

**13 unit tests passing:**
- 7 cases for `resolveSessionFallback` (auto-select, loading guard, preserve, first miss, second miss, no alternatives, empty)
- 5 cases for `computeInstanceSignature` (same order, status change, added instance, removed instance, non-signature fields)
- 1 structural documentation test for `useTerminalSocket`

**npm run build passes cleanly.**

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All created files present. All commits verified.

| Item | Status |
|------|--------|
| src/client/hooks/useSessionSelection.ts | FOUND |
| src/client/hooks/useActiveInstances.ts | FOUND |
| vitest.config.ts | FOUND |
| tests/unit/useSessionSelection.test.ts | FOUND |
| tests/unit/useActiveInstances.test.ts | FOUND |
| tests/unit/useTerminalSocket.test.ts | FOUND |
| Commit 72bd9ec (Task 1) | FOUND |
| Commit 75d0d51 (Task 2) | FOUND |
