# Phase 21: Agent Lifecycle Controls - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator can start, stop, and restart agent sessions from the Warden dashboard. Sessions display real-time lifecycle state (starting/active/stopping/stopped) with safety dialogs preventing accidental actions. Warden transitions from passive observer to active controller.

Scope: lifecycle actions + state indicators + safety guards. Does NOT include scheduling, auto-restart policies, or batch operations.

</domain>

<decisions>
## Implementation Decisions

### Start flow UX
- Start from AgentSidebar — each agent gets a Start button inline, no separate dialog needed
- Always use the agent's configured project path from openclaw.json — no override field
- Tab appears immediately in the tab bar with a spinning/pulsing indicator and "Starting..." label while the tmux session boots (up to 15s)
- No initial prompt on start — operator uses the existing PromptPanel to send instructions after boot

### Shutdown sequence
- Pulsing "Stopping..." badge in tab during the 5s grace period (no countdown timer — keep it simple)
- Tab stays visible with a "stopped" badge after shutdown — operator can restart from there or manually dismiss
- Force Kill button appears during the grace period so operator can skip waiting if needed
- Same confirmation dialog regardless of whether agent is mid-output — keep dialogs consistent and simple

### Lifecycle indicators
- Color-coded dot badges on tabs: green = active, yellow/pulsing = starting, orange/pulsing = stopping, gray = stopped
- Terminal area shows contextual overlays: "Starting..." placeholder when booting, grayed-out overlay when stopping/stopped
- Hybrid approach for state updates: optimistic UI update immediately on operator action, then confirm/correct on next InstanceTracker poll cycle (10s)
- Distinct visual treatment for stopped vs errored/crashed: gray for intentional stop, red for crash/error

### Confirmation dialogs
- Minimal quick-confirm style: "Stop agent warden-dashboard?" with Stop/Cancel buttons — operator knows what they're doing
- Distinct dialogs per action: Stop dialog is more cautionary (red action button), Restart dialog is softer (amber/blue button)
- Actions triggered from tab bar (existing pattern with stop button) — no context menu needed for now
- 409 duplicate-start prevented at UI level: Start button disabled for agents that already have an active session. 409 is just a server-side safety net

### Claude's Discretion
- Exact animation/transition timing for state changes
- Specific color values within the warden-* theme token system
- Dialog component implementation (modal vs popover vs inline)
- Error handling for failed start/stop/restart API calls (toasts, inline errors, etc.)
- Exact layout of the "Starting..." terminal placeholder

</decisions>

<specifics>
## Specific Ideas

- Start button should feel immediate — tab appears right away, don't wait for session confirmation
- Stopped tabs should remain for context (restart from there) rather than auto-removing
- Force Kill as an escape hatch during grace period — operator needs an out if something hangs
- Keep confirmation dialogs fast and minimal — this is an operator tool, not a consumer app

</specifics>

<deferred>
## Deferred Ideas

- Auto-restart policy for crashed agents — future phase
- Batch start/stop multiple agents — future phase
- Initial prompt injection on start — could be added later via the start dialog
- Right-click context menu on tabs for additional actions — future enhancement
- Scheduled agent start/stop — out of scope

</deferred>

---

*Phase: 21-agent-lifecycle-controls*
*Context gathered: 2026-03-04*
