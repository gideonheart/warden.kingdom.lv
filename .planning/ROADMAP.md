# Roadmap: Warden Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-02-12)
- ✅ **v1.1 UX Fixes & Prompt Panel** — Phases 7-8 (shipped 2026-02-12)
- ✅ **v2.0 Mission Control** — Phases 9-11 (shipped 2026-02-18)
- 📋 **v2.1 GSD Manager Plugin** — Phases 12-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-02-12</summary>

- [x] Phase 1: Core Infrastructure (2/2 plans) — completed 2026-02-12
- [x] Phase 2: Terminal Integration (1/1 plan) — completed 2026-02-12
- [x] Phase 3: Agent Integration (1/1 plan) — completed 2026-02-12
- [x] Phase 4: History & Analytics (1/1 plan) — completed 2026-02-12
- [x] Phase 5: Production Deployment (1/1 plan) — completed 2026-02-12
- [x] Phase 6: Close v1 Audit Gaps (3/3 plans) — completed 2026-02-12

</details>

<details>
<summary>✅ v1.1 UX Fixes & Prompt Panel (Phases 7-8) — SHIPPED 2026-02-12</summary>

- [x] Phase 7: Terminal Interactivity & Scrollback (1/1 plan) — completed 2026-02-12
- [x] Phase 8: Prompt Panel & Gateway Integration (1/1 plan) — completed 2026-02-12

</details>

<details>
<summary>✅ v2.0 Mission Control (Phases 9-11) — SHIPPED 2026-02-18</summary>

- [x] Phase 9: Plugin Registry Foundation (2/2 plans) — completed 2026-02-17
- [x] Phase 10: Mobile-First UI Restructure (2/2 plans) — completed 2026-02-18
- [x] Phase 11: Activity Timeline & Audit Log (2/2 plans) — completed 2026-02-18

</details>

### 📋 v2.1 GSD Manager Plugin (In Progress)

**Milestone Goal:** Add a GSD Control Center plugin that lets the operator spawn agents, send commands, view session state, and monitor hook activity — all from the browser.

- [x] **Phase 12: Backend Foundation** - Types, services, REST API, and Socket.IO namespace for GSD operations with full input validation (completed 2026-02-18)
- [ ] **Phase 13: Client Plugin** - Self-registering gsd-manager-plugin with agent grid, spawn form, command dispatch, registry viewer, hook feed, and inline bash reference
- [ ] **Phase 14: Enhanced Agent Visibility** - State hint badges, context pressure indicators, and STATE.md phase/progress per agent

## Phase Details

<details>
<summary>✅ v1.0 MVP Phase Details (Phases 1-6)</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Phase Details (Phases 7-8)</summary>

See `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Phase Details (Phases 9-11)</summary>

### Phase 9: Plugin Registry Foundation
**Goal**: Operator can register, view, and toggle tool modules with build-time type-safe registration and UI panel rendering
**Depends on**: Phase 8
**Requirements**: PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PLUG-06
**Success Criteria** (what must be TRUE):
  1. Operator can view a metadata table showing all registered plugins with name, version, description, and status
  2. Operator can enable or disable any plugin via toggle and see UI panels appear/disappear immediately
  3. Plugin developers can register new plugins by adding a single TypeScript module file with co-located metadata, code, and UI
  4. Plugin UI panels render in designated layout slots without breaking the main application
  5. TypeScript compiler catches invalid plugin manifests at build time
**Plans**: 09-01-PLAN.md, 09-02-PLAN.md

### Phase 10: Mobile-First UI Restructure
**Goal**: Operator can use full Warden dashboard experience on mobile devices with responsive layout, collapsible panels, and touch-optimized controls
**Depends on**: Phase 9
**Requirements**: MOBI-01, MOBI-02, MOBI-03, MOBI-04, MOBI-05, MOBI-06, MOBI-07
**Success Criteria** (what must be TRUE):
  1. Dashboard renders cleanly from 375px mobile to 1920px desktop with no horizontal scroll or broken layouts
  2. Agent details, session logs, and token usage collapse into accordion panels that operator can expand/collapse with single tap
  3. Prompt panel renders as bottom sheet on mobile, thumb-reachable from bottom of screen
  4. Operator can scroll terminal output with touch on mobile and swipe between session tabs
  5. All interactive elements meet 44x44px minimum touch target size with proper safe area insets
**Plans**: 10-01-PLAN.md, 10-02-PLAN.md

### Phase 11: Activity Timeline & Audit Log
**Goal**: Operator can view chronological timeline of all agent activity with structured event capture, filtering, export, and terminal linking
**Depends on**: Phase 10
**Requirements**: ACTV-01, ACTV-02, ACTV-03, ACTV-04, ACTV-05, ACTV-06, ACTV-07, ACTV-08, ACTV-09, ACTV-10
**Success Criteria** (what must be TRUE):
  1. System captures structured events for session lifecycle changes, operator prompt injections, and terminal input in SQLite with timestamps
  2. Operator can view chronological event list in dedicated Activity view, newest events first
  3. Operator can click any event to view full metadata detail panel
  4. Operator can filter activity by agent, date range, and event type
  5. Operator can export filtered activity to CSV or JSON
  6. System parses terminal output to extract tool calls, file edits, and commands as structured events with success/failure indicators
  7. Operator can click a terminal event and jump directly to the source terminal session at that timestamp
**Plans**: 11-01-PLAN.md, 11-02-PLAN.md

</details>

---

### Phase 12: Backend Foundation

**Goal**: Server exposes a complete, injection-safe API for all GSD operations — registry reads/writes, agent spawning, command dispatch, hook log streaming — before any client code is written

**Depends on**: Phase 11

**Requirements**: INFRA-01, INFRA-02, INFRA-03

**Success Criteria** (what must be TRUE):
  1. Operator can curl `GET /api/gsd/registry` and receive JSON listing all agents from recovery-registry.json with their enabled status and working directory
  2. Operator can curl `POST /api/gsd/spawn` with agentName and workdir and receive `202 Accepted` immediately, with the new session appearing in `/api/instances` within 10 seconds
  3. Operator can curl `POST /api/gsd/sessions/:session/command` with a valid action and see the command dispatched to the tmux session without shell injection risk
  4. A `socket.io-client` subscriber to the `/gsd-hooks` namespace receives live events as `/tmp/gsd-hooks.log` is appended to, and receives the last 20 events on connect
  5. Requests with path traversal attempts in `workdir` or disallowed characters in `firstCommand` are rejected with 400 before reaching any shell

**Plans**: 2 plans
- [ ] 12-01-PLAN.md — GsdRegistryService and GsdHookLogWatcher services
- [ ] 12-02-PLAN.md — GSD REST routes with validation and server wiring

---

### Phase 13: Client Plugin

**Goal**: Operator can open the GSD Manager bottom-panel plugin and perform all primary control-center operations — view agent grid, spawn agents, send commands, view registry, monitor hook feed, and copy equivalent bash commands

**Depends on**: Phase 12

**Requirements**: GRID-01, GRID-02, CTRL-01, CTRL-02, REG-01, REG-02, HOOK-01, DX-01

**Success Criteria** (what must be TRUE):
  1. Operator can see all managed agents in a grid showing session status (active/idle/stopped) and working directory, updated without page refresh
  2. Operator can fill out a spawn form (agent name, working directory, optional first command) and submit it, seeing the button disable and show "Spawning..." while the session starts
  3. Operator can type any custom command into the command input, select a target session, and dispatch it, seeing "dispatched" confirmation with a reference to the terminal tab
  4. Operator can view the recovery registry table showing all agents with their enabled/disabled status, and toggle any agent's enabled flag with immediate optimistic UI feedback
  5. Operator can see a live feed of the last 20 hook events auto-updating as new events arrive via Socket.IO, newest first
  6. Every UI action (spawn, command, toggle) displays the equivalent manual bash command with a one-click copy-to-clipboard button that shows "Copied!" confirmation

**Plans**: 1 plan
- [ ] 13-01-PLAN.md — Data hooks (useGsdRegistry, useGsdHookFeed) and GSD Manager plugin with 4-tab panel UI

---

### Phase 14: Enhanced Agent Visibility

**Goal**: Operator can see at a glance what each agent is currently doing (state hint), how much context budget remains (pressure), and where each agent is in its GSD workflow (phase and progress)

**Depends on**: Phase 13

**Requirements**: GRID-03, GRID-04, GRID-05

**Success Criteria** (what must be TRUE):
  1. Each agent in the grid shows a color-coded state badge (idle/menu/working/error) derived from hook log activity, updating within 5 seconds of an agent state change
  2. Each agent in the grid shows a context pressure percentage (e.g., "72%") with a visual indicator that distinguishes safe, warning, and critical thresholds
  3. Each agent in the grid shows the current GSD phase number and progress percentage parsed from the agent's STATE.md, falling back to "—" gracefully when STATE.md is absent or unparseable

**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Infrastructure | v1.0 | 2/2 | Complete | 2026-02-12 |
| 2. Terminal Integration | v1.0 | 1/1 | Complete | 2026-02-12 |
| 3. Agent Integration | v1.0 | 1/1 | Complete | 2026-02-12 |
| 4. History & Analytics | v1.0 | 1/1 | Complete | 2026-02-12 |
| 5. Production Deployment | v1.0 | 1/1 | Complete | 2026-02-12 |
| 6. Close v1 Audit Gaps | v1.0 | 3/3 | Complete | 2026-02-12 |
| 7. Terminal Interactivity & Scrollback | v1.1 | 1/1 | Complete | 2026-02-12 |
| 8. Prompt Panel & Gateway Integration | v1.1 | 1/1 | Complete | 2026-02-12 |
| 9. Plugin Registry Foundation | v2.0 | 2/2 | Complete | 2026-02-17 |
| 10. Mobile-First UI Restructure | v2.0 | 2/2 | Complete | 2026-02-18 |
| 11. Activity Timeline & Audit Log | v2.0 | 2/2 | Complete | 2026-02-18 |
| 12. Backend Foundation | 2/2 | Complete    | 2026-02-18 | - |
| 13. Client Plugin | v2.1 | 0/1 | Planned | - |
| 14. Enhanced Agent Visibility | v2.1 | 0/? | Not started | - |
