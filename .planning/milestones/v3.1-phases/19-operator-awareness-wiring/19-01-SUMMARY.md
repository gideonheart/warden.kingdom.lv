---
phase: 19-operator-awareness-wiring
plan: 01
subsystem: ui
tags: [react, typescript, tailwind, xterm, socket.io, polling]

# Dependency graph
requires:
  - phase: 14-enhanced-agent-visibility
    provides: useAgentLiveStatus hook + gsdRoutes live-status endpoint + gsdShared.tsx StateBadge/PressureIndicator components
  - phase: 17-polish
    provides: extractContextPressure anchored regex + JSON.stringify comparison dedup in useAgentLiveStatus
provides:
  - Permission detection tightened to Claude-specific prompt strings (eliminates npm/git false positives)
  - Pressure thresholds corrected to match UX spec (90/70 not 80/50)
  - useAgentLiveStatus lifted to App.tsx — single poll interval feeding both InstanceTabBar and TerminalView
  - Pulsing amber badge on InstanceTabBar tabs for agents in permission_prompt state
  - State chip (StateBadge) + color-coded context pressure in TerminalView header
  - terminalFocusRef wired for Phase 19 Plan 02 keyboard shortcuts
affects:
  - 19-02-PLAN (uses terminalFocusRef established here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lift shared hook to App.tsx + sessionStatusMap useMemo bridges agentId->tmuxSessionName for child components"
    - "headerPressureText module-scope helper for inline JSX formatting without modifying shared PressureIndicator"
    - "terminalFocusRef pattern: MutableRefObject<(() => void) | null> registered via useEffect, cleared on unmount"

key-files:
  created: []
  modified:
    - src/server/routes/gsdRoutes.ts
    - src/client/App.tsx
    - src/client/components/InstanceTabBar.tsx
    - src/client/components/TerminalView.tsx

key-decisions:
  - "Call useAgentLiveStatus in App.tsx (not AgentsTab) — props-down to TerminalView and InstanceTabBar avoids second poll interval"
  - "sessionStatusMap useMemo bridges agentId (hook key) to tmuxSessionName (component lookup key)"
  - "terminalFocusRef: MutableRefObject<(() => void) | null> in App.tsx forwarded to TerminalView for Plan 02 keyboard shortcuts"
  - "headerPressureText helper at module scope uses text-[10px] matching terminal header font budget — avoids modifying shared PressureIndicator"
  - "Permission regex tightened to Claude-specific /Do you want to proceed?|=> 1. Yes/ — eliminates false positives from npm/git output"
  - "Pressure thresholds corrected: critical >=90%, warning >=70% (was: 80%/50%) to match UX specification"

patterns-established:
  - "Hook lifting pattern: shared poll hooks lifted to App root, sessionStatusMap useMemo converts key space for consumers"
  - "terminalFocusRef: register callback in useEffect, clean up on unmount — allows cross-component focus without exposing xterm instance"

requirements-completed:
  - AWARE-01
  - AWARE-02
  - AWARE-03
  - AWARE-04
  - AWARE-05

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 19 Plan 01: Operator Awareness Wiring Summary

**Pulsing amber permission badge on session tabs + state chip and color-coded context pressure in terminal header, backed by tightened Claude-specific permission detection and corrected 90/70 pressure thresholds**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T19:58:20Z
- **Completed:** 2026-03-03T20:01:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Fixed server-side permission detection: regex now targets Claude Code's actual permission dialog strings ("Do you want to proceed?", "❯ 1. Yes") instead of broad word matches that produced false positives on npm/git output
- Fixed pressure level thresholds: 90%/70% boundary matching UX specification (was 80%/50%)
- Lifted `useAgentLiveStatus` from AgentsTab into App.tsx so TerminalView and InstanceTabBar consume live status without adding a second poll interval
- InstanceTabBar renders a pulsing amber dot on tabs for agents in `permission_prompt` state, auto-clears on next 5s poll
- TerminalView header shows `StateBadge` state chip + color-coded pressure percentage (green <70%, amber 70-89%, pulsing red >=90%, em-dash when null) before the font-size button
- `terminalFocusRef` wired end-to-end from App.tsx through TerminalView for Phase 19 Plan 02 keyboard shortcuts

## Task Commits

1. **Task 1: Fix server-side permission regex and pressure thresholds** - `25ef7e3` (fix)
2. **Task 2: Wire useAgentLiveStatus to App.tsx, InstanceTabBar, and TerminalView** - `348987f` (feat)

## Files Created/Modified

- `src/server/routes/gsdRoutes.ts` — Tightened `detectAgentState()` permission regex; corrected `extractContextPressure()` thresholds to 90/70
- `src/client/App.tsx` — Added `useAgentLiveStatus()` + `sessionStatusMap` useMemo + `terminalFocusRef`; passed new props to InstanceTabBar and TerminalView
- `src/client/components/InstanceTabBar.tsx` — Added `sessionStatusMap` prop; pulsing amber dot for `permission_prompt` state
- `src/client/components/TerminalView.tsx` — Added `agentLiveStatus` + `terminalFocusRef` props; `headerPressureText` helper; StateBadge + pressure in header; focus registration effect

## Decisions Made

- Called `useAgentLiveStatus()` in App.tsx (not AgentsTab) so the single poll interval serves both terminal header and tab bar without duplication. The hook's JSON comparison dedup (introduced Phase 17) keeps the Map reference stable, so the useMemo for sessionStatusMap only recomputes on actual data changes.
- `sessionStatusMap` useMemo bridges the key space: hook returns data keyed by `agentId`, but InstanceTabBar and TerminalView look up by `tmuxSessionName`.
- `terminalFocusRef` follows the established callback-ref pattern: `MutableRefObject<(() => void) | null>` registered in TerminalView's useEffect and cleared on unmount. Plan 02 keyboard shortcuts will call this without needing access to the xterm Terminal instance.
- `headerPressureText` placed at module scope above TerminalView — it's an inline JSX helper that uses `text-[10px]` to match the terminal header's compact font budget, distinct from the `text-sm` PressureIndicator used in AgentsTab cards.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 19 Plan 02 (keyboard shortcuts) can use `terminalFocusRef` established here
- Permission badge auto-clears on poll cycle when agent leaves permission state
- All AWARE-01 through AWARE-05 requirements satisfied

## Self-Check: PASSED

All files exist and both task commits verified in git log.

---
*Phase: 19-operator-awareness-wiring*
*Completed: 2026-03-03*
