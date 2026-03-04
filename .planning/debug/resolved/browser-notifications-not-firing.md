---
status: resolved
trigger: "browser-notifications-not-firing"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:00:00Z
---

## Current Focus

hypothesis: THREE bugs confirmed — (1) the notification toggle button only appears on terminals view while a session is selected, (2) useBrowserNotifications only fires on `permission_prompt` state transitions (NOT budget alerts or session status changes), and (3) `useAgentLiveStatus` is DISABLED on the terminals view (isTerminalsView=true → enabled=false), meaning sessionStatusMap is always empty while on terminals view, so notifications can never fire.
test: Confirmed by code reading. All three are structural/logic bugs.
expecting: Fix all three issues
next_action: Implement fixes

## Symptoms

expected: Budget alerts, session status changes trigger browser notifications after user enables them in settings
actual: Nothing happens — no notification appears, no browser permission prompt either
errors: None reported
reproduction: Enable browser notifications in Warden settings, trigger events that should produce notifications
started: Never worked — first time testing notifications feature

## Eliminated

## Evidence

- timestamp: 2026-03-04T00:10:00Z
  checked: useBrowserNotifications.ts — what triggers a notification
  found: Hook ONLY fires notifications when a session enters `permission_prompt` state AND the browser tab is hidden. No budget alert notifications exist here at all.
  implication: Budget alerts never produce a browser notification, regardless of enablement.

- timestamp: 2026-03-04T00:10:00Z
  checked: App.tsx line 96 — useAgentLiveStatus enablement
  found: `const liveStatus = useAgentLiveStatus(!isTerminalsView);` — disabled (returns EMPTY_MAP) when on the Terminals view
  implication: sessionStatusMap is always empty Map when on Terminals view. useBrowserNotifications receives empty map → no notifications ever fire while user is on Terminals view.

- timestamp: 2026-03-04T00:10:00Z
  checked: App.tsx line 247 — useBudgetAlerts enablement
  found: `const budgetAlertLevel = useBudgetAlerts(!isTerminalsView);` — also disabled on terminals view
  implication: Budget polling is paused while on terminals view AND budget level changes never connect to browser notifications at all (useBudgetAlerts returns a level string but nothing converts it to a Notification API call).

- timestamp: 2026-03-04T00:10:00Z
  checked: useBrowserNotifications notification trigger line 65
  found: `if (status.state !== 'permission_prompt') continue;` — only ever notifies for permission_prompt state, not for budget alerts, not for session state changes in general.
  implication: The feature scope is much narrower than what the user expects. Even if wired correctly it only handles one scenario.

- timestamp: 2026-03-04T00:10:00Z
  checked: TerminalView.tsx line 666 — where notification toggle button is rendered
  found: Button is inside TerminalView, which only renders when `currentView === 'terminals'` AND `selectedSessionName` is truthy AND instance is selected. No notification toggle appears on any other view.
  implication: User can only find/toggle notifications from the terminal header toolbar — this is fine UX-wise but the disabling of liveStatus on terminals view breaks the actual functionality.

- timestamp: 2026-03-04T00:10:00Z
  checked: App.tsx lines 94-108 — sessionStatusMap construction
  found: `sessionStatusMap` is built from `liveStatus` which is EMPTY_MAP when isTerminalsView=true. So sessionStatusMap passed to useBrowserNotifications is always empty on terminals view.
  implication: Notifications are architecturally impossible to fire: the place you enable notifications (TerminalView, only shown on terminals view) is the exact view where live status polling is disabled, so the hook never gets data to check.

## Resolution

root_cause: Three compounding bugs: (1) useAgentLiveStatus is disabled on terminals view for performance reasons, but useBrowserNotifications depends on liveStatus data — creating an architectural conflict where enabling notifications from the terminals view is the only UX affordance but the terminals view disables the data source; (2) useBudgetAlerts data never connects to any Notification API call; (3) useBrowserNotifications only handles permission_prompt state, not budget threshold events.

fix: |
  1. Added a second `useAgentLiveStatus(true)` call in App.tsx (notificationLiveStatus) that stays
     always-on regardless of current view. Built a separate notificationSessionStatusMap from it,
     passed exclusively to useBrowserNotifications — not into the render path — so xterm performance
     optimization is fully preserved.
  2. Added a second `useBudgetAlerts(true)` call (budgetAlertLevelForNotifications) always-on,
     passed to useBrowserNotifications. The existing view-gated budgetAlertLevel remains for the
     History nav badge.
  3. Updated useBrowserNotifications to accept budgetAlertLevel param and fire OS notifications
     on ok→warning and ok→exceeded transitions using previousBudgetLevelRef for deduplication.
  4. Removed the visibilityState === 'hidden' guard on permission_prompt notifications — it was
     suppressing all notifications when the user had the tab open.

verification: TypeScript typecheck passes clean. Production build (vite + tsc) succeeds. All three
  structural bugs addressed. Notifications will now fire on the terminals view when permission_prompt
  state is detected AND when budget thresholds are crossed.
files_changed:
  - src/client/App.tsx
  - src/client/hooks/useBrowserNotifications.ts
