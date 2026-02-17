# Roadmap: Warden Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-02-12)
- ✅ **v1.1 UX Fixes & Prompt Panel** — Phases 7-8 (shipped 2026-02-12)
- 📋 **v2.0 Mission Control** — Phases 9-11 (planned)

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

### 📋 v2.0 Mission Control (Planned)

**Milestone Goal:** Transform Warden from a terminal viewer into an extensible mission control platform with plugin architecture, agent activity auditing, and mobile-first design.

#### Phase 9: Plugin Registry Foundation

**Goal:** Operator can register, view, and toggle tool modules with build-time type-safe registration and UI panel rendering

**Depends on:** Phase 8

**Requirements:** PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PLUG-06

**Success Criteria** (what must be TRUE):
1. Operator can view a metadata table showing all registered plugins with name, version, description, and status
2. Operator can enable or disable any plugin via toggle and see UI panels appear/disappear immediately
3. Plugin developers can register new plugins by adding a single TypeScript module file with co-located metadata, code, and UI
4. Plugin UI panels render in designated layout slots without breaking the main application
5. TypeScript compiler catches invalid plugin manifests at build time

**Plans:** 2 plans

Plans:
- [x] 09-01-PLAN.md — Plugin types, auto-discovery registry, usePluginRegistry hook, example plugin
- [x] 09-02-PLAN.md — PluginRegistryView table, PluginSlotRenderer, App.tsx integration with nav and slots

#### Phase 10: Mobile-First UI Restructure

**Goal:** Operator can use full Warden dashboard experience on mobile devices with responsive layout, collapsible panels, and touch-optimized controls

**Depends on:** Phase 9

**Requirements:** MOBI-01, MOBI-02, MOBI-03, MOBI-04, MOBI-05, MOBI-06, MOBI-07

**Success Criteria** (what must be TRUE):
1. Dashboard renders cleanly from 375px mobile to 1920px desktop with no horizontal scroll or broken layouts
2. Agent details, session logs, and token usage collapse into accordion panels that operator can expand/collapse with single tap
3. Prompt panel renders as bottom sheet on mobile, thumb-reachable from bottom of screen
4. Operator can scroll terminal output with touch on mobile and swipe between session tabs
5. All interactive elements meet 44x44px minimum touch target size with proper safe area insets

**Plans:** 2 plans

Plans:
- [ ] 10-01-PLAN.md — Mobile header hamburger, safe areas, touch targets, scroll-snap tabs, font size toggle, responsive data views
- [ ] 10-02-PLAN.md — MobilePromptSheet bottom sheet, HistoryView accordion panels

#### Phase 11: Activity Timeline & Audit Log

**Goal:** Operator can view chronological timeline of all agent activity with structured event capture, filtering, export, and terminal linking

**Depends on:** Phase 10

**Requirements:** ACTV-01, ACTV-02, ACTV-03, ACTV-04, ACTV-05, ACTV-06, ACTV-07, ACTV-08, ACTV-09, ACTV-10

**Success Criteria** (what must be TRUE):
1. System captures structured events for session lifecycle changes, operator prompt injections, and terminal input in SQLite with timestamps
2. Operator can view chronological event list in dedicated Activity view, newest events first
3. Operator can click any event to view full metadata detail panel
4. Operator can filter activity by agent, date range, and event type, with results updating in real-time
5. Operator can export filtered activity to CSV or JSON for audit compliance
6. System parses terminal output to extract tool calls, file edits, and commands as structured events with success/failure indicators
7. Operator can click a terminal event and jump directly to the source terminal session at that timestamp

**Plans:** 1/2 plans executed

Plans:
- [ ] 11-01-PLAN.md — Backend event capture pipeline: activity_events table, ActivityEventService with ANSI stripping + terminal parsing, activityRoutes API, hooks into InstanceTracker + TerminalStreamService + agentRoutes
- [ ] 11-02-PLAN.md — Frontend ActivityView with filters, event detail panel, CSV/JSON export, HistoryView tab integration, terminal navigation

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
| 10. Mobile-First UI Restructure | v2.0 | 0/0 | Not started | - |
| 11. Activity Timeline & Audit Log | 1/2 | In Progress|  | - |

### Phase 11.1: Fix tmux visibility when mobile keyboard opens (INSERTED)

**Goal:** Terminal content stays visible and prompt sheet floats above keyboard when mobile keyboard opens/closes

**Depends on:** Phase 11

**Requirements:** MOBI-KB-01, MOBI-KB-02

**Plans:** 1/1 plans complete

Plans:
- [ ] 11.1-01-PLAN.md -- Add visualViewport resize listeners to TerminalView and MobilePromptSheet for cross-platform mobile keyboard handling
