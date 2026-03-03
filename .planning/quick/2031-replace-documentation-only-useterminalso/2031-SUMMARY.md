---
phase: quick-2031
plan: "01"
subsystem: tests
tags: [testing, vitest, useTerminalSocket, behavioral-tests, fake-timers]
dependency_graph:
  requires: []
  provides: [behavioral-test-coverage-useTerminalSocket]
  affects: [tests/unit/useTerminalSocket.test.ts]
tech_stack:
  added: []
  patterns: [vi.mock-factory, renderHook-act-pattern, fake-socket-handroll, vi.useFakeTimers]
key_files:
  created: []
  modified:
    - tests/unit/useTerminalSocket.test.ts
decisions:
  - "Hand-rolled fake socket rather than partial mock — gives full control over event firing without complex spy chains"
  - "Import io mock after vi.mock declaration to avoid hoisting issues when reading mock.calls.length"
  - "fakeSocket module-level var (not returned per-call) so helper functions can access current socket without passing references"
  - "fireSocketEvent/fireIoEvent helpers throw on missing handler — fast failure if hook stops registering events"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-03"
  tasks_completed: 2
  files_modified: 1
---

# Phase quick-2031 Plan 01: Replace Documentation-Only useTerminalSocket Tests Summary

Replaced 4 documentation-only stubs (expect(true).toBe(true), expect(500).toBeGreaterThan(0), invariants array length check, hook.length check) with 9 real behavioral tests using vi.mock('socket.io-client'), renderHook, act, and vi.useFakeTimers.

## What Was Done

Replaced the entire body of `tests/unit/useTerminalSocket.test.ts` (99 lines of stub tests) with 160+ lines of behavioral tests that actually exercise the hook via a hand-rolled fake socket.io-client mock.

### Tests Implemented

**Suite: 500ms overlay delay (3 tests)**
- `showConnectingOverlay` is false immediately after disconnect (timer not elapsed)
- `showConnectingOverlay` becomes true after 500ms via `vi.advanceTimersByTime(500)`
- `showConnectingOverlay` stays false when socket reconnects within 500ms (timer cancelled)

**Suite: PTY exit reconnect (2 tests)**
- `terminal:exit` calls `socket.disconnect()` then after 2s delay triggers new socket creation (io() called twice total)
- `terminal:exit` calls `onSessionExit` with the correct exit code

**Suite: Callback ref stability (1 test)**
- Re-rendering with new callback function identities does not cause `io()` to be called again (socket not recreated)

**Suite: sendInput and sendResize (2 tests)**
- `sendInput('hello')` emits `terminal:input` with the string
- `sendResize(120, 30)` emits `terminal:resize` with `{ cols: 120, rows: 30 }`

**Structural test kept (1 test)**
- `exports the useTerminalSocket function` — valid structural guard, retained

### Mock Strategy

Used `vi.mock('socket.io-client', factory)` with a module-level `fakeSocket` variable reset by `makeFakeSocket()` each time `io()` is called. Handlers stored in Maps keyed by event name. `fireSocketEvent()` and `fireIoEvent()` helpers retrieve and call handlers directly.

## Verification Results

```
npx vitest run tests/unit/useTerminalSocket.test.ts
9 tests passed

npx vitest run tests/unit/
32 tests passed (useTerminalSocket: 9, useSessionSelection: 11, useActiveInstances: 12)

npm run build
dist/client/ and dist/server/ built successfully
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- tests/unit/useTerminalSocket.test.ts: FOUND
- Commit 63f1fbe: FOUND
- grep 'expect(true)' returns 0: CONFIRMED
- grep -c 'it(' returns 9: CONFIRMED (8 behavioral + 1 structural)

## Self-Check: PASSED
