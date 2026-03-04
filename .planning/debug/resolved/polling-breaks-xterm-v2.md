---
status: resolved
trigger: "polling-breaks-xterm-rerender-v2"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:20:00Z
---

## Current Focus

hypothesis: RESOLVED
test: Build passes, typecheck clean
expecting: TerminalView no longer re-renders on polling cycles
next_action: done

## Symptoms

expected: xterm.js terminal should remain stable and interactive regardless of background API polling
actual: After a few polling cycles, the entire terminal UI breaks — content floats around, layout breaks, terminal becomes unusable. Previous fix (memoizing selectedSessionLiveStatus + React.memo on TerminalView) was INSUFFICIENT.
errors: No JS errors — this is a DOM/layout re-render issue affecting xterm.js
reproduction: Open Warden dashboard, connect to any terminal session. Wait 5-10 seconds.
started: When GSD agent features and budget monitoring pollers were added

## Eliminated

- hypothesis: "liveStatus state update causes re-renders even with data guard"
  evidence: useAgentLiveStatus compares serialized JSON; only calls setStatusMap when data differs. However App still re-renders due to onRestart prop instability.
  timestamp: 2026-03-04T00:10:00Z

- hypothesis: "useActiveInstances setError(null) / setIsLoading(false) causes re-renders every poll"
  evidence: React 18 bails out of re-render when setState is called with the same primitive value. Not the cause.
  timestamp: 2026-03-04T00:10:00Z

## Evidence

- timestamp: 2026-03-04T00:05:00Z
  checked: App.tsx line 207-210 — selectedInstance derivation
  found: `const selectedInstance = activeInstances.find(...)` was NOT memoized — executes on every App render, returning a new object reference
  implication: selectedInstance gets a new object reference whenever App re-renders for any reason (including any polling state update)

- timestamp: 2026-03-04T00:05:00Z
  checked: App.tsx TerminalView props — onRestart
  found: `onRestart={selectedInstance ? () => handleRestartInstance(selectedInstance.id) : undefined}` was an INLINE arrow function. Even though handleRestartInstance was stable (useCallback), the wrapping arrow function is a new closure on every render. React.memo's shallow prop comparison always sees a new function reference → memo is completely defeated.
  implication: TerminalView re-renders on EVERY App render cycle, regardless of all the previous stabilization work on agentLiveStatus and liveStatus data guards.

- timestamp: 2026-03-04T00:08:00Z
  checked: TerminalView useEffect deps — line 618
  found: `}, [tmuxSessionName, sendInput, sendResize]` — the xterm.js initialization effect is NOT the problem (deps are stable). The problem is React reconciling the entire TerminalView JSX tree (header div, overlay divs, xterm container) on every re-render, which disturbs xterm.js DOM layout.
  implication: Layout disruption from reconciliation, not full xterm re-initialization.

## Resolution

root_cause: Two compounding issues in App.tsx defeated React.memo on TerminalView:
  1. `selectedInstance` was computed with an un-memoized `Array.find()` in the render body, producing a new object reference on every App render.
  2. `onRestart` prop was passed as an inline arrow function `() => handleRestartInstance(selectedInstance.id)`, which always creates a new function reference regardless of whether the instance or handler changed. React.memo performs shallow prop comparison — a new function reference means TerminalView ALWAYS re-renders, nullifying all previous stabilization work.

fix:
  1. Wrapped `selectedInstance` in `useMemo([activeInstances, selectedSessionName])` — now stable when the underlying data is unchanged.
  2. Extracted `onRestart` into `handleRestartSelectedInstance` — a `useCallback([handleRestartInstance])` that reads the current instance via a ref (`selectedInstanceRef`). The ref pattern avoids making `selectedInstance` a dependency (which would destabilize the callback on session switch), while still reading the latest value at call time.

verification: `npm run typecheck` passes. `npm run build` passes cleanly.

files_changed:
  - src/client/App.tsx
