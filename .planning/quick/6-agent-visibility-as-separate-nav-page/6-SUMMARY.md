---
phase: quick-6
plan: 01
subsystem: client-nav
tags: [navigation, agent-visibility, routing, ui]
dependency_graph:
  requires: [phase-14]
  provides: [agents-page]
  affects: [App.tsx, client-nav]
tech_stack:
  added: []
  patterns: [hash-routing, responsive-card-grid, local-helper-components]
key_files:
  created:
    - src/client/components/AgentsView.tsx
  modified:
    - src/client/App.tsx
decisions:
  - "Local helper components (StateBadge, PressureIndicator, PhaseProgress) copied into AgentsView.tsx — plugins must not export sub-components"
  - "Sidebar toggle button renamed from Agents to Sidebar (desktop + mobile) to disambiguate from new Agents nav page"
  - "AgentsView receives zero props — all data from hooks (useGsdRegistry, useAgentLiveStatus, useAgentStateFiles, useActiveInstances)"
  - "GSD bottom-panel and AgentSidebar remain terminals-only — not shown on Agents page to avoid redundancy"
metrics:
  duration: 139s
  completed: 2026-02-18
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Quick Task 6: Agent Visibility as Separate Nav Page — Summary

**One-liner:** Full-page Agents view as fourth nav item with responsive card grid showing live state, context pressure, and GSD phase per agent.

## What Was Built

A dedicated "Agents" navigation view has been added to Warden Dashboard as a first-class top-level page. Previously, agent visibility was buried inside the GSD Control Center bottom panel (an expandable panel on the Terminals view). Now operators can navigate directly to a full-page agent overview grid.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create AgentsView full-page component | `80ab5c5` | `src/client/components/AgentsView.tsx` (220 lines) |
| 2 | Add Agents view to App.tsx navigation and routing | `d45a5ed` | `src/client/App.tsx` |

## Component Details

### AgentsView.tsx (220 lines)

Self-contained full-page component with:

- **Header area:** "Agents" title + registered count badge + loading/error states
- **Responsive card grid:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- **Per-agent card:**
  - Top: `agent_id` (font-mono, font-semibold) + status dot + status label
  - Middle: State badge (colored pill), Context pressure (% with color), Phase progress (P14 70%)
  - Bottom: tmux session name (truncated, dim) + enabled/disabled toggle button
- **Empty state:** "No agents registered" centered message
- **Local helper components:** StateBadge, PressureIndicator, PhaseProgress (copied color maps, not imported from plugin)
- **Hover effect:** `hover:border-warden-accent/30 transition-colors`

### App.tsx Changes

- `AppView` type: extended from `'terminals' | 'history' | 'plugins'` to include `'agents'`
- `parseHash()`: handles `view=agents` parameter for URL hash routing
- Desktop nav bar: `Terminals | History | Agents | Plugins | [divider] | Sidebar | Refresh`
- Mobile dropdown: `Terminals | History | Agents | Plugins | [divider] | Sidebar | Refresh`
- Both sidebar toggle buttons renamed from "Agents" to "Sidebar"
- Routing ternary: `currentView === 'agents'` renders `<AgentsView />`
- GSD bottom-panel (`PluginSlotRenderer slot="bottom-panel"`) remains terminals-only

## Data Hooks Used

| Hook | Endpoint | Purpose |
|------|----------|---------|
| `useGsdRegistry()` | `GET /api/gsd/registry` | Agent list, enabled state, toggle |
| `useAgentLiveStatus()` | `GET /api/gsd/agents/live-status` | State badge + context pressure |
| `useAgentStateFiles(sessionNames)` | `GET /api/gsd/sessions/:name/state` | GSD phase/progress from STATE.md |
| `useActiveInstances()` | `GET /api/instances` | tmux session status dot |

## Verification

- `npx tsc --noEmit`: PASS (zero errors)
- Nav bar: Terminals | History | Agents | Plugins | [divider] | Sidebar | Refresh
- URL: `#view=agents` routes to AgentsView, survives page refresh
- Existing sidebar "Agents" toggle renamed to "Sidebar" (both desktop and mobile)
- GSD Control Center bottom panel unaffected (still terminals-only)
- Mobile dropdown includes Agents option

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/client/components/AgentsView.tsx` exists (220 lines, above 80-line minimum)
- [x] `src/client/App.tsx` updated (AppView type, parseHash, nav buttons, routing)
- [x] Commit `80ab5c5` exists (AgentsView component)
- [x] Commit `d45a5ed` exists (App.tsx routing)
- [x] TypeScript compiles without errors
- [x] All key_links verified: AgentsView uses useGsdRegistry + useAgentLiveStatus + useActiveInstances, App.tsx routes `currentView === 'agents'` to `<AgentsView />`

## Self-Check: PASSED
