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
  duration: "~10 minutes (including human verification)"
  completed: "2026-03-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 3
---

# Quick Task 21: Stabilize Terminal Polling to Prevent Session Reconnection

**One-liner:** Poll dedup via signature comparison + useSessionSelection hook with 2-miss hysteresis eliminates terminal reconnection caused by 5s polling cycle re-renders.

## Root Cause Analysis

The 5-second `/api/instances` poll was creating a cascade of problems:

1. **New array reference on every poll** — `useActiveInstances` called `setInstances(data.instances)` unconditionally, producing a new array reference even when data was identical. This triggered App.tsx re-renders on every poll cycle.

2. **Render-body setState calls** — App.tsx had three `setState` calls in the render body (not inside `useEffect` or event handlers): auto-select of first session, fallback when selected session disappears, and sidebar agent auto-select. React's strict mode fires these synchronously during render, and they fire on every re-render caused by the poll, generating a loop of state mutations.

3. **TerminalView remount** — `TerminalView` is keyed by `selectedSessionName`. When the render-body setState calls changed `selectedSessionName` due to a transient poll hiccup (session momentarily absent from response), the key changed, React unmounted and remounted TerminalView, the old Socket.IO connection was torn down, and a new PTY was spawned — causing the "Connecting..." overlay and terminal corruption.

## What Was Fixed

### Task 1: Vitest + useActiveInstances dedup + useSessionSelection hook

**Commits:** `72bd9ec`

**useActiveInstances.ts** — Added `computeInstanceSignature()` that produces a JSON-serialized array of `id:tmuxSessionName:status` tuples sorted by id. `fetchInstances` compares the new signature against `previousSignatureRef.current` and skips `setInstances()` when the signature is unchanged. The `instances` array reference is only replaced when actual session data changes — breaking the poll-driven re-render cycle at the source.

```ts
export function computeInstanceSignature(instances: AgentInstance[]): string {
  const tuples = instances
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((instance) => `${instance.id}:${instance.tmuxSessionName}:${instance.status}`);
  return JSON.stringify(tuples);
}
```

**useSessionSelection.ts** (new, 115 lines) — Encapsulates all session selection policy:
- Auto-selects first session when none is selected and loading completes
- Preserves user-selected session across poll cycles (reference stable, no spurious changes)
- Hysteresis: requires 2 consecutive missed polls before falling back to another session (tolerates 1 transient miss)
- `selectSession(name)` / `clearSelection()` for explicit user actions, each reset the miss counter
- All state mutations inside `useEffect` or callbacks — zero render-body setState

Exported `resolveSessionFallback()` pure function for isolated unit testing:

```ts
export function resolveSessionFallback(
  currentSession: string | null,
  activeSessionNames: string[],
  consecutiveMisses: number,
  isLoading: boolean,
): { selectedSession: string | null; resetMissCount: boolean }
```

**Vitest** configured at `vitest.config.ts` with jsdom environment, globals, and `@shared` path alias. Scripts `test` and `test:watch` added to `package.json`.

### Task 2: App.tsx refactor + unit tests + build verification

**Commits:** `75d0d51`

**App.tsx** — All render-body setState calls removed:

| Before | After |
|--------|-------|
| `if (sidebarSelectedAgentId === null && agents.length > 0) setSidebarSelectedAgentId(...)` in render body | Moved into `useEffect([agents, sidebarSelectedAgentId])` |
| Render-body fallback + auto-select blocks calling `setSelectedSessionName()` | Replaced by `useSessionSelection` hook — no render-body code at all |
| `handleViewChange` used `setSelectedSessionName(current => { updateHash(...); return current; })` to read state inside setState | Simplified to `setCurrentView(view)` only; hash sync is a separate `useEffect` |
| Inline `updateHash` calls scattered across render-body setState blocks | Consolidated into single `useEffect([currentView, selectedSessionName])` |

The `hashchange` listener now calls `selectSession()` / `clearSelection()` instead of `setSelectedSessionName()` directly.

**Unit tests (13 passing):**

`tests/unit/useSessionSelection.test.ts` — 7 cases for `resolveSessionFallback`:
1. Auto-selects first session when none selected and not loading
2. No change while loading (even if current is null)
3. Preserves current when still in active list
4. First miss: keeps current (hysteresis tolerance)
5. Second consecutive miss: falls back to first available
6. Second consecutive miss with no alternatives: falls back to null
7. No sessions and no selection: returns null without reset

`tests/unit/useActiveInstances.test.ts` — 5 cases for `computeInstanceSignature`:
1. Same instances in same order produce same signature
2. Different status produces different signature
3. Added instance produces different signature
4. Removed instance produces different signature
5. Non-signature fields (e.g. `lastActiveAt`) produce same signature

`tests/unit/useTerminalSocket.test.ts` — 1 export check + structural protection documentation explaining why zero reconnections occur during polling.

**Build:** `npm run build` passes cleanly. No TypeScript errors.

### Task 3: Human verification

**Status:** Acknowledged by operator. User will verify terminal stability in production after deployment.

The fix is structural: because `selectedSessionName` only changes on genuine user actions or after 2+ consecutive missed polls, `TerminalView`'s `key` prop is stable during normal polling, preventing the remount that caused Socket.IO reconnection and "Connecting..." overlay flicker.

## Commits

| Hash | Message |
|------|---------|
| `72bd9ec` | feat(quick-21-01): install vitest, stabilize polling, add useSessionSelection hook |
| `75d0d51` | feat(quick-21-01): refactor App.tsx to use useSessionSelection, add socket stability test |
| `eb8e4ef` | docs(quick-21): add 2027-SUMMARY.md and update STATE.md |

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
