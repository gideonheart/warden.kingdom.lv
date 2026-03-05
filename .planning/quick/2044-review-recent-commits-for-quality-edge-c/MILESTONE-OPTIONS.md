# Next Milestone Options (v4 Series — Set 3)

## Where We Are

Warden v3.3 is complete. All 6 previous milestone proposals have been catalogued:

- **quick-2042:** Recording Completion (shipped as v3.2), Telegram Operator Awareness (shipped as v3.3), Multi-Agent Audit
- **quick-2043:** Smart Agent Health Monitor, Live Fleet Coordination View, Operator Prompt Workbench

The three options below are deliberately distinct from all six above. They address gaps that the code review (CODE-REVIEW.md) surfaced or that became visible only after v3.3 shipped and the full system is running end-to-end.

---

## Option A — v4.1: Agent Session Analytics Dashboard

### Problem Solved

The `token_usage` and `token_usage_by_model` tables contain rich per-agent, per-day, per-model cost and token data accumulated across every session ever run. The current UI surfaces this as a flat table with date-range filtering and a burn rate chip (rolling 24h spend). This is enough to answer "how much did I spend today?" but not enough to answer operational questions like: "Is agent X trending toward overspend this week?", "Which agent is the least cost-efficient?", "Did the model switch on Gideon last Thursday reduce or increase costs?", or "What's my typical cost variance by day of week?"

The data exists. The intelligence does not. Every piece of information the operator needs to make smarter decisions about agent configuration, budget allocation, and model selection is sitting in SQLite unused.

### Scope

Build a proper Analytics view — a new History sub-tab with time-series cost charts, per-agent efficiency metrics, trend lines, and anomaly highlighting. This is a pure read path: no new writes, no new infrastructure, no external dependencies. The entire milestone is SQLite queries + charting library integration.

**What gets built:**

- A cost time-series chart (line or area chart) showing daily spend per agent over a configurable window (7d / 30d / 90d), with each agent rendered as a distinct color series
- A "cost efficiency" table: per-agent averages for cost per session, cost per active hour, tokens per dollar, and session count over the selected window
- Anomaly row highlighting: sessions where cost was 2x or more the agent's rolling average are flagged visually in the cost efficiency table
- A trend indicator per agent: up/down/flat arrow with 7-day slope derived from a simple linear regression on daily costs
- A model impact panel: for agents that used multiple models in the date window, show a before/after cost rate comparison at each model switch point
- Mobile-aware rendering: charts collapse to a compact summary table on narrow viewports

**Technical approach:** Recharts (already a common React charting library, MIT licensed, well-documented) for chart rendering. All data from existing `/api/history/token-usage` and model comparison endpoints — no new backend routes needed for the basic version. One new aggregation endpoint may be needed for the trend computation.

### Requirements

- ANLX-01: Cost time-series chart — `/api/analytics/daily-costs` endpoint returning per-agent daily cost aggregates for a date range; front-end renders as a multi-series line chart with date on x-axis and cost on y-axis
- ANLX-02: Efficiency metrics table — per-agent averages computed from `token_usage` table: cost per session (total cost / session count), cost per active hour (total cost / sum of session durations), tokens per dollar; displayed in a sortable table
- ANLX-03: Cost anomaly detection — for each agent, flag sessions whose cost exceeds 2x the agent's 30-day rolling average; highlight in efficiency table with amber indicator and cost delta
- ANLX-04: Spend trend indicator — for each agent, compute 7-day linear regression slope on daily cost; render as a colored arrow (green for down, yellow for flat ±10%, red for up) with the slope value in $/day shown on hover
- ANLX-05: Model impact panel — for agents with model changes in the selected window, render a before/after cost rate table showing average daily cost and tokens per session in each model period
- ANLX-06: Analytics tab in History view — new sub-tab alongside existing Sessions / Token Usage tabs; renders all analytics panels with a shared date-range picker and agent filter

### Estimated Phases

3 phases:

1. **Analytics data layer** — new `/api/analytics/daily-costs` aggregation endpoint, efficiency metrics query, trend slope computation endpoint; all query-only, no schema changes
2. **Charts and efficiency table** — Recharts integration, cost time-series chart component, efficiency table with sorting, anomaly highlighting
3. **Trend indicators, model impact panel, and E2E verification** — trend arrow computation and rendering, model switch detection and before/after table, Playwright tests for analytics tab rendering with mock data

### Impact

**High** — converts the most information-rich data in the database from "visible on request" to "actionable intelligence". Operators running 3-5 agents simultaneously make meaningful cost decisions (which agent to pause, which model to switch) based on gut feel today. Analytics makes those decisions evidence-based.

### Effort

**Low-Medium** — all writes already exist; this milestone is entirely read-path. The main engineering challenge is the charting library integration and the trend computation. No new infrastructure, no new tables, no new polling loops.

### Risks

1. **Recharts bundle size** — Recharts adds ~100KB to the already large JS bundle. Mitigation: dynamic-import the Analytics tab (which is not on the hot path), keeping the initial bundle size unchanged.
2. **Thin data for new installs** — trend indicators and model impact panels require at least 7+ days of data. Before that, they display a "Not enough data" placeholder. This is a first-run UX gap, not a correctness issue.
3. **Efficiency metric accuracy** — "cost per active hour" depends on session duration data, which relies on `sessions.last_active_at` deltas. Sessions that were never stopped cleanly (server crash) will have inaccurate durations. Mitigation: exclude sessions with `status = 'stopped'` but `duration_secs IS NULL` from the efficiency calculation.

### Rationale

The code review found no correctness gaps in the recording or cost tracking infrastructure. The data pipeline is solid. The gap is entirely in the presentation layer — the operator has more information available than the UI exposes. This milestone has the lowest risk of any proposed option (no new writes, no new infrastructure, no new services) while delivering high-visibility operational intelligence. It also does not compete for the same engineering surface as Health Monitor (TD-01: detectAgentState tests) or Fleet Coordination — it can be parallelised or done first without creating downstream complexity.

---

## Option B — v4.1: Smart Session Lifecycle

### Problem Solved

Sessions today are entirely manual: the operator creates them, monitors them, and stops them. Warden tracks when sessions disappear from tmux but takes no autonomous action. Three lifecycle scenarios currently require manual operator intervention:

1. **Crash recovery** — when a tmux session disappears (agent process crashed, OOM kill, shell error), the operator must notice the session tab turn red and manually restart. There is no auto-restart, no notification beyond the UI badge, no recovery attempt.

2. **Idle timeout** — sessions that finish their task and reach the idle state continue consuming a tmux session slot indefinitely. There is no idle-timeout cleanup. On a server with many completed sessions, this creates visual clutter and wastes the tmux session namespace.

3. **Launch friction** — starting a new agent session requires the operator to run the `tmux new-session` command manually with the correct session name format (`{agentId}-{projectSlug}-{shortUuid}`). There is no in-dashboard "Start new session" flow, no session template system, and no way to pre-configure a common agent+project combination for one-click launch.

Together these three gaps mean the operator must stay hands-on throughout the session lifecycle. For unattended overnight runs, crash recovery failure means wasted wall-clock time until the next check-in.

**What gets built:**

- A crash detection hook in `InstanceTracker`: when a session transitions from `active` to `stopped` without an explicit operator-initiated stop, classify it as a crash and optionally auto-restart (per-agent policy: `none` / `restart-once` / `restart-always`)
- Auto-restart implementation: calls `TmuxSessionManager.spawnSession()` with the same agent ID and project path as the crashed session; logs the restart event to SQLite; sends a Telegram notification via the existing notification pipeline
- Idle timeout policy: per-agent configurable idle timeout (default: disabled); when `NotificationPoller` detects `'idle'` state for longer than the threshold, auto-stop the session with `stop_reason = 'idle-timeout'`
- Session template CRUD: a `session_templates` SQLite table with agent ID, project path, tmux session name prefix, and optional startup flags; a `/api/session-templates` endpoint
- One-click launch UI: a "New Session" button in the dashboard that opens a template picker; selecting a template calls the existing `/api/instances/:id/start` path with pre-filled parameters
- Session lifecycle log: a summary in the History view showing all crash/restart/idle-timeout events with timestamps and outcomes

### Requirements

- SLFC-01: Crash detection — `InstanceTracker` distinguishes operator-initiated stops (status was `'stopping'` before disappearing) from crashes (status was `'active'` or `'idle'` at last poll, tmux session now absent); persists crash event to `session_lifecycle_events` SQLite table
- SLFC-02: Auto-restart policy — `session_lifecycle_policy` SQLite table keyed by `agent_id` with columns: `crash_restart_mode` (none/once/always), `idle_timeout_minutes` (null = disabled); CRUD at `/api/session-lifecycle-policy`
- SLFC-03: Auto-restart execution — when crash detected and `crash_restart_mode` is `once` or `always`, call `TmuxSessionManager.spawnSession()` with saved project path; log restart to `session_lifecycle_events`; send Telegram notification using existing pipeline; enforce maximum 3 restarts per hour per agent to prevent restart storms
- SLFC-04: Idle timeout enforcement — `NotificationPoller` tracks time-in-idle-state per session; when threshold exceeded and `idle_timeout_minutes` is set, call `/api/instances/:id/stop`; log to `session_lifecycle_events`
- SLFC-05: Session templates — `session_templates` table (id, name, agent_id, project_path, created_at); CRUD endpoints; template picker UI in "New Session" modal
- SLFC-06: Lifecycle history view — new section in History view showing `session_lifecycle_events` (crash detections, auto-restarts, idle-timeout stops) with agent, timestamp, event type, and outcome; filterable by agent and event type

### Estimated Phases

4 phases:

1. **Crash detection backend** — lifecycle event classification in `InstanceTracker`, `session_lifecycle_events` table migration, `/api/session-lifecycle-events` endpoint, Telegram crash notification
2. **Auto-restart engine** — restart policy persistence, `spawnSession()` integration, per-hour rate limiter, restart outcome tracking
3. **Idle timeout and session templates** — idle time tracking in `NotificationPoller`, timeout enforcement, `session_templates` table and CRUD, template picker UI
4. **Lifecycle history view and E2E verification** — lifecycle events history panel in History view, Playwright tests for crash detection → restart flow

### Impact

**High** — crash recovery is the primary untracked failure mode for overnight unattended runs. The operator currently discovers crashed sessions only on next check-in. Auto-restart with notification directly closes the gap between "session crashed at 02:00" and "operator knows by 02:00 and session is already recovering".

### Effort

**Medium-High** — crash detection requires care to distinguish crashes from intentional stops without false positives. The auto-restart rate limiter prevents restart storms. Session templates add a new data model. But all building blocks exist: `InstanceTracker` already tracks session state transitions, `TmuxSessionManager` already has `spawnSession`, the Telegram notification pipeline is in place.

### Risks

1. **Crash detection false positives** — the operator manually stopping a session (via the Stop button) should not trigger "crash detected". The distinction is based on whether the session was in `'stopping'` state before disappearing. If a stop completes faster than the next poll cycle (within 10s), the session may appear to "crash" without going through `'stopping'`. Mitigation: introduce a `graceful_stop_marker` flag set atomically by the Stop API endpoint before the tmux kill command executes.
2. **Restart storm** — if the crash is caused by a broken environment (missing dependency, corrupt project), auto-restart will loop until the per-hour rate limit triggers. The rate limit (3 restarts/hour) bounds the damage but does not prevent the operator from returning to 3 failed sessions instead of 1. Mitigation: after 3 restarts in 1 hour, flip `crash_restart_mode` to `none` for that session and send a Telegram alert.
3. **Idle timeout on long-running tasks** — an agent performing a legitimate multi-hour computation may briefly enter `'idle'` state between tool calls. An aggressive idle timeout would kill it. Mitigation: default idle timeout is disabled; opt-in per agent; minimum configurable value is 60 minutes.

### Rationale

The Telegram notification milestone (v3.3) gave the operator awareness of permission prompts and budget alerts. The natural next step is awareness of session crashes — an even more consequential event category. Smart Session Lifecycle closes the last major "invisible failure mode" gap in the current system and adds active recovery rather than just notification.

---

## Option C — v4.1: Codebase Quality Foundation

### Problem Solved

The code review (CODE-REVIEW.md) identified a cluster of real-but-deferred issues that individually seem minor but compound as the codebase grows:

- **EC-02:** Unescaped Markdown in approval `editMessageText` causes silent notification UI bugs after agent approval
- **EC-03:** `parseInt(topicId)` silently returns `NaN`, causing all Telegram sends to fail without a clear error if `openclaw.json` is misconfigured
- **EC-04:** `BudgetAlertPoller` alert state lost on server restart → false re-alerts after every deployment
- **TD-01:** `detectAgentState()` has zero unit tests, making it a regression-prone single point of failure for the notification pipeline
- **TD-02:** `DatabaseConnection.ts` at 736 lines, growing toward an unmanageable monolith
- **TD-03:** 673KB JS bundle with no code splitting — 2x the Vite warning threshold
- **TD-04:** Missing `void` on `syncWithTmux()` call in `startPeriodicSync`

Individually, each item is postpone-able. Together, they represent a maintenance burden that makes every future milestone harder. A focused quality milestone fixes all of them, adds test coverage for the critical path, and leaves the codebase in a state where v4.x features can be built on a stable foundation.

**What gets built:**

- EC-02 fix: Escape or strip Markdown special characters from the tmux pane excerpt before including it in Telegram messages; or switch to `parse_mode: 'HTML'` with proper `<code>` blocks (cleaner escaping semantics)
- EC-03 fix: Validate `topicId` is numeric before calling `parseInt`; log a clear diagnostic error and skip send if invalid
- EC-04 fix: Persist `lastAlertedAt` per agent to a new column in `budget_config` table (one column addition, no schema rebuild); hydrate `BudgetAlertPoller.records` from the database on startup
- TD-01 fix: Vitest unit test suite for `detectAgentState()` — at minimum 10 test cases covering all state branches and edge cases (empty pane, partial permission prompt text, error-within-normal-output)
- TD-02 fix: Extract `DatabaseConnection.ts` into domain-specific repository modules: `InstanceRepository`, `TokenUsageRepository`, `RecordingRepository`, `NotificationRepository`, `BudgetRepository`; `DatabaseConnection` becomes a thin coordinator that initializes the database and vends repositories
- TD-03 fix: Vite code splitting — lazy-load `RecordingPlayer` (asciinema-player is the likely largest contributor) and the Analytics tab (if v4.1 Analytics is shipping); target: reduce initial chunk to under 400KB
- TD-04 fix: Add `void` prefix to `this.syncWithTmux()` call in `startPeriodicSync()`
- Structured error logging: introduce a lightweight logger module (`src/server/utils/logger.ts`) that wraps `console.log/warn/error` with ISO timestamp, log level, and service prefix; replace all raw `console.*` calls in services with the logger; this makes log analysis easier in production

### Requirements

- QUAL-01: Markdown escaping in Telegram messages — all user-sourced content (tmux pane excerpts) passed to Telegram APIs must be sanitized; implement `escapeMarkdown(text: string): string` utility and apply at all send sites; add unit tests for the escape function with pathological inputs (unmatched backtick, unmatched asterisk, mixed special chars)
- QUAL-02: topicId validation — `TelegramBotService.sendToTopic` and `sendToTopicWithApproveButton` must validate that `topicId` parses to a finite integer before calling the API; log `[TelegramBot] Invalid topicId "${topicId}" — not a finite integer` and return null/undefined on failure; add unit test for this validation path
- QUAL-03: BudgetAlertPoller persistence — add `last_alerted_at` column to `budget_config` table (nullable INTEGER); `BudgetAlertPoller.startPolling()` reads existing `last_alerted_at` values and populates `records` before the first poll; `checkAgent()` writes updated `lastAlertedAt` to both the Map and the database column
- QUAL-04: detectAgentState unit tests — Vitest test suite in `tests/unit/agentStateDetection.test.ts` with at least 10 cases: empty string, whitespace-only, working output, permission prompt (both regex patterns), menu selection, error line, error-in-error-handling context (must not match), mixed content with permission prompt at end, mixed content with error inside normal paragraph
- QUAL-05: DatabaseConnection decomposition — extract domain-specific repository classes (minimum: `InstanceRepository`, `TokenUsageRepository`, `RecordingRepository`, `NotificationRepository`); `DatabaseConnection` retains the shared `db` handle and runs migrations; repositories are instantiated with the shared `db` handle and exposed via the `database` singleton; all existing import paths continue working (no breaking change)
- QUAL-06: Bundle code splitting — configure `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split xterm.js and asciinema-player into separate async chunks; lazy-load `RecordingPlayer` and `RecordingLibrary` components; verify initial chunk drops below 450KB after splitting

### Estimated Phases

3 phases:

1. **Bug fixes and validation hardening** — EC-02 Markdown escaping utility + tests, EC-03 topicId validation + tests, EC-04 BudgetAlertPoller persistence with DB migration, TD-04 void prefix fix
2. **Test coverage for critical path** — QUAL-04 detectAgentState unit tests, integration test verifying NotificationPoller correctly calls detectAgentState (mocked), confirm all existing Vitest and Playwright tests still pass
3. **Structural improvements** — QUAL-05 DatabaseConnection decomposition (repository extraction), QUAL-06 bundle code splitting, structured logger module

### Impact

**Medium** — directly reduces the risk surface of the Telegram notification pipeline (the feature most likely to be firing on an unattended server). The repository decomposition makes future milestones cheaper to implement. The bundle splitting improves perceived load performance.

### Effort

**Medium** — EC-02/03/04 are 1-4 hour fixes each. TD-01 tests are 2-3 hours. TD-02 repository extraction is the largest effort (~1 day) because every file that imports from `DatabaseConnection` needs to be updated to the new import path. TD-03 code splitting is 2-4 hours.

### Risks

1. **DatabaseConnection refactor introduces import regressions** — 15+ files import from `DatabaseConnection.ts`. Extraction must preserve the singleton pattern and not break any existing import path. Mitigation: the `database` singleton continues to exist and expose all methods by delegation; imports need no changes in Phase 3 if the public API is preserved. Breaking changes are opt-in for callers.
2. **Test coverage reveals hidden bugs** — writing `detectAgentState` tests may expose edge cases in the current regex logic that were previously undetected. Mitigation: if tests reveal a real false-positive (permission prompt not detected), fix it immediately as part of this milestone.
3. **Code splitting breaks RecordingPlayer** — lazy-loaded components require proper React Suspense boundaries. If none exist, a chunk loading failure will crash the component tree. Mitigation: wrap lazy-loaded components in `<Suspense fallback={...}>`. An `ErrorBoundary.tsx` already exists in the codebase.

### Rationale

The code review found EC-02 (Markdown escaping), EC-03 (topicId NaN), and EC-04 (restart re-alerts) as the three highest-priority actionable items — all in the Telegram pipeline. The next highest-priority item is TD-01 (detectAgentState tests). A standalone Quality Foundation milestone addresses all four plus the structural debt, in a focused 3-phase effort. This is the "pay the debt before it compounds" option. It does not add user-visible features but it makes every subsequent milestone faster and safer to ship.

---

## Recommendation

**Pick Option B (v4.1: Smart Session Lifecycle).**

Rationale:

1. **Closes the last major untracked failure mode.** After v3.3, the operator gets notified about permission prompts and budget alerts. Session crashes — the other major "invisible failure event" — still produce no notification and no recovery. This is the gap with the highest operational impact for unattended overnight runs.

2. **The critical code-review fixes (EC-02, EC-03, EC-04) should be done first, as inline fixes before starting v4.1 — not as their own milestone.** They are all 30-minute to 1-hour changes. Wrapping them in a 3-phase milestone is over-engineering the fix. Commit them directly as prep work before starting the next milestone.

3. **Builds on proven infrastructure.** `InstanceTracker` already tracks session state transitions. `TmuxSessionManager` already has session spawn/destroy. The Telegram notification pipeline is tested and running. Smart Session Lifecycle adds decision logic on top of existing plumbing — not new plumbing.

4. **Higher operator leverage than analytics.** Analytics (Option A) is valuable intelligence but requires the operator to actively open a chart view. Smart Session Lifecycle (Option B) acts on the operator's behalf without requiring attention — which is the stated design philosophy of the entire platform.

**Sequencing the others:**

After v4.1 (Smart Session Lifecycle) ships:

- **Option A (Analytics Dashboard)** becomes the natural next pick — session lifecycle events from SLFC-06 (crash/restart history) feed directly into the analytics view, enriching it with reliability data alongside cost data.
- **Option C (Quality Foundation)** should be done as prep work inline (EC-02, EC-03, EC-04 as direct commits) rather than a dedicated milestone, unless the repository decomposition (QUAL-05) becomes urgent due to merge conflicts.
- **Multi-Agent Audit (from quick-2042)** remains the right choice when fleet size grows to 5+ simultaneous agents and the operator needs retrospective forensics.
