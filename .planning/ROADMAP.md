# Roadmap: Warden Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-02-12)
- ✅ **v1.1 UX Fixes & Prompt Panel** — Phases 7-8 (shipped 2026-02-12)
- ✅ **v2.0 Mission Control** — Phases 9-11 (shipped 2026-02-18)
- ✅ **v2.1 GSD Manager Plugin** — Phases 12-14 (shipped 2026-02-18)
- ✅ **v2.3 Code Hygiene & Token Usage** — Phases 15-18 (shipped 2026-03-03)
- 🔄 **v3.0 Operator Awareness & Terminal Power Tools** — Phases 19-20 (in progress)

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

<details>
<summary>✅ v2.1 GSD Manager Plugin (Phases 12-14) — SHIPPED 2026-02-18</summary>

- [x] Phase 12: Backend Foundation (2/2 plans) — completed 2026-02-18
- [x] Phase 13: Client Plugin (1/1 plan) — completed 2026-02-18
- [x] Phase 14: Enhanced Agent Visibility (1/1 plan) — completed 2026-02-18

</details>

<details>
<summary>✅ v2.3 Code Hygiene & Token Usage (Phases 15-18) — SHIPPED 2026-03-03</summary>

- [x] Phase 15: Foundation — Dead code removal + shared types (2/2 plans) — completed 2026-02-19
- [x] Phase 16: DRY + SRP — Shared module + tab extraction (2/2 plans) — completed 2026-02-19
- [x] Phase 17: Polish — Lazy-mount, fd safety, regex, setTimeout cleanup (2/2 plans) — completed 2026-02-19
- [x] Phase 18: Fix token usage — JSONL session reader + DB population (2/2 plans) — completed 2026-02-23

</details>

### v3.0 Operator Awareness & Terminal Power Tools (Phases 19-20)

- [ ] **Phase 19: Operator Awareness Wiring** — Permission badge, context pressure badge, agent state chip, keyboard navigation (Ctrl+1-9, Ctrl+[/], Ctrl+B, Escape), Ctrl+F stub
- [ ] **Phase 20: Terminal Search & Browser Notifications** — Full terminal text search (xterm-addon-search@0.13.0), match count, scrollbar gutter markers, browser notification opt-in for permission prompts

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

See `.planning/milestones/v2.3-ROADMAP.md` (v2.0 details preserved in v2.3 archive)

</details>

<details>
<summary>✅ v2.1 Phase Details (Phases 12-14)</summary>

See `.planning/milestones/v2.3-ROADMAP.md` (v2.1 details preserved in v2.3 archive)

</details>

<details>
<summary>✅ v2.3 Phase Details (Phases 15-18)</summary>

See `.planning/milestones/v2.3-ROADMAP.md`

</details>

### Phase 19: Operator Awareness Wiring

**Goal**: The operator can see every agent's state at a glance — permission prompts surface as pulsing amber tab badges, context pressure is visible in the terminal header with color-coded thresholds, the agent state chip shows current working/idle/error/permission state, and keyboard shortcuts enable navigation without touching the mouse.

**Depends on**: Phase 18 (existing `useAgentLiveStatus` hook and `gsdShared.tsx` components)

**Requirements**: AWARE-01, AWARE-02, AWARE-03, AWARE-04, AWARE-05, KB-01, KB-02, KB-03, KB-04, KB-05

**Success Criteria** (what must be TRUE):
  1. When an agent is waiting for permission, a pulsing amber dot appears on its tab in `InstanceTabBar` without the operator switching to that tab; the dot disappears when the operator sends input to that session
  2. The terminal view header for the active session shows a context pressure percentage with the correct color: green for under 70%, amber for 70-89%, and pulsing red for 90% or above; when pressure is undetectable the header shows "—" rather than crashing
  3. The terminal view header shows an agent state chip (working / idle / permission / error) reflecting the current `detectAgentState()` output for the active session
  4. Pressing Ctrl+1 through Ctrl+9 switches to the corresponding session tab; Ctrl+[ and Ctrl+] cycle tabs; Ctrl+B toggles the AgentSidebar; Escape moves focus to the terminal canvas when search is not open
  5. Keyboard shortcuts do not fire when the operator's cursor is inside a text input or textarea (prompt panel, search inputs, etc.)

**Plans:** 2 plans

Plans:
- [ ] 19-01-PLAN.md — Server-side fixes (permission regex, pressure thresholds) + lift useAgentLiveStatus to App.tsx + permission badge on tabs + state chip and pressure in terminal header
- [ ] 19-02-PLAN.md — Global keyboard shortcuts (useGlobalHotkeys hook, Ctrl+1-9/[/]/B/F/Escape) + xterm PTY key suppression

---

### Phase 20: Terminal Search & Browser Notifications

**Goal**: The operator can search the full terminal scrollback buffer in any session, see match count and gutter markers, navigate matches with keyboard or buttons, and optionally receive a browser notification when a permission prompt fires while the browser tab is not focused.

**Depends on**: Phase 19 (Ctrl+F handler stub, permission detection infrastructure, browser notification permission detection)

**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07, AWARE-06, AWARE-07, AWARE-08

**Success Criteria** (what must be TRUE):
  1. Pressing Ctrl+F in the terminal view opens a search overlay without triggering the browser's native find bar; typing in the overlay highlights matching text throughout the full scrollback buffer (not just visible lines)
  2. The search overlay shows a match count in "N / M" format; when matches exceed 1000 the display shows "1000+" rather than freezing the UI; yellow gutter markers appear on the scrollbar at match positions
  3. Pressing Enter or clicking Next advances to the next match; Shift+Enter or clicking Previous goes to the previous match; Escape closes the overlay and returns keyboard focus to the terminal canvas
  4. Search input is debounced at 300ms so typing quickly in a large buffer does not block the UI
  5. A settings toggle in the UI lets the operator opt in to browser notifications; when opted in and the browser tab is unfocused, a notification fires the first time an agent enters permission state; the notification does not repeat while the same agent stays in permission state (state-transition only)

**Plans**: TBD

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
| 12. Backend Foundation | v2.1 | 2/2 | Complete | 2026-02-18 |
| 13. Client Plugin | v2.1 | 1/1 | Complete | 2026-02-18 |
| 14. Enhanced Agent Visibility | v2.1 | 1/1 | Complete | 2026-02-18 |
| 15. Foundation | v2.3 | 2/2 | Complete | 2026-02-19 |
| 16. DRY + SRP | v2.3 | 2/2 | Complete | 2026-02-19 |
| 17. Polish | v2.3 | 2/2 | Complete | 2026-02-19 |
| 18. Fix token usage | v2.3 | 2/2 | Complete | 2026-02-23 |
| 19. Operator Awareness Wiring | v3.0 | 0/2 | Planned | — |
| 20. Terminal Search & Browser Notifications | v3.0 | 0/? | Not started | — |
