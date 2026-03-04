---
phase: 20-terminal-search-browser-notifications
plan: 02
subsystem: ui
tags: [react, notifications, browser-notifications, hooks, localStorage, xterm]

# Dependency graph
requires:
  - phase: 20-01
    provides: "sessionStatusMap in App.tsx, permission_prompt state detection via useAgentLiveStatus"
  - phase: 19-01
    provides: "useAgentLiveStatus hook, AgentLiveStatus type, terminalFocusRef pattern"
provides:
  - "useBrowserNotifications hook with state-transition detection, localStorage persistence, permission management"
  - "Bell icon toggle in TerminalView header (between agent status and font size button)"
  - "Browser notification fires on permission_prompt state transition when tab is unfocused"
affects: [future phases needing notification infrastructure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notification API with tag-based deduplication (tag: warden-permission-{sessionName})"
    - "State-transition detection via useRef<Set<string>> — fires notification only on entry, not while sustained"
    - "User gesture requirement: Notification.requestPermission() called inside button onClick handler"
    - "localStorage persistence pattern matching FONT_SIZE_STORAGE_KEY in TerminalView"

key-files:
  created:
    - src/client/hooks/useBrowserNotifications.ts
  modified:
    - src/client/App.tsx
    - src/client/components/TerminalView.tsx

key-decisions:
  - "State-transition detection via useRef<Set<string>>: fires notification only when session ENTERS permission_prompt, not while sustained — prevents notification spam"
  - "Notification tag warden-permission-{sessionName} provides browser-level deduplication as second defense layer"
  - "document.visibilityState === 'hidden' guard: no notification if operator is actively watching the tab"
  - "window.focus() in notification.onclick: unreliable on macOS Chrome/Firefox but worth attempting — accepted limitation (from v3.0 research)"
  - "notificationPermission === 'unsupported' hides bell button entirely — clean UI for environments without Notification API"
  - "disabled prop on bell button when permission is 'denied' — prevents click that does nothing, tooltip explains how to fix"

patterns-established:
  - "Opt-in toggle props pattern: notificationsEnabled + onToggleNotifications + notificationPermission passed down from App.tsx"
  - "isSupported guard pattern for browser APIs: check typeof Notification !== 'undefined' before all Notification calls"

requirements-completed:
  - AWARE-06
  - AWARE-07
  - AWARE-08

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 20 Plan 02: Browser Notifications Summary

**Desktop notification opt-in for permission-prompt state transitions: bell icon toggle in TerminalView header, state-transition detection via ref-based Set, localStorage persistence, Notification API with tag deduplication**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T21:01:44Z
- **Completed:** 2026-03-03T21:03:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `useBrowserNotifications` hook with state-transition detection — fires notification only when a session ENTERS `permission_prompt`, not while it stays in that state
- Bell icon toggle added to TerminalView header between agent status indicators and font size button
- Toggle state persists in localStorage (`warden:notifications-enabled`) across page reloads
- Permission request triggered by user gesture (button click) — browser allows this path
- Clicking notification attempts `window.focus()` and switches to alerting session via `onSelectSession`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useBrowserNotifications hook and wire into App.tsx** - `272093e` (feat)
2. **Task 2: Add bell icon toggle to TerminalView header** - `797ff01` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/client/hooks/useBrowserNotifications.ts` - New hook: state-transition detection, localStorage persistence, permission management, toggleNotifications callback
- `src/client/App.tsx` - Import and call useBrowserNotifications, pass props to TerminalView
- `src/client/components/TerminalView.tsx` - Extend TerminalViewProps, destructure new props, render bell icon button in header

## Decisions Made
- State-transition detection via `useRef<Set<string>>`: compares current permission_prompt session set against previous set; fires notification only on new entries. Prevents repeated notifications while agent stays in permission state.
- `document.visibilityState === 'hidden'` guard: notification only fires when tab is unfocused. No interruption if operator is actively watching.
- `window.focus()` in notification.onclick: unreliable on macOS Chrome/Firefox (known browser limitation from v3.0 research) — still included as best-effort.
- Bell icon hidden entirely when `notificationPermission === 'unsupported'` — clean UI for environments without Notification API (older browsers, SSR).
- `disabled` attribute on bell button when permission is `'denied'` — click would do nothing, tooltip explains remedy.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 20 is complete. Both plans executed:
- Plan 01: Terminal scrollback search with xterm-addon-search and Ctrl+F overlay
- Plan 02: Browser notifications for permission-prompt state transitions

v3.0 milestone (Operator Awareness & Terminal Power Tools) is complete. All AWARE-* requirements met.

## Self-Check: PASSED

- FOUND: src/client/hooks/useBrowserNotifications.ts
- FOUND: src/client/App.tsx (modified)
- FOUND: src/client/components/TerminalView.tsx (modified)
- FOUND: .planning/phases/20-terminal-search-browser-notifications/20-02-SUMMARY.md
- FOUND: commit 272093e (feat(20-02): add useBrowserNotifications hook and wire into App.tsx)
- FOUND: commit 797ff01 (feat(20-02): add bell icon notification toggle to TerminalView header)

---
*Phase: 20-terminal-search-browser-notifications*
*Completed: 2026-03-03*
