# Feature Research: GSD Manager Plugin

**Domain:** Process management control panel — GSD skill browser UI (agent spawning, command dispatch, hook monitoring, registry management, inline CLI reference)
**Researched:** 2026-02-18
**Milestone:** v2.1 GSD Manager Plugin
**Confidence:** HIGH

---

## Context

This research is scoped to the NEW features for the GSD Manager Plugin — a `bottom-panel` plugin that wraps GSD CLI tooling in a browser UI. It does NOT re-document features already built in v1.x / v2.0 (terminals, activity timeline, prompt panel, plugin system, etc.).

Existing Warden services this plugin can reuse:
- `GatewayApiClient` — sends prompts to agents via OpenClaw Gateway (`POST /api/agents/:id/prompt`)
- `TmuxSessionManager.sendPromptToSession()` — sends keys directly to tmux pane
- `TmuxSessionManager.destroySession()` — kills a session
- `instanceRoutes` — `/api/instances` for current session list
- Plugin slot `bottom-panel` — rendered in terminals view below the terminal
- Plugin manifest/registration — drop-in `.tsx` file auto-discovered by `import.meta.glob`

New backend needed: `gsdRoutes.ts` at `/api/gsd/` — wraps `spawn.sh`, `menu-driver.sh`, `recovery-registry.json`, `STATE.md` reads, `/tmp/gsd-hooks.log` tail.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the operator will assume exist. Missing any of these = plugin feels incomplete.

| Feature | Why Expected | Complexity | Warden Dependency |
|---------|--------------|------------|-------------------|
| **Agent grid — session status display** | Operator needs to see which agents are live vs stopped at a glance | LOW | `/api/instances` (existing) |
| **Agent grid — working directory display** | Registry entries store `working_directory`; operator needs to know which project each agent is working on | LOW | `/api/gsd/registry` (new) |
| **Quick command — preset GSD slash commands** | The 6 core GSD commands (`/gsd:resume-work`, `/gsd:quick`, `/gsd:new-milestone`, `/gsd:execute-phase`, `/gsd:plan-phase`, `/gsd:progress`) are the main driver of agent behavior; operators run these constantly | LOW | `POST /api/gsd/sessions/:session/command` (new) |
| **Quick command — custom command input** | Operator sometimes needs non-preset commands; must not be locked into presets | LOW | Same as above |
| **Quick command — success/error feedback** | After sending a command, operator needs to know if it was delivered or if something failed | LOW | Response from command endpoint |
| **Recovery registry viewer — agent list** | The registry is the source of truth for all managed agents; operator needs to see it | LOW | `/api/gsd/registry` (new) |
| **Recovery registry viewer — enabled/disabled toggle** | Operators enable/disable agents to control auto-wake behavior; hand-editing JSON is error-prone | MEDIUM | `PATCH /api/gsd/registry/agents/:id` (new, writes JSON file) |
| **Hook activity feed — recent events** | `/tmp/gsd-hooks.log` is the only real-time signal about what hooks are firing and whether agents are matched; operators need to see this from the browser | LOW | `/api/gsd/hooks/log` (new, file read) |
| **Spawn agent — agent name and workdir inputs** | Core workflow: operator picks agent identifier and project directory, clicks spawn | MEDIUM | `POST /api/gsd/spawn` (new, exec spawn.sh) |
| **Manual command reference — inline bash equivalent** | Every UI action should show the equivalent bash command (per PRD); operators need to understand what the UI is doing and fall back to CLI if needed | LOW | Static display, no backend |
| **Collapsible sections** | Bottom panel has limited vertical space; all sections must collapse to a header bar | LOW | None (CSS only) |

### Differentiators (Competitive Advantage)

Features that make this control panel genuinely useful rather than just a novelty.

| Feature | Value Proposition | Complexity | Warden Dependency |
|---------|-------------------|------------|-------------------|
| **Agent grid — state hint display** | The stop-hook sends `state` (idle / menu / working / error / permission_prompt); showing this in the grid tells operator exactly what Claude is doing without opening the terminal | MEDIUM | `/api/gsd/sessions/:session/state` reads STATE.md + hook log inference |
| **Agent grid — context pressure indicator** | Stop-hook extracts context pressure percentage (e.g. "72% [WARNING]"); exposing this warns operator before agent hits context limit | MEDIUM | Same as above, STATE.md or hook log parsing |
| **Spawn agent — auto-detect first command** | Mirror spawn.sh's `choose_first_cmd()` logic: if `.planning/` exists → suggest `/gsd:resume-work`; if `PRD.md` exists → suggest `/gsd:new-project @PRD.md`; show the suggestion so operator can override | MEDIUM | `POST /api/gsd/spawn` with auto-detect flag, or client-side inference |
| **Quick command — session selector tied to tab bar** | Pre-select the command target to match the terminal tab currently open; reduces cognitive load ("which session am I sending to?") | LOW | `selectedSessionName` prop from App.tsx, passed via plugin context |
| **Hook activity feed — per-agent filtering** | Multiple agents generate hook events; operator needs to filter to one agent's events without wading through all others | LOW | Client-side filter on log lines (all lines contain `tmux_session=`) |
| **Hook activity feed — auto-poll with freshness indicator** | Hook log is a file; poll every 5s, show "Updated Xs ago" so operator knows if the feed is live | LOW | Polling `/api/gsd/hooks/log` — no WebSocket needed at this scale |
| **Registry viewer — launch command display** | `claude_launch_command` and `claude_post_launch_mode` are config fields operators sometimes need to verify | LOW | `/api/gsd/registry` response includes these fields |
| **Inline bash reference — copy-to-clipboard** | State-changing "Copy" → "Copied!" button next to every bash snippet; operator can paste into terminal for manual override without retyping | LOW | Browser `navigator.clipboard.writeText()` |
| **Session state — read STATE.md** | Show current phase, progress %, and last activity date from `.planning/STATE.md` when available | MEDIUM | `/api/gsd/sessions/:session/state` (new, reads file at registry's `working_directory`) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Edit recovery-registry.json inline** | Operators want to change `system_prompt`, `claude_launch_command` from UI | JSON editing UX in a browser is fragile; schema enforcement difficult; concurrent writes from hooks can clobber edits; partial edits corrupt registry | Support toggle (enabled/disabled) and discrete field updates (PATCH endpoints) only; keep full edits in the file system |
| **Edit STATE.md or PROJECT.md from UI** | State looks editable; operators want to advance phase markers manually | PRD explicitly flags this as a non-goal; STATE.md is auto-maintained by GSD workflow; manual edits break GSD's tracking assumptions | Read-only display; operators who need to advance state use GSD commands via the command panel |
| **WebSocket streaming for hook log** | "Real-time" hook events feel more alive | Hook log is a local file appended by bash scripts; `tail -f` via PTY or `fs.watch()` would add complexity with minimal gain at single-operator scale; polling every 5s is imperceptible | Polling at 5s with freshness indicator; operator sees events within 5s which is fast enough for diagnostic purposes |
| **Spawn agent — system prompt text editor** | spawn.sh supports `--system-prompt`; operators want to set custom prompts | Multi-line text editors in a bottom panel are cramped; system prompts are long and need careful editing; prompts should live in registry or files for traceability | System prompt path field only (pass a file path); the file itself is edited outside Warden; show current prompt as read-only preview |
| **Kill session button in this plugin** | Seems logical alongside spawn | Already available in `InstanceTabBar` (existing stop button per session); duplicating it here creates confusion about authoritative kill point | Link to the session tab; keep kill in existing UI |
| **Agent auto-wake toggle UI** | Registry has `auto_wake` field | Requires understanding of OpenClaw agent wake behavior; risk of operator accidentally disabling recovery for a critical agent | Show `auto_wake` as read-only label next to enabled toggle; add to v2.x if demand exists |
| **Real-time terminal-in-panel** | "See the terminal without switching tabs" | Full xterm.js terminal in a bottom panel is a new PTY connection — doubles resource usage; already solved by the Terminals view | Deep-link "open in terminal" button that switches to the Terminals view and selects that session |

---

## Feature Dependencies

```
Agent Grid — State Hint Display
    └──requires──> /api/gsd/sessions/:session/state (new)
                       └──requires──> working_directory from /api/gsd/registry
                       └──reads──> .planning/STATE.md at that path

Agent Grid — Context Pressure
    └──requires──> Hook log parsing OR STATE.md parsing
    └──enhances──> Agent Grid — State Hint Display

Spawn Agent — auto-detect first command
    └──requires──> /api/gsd/spawn POST endpoint
    └──enhances──> Quick Command (suggests first command as a preset)

Quick Command — session selector tied to tab bar
    └──requires──> Plugin receives selectedSessionName from plugin context
                       └──requires──> PluginSlotRenderer to pass App state as context prop

Registry Viewer — enabled toggle
    └──requires──> /api/gsd/registry GET (to render current state)
    └──requires──> PATCH /api/gsd/registry/agents/:id (to write)
    └──requires──> File lock awareness (spawn.sh uses flock; server PATCH must also lock)

Hook Activity Feed — per-agent filter
    └──requires──> /api/gsd/hooks/log GET (raw log lines)
    └──enhances──> Agent Grid (can show last hook event per agent)

Manual Command Reference — copy to clipboard
    └──requires──> Any action that generates a bash equivalent string
    └──enhances──> All other features (cross-cutting UX concern)

Session State — STATE.md display
    └──requires──> /api/gsd/sessions/:session/state
    └──enhances──> Agent Grid (adds phase/progress to each agent card)
```

### Dependency Notes

- **Plugin context / session selector:** The existing `PluginSlotRenderer` renders `<PanelComponent />` with no props. To pass `selectedSessionName` into the GSD plugin, either the plugin context needs to be extended, or the plugin fetches it from `/api/instances` itself. The latter is simpler: plugin polls instances and cross-references with registry.

- **File locking for registry PATCH:** `spawn.sh` uses `flock` on a `.lock` file when writing the registry. The `/api/gsd/registry/agents/:id` PATCH must also honor this lock (use `child_process.execFile('flock', ...)` wrapper or write a shell helper) to avoid race conditions when an agent spawns while the operator toggles enabled status.

- **STATE.md path:** The path is `{working_directory}/.planning/STATE.md` where `working_directory` comes from the registry entry. The endpoint must resolve this per-agent, not assume a fixed project path.

- **Hook log parsing for state hint:** Hook log lines contain `state=working`, `state=idle`, `state=menu`, `state=error`. Parsing the last matching line per session gives a cheap state approximation without a new data store.

---

## MVP Definition

### Launch With (v2.1 — Plugin v1.0)

Minimum viable set that validates the control-center concept and replaces the most common CLI workflows.

- [ ] **Agent grid with session status** — show active/idle/stopped per agent, pulling from `/api/instances` + registry merge — _validates the agent grid concept_
- [ ] **Preset GSD commands** — 6 preset buttons (`/gsd:resume-work`, `/gsd:quick <task>`, `/gsd:new-milestone`, `/gsd:execute-phase`, `/gsd:plan-phase <n>`, `/gsd:progress`) sent via `menu-driver.sh clear_then` — _core operator workflow_
- [ ] **Custom command input** — free text box + send button — _covers commands not in presets_
- [ ] **Command success/error feedback** — inline status message (same pattern as PromptPanel) — _operator confidence_
- [ ] **Recovery registry viewer — agent list** — read-only display of registry agents with enabled status indicator — _audit visibility_
- [ ] **Enabled/disabled toggle** — PATCH `/api/gsd/registry/agents/:id` — _replaces hand-editing JSON_
- [ ] **Hook activity feed — last 20 events** — polled every 5s from `/api/gsd/hooks/log` — _diagnostic value_
- [ ] **Spawn agent form** — agent name, workdir, optional first command, submit button calling `spawn.sh` — _core operator workflow_
- [ ] **Inline bash reference** — collapsible "Manual" row below each action with copy button — _PRD requirement; operator trust_
- [ ] **Collapsible sections** — Agent Grid, Quick Actions, Hook Feed, Registry — accordion behavior — _space management in bottom panel_

### Add After Validation (v2.1.x)

- [ ] **State hint display** — parse hook log for last `state=` line per agent, show idle/menu/working/error badge — _trigger: operators asking "what is this agent doing?"_
- [ ] **Context pressure indicator** — parse `XX% [WARNING/CRITICAL]` from hook log per agent — _trigger: agents hitting context limit unnoticed_
- [ ] **Session selector tied to tab bar** — pre-select command target from currently viewed terminal session — _trigger: friction sending commands to wrong agent_
- [ ] **STATE.md phase + progress display** — show phase X/N and progress % per agent — _trigger: operators asking "how far along is this project?"_
- [ ] **Spawn agent auto-detect first command** — mirror spawn.sh logic, show suggested command in form — _trigger: operators spawning wrong command type_
- [ ] **Per-agent hook feed filter** — client-side filter on log lines by agent/session name — _trigger: multi-agent operators confused by mixed feed_

### Future Consideration (v2.2+)

- [ ] **Hook log SSE streaming** — Server-Sent Events push log lines as they appear — _defer: polling at 5s is sufficient for diagnostic use; SSE adds server-side complexity_
- [ ] **Registry field editor** — PATCH discrete fields (topic_id, claude_post_launch_mode) — _defer: currently low demand; hand-editing file is acceptable_
- [ ] **System prompt path field in spawn form** — pass `--system-prompt /path/to/file` to spawn.sh — _defer: advanced use case, most agents use defaults_
- [ ] **Recovery diagnostics — run diagnose-hooks.sh** — button to run the diagnostic script and show output — _defer: niche; `diagnose-hooks.sh` is already CLI-friendly_

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|---------------|---------------------|----------|
| Spawn agent form | HIGH | MEDIUM | P1 |
| Preset GSD commands | HIGH | LOW | P1 |
| Custom command input | HIGH | LOW | P1 |
| Command success/error feedback | HIGH | LOW | P1 |
| Agent grid — session status | HIGH | LOW | P1 |
| Collapsible sections | HIGH | LOW | P1 |
| Recovery registry viewer (read) | MEDIUM | LOW | P1 |
| Enabled/disabled toggle | MEDIUM | MEDIUM | P1 |
| Hook activity feed (polled) | MEDIUM | LOW | P1 |
| Inline bash reference + copy | MEDIUM | LOW | P1 |
| State hint display | MEDIUM | MEDIUM | P2 |
| Context pressure indicator | MEDIUM | MEDIUM | P2 |
| Session selector tied to tab bar | MEDIUM | MEDIUM | P2 |
| STATE.md display | MEDIUM | MEDIUM | P2 |
| Spawn auto-detect first command | LOW | MEDIUM | P2 |
| Per-agent hook feed filter | LOW | LOW | P2 |
| Hook log SSE streaming | LOW | HIGH | P3 |
| Registry field editor | LOW | MEDIUM | P3 |
| System prompt path in spawn | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v2.1 launch
- P2: Should have; add in v2.1.x patch cycles
- P3: Defer to v2.2+ or only if explicitly requested

---

## UX Patterns from Reference Analysis

### Agent Spawning UI (confirmed patterns)

- **Suggest-and-confirm pattern** (agentic AI UX standard): Show the auto-detected first command as a pre-filled suggestion; operator can override before confirming. Do not auto-spawn without review.
- **Progressive disclosure**: Spawn form starts collapsed; expands on "Spawn Agent" button click. Advanced options (system prompt path, launch command override) under an "Advanced" expander.
- **Clear feedback on long-running operations**: `spawn.sh` waits for TUI readiness (up to 20 seconds). Show a "Spawning..." state with an indeterminate progress indicator; show success/error when the endpoint resolves.

### Command Dispatch (confirmed patterns)

- **Preset buttons as primary affordance**: 6 preset command buttons are the primary action surface. Custom input is secondary (collapsed or smaller).
- **Confirmation dialogs**: Only for destructive or irreversible actions. Sending a GSD command is non-destructive (Claude will handle or ignore it) — no confirmation needed. Spawn is also recoverable (can kill session). Do NOT add confirmation modals to every action (adds friction).
- **In-place feedback**: Use the same inline status pattern as `PromptPanel` — success message auto-dismisses after 5s, error persists until dismissed. No modal dialogs.

### Real-Time Log/Event Feed (confirmed patterns)

- **Polling over streaming for this scale**: Single operator, file-based log, updates every few seconds. Poll at 5s intervals. WebSocket streaming is overkill here and adds server complexity.
- **Freshness indicator**: Show "Updated Xs ago" or timestamp of last poll. Makes the feed feel live even with polling.
- **User-driven refresh**: Add a manual "Refresh" button for operators who want immediate update without waiting 5s.
- **Newest-first ordering**: Hook events are diagnostic — operators want the latest event, not historical scroll. Newest first, fixed max of 20-50 lines.
- **No auto-scroll lock**: If operator is reading older events, do not scroll to bottom on new event. Use a "New events" badge at the top that scrolls when clicked.

### Process Registry Management (confirmed patterns)

- **Toggle switch for enabled/disabled**: Standard UX for enable/disable. Green = enabled, grey = disabled. Show label ("Enabled" / "Disabled") next to toggle to avoid ambiguity.
- **Optimistic UI with revert**: Apply toggle state immediately in UI, then confirm with server. If PATCH fails, revert and show error — don't leave UI in inconsistent state.
- **Status indicators with semantic color**: `active` → green dot, `idle` → amber dot, `stopped` → grey dot, `error` → red dot. Consistent with existing `AgentInstanceStatus` type.

### Inline Command Reference (confirmed patterns)

- **Collapsible "Manual" disclosure**: Show the bash equivalent as a collapsed row below each action form. Operator can expand when needed. Not shown by default (reduce visual noise).
- **Inline compact clipboard copy** (PatternFly / shadcn pattern): Copy button adjacent to the command text. State changes "Copy" → "Copied!" for 2s, then resets.
- **Monospace code block**: Wrap bash commands in `<code>` with monospace font and subtle background (`bg-warden-bg/50`), matching Warden's terminal aesthetic.

---

## Backend API Surface (New Routes)

All new routes are in `src/server/routes/gsdRoutes.ts` mounted at `/api/gsd/`:

| Endpoint | Method | Action | Key Behavior |
|----------|--------|--------|--------------|
| `/api/gsd/registry` | GET | Read recovery-registry.json | JSON parse, return agents array with global hook_settings |
| `/api/gsd/registry/agents/:agentId` | PATCH | Toggle enabled, update discrete fields | Use flock-compatible write; validate field allow-list |
| `/api/gsd/spawn` | POST | Run spawn.sh | `execFile` with timeout (30s); stream stdout/stderr to response |
| `/api/gsd/sessions/:session/command` | POST | Run menu-driver.sh action | `execFile`; action must be in allow-list |
| `/api/gsd/sessions/:session/state` | GET | Read STATE.md from project .planning/ | Resolve path from registry; graceful 404 if not found |
| `/api/gsd/hooks/log` | GET | Tail /tmp/gsd-hooks.log | Last N lines (default 50, max 200); optional `?session=` filter |

---

## Sources

### Process Management UI Patterns
- [Agentic AI Design Patterns — UX Magazine](https://uxmag.com/articles/secrets-of-agentic-ux-emerging-design-patterns-for-human-interaction-with-ai-agents)
- [Agentic Patterns and Implementation — Salesforce Architects](https://architect.salesforce.com/fundamentals/agentic-patterns)
- [Top 10 Agentic AI Design Patterns — AufaitUX](https://www.aufaitux.com/blog/agentic-ai-design-patterns-enterprise-guide/)

### Real-Time Log Feed Patterns
- [Activity Stream design pattern — UI Patterns](https://ui-patterns.com/patterns/ActivityStream)
- [Polling vs Streaming — Svix Resources](https://www.svix.com/resources/faq/polling-vs-streaming/)
- [UX Strategies for Real-Time Dashboards — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Streaming Options for UI: SSE, WebSocket, Long Poll — VerticalServe/Medium](https://verticalserve.medium.com/streaming-options-for-ui-sse-websocket-and-long-poll-975192248506)

### Inline Command Reference / Copy-to-Clipboard
- [Clipboard Copy Design Guidelines — PatternFly](https://www.patternfly.org/components/clipboard-copy/design-guidelines/)
- [UI Copy: UX Guidelines for Command Names and Keyboard Shortcuts — NN/g](https://www.nngroup.com/articles/ui-copy/)
- [Top 8 UX Patterns for Contextual Help — Chameleon](https://www.chameleon.io/blog/contextual-help-ux)

### Existing Codebase Reference
- `spawn.sh` — `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh`
- `menu-driver.sh` — `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh`
- `recovery-registry.example.json` — `/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.example.json`
- `/tmp/gsd-hooks.log` — live hook event log (format: `[ISO8601] [script.sh] key=value`)
- `PRD-gsd-manager-plugin.md` — product requirements document

---

*Feature research for: GSD Manager Plugin for Warden Dashboard (v2.1 milestone)*
*Researched: 2026-02-18*
*Confidence: HIGH (primary sources: live codebase inspection, GSD scripts, real hook log, PRD; web: agentic UX patterns, polling vs streaming, copy-to-clipboard patterns)*
