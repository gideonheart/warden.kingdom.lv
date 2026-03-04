---
phase: 21-agent-lifecycle-controls
plan: 02
subsystem: ui
tags: [react, lifecycle, tailwind, xterm, controls, dialogs]

# Dependency graph
requires:
  - phase: 21-01
    provides: lifecycle API endpoints (start/stop/restart/force-kill) and AgentInstanceStatus types

provides:
  - Start button per agent in AgentSidebar with disabled state for running agents
  - Lifecycle badges (green/yellow-pulse/orange-pulse/gray/red) in InstanceTabBar
  - Stop confirmation dialog (red action button) in InstanceTabBar
  - Restart confirmation dialog (amber action button) in InstanceTabBar
  - Force Kill button during stopping state in InstanceTabBar
  - Dismissed sessions set (x button on stopped/error tabs) in InstanceTabBar
  - Four lifecycle overlays in TerminalView (starting/stopping/stopped/error)
  - Extended STATUS_COLORS map with starting and stopping entries in gsdShared
  - All 6 lifecycle statuses visible in tab bar via App.tsx activeInstances filter

affects: [phase 22, phase 23, phase 24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confirmation dialogs via local state (confirmingStopSession, confirmingRestartSession) replacing direct action buttons"
    - "Lifecycle overlay pattern in TerminalView using absolute inset-0 z-10 with varying opacity backgrounds"
    - "StartButton as isolated sub-component with local isStarting/errorMessage state to prevent re-renders"
    - "dismissedSessions Set in InstanceTabBar for client-side tab removal without server round-trip"

key-files:
  created: []
  modified:
    - src/client/components/gsdShared.tsx
    - src/client/components/AgentSidebar.tsx
    - src/client/components/InstanceTabBar.tsx
    - src/client/components/TerminalView.tsx
    - src/client/App.tsx

key-decisions:
  - "activeInstances filter includes all 6 statuses (active/idle/starting/stopping/stopped/error) — API controls scope, UI shows everything returned"
  - "activeAgentIds Set derived from instances with active/idle/starting status — disables Start button before server confirms"
  - "Dismiss button uses client-side Set — no server call, tab reappears on next poll if still in DB"
  - "Stop button uses two-step inline confirm rather than modal — keeps UI compact and keyboard-accessible"
  - "Restart confirmation uses amber/blue (warden-warning) vs Stop's red (warden-error) for distinct risk signaling"

patterns-established:
  - "Lifecycle overlay pattern: absolute inset-0 flex items-center justify-center with bg-warden-bg/{opacity} z-10 — reuse for any full-terminal status overlay"
  - "Confirmation dialog pattern: local state string|null (null = no dialog, sessionName = active dialog) — inline confirm/cancel buttons replace action button"

requirements-completed: [ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05]

# Metrics
duration: <5min
completed: 2026-03-04
---

# Phase 21 Plan 02: Client Lifecycle Controls Summary

**React lifecycle controls with Start button, confirmation dialogs, Force Kill escape hatch, and terminal overlays for all six session states (starting/active/idle/stopping/stopped/error)**

## Performance

- **Duration:** <5 min (continuation of prior session where Task 1 was already committed)
- **Started:** 2026-03-04T06:13:08Z
- **Completed:** 2026-03-04T06:15:56Z
- **Tasks:** 1 of 2 completed (Task 2 is human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- Start button added to each agent row in AgentSidebar with disabled/Running state and local loading spinner
- InstanceTabBar extended with lifecycle badges (animate-pulse for starting/stopping), Stop confirmation dialog (red), Restart confirmation dialog (amber), Force Kill button during stopping state, and client-side dismiss x button
- TerminalView gains four contextual overlays: frosted-glass spinner for starting, semi-transparent for stopping, full overlay with restart button for stopped, full overlay with restart button for error
- App.tsx wires handleStartAgent/handleRestartInstance/handleForceKillInstance callbacks to lifecycle API endpoints and passes new props throughout component tree
- gsdShared STATUS_COLORS extended with `starting: 'bg-warden-warning animate-pulse'` and `stopping: 'bg-warden-error/60 animate-pulse'`

## Task Commits

1. **Task 1: Add lifecycle badges, Start button, confirmation dialogs, and terminal overlays** - `e6c70ef` (feat)

**Note:** Task 2 is a `checkpoint:human-verify` — execution pauses here for operator verification.

## Files Created/Modified
- `src/client/components/gsdShared.tsx` - Extended STATUS_COLORS with starting/stopping lifecycle colors
- `src/client/components/AgentSidebar.tsx` - Added StartButton sub-component, onStartAgent/activeAgentIds props
- `src/client/components/InstanceTabBar.tsx` - Lifecycle badges, confirmation dialogs, restart/force-kill buttons, dismiss x
- `src/client/components/TerminalView.tsx` - Four lifecycle overlays (starting/stopping/stopped/error)
- `src/client/App.tsx` - All-status filter, activeAgentIds derivation, lifecycle callbacks, prop wiring

## Decisions Made
- All six lifecycle statuses shown in tab bar — API filters scope, not client-side code
- Confirmation dialogs are inline (not modal) to keep UI compact and avoid focus traps
- Restart button uses amber/warning color vs. Stop's red/error to signal lower risk
- Dismiss button is client-side only (dismissedSessions Set) — reappears on next poll if DB still has the record

## Deviations from Plan

None - plan was previously executed exactly as specified (commit e6c70ef from prior session).

## Issues Encountered
None — Task 1 was already committed in a prior session. Build passes cleanly.

## Next Phase Readiness
- Task 2 checkpoint requires operator to verify end-to-end lifecycle flow in browser
- Once verified, Phase 21 is complete and Phase 22 can proceed
- No blockers identified

---
*Phase: 21-agent-lifecycle-controls*
*Completed: 2026-03-04*
