# Roadmap: Warden Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-02-12)
- ✅ **v1.1 UX Fixes & Prompt Panel** — Phases 7-8 (shipped 2026-02-12)
- ✅ **v2.0 Mission Control** — Phases 9-11 (shipped 2026-02-18)
- ✅ **v2.1 GSD Manager Plugin** — Phases 12-14 (shipped 2026-02-18)
- ✅ **v2.3 Code Hygiene & Token Usage** — Phases 15-18 (shipped 2026-03-03)
- ✅ **v3.0 Operator Awareness & Terminal Power Tools** — Phases 19-20 (shipped 2026-03-04)
- 🚧 **v3.1 Agent Control & Deep Insights** — Phases 21-26 (in progress)

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

<details>
<summary>✅ v3.0 Operator Awareness & Terminal Power Tools (Phases 19-20) — SHIPPED 2026-03-04</summary>

- [x] **Phase 19: Operator Awareness Wiring** — Permission badge, context pressure badge, agent state chip, keyboard navigation (Ctrl+1-9, Ctrl+[/], Ctrl+B, Escape), Ctrl+F stub (completed 2026-03-03)
- [x] **Phase 20: Terminal Search & Browser Notifications** — Full terminal text search (xterm-addon-search@0.13.0), match count, scrollbar gutter markers, browser notification opt-in for permission prompts (completed 2026-03-03)

</details>

### v3.1 Agent Control & Deep Insights (Phases 21-26)

**Milestone Goal:** Advance Warden from a monitoring tool to an active operations platform — agent lifecycle control, cost velocity insights, and session recording.

- [x] **Phase 21: Agent Lifecycle Controls** — Start, stop, restart agent sessions with safety guards and real-time transitional state badges (completed 2026-03-04)
- [x] **Phase 22: Token Burn Rate & Budget Alerts** — Real-time cost velocity with sliding windows, budget thresholds, and cost projection (completed 2026-03-04)
- [x] **Phase 23: Token Analytics & Export** — Model cost comparison view and CSV export of full token usage dataset (completed 2026-03-04)
- [ ] **Phase 26: Token Analytics Polish & Tech Debt** — Fix agent filter accessibility on Model Costs tab, clean up unused imports and label semantics (gap closure)
- [ ] **Phase 24: Session Recording & Replay** — Record terminal output as asciicast v2 files, replay at variable speed, browsable recording library
- [ ] **Phase 25: Recording Automation** — Auto-record sessions based on configurable trigger rules (stretch goal)

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

<details>
<summary>✅ v3.0 Phase Details (Phases 19-20)</summary>

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

**Plans:** 2/2 plans complete

Plans:
- [x] 19-01-PLAN.md — Server-side fixes (permission regex, pressure thresholds) + lift useAgentLiveStatus to App.tsx + permission badge on tabs + state chip and pressure in terminal header
- [x] 19-02-PLAN.md — Global keyboard shortcuts (useGlobalHotkeys hook, Ctrl+1-9/[/]/B/F/Escape) + xterm PTY key suppression

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

**Plans:** 2/2 plans complete

Plans:
- [x] 20-01-PLAN.md — Terminal search: xterm-addon-search integration, TerminalSearchOverlay, Ctrl+F wiring, match count, gutter markers, debounced input
- [x] 20-02-PLAN.md — Browser notifications: useBrowserNotifications hook, bell icon toggle, state-transition firing, localStorage opt-in persistence

</details>

### Phase 21: Agent Lifecycle Controls

**Goal**: Operator can start, stop, and restart agent sessions from the dashboard with safety dialogs and real-time lifecycle state tracking — Warden transitions from observer to active controller.

**Depends on**: Phase 20 (existing TmuxSessionManager, InstanceTracker, tab bar infrastructure)

**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05

**Success Criteria** (what must be TRUE):
  1. Operator can select any configured agent and click Start; a new tmux session with Claude Code running appears as a tab in the dashboard within 15 seconds
  2. Operator can click Stop on any running session; after a confirmation dialog Claude Code receives Ctrl+C, the session enters "stopping" state for up to 5 seconds, then the tmux session is killed and the tab reflects "stopped"
  3. Operator can restart a stopped or errored session; the restart triggers stop (if needed) then start with the same agent identity and project path
  4. Session tab badges display all four lifecycle states — starting, active, stopping, stopped — with visually distinct indicators that update in real time without page reload
  5. Start button is disabled when the agent already has an active session; duplicate start attempts via the API return HTTP 409; stop and restart require a confirmation dialog before executing

**Plans:** 3/3 plans complete

Plans:
- [x] 21-01-PLAN.md — Server-side lifecycle API: extend AgentInstanceStatus with starting/stopping, TmuxSessionManager sendCtrlC + createSessionWithClaude, lifecycle API endpoints (start/stop/restart/force-kill), InstanceTracker transitional state reconciliation
- [x] 21-02-PLAN.md — Client-side lifecycle UI: Start button in AgentSidebar, confirmation dialogs for stop, lifecycle badges (green/yellow-pulse/orange-pulse/gray/red), terminal overlays for transitional states, Force Kill escape hatch, Restart for stopped sessions
- [x] 21-03-PLAN.md — Gap closure: extend listActiveInstances() to include recently-stopped/errored sessions so stopped tabs persist for restart access

---

### Phase 22: Token Burn Rate & Budget Alerts

**Goal**: Operator sees real-time cost velocity per agent and receives visual warnings before daily budget is exceeded — cost surprises become impossible.

**Depends on**: Phase 21 (existing token_usage table, SessionUsageReader, TokenUsageView)

**Requirements**: TOKN-10, TOKN-11, TOKN-13

**Success Criteria** (what must be TRUE):
  1. The token usage view shows a burn rate (cost per hour) per agent with a sliding window selector; operator can switch between 1h, 4h, and 24h windows and the displayed rate updates immediately
  2. Operator can set a daily budget threshold per agent stored in SQLite; when an agent's daily spend crosses 80% of the threshold an amber warning badge appears on the History nav tab; at 100% the badge turns red
  3. The cost projection card shows estimated daily and weekly spend at the current burn rate, recalculating automatically when the operator changes the burn rate window

**Plans:** 2/2 plans complete

Plans:
- [x] 22-01-PLAN.md — Server-side burn rate & budget config: shared types, budget_config table migration, getBurnRate/getBudgetAlertStatus DB methods, four API endpoints (burn-rate, budget-config CRUD, budget-config status)
- [x] 22-02-PLAN.md — Client-side burn rate & alerts: useBudgetAlerts hook, window selector (Today/2-day/7-day), burn rate cards with aggregate total, inline budget editor, progress bar, cost projection card, History nav badge

---

### Phase 23: Token Analytics & Export

**Goal**: Operator can compare model costs across agents for spend optimization and export the full dataset for external analysis.

**Depends on**: Phase 22 (burn rate infrastructure, per-model daily aggregates from SessionUsageReader)

**Requirements**: TOKN-12, TOKN-14

**Success Criteria** (what must be TRUE):
  1. A model comparison view in the token usage section shows cost breakdown by model variant (sonnet/opus/haiku) per agent as a bar chart or data table; operator can see which model is driving the most cost
  2. Clicking the Export button downloads a CSV file containing the full token usage dataset with columns: date, agent_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd

**Plans:** 2/2 plans complete

Plans:
- [ ] 23-01-PLAN.md — Server-side per-model data: token_usage_by_model table, extended JSONL scanner, model-comparison API endpoint, CSV export API endpoint
- [ ] 23-02-PLAN.md — Client-side UI: ModelComparisonView component (bar chart with time ranges, insight headline), Model Costs tab in TokenUsageView, Export CSV button with toast notification

---

### Phase 26: Token Analytics Polish & Tech Debt (Gap Closure)

**Goal**: Fix agent filter accessibility on Model Costs tab so operators can filter without switching tabs, and clean up minor tech debt from Phases 21-23.

**Depends on**: Phase 23 (existing TokenUsageView, ModelComparisonView)

**Requirements**: None (integration/flow gap + tech debt — no new requirements)

**Gap Closure:** Closes integration gap from v3.1 audit (TOKN-12 agent filter, Flow C)

**Success Criteria** (what must be TRUE):
  1. Agent filter input is accessible on both the Token Usage tab and the Model Costs tab — operator can change the filter without switching tabs
  2. Flow C (Token usage → Model Costs tab → change agent filter → export) completes end to end
  3. Unused `{ openSync, closeSync }` import removed from instanceRoutes.ts
  4. `24h` time range label in ModelComparisonView clarified (either rename to "Today" or calculate rolling 24h)

**Plans**: TBD

Plans:
- [ ] 26-01: Agent filter + tech debt — move agentFilter input to shared header visible on all tabs; remove unused fs import; fix 24h label semantics

---

### Phase 24: Session Recording & Replay

**Goal**: Operator can record any terminal session as a standard asciicast v2 file and replay it later at variable speed — every agent action becomes auditable.

**Depends on**: Phase 23 (existing TerminalStreamService PTY pipeline, SQLite database)

**Requirements**: REC-01, REC-02, REC-03, REC-04

**Success Criteria** (what must be TRUE):
  1. When recording is active for a session, PTY output is captured as timestamped asciicast v2 JSON Lines files written to data/recordings/; each completed recording has a corresponding row in the SQLite recordings table with agent name, project, start time, duration, and file size
  2. A Record button in the terminal view header starts and stops recording for the active session; a pulsing red indicator is visible in the header whenever recording is in progress
  3. Operator can open any completed recording in a replay player showing a read-only xterm.js terminal; the player supports 1x, 2x, 4x, and 8x playback speed and pause/resume controls
  4. A Recording Library page or panel lists all past recordings with agent name, project, date, duration, and file size; clicking a recording opens it in the replay player

**Plans**: TBD

Plans:
- [ ] 24-01: Recording capture backend — asciicast v2 writer tapped into TerminalStreamService PTY output pipeline; recordings SQLite table; start/stop recording API endpoints; data/recordings/ directory setup
- [ ] 24-02: Recording UI — Record button with red pulse indicator in TerminalView header; Socket.IO recording state events; RecordingLibrary component; RecordingPlayer with read-only xterm.js and speed controls

---

### Phase 25: Recording Automation (Stretch)

**Goal**: Operator configures rules that trigger recording automatically — capturing critical moments without manual intervention.

**Depends on**: Phase 24 (recording infrastructure), Phase 19 (permission prompt detection)

**Requirements**: REC-05

**Success Criteria** (what must be TRUE):
  1. A settings panel exposes an auto-record dropdown with three options: always (record every session from start), never (recording is manual only), and on-permission-prompt (recording starts automatically when a permission prompt is detected)
  2. When auto-record is set to on-permission-prompt, a recording begins within one polling cycle of a permission prompt being detected, without operator action

**Plans**: TBD

Plans:
- [ ] 25-01: Auto-record settings — settings panel with auto-record dropdown; auto-record rule stored in SQLite or config file; server-side trigger hook in InstanceTracker or TerminalStreamService that fires recording based on configured condition

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
| 12. Backend Foundation | v2.1 | 2/2 | Complete | 2026-02-18 |
| 13. Client Plugin | v2.1 | 1/1 | Complete | 2026-02-18 |
| 14. Enhanced Agent Visibility | v2.1 | 1/1 | Complete | 2026-02-18 |
| 15. Foundation | v2.3 | 2/2 | Complete | 2026-02-19 |
| 16. DRY + SRP | v2.3 | 2/2 | Complete | 2026-02-19 |
| 17. Polish | v2.3 | 2/2 | Complete | 2026-02-19 |
| 18. Fix token usage | v2.3 | 2/2 | Complete | 2026-02-23 |
| 19. Operator Awareness Wiring | v3.0 | 2/2 | Complete | 2026-03-03 |
| 20. Terminal Search & Browser Notifications | v3.0 | 2/2 | Complete | 2026-03-03 |
| 21. Agent Lifecycle Controls | v3.1 | 3/3 | Complete | 2026-03-04 |
| 22. Token Burn Rate & Budget Alerts | v3.1 | 2/2 | Complete | 2026-03-04 |
| 23. Token Analytics & Export | v3.1 | 2/2 | Complete | 2026-03-04 |
| 26. Token Analytics Polish & Tech Debt | v3.1 | 0/1 | Not started | - |
| 24. Session Recording & Replay | v3.1 | 0/2 | Not started | - |
| 25. Recording Automation | v3.1 | 0/1 | Not started | - |
