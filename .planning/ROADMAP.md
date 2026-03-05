# Roadmap: Warden Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-02-12)
- ✅ **v1.1 UX Fixes & Prompt Panel** — Phases 7-8 (shipped 2026-02-12)
- ✅ **v2.0 Mission Control** — Phases 9-11 (shipped 2026-02-18)
- ✅ **v2.1 GSD Manager Plugin** — Phases 12-14 (shipped 2026-02-18)
- ✅ **v2.3 Code Hygiene & Token Usage** — Phases 15-18 (shipped 2026-03-03)
- ✅ **v3.0 Operator Awareness & Terminal Power Tools** — Phases 19-20 (shipped 2026-03-04)
- ✅ **v3.1 Agent Control & Deep Insights** — Phases 21-24, 26-27 (shipped 2026-03-04)
- ✅ **v3.2 Mobile Operations & UX Polish** — Phases 28-31 (shipped 2026-03-04)
- ✅ **v3.3 Telegram Operator Awareness** — Phases 32-35 (shipped 2026-03-05)
- 🚧 **v3.4 Smart Session Lifecycle** — Phases 36-40 (in progress)

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

- [x] Phase 19: Operator Awareness Wiring (2/2 plans) — completed 2026-03-03
- [x] Phase 20: Terminal Search & Browser Notifications (2/2 plans) — completed 2026-03-03

</details>

<details>
<summary>✅ v3.1 Agent Control & Deep Insights (Phases 21-24, 26-27) — SHIPPED 2026-03-04</summary>

- [x] Phase 21: Agent Lifecycle Controls (3/3 plans) — completed 2026-03-04
- [x] Phase 22: Token Burn Rate & Budget Alerts (2/2 plans) — completed 2026-03-04
- [x] Phase 23: Token Analytics & Export (2/2 plans) — completed 2026-03-04
- [x] Phase 26: Token Analytics Polish & Tech Debt (1/1 plan) — completed 2026-03-04
- [x] Phase 24: Session Recording & Replay (2/2 plans) — completed 2026-03-04
- [x] Phase 27: Recording State Cleanup & Tech Debt (1/1 plan) — completed 2026-03-04

</details>

<details>
<summary>✅ v3.2 Mobile Operations & UX Polish (Phases 28-31) — SHIPPED 2026-03-04</summary>

- [x] Phase 28: Mobile Toolbar Fixes (1/1 plan) — completed 2026-03-04
- [x] Phase 29: Session Navigation (1/1 plan) — completed 2026-03-04
- [x] Phase 30: Auto-Record Per Agent (2/2 plans) — completed 2026-03-04
- [x] Phase 31: Storage Rotation (2/2 plans) — completed 2026-03-04

</details>

<details>
<summary>✅ v3.3 Telegram Operator Awareness (Phases 32-35) — SHIPPED 2026-03-05</summary>

- [x] Phase 32: Bot Foundation (2/2 plans) — completed 2026-03-04
- [x] Phase 33: Permission Prompt Detection and Forwarding (2/2 plans) — completed 2026-03-04
- [x] Phase 34: One-Tap Approve (2/2 plans) — completed 2026-03-04
- [x] Phase 35: Budget Alerts and Notification Settings (2/2 plans) — completed 2026-03-05

</details>

### 🚧 v3.4 Smart Session Lifecycle (In Progress)

**Milestone Goal:** Transform Warden from passive monitoring to autonomous session management — crash recovery, idle timeout cleanup, and one-click session launch.

- [x] **Phase 36: Telegram Pipeline Pivot & Hardening** - Route notifications through Gideon's bot, remove standalone bot, fix edge cases (completed 2026-03-05)
- [x] **Phase 37: Crash Detection Backend** - Detect crashed sessions, persist lifecycle events, send Telegram crash notifications (completed 2026-03-05)
- [x] **Phase 38: Auto-Restart Engine** - Per-agent restart policy, automatic crash recovery, restart storm rate limiter (completed 2026-03-05)
- [x] **Phase 39: Idle Timeout & Quick-Launch** - Auto-stop idle sessions and one-click session launch from dashboard (completed 2026-03-05)
- [x] **Phase 40: Lifecycle History & E2E Verification** - Lifecycle event history UI with filters and end-to-end verification (completed 2026-03-05)

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

See `.planning/milestones/v3.1-ROADMAP.md` (v3.0 details preserved in v3.1 archive)

</details>

<details>
<summary>✅ v3.1 Phase Details (Phases 21-24, 26-27)</summary>

See `.planning/milestones/v3.1-ROADMAP.md`

</details>

<details>
<summary>✅ v3.2 Phase Details (Phases 28-31)</summary>

See `.planning/milestones/v3.2-ROADMAP.md`

</details>

<details>
<summary>✅ v3.3 Phase Details (Phases 32-35)</summary>

See `.planning/milestones/v3.3-ROADMAP.md`

</details>

### Phase 36: Telegram Pipeline Pivot & Hardening
**Goal**: Route Telegram notifications through Gideon's bot (send-only, no polling), remove standalone bot infrastructure, fix notification edge cases
**Depends on**: Nothing (refactor + bug fixes to existing v3.3 code)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06
**Success Criteria** (what must be TRUE):
  1. Notifications are sent using Gideon's bot token from `openclaw.json` — no `WARDEN_TELEGRAM_BOT_TOKEN` env var needed
  2. Notifications land in the correct Telegram topic based on agent-to-topic mapping (e.g., Warden session → topic 41)
  3. ApprovalCallbackHandler, ApprovalStateTracker, and inline Approve button code are removed — dead code deleted
  4. Notification messages with Markdown special characters in pane excerpts are sent successfully
  5. Invalid topicId produces a clear log warning and graceful return (no silent failure)
  6. Budget alert state survives server restart — no false re-alerts after restart
**Plans**: 2 plans

Plans:
- [ ] 36-01-PLAN.md — Core pipeline pivot: rewrite TelegramBotService to send-only, remove approval infrastructure, fix Markdown escaping and topicId validation (FIX-01, FIX-02, FIX-03, FIX-04)
- [ ] 36-02-PLAN.md — Budget alert persistence and UI update: persist BudgetAlertPoller state to SQLite, update NotificationSettingsPanel for send-only bot (FIX-05, FIX-06)

### Phase 37: Crash Detection Backend
**Goal**: Warden detects when agent sessions crash and records/notifies the operator
**Depends on**: Phase 36 (Telegram pipeline must be reliable for crash notifications)
**Requirements**: CRSH-01, CRSH-02, CRSH-06
**Success Criteria** (what must be TRUE):
  1. When an active tmux session disappears without an operator-initiated stop, Warden logs it as a crash (not a normal stop) in the dashboard
  2. Crash events are persisted to the database with session ID, agent ID, event type, timestamp, and outcome — surviving server restarts
  3. Operator receives a Telegram notification within one poll cycle when an agent session crashes, including agent name and session name
  4. Operator-initiated stops (via dashboard Stop button) are never misclassified as crashes
**Plans**: 2 plans

Plans:
- [ ] 37-01-PLAN.md — Crash detection in InstanceTracker with 2-poll grace period, session_lifecycle_events table, lifecycle event logging for all transitions (CRSH-01, CRSH-02)
- [ ] 37-02-PLAN.md — Telegram crash notifications via onCrashDetected callback, GET /api/lifecycle-events endpoint (CRSH-06)

### Phase 38: Auto-Restart Engine
**Goal**: Warden can automatically restart crashed sessions based on per-agent policy with safety limits
**Depends on**: Phase 37 (crash detection must exist before auto-restart can act on it)
**Requirements**: CRSH-03, CRSH-04, CRSH-05
**Success Criteria** (what must be TRUE):
  1. Operator can configure per-agent crash restart policy (none/once/always) from the dashboard, defaulting to none
  2. When a crash is detected and the agent's policy allows restart, a new tmux session spawns automatically with the same project path
  3. Auto-restart outcomes (success or failure) are logged to the lifecycle events table
  4. After 3 restarts in one hour for the same agent, the restart policy flips to "none" and a Telegram alert notifies the operator of the restart storm
**Plans**: 2 plans

Plans:
- [ ] 38-01-PLAN.md — Restart policy types, database table, API endpoints, and AgentSidebar config dropdown (CRSH-03)
- [ ] 38-02-PLAN.md — AutoRestartService with crash recovery execution, sliding-window rate limiter, Telegram storm alert, and client toast notification (CRSH-04, CRSH-05)

### Phase 39: Idle Timeout & Quick-Launch
**Goal**: Warden automatically cleans up idle sessions and lets the operator launch new sessions with one click
**Depends on**: Phase 38 (shares `session_lifecycle_policy` table; restart engine must be stable)
**Requirements**: IDLE-01, IDLE-02, IDLE-03, LNCH-01, LNCH-02, LNCH-03
**Success Criteria** (what must be TRUE):
  1. Operator can configure per-agent idle timeout (minimum 60 minutes, or disabled) from the dashboard
  2. Sessions that remain idle beyond their configured timeout are automatically stopped, with the stop reason recorded as "idle-timeout" in lifecycle events
  3. Dashboard shows a "New Session" button that opens an agent picker with each agent's last-used project path pre-filled
  4. Operator can override the pre-filled project path before launching, and the session starts via the existing start API
  5. Quick-launch works for agents that have never been started (no last-used path) — operator must provide a path manually
**Plans**: 2 plans

Plans:
- [ ] 39-01-PLAN.md — Idle timeout policy, enforcement, and lifecycle event logging (IDLE-01, IDLE-02, IDLE-03)
- [ ] 39-02-PLAN.md — Quick-launch UI with agent picker and project path override (LNCH-01, LNCH-02, LNCH-03)

### Phase 40: Lifecycle History & E2E Verification
**Goal**: Operator can review all lifecycle events and the full milestone is verified end-to-end
**Depends on**: Phase 39 (all lifecycle event types must exist to display in history)
**Requirements**: HIST-01, HIST-02
**Success Criteria** (what must be TRUE):
  1. History view shows a lifecycle events section displaying crashes, auto-restarts, and idle-timeout stops with agent name, timestamp, event type, and outcome
  2. Lifecycle history is filterable by agent and by event type
  3. All five phases of v3.4 pass end-to-end verification (Playwright tests or manual verification checklist)
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — Fix force-kill lifecycle logging (TD-4) + NaN guard (TD-5) + LifecycleEventsView component + Lifecycle tab in HistoryView (HIST-01, HIST-02)
- [ ] 40-02-PLAN.md — Playwright E2E spec for lifecycle history UI + manual verification checklist for all 5 v3.4 phases (HIST-01, HIST-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 36 → 37 → 38 → 39 → 40

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
| 26. Token Analytics Polish & Tech Debt | v3.1 | 1/1 | Complete | 2026-03-04 |
| 24. Session Recording & Replay | v3.1 | 2/2 | Complete | 2026-03-04 |
| 27. Recording State Cleanup & Tech Debt | v3.1 | 1/1 | Complete | 2026-03-04 |
| 28. Mobile Toolbar Fixes | v3.2 | 1/1 | Complete | 2026-03-04 |
| 29. Session Navigation | v3.2 | 1/1 | Complete | 2026-03-04 |
| 30. Auto-Record Per Agent | v3.2 | 2/2 | Complete | 2026-03-04 |
| 31. Storage Rotation | v3.2 | 2/2 | Complete | 2026-03-04 |
| 32. Bot Foundation | v3.3 | 2/2 | Complete | 2026-03-04 |
| 33. Permission Prompt Detection and Forwarding | v3.3 | 2/2 | Complete | 2026-03-04 |
| 34. One-Tap Approve | v3.3 | 2/2 | Complete | 2026-03-04 |
| 35. Budget Alerts and Notification Settings | v3.3 | 2/2 | Complete | 2026-03-05 |
| 36. Telegram Pipeline Pivot & Hardening | 2/2 | Complete    | 2026-03-05 | - |
| 37. Crash Detection Backend | 2/2 | Complete    | 2026-03-05 | - |
| 38. Auto-Restart Engine | 2/2 | Complete    | 2026-03-05 | - |
| 39. Idle Timeout & Quick-Launch | 2/2 | Complete    | 2026-03-05 | - |
| 40. Lifecycle History & E2E Verification | 2/2 | Complete   | 2026-03-05 | - |
