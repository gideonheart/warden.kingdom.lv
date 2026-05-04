---
status: resolved
trigger: "Stop button UX improvements: spinner state + auto-switch to active tab after stop"
created: 2026-03-12T00:00:00Z
updated: 2026-03-12T00:01:00Z
---

## Current Focus

hypothesis: Stop button in TerminalView has no loading state; App.tsx handleStopSelectedInstance has no isStopping flag; no auto-tab-switch after stop
test: Read TerminalView.tsx stop button area + App.tsx handleStopSelectedInstance + useSessionSelection
expecting: Implement isStopping state in App.tsx, pass it down, add spinner/disabled to button, add selectSession call after stop
next_action: Implement fixes in App.tsx and TerminalView.tsx

## Symptoms

expected:
1. Stop button shows spinner and becomes disabled during stop operation
2. After stop, UI auto-switches to first available active tab

actual:
1. Stop button stays clickable during stop operation
2. After stopping, stays on stopped session tab (shows restart attempts)

errors: No errors — UX improvement
reproduction: Click Stop on any active terminal session
started: Always been this behavior

## Evidence

- timestamp: 2026-03-12T00:00:00Z
  checked: App.tsx handleStopSelectedInstance (line 375-385)
  found: async function with fetch, no loading state tracked, calls refetch() after
  implication: Need to add isStopping useState + set it before/after fetch

- timestamp: 2026-03-12T00:00:00Z
  checked: TerminalView.tsx stop button (line 875-882)
  found: Simple button with onClick={onStop}, no disabled or spinner, onStop is () => void
  implication: Need to change onStop prop type to async or accept isStopping bool prop + add spinner

- timestamp: 2026-03-12T00:00:00Z
  checked: useSessionSelection hook
  found: selectSession() callback available in App.tsx that forces immediate tab switch
  implication: After successful stop, call selectSession on first active (non-stopped/error) instance

- timestamp: 2026-03-12T00:00:00Z
  checked: TerminalView.tsx props interface (line 46-47)
  found: onStop?: () => void — plain void callback
  implication: Can add isStoppingSession?: boolean prop OR change to return Promise

## Eliminated

- hypothesis: isStopping state lives in TerminalView already
  evidence: No such state found in TerminalView — the stop button is a pure passthrough to onStop prop
  timestamp: 2026-03-12T00:00:00Z

## Resolution

root_cause: |
  1. handleStopSelectedInstance in App.tsx is async but no loading state is tracked/passed down.
  2. After stop completes, no explicit tab switch is triggered — the hysteresis logic in
     useSessionSelection waits for 2 poll cycles before switching away from the stopped session.

fix: |
  1. Add `isStoppingSession` useState<boolean> in App.tsx, set to true before fetch, false after.
  2. Pass `isStoppingSession` as new prop to TerminalView.
  3. In TerminalView, use it to disable Stop button and show spinner.
  4. After successful stop in handleStopSelectedInstance, find first active/idle/starting
     instance and call selectSession() on it.

verification: Build passes (npm run build). Both fixes applied and compile cleanly.
files_changed:
  - src/client/App.tsx
  - src/client/components/TerminalView.tsx
