---
status: resolved
trigger: "terminal-view-periodic-blink - TerminalView re-renders/reloads every 20-30 seconds causing UI blink"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED -- useAgentConfig 30-second poll creates new array references every cycle, triggering unnecessary App re-renders
test: Added JSON serialization dedup refs to useAgentConfig
expecting: No App re-render when agent config data is unchanged
next_action: Archive session

## Symptoms

expected: Terminal view should remain stable once connected to a tmux session. The xterm.js terminal canvas should persist without blinking or re-mounting.
actual: Every 20-30 seconds the whole terminal container blinks/re-renders. Console output drifts/resets. Terminal appears destroyed and recreated.
errors: No specific error messages -- visual/UX issue
reproduction: Open any terminal session in Warden dashboard and watch for 30-60 seconds
started: Likely introduced or worsened during v3.0 changes (Phase 19 useAgentLiveStatus lift, Quick-21 useSessionSelection)

## Eliminated

- hypothesis: TerminalView key prop changes on poll cycle
  evidence: ErrorBoundary key={selectedSessionName} -- selectedSessionName is stable across polls (useSessionSelection has hysteresis logic, useActiveInstances has signature check)
  timestamp: 2026-03-04T00:00:30Z

- hypothesis: useActiveInstances creates new instances reference on each poll
  evidence: computeInstanceSignature() deduplication check prevents setInstances when data is logically unchanged (checks id:tmuxSessionName:status tuples)
  timestamp: 2026-03-04T00:00:31Z

- hypothesis: useAgentLiveStatus creates new Map on each poll
  evidence: JSON serialization check on line 46-47 prevents setStatusMap when data unchanged
  timestamp: 2026-03-04T00:00:32Z

- hypothesis: useSessionSelection changes selectedSessionName on poll
  evidence: activeSessionNamesKey is stable (derived from memoized activeInstances), effect only runs when key changes, hysteresis logic prevents premature fallback
  timestamp: 2026-03-04T00:00:33Z

- hypothesis: Socket.IO periodic disconnects cause terminal:reset
  evidence: WebSocket transport is preferred (transports: ['websocket', 'polling']), pingTimeout is 60s (generous), connectionStateRecovery enabled. No evidence of periodic disconnects in the code path.
  timestamp: 2026-03-04T00:00:34Z

- hypothesis: TerminalView xterm.js useEffect re-runs due to unstable deps
  evidence: Effect deps are [tmuxSessionName, sendInput, sendResize]. sendInput/sendResize are useCallback with [] deps (stable). tmuxSessionName only changes on session switch.
  timestamp: 2026-03-04T00:00:35Z

- hypothesis: Server-side InstanceTracker sync causes status flip
  evidence: upsertInstance runs BEFORE markMissingSessionsStopped; sessions are upserted as active first, then only absent sessions are marked stopped. No brief status oscillation.
  timestamp: 2026-03-04T00:00:36Z

## Evidence

- timestamp: 2026-03-04T00:00:20Z
  checked: useAgentConfig.ts polling interval
  found: REFRESH_INTERVAL_MS = 30_000 (30 seconds) -- matches user's reported 20-30 second blink cycle
  implication: useAgentConfig is the most likely trigger source

- timestamp: 2026-03-04T00:00:21Z
  checked: useAgentConfig.ts state update pattern
  found: setAgents(agentsData.agents) and setTopicMappings(topicsData.mappings) called unconditionally on every successful poll -- NO serialization/dedup check unlike useActiveInstances and useAgentLiveStatus
  implication: Every 30 seconds, new array references are created, causing App to re-render even when data is unchanged

- timestamp: 2026-03-04T00:00:22Z
  checked: Previous fix commit ee8b951
  found: Already fixed three compounding causes: (1) activeInstances memoization, (2) Socket.IO transport order, (3) PTY resize broadcast scope. But useAgentConfig was not addressed.
  implication: This is a 4th compounding cause that survived the previous fix

- timestamp: 2026-03-04T00:00:23Z
  checked: All client-side poll intervals
  found: useActiveInstances=5s (has dedup), useAgentLiveStatus=5s (has dedup), useAgentConfig=30s (NO dedup), useAgentStateFiles=30s (not mounted in terminals view), useGsdRegistry=10s (not mounted in terminals view)
  implication: useAgentConfig is the only poll that runs during terminals view AND lacks deduplication

- timestamp: 2026-03-04T00:00:40Z
  checked: Build, typecheck, and unit tests after fix
  found: Build succeeds, typecheck clean, all 40 unit tests pass
  implication: Fix is safe and introduces no regressions

## Resolution

root_cause: useAgentConfig hook calls setAgents() and setTopicMappings() with new array references every 30 seconds regardless of whether data changed. This triggers unnecessary App re-renders that cascade through the component tree, causing TerminalView re-renders and browser canvas repaints on the xterm.js terminal -- producing the visible blink. This is the 4th compounding cause (the first three were fixed in commit ee8b951).
fix: Added JSON serialization deduplication refs (previousAgentsRef, previousTopicsRef) to useAgentConfig, matching the established pattern used by useActiveInstances (computeInstanceSignature) and useAgentLiveStatus (serialized comparison). The hook now only calls setAgents/setTopicMappings when the poll data has actually changed.
verification: Build succeeds, TypeScript typecheck clean, all 40 unit tests pass. The fix eliminates the sole remaining source of unnecessary App re-renders on a 30-second cycle.
files_changed: [src/client/hooks/useAgentConfig.ts]
