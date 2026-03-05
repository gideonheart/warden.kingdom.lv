# Next Milestone Options (v4 Series)

## Where We Are

Warden v3.3 shipped Telegram Operator Awareness — the full arc from live terminal streaming (v1.0) to Telegram-based remote control (v3.3) is complete. The operator can now manage agents from anywhere: spin up or stop sessions from the dashboard, approve stalled agents with a single tap in Telegram, receive budget alerts before runaway costs land, and auto-record every session with storage rotation keeping disk usage bounded. The codebase is 12,252 LOC across 73 source files, fully typed TypeScript, with 20 Playwright E2E tests and 90 Vitest unit tests.

The three options below address the next meaningful gaps: agent reliability automation, live multi-agent coordination, and operator workflow efficiency. None of them repeat what v3.2 (Recording Completion) or v3.3 (Telegram Awareness) built. The Multi-Agent Audit retrospective timeline (already proposed as Option C in quick-2042) is also excluded — it remains the correct v4.0 pick when the fleet grows to 5+ simultaneous agents.

---

## Option A — v4.1: Smart Agent Health Monitor

### Problem Solved

Agents silently stall. Context exhaustion, tool failures, infinite reasoning loops, and shell hangs all produce the same surface symptom: the terminal stops producing meaningful output. The operator only learns about it by looking at the dashboard or via a Telegram permission-prompt ping — both require the stall to have already produced a detectable event. Agents that are stuck in non-permission-prompt states (tight loops, shell hangs, silent tool failures) are invisible until the operator notices elapsed time. For a single-operator multi-agent environment where sessions may run unattended for hours, silent stalls directly translate to wasted cost and missed deadlines.

### Scope

Build a proactive health scoring system that monitors every active agent session continuously, classifies health state with more granularity than the existing `detectAgentState()` heuristics, and triggers configurable automatic interventions. This extends the existing agent state detection infrastructure into an active reliability layer rather than a passive badge display.

**What gets built:**

- A `HealthMonitorService` that consumes the existing tmux `capture-pane` output from `NotificationPoller` and applies a sliding-window analysis to detect stall patterns (no new tool calls in N minutes, repeated identical output, shell prompt without activity)
- A numeric health score (0-100) per session derived from output velocity, state transitions, and time-in-state
- A configurable health policy per agent: warn-only, auto-ping (inject a configurable "are you still working?" prompt), or auto-restart on stall detection
- A health history log in SQLite recording stall events, intervention type, and recovery outcome
- A Health panel in the dashboard showing current health score, recent stall events per agent, and intervention log
- Telegram notification forwarding for health-degraded or auto-restarted agents (integrates with existing notification pipeline)

### Requirements

- HLT-01: Health score calculation — sliding-window output velocity metric per active session, updated every 10s, stored in memory with last N samples
- HLT-02: Stall pattern detection — classify stall types: idle-too-long, repeated-output-loop, shell-prompt-hang, error-state-loop; each with configurable thresholds (default: 10 min idle = stall)
- HLT-03: Per-agent health policy — SQLite-persisted policy row per agent: one of `watch-only`, `auto-ping`, `auto-restart`; default `watch-only`; configurable from dashboard
- HLT-04: Auto-intervention execution — when stall detected and policy is `auto-ping`, inject configured text via Gateway API; when `auto-restart`, call existing `/api/instances/:id/restart`; log intervention with outcome
- HLT-05: Health history persistence — `agent_health_events` SQLite table with columns: session_id, detected_at, stall_type, intervention_type, recovered_at (nullable); used for history panel and analytics
- HLT-06: Health dashboard panel — Health tab in the UI showing per-agent current score (colored chip: green/amber/red), last stall event, intervention log with timestamps, and health policy selector

### Estimated Phases

4 phases:

1. **HealthMonitorService backend** — stall detection algorithms, health score calculation, integration with existing NotificationPoller output feed, `agent_health_events` table migration
2. **Auto-intervention engine** — policy execution (ping/restart), SQLite policy persistence, Gateway API call wiring, cooldown guards to prevent intervention storms
3. **Health dashboard panel** — Health tab UI with score chips, stall event list, intervention log, policy dropdowns per agent
4. **Telegram health alerts and E2E verification** — forward health degradation and auto-restart events to Telegram notification pipeline, E2E Playwright tests for health flow

### Impact

**High** — transforms Warden from a passive monitor to an active reliability system. Silent stalls are the primary untracked failure mode for autonomous agents. Auto-ping alone would recover the majority of tool-call hangs without operator involvement.

### Effort

**High** — stall detection requires careful heuristics to avoid false positives (a thinking agent looks similar to a stalled agent). The intervention engine needs robust cooldown logic. Health scoring is novel ground for this codebase.

### Risks

1. **False positive interventions** — auto-ping during a legitimate long-running task will disrupt agent flow. Requires conservative defaults and per-agent tuning. Mitigation: default policy is `watch-only`; auto modes are opt-in per agent.
2. **detectAgentState() fragility** — the existing regex heuristics are documented as fragile. Health scoring built on top inherits that fragility. Mitigation: health score is based primarily on output velocity (objective metric), not state classification (regex-dependent).
3. **Notification volume** — health events could flood Telegram if thresholds are miscalibrated. Mitigation: health Telegram alerts share the same cooldown and dedup pipeline as existing notifications.

### Rationale

The existing session recording and Telegram approval infrastructure already prove the operator's intent: reduce the manual attention cost of running multiple agents. Health monitoring is the next logical step — instead of reacting to stalls after they happen, detect and recover from them automatically. The core data source (tmux capture-pane output) is already being read by NotificationPoller; this milestone adds a second consumer with different analysis logic.

---

## Option B — v4.2: Live Fleet Coordination View

### Problem Solved

Running 3-5 agents simultaneously on related tasks creates a blind spot: the operator sees one agent at a time through the tab-based terminal view and has no way to see cross-agent relationships or conflicts. When agents are working on the same codebase in parallel, they may edit the same files simultaneously, causing merge conflicts that neither agent detects until commit time. There is no view showing "what is every agent doing right now" without cycling through tabs manually. This tab-switching overhead grows linearly with agent count and becomes a meaningful operational cost when fleet size exceeds three simultaneous sessions.

### Scope

Build a Fleet Coordination view — a new top-level dashboard tab that shows all active agents in a compact grid, parses file-touch activity from terminal output to build per-agent working sets, and flags potential conflicts when two agents are touching the same file. This is a live coordination tool (not a retrospective audit), complementary to the session recording infrastructure.

**What gets built:**

- A Fleet View tab rendering all active sessions in a 2-3 column responsive grid, each cell showing: agent name, current state chip, health score (if HLT milestone shipped), last line of terminal output, and active files list
- A file-activity parser that extracts file paths from terminal output using regex patterns for common Claude Code tool output patterns (`Read file:`, `Write file:`, `Edit file:`, path-like strings in tool result lines)
- A conflict detector that flags when two or more agents have the same file in their recent working set (within a configurable window, default: 5 minutes)
- A conflict banner in the Fleet View header listing detected conflicts with agent names and file paths
- A compact prompt broadcast panel in the Fleet View for sending the same prompt to all agents or a selected subset
- Clicking a fleet grid cell navigates to that agent's full terminal tab (reuses existing tab selection logic)

### Requirements

- FLT-01: Fleet View tab — new top-level tab in the dashboard nav alongside Terminals and History; renders all active instances in a responsive grid with current state and last output line
- FLT-02: Terminal output file-activity parser — server-side parser that processes tmux capture-pane output lines for file path patterns; maintains a per-session working-set map (file path → last seen timestamp) in memory, TTL 5 minutes
- FLT-03: File conflict detection — compares working sets across all active sessions every 10s; emits `fleet:conflict` Socket.IO event when two sessions share a file in their working set; includes session IDs, file path, and timestamps
- FLT-04: Conflict banner UI — Fleet View header shows conflict count badge; expanded conflict list shows file path, agent names, and time since last touch for each
- FLT-05: Multi-agent prompt broadcast — a prompt input in Fleet View with agent checkboxes; sends the same prompt text to all selected agents sequentially via existing Gateway API; shows per-agent send status
- FLT-06: Fleet View agent cell — compact card component showing agent name, state chip, project path (truncated), last terminal output line (truncated), and active files count with hover-expand file list

### Estimated Phases

4 phases:

1. **File-activity parser backend** — server-side terminal output analysis, working-set in-memory store with TTL, `/api/fleet/working-sets` endpoint, conflict detection logic, Socket.IO `fleet:conflict` event emission
2. **Fleet View tab UI** — responsive grid layout, agent cell components, real-time working-set display via polling or Socket.IO, click-to-focus tab navigation
3. **Conflict detection UI and broadcast panel** — conflict banner with expandable list, multi-agent prompt broadcast with checkbox selection and per-agent status, visual conflict highlighting on agent cells
4. **Polish and E2E verification** — edge cases (agent disappears mid-conflict, empty fleet), Playwright tests for fleet view with mock sessions, performance validation with 5 simultaneous sessions

### Impact

**Medium-High** — directly addresses the linear scaling problem of tab-switching overhead. Conflict detection prevents wasted work from parallel file edits. Broadcast prompts reduce the friction of coordinating related tasks across agents.

### Effort

**Medium** — the grid UI and tab navigation reuse existing components and hooks. The novel engineering is the file-activity parser (regex-based, bounded by known Claude Code output patterns) and the conflict detection logic (set intersection over TTL maps). No new infrastructure dependencies.

### Risks

1. **Parser false positives** — file-activity parsing from raw terminal output is inherently noisy (log lines, stack traces, and other output can contain path-like strings). Mitigation: use explicit Claude Code tool output patterns (`Read file:`, `Wrote to:`, `Edited:`) as primary signals; generic path matching is secondary and filtered to project workspace paths only.
2. **Working-set TTL calibration** — a 5-minute TTL may be too short (agents work on a file over longer sessions) or too long (flags stale conflicts from hours ago). Mitigation: configurable per-operator with default 5 minutes; conflict display includes "last touched" timestamp so operator can evaluate staleness.
3. **Fleet View tab clutter** — if the operator primarily works with 1-2 agents, the Fleet View adds navigation overhead without benefit. Mitigation: Fleet View only appears in nav when 2+ active sessions exist.

### Rationale

The tab-based terminal view is the right design for focused single-agent interaction. It becomes the wrong design for fleet-level awareness. A dedicated Fleet View is the natural complement — not a replacement. The file-activity parsing approach is pragmatic: it does not require instrumenting agent processes or modifying Claude Code tooling, relying instead on the structured output patterns that already exist in Claude Code's terminal output.

---

## Option C — v4.3: Operator Prompt Workbench

### Problem Solved

The current PromptPanel is a single-shot text box that sends one message to one agent and clears. In practice, the operator sends many similar prompts — code review instructions, deployment checklists, debugging guidance, "please commit and push", "focus on X next". Every repeated prompt requires re-typing or copy-pasting from an external notes document. There is no searchable history of what prompts were sent to which agents. Multi-agent coordination requires sending the same prompt to N agents in sequence — currently done by switching tabs and re-typing each time. These friction points are individually small but accumulate significantly across a day of active agent orchestration.

### Scope

Extend the existing PromptPanel into a full Operator Workbench: saved prompt templates with variable substitution, a searchable prompt history, and queued prompts that fire when an agent returns to idle state. This is entirely in-dashboard functionality with no new infrastructure dependencies.

**What gets built:**

- A prompt template library: named templates stored in SQLite, rendered in a picker dropdown in the PromptPanel, with `{{variable}}` substitution filled in before send
- A prompt history sidebar showing the last 100 prompts sent per agent (timestamp, text, outcome status) with full-text search
- A prompt queue: schedule a prompt to fire automatically when a target agent's state transitions back to `idle` (reuses existing `detectAgentState()` output); shows queued prompt in PromptPanel with a cancel button
- A prompt broadcast mode: select multiple agents via checkboxes in the PromptPanel header, send the same prompt (or a template) to all selected agents with configurable delay between sends
- Variable substitution UI: when selecting a template with `{{variables}}`, inline fields appear in the PromptPanel for each variable before the send button activates

### Requirements

- WRK-01: Prompt template storage — `prompt_templates` SQLite table with id, name, body (supports `{{variable}}` syntax), created_at, last_used_at; CRUD endpoints at `/api/prompt-templates`
- WRK-02: Template picker UI — dropdown in PromptPanel listing templates by name with preview on hover; selecting a template populates the textarea; variable fields appear inline for each `{{variable}}` in the template body
- WRK-03: Prompt history persistence — `prompt_history` SQLite table with id, agent_id, session_id, body, sent_at, status (sent/queued/cancelled); `/api/prompt-history` endpoint with agent and date filters; display in collapsible history sidebar in PromptPanel
- WRK-04: Prompt queue — server-side queue (in-memory Map, persisted to SQLite for crash safety) keyed by agent_id; InstanceTracker state-change hook triggers dequeue when agent transitions to idle; queued prompt fires via existing Gateway API send path
- WRK-05: Prompt broadcast mode — PromptPanel header toggle activates multi-agent mode; session checkboxes appear; send iterates selected agents with 500ms inter-send delay; per-agent send status shown inline
- WRK-06: Prompt history full-text search — SQLite FTS5 virtual table on `prompt_history.body`; search box in history sidebar returns ranked results with agent context

### Estimated Phases

4 phases:

1. **Prompt template backend and picker UI** — `prompt_templates` table, CRUD API, template picker dropdown in PromptPanel, variable substitution rendering and inline field UI
2. **Prompt history persistence and sidebar** — `prompt_history` table with status tracking, history sidebar component with agent filter, FTS5 search integration
3. **Prompt queue and broadcast mode** — server-side queue with SQLite persistence, InstanceTracker idle-transition hook, dequeue and send logic, broadcast mode UI with checkboxes and per-agent status
4. **Polish and E2E verification** — queue cancellation, crash recovery for persisted queue, Playwright tests for template pick → variable fill → send → history appearance, broadcast to 2+ agents

### Impact

**Medium** — directly reduces per-prompt friction for the most frequent operator action. Template library pays off fastest for operators with repeating workflows (daily reviews, deployment sequences). Prompt queue is the highest-leverage individual feature: it lets the operator schedule the next task while the agent is still finishing the current one, with zero tab-watching required.

### Effort

**Medium** — all changes are to well-understood surfaces (PromptPanel component, Gateway API wiring, SQLite schema). The prompt queue requires an InstanceTracker hook for state-change events — a new internal event pattern but not a new external dependency. FTS5 is built into SQLite (no new dependency).

### Risks

1. **Prompt queue race conditions** — if the operator sends a manual prompt while a queued prompt is about to fire, both may execute. Mitigation: queued prompt fires only if no manual prompt was sent in the last 30 seconds (configurable lockout window); queue UI shows pending status prominently.
2. **detectAgentState() idle reliability** — the prompt queue depends on accurate idle detection to trigger. If idle detection misses a transition (due to regex fragility), queued prompts may not fire. Mitigation: queued prompts also have a maximum wait timeout (configurable, default: 60 minutes) after which they fire unconditionally with a warning.
3. **Template variable UX complexity** — templates with many variables could make the PromptPanel cluttered. Mitigation: limit to 5 variables per template; enforce at template creation time with clear validation error.

### Rationale

Every session of active agent orchestration involves the operator typing similar prompts repeatedly. The PromptPanel today is a text box — functionally equivalent to a tmux `send-keys` wrapper. The Operator Workbench makes it the primary orchestration interface: where templates encode tribal knowledge, history enables review and learning, and queues decouple operator attention from agent completion. This is a high-frequency-use-case improvement with no new infrastructure cost.

---

## Recommendation

**Pick Option A (v4.1: Smart Agent Health Monitor).**

Rationale:

- **Addresses the highest-impact untracked failure mode.** Silent stalls are currently invisible unless the operator is watching the terminal or the stall happens to trigger a permission prompt. Auto-recovery via health monitoring directly reduces the cost of unattended operation — which is the stated purpose of running a multi-agent system in the first place.
- **Builds on infrastructure that is already in place.** `NotificationPoller` already calls `tmux capture-pane` every 10 seconds and feeds output to `detectAgentState()`. The health monitor is a second consumer of that same data stream. No new data sources, no new polling loops, no new bot clients — just better analysis of what is already being collected.
- **Pays dividends forward.** Once HLT health events are in the `agent_health_events` table, the Multi-Agent Audit timeline (v4.0, deferred) gets stall/recovery events for free. Fleet Coordination (Option B) can display the health score chip in each fleet grid cell without additional backend work.
- **Conservative by default, powerful when opted in.** The `watch-only` default means zero behavioral change until the operator consciously enables interventions per agent. This makes the milestone safe to ship and test incrementally.

**Sequencing the others:**

After v4.1 (Health Monitor) ships, the natural next pick is **Option B (Fleet Coordination)** — because with health scores already available per session, the Fleet View gets richer data in its agent cells at no additional cost, and the prompt broadcast panel in Fleet View pairs naturally with the health monitor's alert-on-stall workflow.

**Option C (Prompt Workbench)** is valuable but addresses efficiency (friction reduction) rather than reliability (failure prevention). It is the right choice for a milestone after fleet coordination is in place, when the primary remaining operator pain point shifts from "I don't know what my agents are doing" to "I spend too much time typing the same things."
