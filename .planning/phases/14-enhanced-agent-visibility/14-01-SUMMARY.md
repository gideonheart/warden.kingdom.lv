---
phase: 14-enhanced-agent-visibility
plan: 01
subsystem: gsd-manager-plugin
tags: [live-status, tmux, agent-visibility, context-pressure, gsd-phase]
dependency_graph:
  requires:
    - 13-01 (GSD Manager plugin and hooks)
    - 12 (GSD backend routes and registry service)
  provides:
    - Live agent state badges in Agents grid
    - Context pressure indicators in Agents grid
    - GSD phase/progress display in Agents grid
  affects:
    - src/server/routes/gsdRoutes.ts
    - src/client/plugins/gsd-manager-plugin.tsx
tech_stack:
  added: []
  patterns:
    - Promise.allSettled for parallel tmux capture-pane per agent
    - setInterval polling hooks with cleanup on unmount
    - useMemo for stable sessionNames dependency key
key_files:
  created:
    - src/client/hooks/useAgentLiveStatus.ts
    - src/client/hooks/useAgentStateFiles.ts
  modified:
    - src/server/routes/gsdRoutes.ts
    - src/client/plugins/gsd-manager-plugin.tsx
decisions:
  - "Promise.allSettled for live-status: parallel tmux captures with per-agent error isolation — dead sessions return nulls, not errors"
  - "sessionNames.join(',') as stable useEffect dependency key for useAgentStateFiles — avoids re-registering intervals on every render"
  - "Working Dir column removed from Agents grid only, preserved in Registry tab — Agents grid now fits 7 columns without horizontal scroll"
  - "extractContextPressure reads last 5 non-empty pane lines — Claude Code status bar is always near bottom of pane output"
metrics:
  duration_minutes: 4
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
  completed_date: "2026-02-18"
---

# Phase 14 Plan 01: Enhanced Agent Visibility Summary

**One-liner:** Live agent state badges (working/idle/menu/perm/error), context pressure percentage, and GSD phase/progress in Agents grid via server-side tmux capture-pane and STATE.md polling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add live-status server endpoint with tmux pane capture | `1ddda65` | src/server/routes/gsdRoutes.ts |
| 2 | Create useAgentLiveStatus and useAgentStateFiles client hooks | `178af1c` | src/client/hooks/useAgentLiveStatus.ts, src/client/hooks/useAgentStateFiles.ts |
| 3 | Extend Agents grid with State, Ctx, and Phase columns | `01b447f` | src/client/plugins/gsd-manager-plugin.tsx |

## What Was Built

### Server: GET /api/gsd/agents/live-status

Added to `gsdRoutes.ts`:

- `detectAgentState(pane)`: Matches pane content against patterns for menu, permission_prompt, idle, error — defaults to working
- `extractContextPressure(pane)`: Takes last 5 non-empty pane lines, extracts `%` value, classifies as ok/warning/critical
- Route uses `Promise.allSettled` to capture all agent panes in parallel via `tmux capture-pane -pt {session}:0.0 -S -5`
- Dead/stopped sessions catch errors and return nulls — no 500 errors from stopped sessions

Verified output (live system):
```json
{
  "agents": [
    { "agentId": "forge", "sessionName": "forge-main", "state": null, "contextPressure": null, "contextPressureLevel": null },
    { "agentId": "warden", "sessionName": "warden-main-3", "state": "permission_prompt", "contextPressure": 54, "contextPressureLevel": "warning" }
  ]
}
```

### Client Hooks

**useAgentLiveStatus.ts** — polls `/api/gsd/agents/live-status` every 5s, returns `Map<agentId, AgentLiveStatus>`. Preserves previous data on fetch errors.

**useAgentStateFiles.ts** — polls `/api/gsd/sessions/:session/state` every 30s for each session in parallel via `Promise.allSettled`. Parses `Phase:` and `Progress:` from STATE.md content. Uses `sessionNames.join(',')` as stable dependency key.

### Plugin: Enhanced Agents Grid

Added three display components:
- `StateBadge`: Color-coded pill (indigo=working, slate=idle, amber=menu/perm, red=error)
- `PressureIndicator`: Colored percentage (green <50%, amber 50-79%, red >=80%)
- `PhaseProgress`: Monospace `P{phase} {progress}%` or dash

Agents grid now shows 7 columns: Status | Agent ID | Session | State | Ctx | Phase | Enabled

Working Dir column removed from Agents grid (preserved in Registry tab).

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `npm run typecheck` — PASSED, no errors
2. `curl -s http://localhost:3001/api/gsd/agents/live-status | jq .` — returns valid JSON with real agent data
3. Stopped agent (forge-main) returns null values without errors
4. Active agent (warden-main-3) returns live state=permission_prompt, contextPressure=54, contextPressureLevel=warning

## Self-Check: PASSED

Files verified:
- FOUND: src/server/routes/gsdRoutes.ts (contains detectAgentState)
- FOUND: src/client/hooks/useAgentLiveStatus.ts
- FOUND: src/client/hooks/useAgentStateFiles.ts
- FOUND: src/client/plugins/gsd-manager-plugin.tsx (contains StateBadge)

Commits verified:
- FOUND: 1ddda65 feat(14-01): add GET /api/gsd/agents/live-status endpoint
- FOUND: 178af1c feat(14-01): add useAgentLiveStatus and useAgentStateFiles hooks
- FOUND: 01b447f feat(14-01): extend Agents grid with State, Ctx, and Phase columns
