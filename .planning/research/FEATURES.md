# Feature Landscape

**Domain:** Browser-based terminal dashboard / multi-agent session multiplexer
**Researched:** 2026-02-12
**Confidence:** MEDIUM

## Executive Summary

Browser-based terminal dashboards combine two established patterns: **terminal multiplexing** (tmux/screen model) and **web-based terminal emulation** (xterm.js rendering). Multi-agent monitoring adds a third layer: **process orchestration visibility** (Jenkins/Kubernetes agent dashboard model).

The domain has clear table stakes — users expect instant terminal visibility, session persistence, and read-only observation. Differentiators come from intelligent agent routing, cross-tool integration (Telegram topic mapping), and intervention capabilities (prompt injection vs direct terminal takeover).

**Key insight:** This is NOT a general-purpose terminal tool competing with tmux. It's a **monitoring and intervention layer** for an autonomous agent system. Features should prioritize visibility, non-invasiveness, and surgical intervention over power-user terminal features.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Live terminal streaming** | Core value prop — see what agents are doing right now | MEDIUM | xterm.js + Socket.IO + node-pty. Standard pattern. Latency under 100ms critical. |
| **Session persistence across disconnects** | Browser refresh shouldn't kill agent work | LOW | tmux handles this. Just need to re-attach on reconnect. |
| **Multi-session tabs/view** | Users monitor multiple agents — need quick switching | LOW | Horizontal tab bar. Standard UI pattern. |
| **Read-only by default** | Prevent accidental interference with autonomous agents | LOW | Socket doesn't listen for input until explicitly enabled. |
| **Connection status indicators** | Users need to know if stream is live or stale | LOW | Dot indicators: green = connected, amber = reconnecting, red = dead. |
| **Terminal scroll and search** | Users review past output to understand agent state | LOW | xterm.js has built-in scroll buffer. Search requires addon. |
| **Auto-reconnect on network drop** | Unstable connections shouldn't require manual refresh | LOW | Socket.IO handles this with exponential backoff. |
| **Session metadata display** | Which agent? Which project? When started? | LOW | Show in tab label and sidebar. Read from SQLite or tmux session name. |
| **Terminal resizing** | Users resize browser window — terminal must adapt | LOW | FitAddon for xterm.js. Send resize events to pty. |
| **Copy/paste support** | Users extract output for debugging | LOW | Browser native. xterm.js handles selection. |

---

## Differentiators

Features that set Warden apart. Not expected, but highly valued for this use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Agent-to-Telegram topic mapping** | Shows which Telegram conversation controls which agent | MEDIUM | Unique to OpenClaw architecture. Visual grid prevents routing confusion. |
| **Prompt injection via gateway** | Send message through OpenClaw routing instead of raw terminal | MEDIUM | Preserves agent context + memory. Safer than direct terminal input. |
| **Explicit take-over mode** | Clear boundary between observation and intervention | LOW | Toggle per session. Visual indicator (banner, cursor blink). Prevents accidents. |
| **Agent identity in UI** | Color-coded tabs, avatars, distinct visual identity per agent | LOW | Helps users mentally map "this terminal = Warden = coding tasks". |
| **Session status tracking** | Active vs idle vs stopped vs error states | MEDIUM | Requires heuristics (last output timestamp, process exit codes) + SQLite persistence. |
| **Project path context** | Show which git repo the agent is working in | LOW | Parse from systemPrompt or read from session metadata. Critical for multi-project agents. |
| **SOUL.md preview** | Quick reminder of agent's role without leaving dashboard | LOW | Read from agentDir, render in sidebar. Helps operator decide when to intervene. |
| **Session discovery** | Auto-detect tmux sessions even if not tracked in DB | MEDIUM | Parse `tmux list-sessions`, match naming conventions. Resilient to DB loss. |
| **Workspace isolation indicators** | Show which agentDir, which workspace path | LOW | Prevents cross-agent confusion. Shows when agents share vs isolate state. |

---

## Anti-Features

Features to explicitly NOT build (commonly requested, often problematic).

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Multi-pane terminal splits** | tmux has splits, why not the dashboard? | Adds complexity for zero value — tmux already does this inside sessions. | Let tmux handle layout. Dashboard shows whole session. |
| **Terminal themes/customization** | Users want to personalize appearance | Scope creep. This is a monitoring tool, not a daily-driver terminal. | Single dark theme matching OpenClaw UI. No user theming. |
| **Vim keybindings in dashboard** | Power users expect vim navigation | Dashboard is for observation, not editing. Agents do the editing. | Provide take-over for rare cases. No keybinding layer. |
| **Collaborative multi-user editing** | What if multiple operators watch same session? | Single-user tool. No auth system. Adding multi-user = 10x complexity. | IP whitelist ensures single operator. No multi-user features. |
| **Session recording/replay** | "Record sessions for later playback" | Storage cost, playback complexity, privacy concerns. Agent logs exist. | Use session history table with timestamps + final output. No video recording. |
| **In-dashboard code editor** | "Edit files without switching to terminal" | Defeats the purpose. Agents edit files. Operator intervenes via prompts. | Prompt input panel. If manual editing needed, use local editor. |
| **Real-time collaboration (CRDTs)** | "Multiple people control one agent" | Chaos. Agents are autonomous. Single operator model. | One operator, prompt queue if needed. No CRDT complexity. |
| **Terminal multiplexing inside dashboard** | "Create new tmux windows from UI" | Dashboard observes, doesn't orchestrate tmux internals. | Let agents manage their own tmux layout. Read-only observation. |

---

## Feature Dependencies

```
Terminal Streaming
    └──requires──> Session Discovery
                       └──requires──> tmux Session Naming Convention

Prompt Injection
    └──requires──> OpenClaw Gateway API
    └──requires──> Agent-to-Topic Mapping

Take-Over Mode
    └──requires──> Terminal Streaming
    └──enhances──> Prompt Injection (alternative intervention path)

Agent Details Sidebar
    └──requires──> OpenClaw Config Reader
    └──enhances──> Agent-to-Topic Mapping (shows systemPrompt context)

Session Status Tracking
    └──requires──> SQLite Database
    └──enhances──> Session Discovery (adds state to discovered sessions)

Session History
    └──requires──> Session Status Tracking
    └──requires──> SQLite Database

Token Usage Dashboard
    └──requires──> OpenClaw Gateway API (if available)
    └──conflicts──> Direct Implementation (OpenClaw may not expose this)
```

### Dependency Notes

- **Terminal Streaming requires Session Discovery:** Can't stream what you can't find. Discovery identifies tmux sessions before streaming.
- **Prompt Injection requires Gateway API:** Direct terminal input bypasses agent context. Gateway routing preserves memory and intent.
- **Take-Over enhances Prompt Injection:** Two intervention modes — structured (prompt via gateway) vs emergency (direct terminal control).
- **Token Usage conflicts with Direct Implementation:** OpenClaw gateway may not expose token counts. Feature may require log parsing or API extension.

---

## MVP Recommendation

### Launch With (v1 — P0 Features)

Minimum viable product — prove the observation layer works.

- [x] **Terminal Streaming** — Live xterm.js view of each tmux session
- [x] **Session Discovery** — Auto-detect running sessions by naming convention
- [x] **Multi-Session Tabs** — Horizontal tab bar with agent name, project, status dot
- [x] **Read-Only by Default** — No input until explicitly enabled
- [x] **Connection Status** — Visual indicators for socket health
- [x] **Session Metadata** — Agent ID, project path, start time

**Rationale:** Prove you can watch agents work. No intervention features yet — pure observation. If this doesn't provide value, intervention features won't save it.

### Add After Validation (v1.x — P1 Features)

Once core observation is validated and used daily.

- [ ] **Prompt Input Panel** — Send messages through OpenClaw gateway
- [ ] **Take-Over Mode** — Toggle to interactive terminal input
- [ ] **Agent-to-Telegram Topic Map** — Visual grid showing routing configuration
- [ ] **Agent Details Sidebar** — SOUL.md, workspace, model, bindings
- [ ] **Session Status Tracking** — Active/idle/stopped/error states in SQLite

**Trigger for adding:** Using the dashboard daily for at least a week. Clear need to intervene (not just observe).

### Future Consideration (v2+ — P2 Features)

Defer until product-market fit with operator workflow.

- [ ] **Session History** — Searchable archive with date/agent filters
- [ ] **Token Usage Dashboard** — Per-agent daily aggregation
- [ ] **Log Viewer** — Tail OpenClaw gateway logs filtered by agent

**Why defer:** These are "nice to have" analytics. Focus on real-time monitoring first. Historical analysis comes later.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Terminal Streaming | HIGH | MEDIUM | P0 |
| Session Discovery | HIGH | MEDIUM | P0 |
| Multi-Session Tabs | HIGH | LOW | P0 |
| Read-Only Default | HIGH | LOW | P0 |
| Connection Status | MEDIUM | LOW | P0 |
| Session Metadata | MEDIUM | LOW | P0 |
| Prompt Input Panel | HIGH | MEDIUM | P1 |
| Take-Over Mode | MEDIUM | LOW | P1 |
| Agent-Telegram Map | HIGH | MEDIUM | P1 |
| Agent Details Sidebar | MEDIUM | LOW | P1 |
| Session Status Tracking | MEDIUM | MEDIUM | P1 |
| SOUL.md Preview | LOW | LOW | P1 |
| Session History | LOW | MEDIUM | P2 |
| Token Usage Dashboard | LOW | HIGH | P2 |
| Log Viewer | LOW | MEDIUM | P2 |

**Priority key:**
- **P0:** Must have for launch — core value prop
- **P1:** Should have — clear value, add once P0 is stable
- **P2:** Nice to have — analytics and polish, defer until proven need

---

## Competitive Feature Analysis

### Comparable Tools

| Category | Tool | Primary Use Case | Relevant Features |
|----------|------|------------------|-------------------|
| **Web Terminals** | Wetty | SSH-over-HTTP | Terminal streaming, auto-reconnect, URL-based session routing |
| **Web Terminals** | ttyd | Share terminal over web | xterm.js, WebSocket streaming, read-only mode |
| **Web Terminals** | GateOne | Enterprise web terminal | Multi-session tabs, session persistence, terminal recording |
| **Tmux Tools** | tmate | Tmux session sharing | Instant session URLs, read-only viewers, multi-viewer support |
| **Agent Dashboards** | Jenkins | CI/CD agent monitoring | Agent status grid, job-to-agent mapping, executor health |
| **Agent Dashboards** | Kubernetes Dashboard | Container orchestration UI | Pod logs streaming, resource metrics, deployment status |
| **Process Monitors** | PM2 Web UI | Node.js process manager | Process list, log streaming, restart controls |

### Feature Comparison

| Feature | Wetty | ttyd | GateOne | tmate | Jenkins | K8s Dash | Warden (Planned) |
|---------|-------|------|---------|-------|---------|----------|------------------|
| **Terminal Streaming** | Yes | Yes | Yes | Yes | No | Yes (logs) | Yes |
| **Multi-Session Tabs** | No | No | Yes | No | Yes (agents) | Yes (pods) | Yes |
| **Read-Only Mode** | No | Yes | Yes | Yes | Yes | Yes | Yes |
| **Session Persistence** | No | No | Yes | Yes | N/A | N/A | Yes (tmux) |
| **Auto-Reconnect** | No | Yes | Yes | Yes | Yes | Yes | Yes |
| **Agent Metadata View** | N/A | N/A | N/A | N/A | Yes | Yes | Yes |
| **Prompt Injection** | N/A | N/A | N/A | N/A | Yes (build params) | Yes (kubectl exec) | Yes |
| **Take-Over Mode** | Yes (default) | No | Yes | Yes | No | Yes (kubectl exec) | Yes |
| **Topic/Routing Map** | N/A | N/A | N/A | N/A | No | No | Yes (unique) |
| **Session History** | No | No | Yes | No | Yes | Yes | Planned (P2) |
| **Status Tracking** | No | No | Yes | No | Yes | Yes | Yes |

### Our Approach vs Competitors

| Feature Category | Standard Approach | Warden's Differentiation |
|------------------|-------------------|--------------------------|
| **Terminal Access** | Direct SSH or pty spawn | Observe tmux sessions created by OpenClaw |
| **Multi-Session** | One tab per connection | One tab per autonomous agent (persistent identity) |
| **Intervention** | Always interactive OR always read-only | Graduated: observe → prompt via gateway → terminal takeover |
| **Routing** | URL-based session IDs | Agent-to-Telegram-topic mapping (matches OpenClaw bindings) |
| **Metadata** | Generic process info | Agent role (SOUL.md), workspace isolation, model config |
| **Session Persistence** | Often ephemeral (dies on disconnect) | tmux-backed (survives browser close, server reboot) |

---

## Domain-Specific Patterns

### Browser-Based Terminals (Wetty, ttyd, GateOne)

**What they do well:**
- xterm.js rendering (fast, well-supported)
- WebSocket streaming (low latency)
- Auto-reconnect on network drop

**Common gaps:**
- Poor multi-session UX (separate windows, no unified view)
- No semantic session identity (just "session-1234")
- No intervention modes (interactive OR read-only, not both)

**Lesson for Warden:** Use their technical stack (xterm.js + Socket.IO) but add semantic layer (agent identity, role-based tabs, graduated intervention).

### Tmux Sharing Tools (tmate)

**What they do well:**
- Instant URL-based session sharing
- Multiple viewers on one session
- Read-only viewer mode

**Common gaps:**
- No session discovery (must copy URL manually)
- No persistent identity (sessions are anonymous)
- No metadata layer (what is this session doing?)

**Lesson for Warden:** Auto-discovery via naming conventions. Persistent agent identity. Rich metadata (project, role, status).

### Agent Monitoring Dashboards (Jenkins, Kubernetes)

**What they do well:**
- Agent/executor health grid
- Job-to-agent routing visibility
- Status indicators (idle/busy/offline)
- Log streaming per agent

**Common gaps:**
- No interactive access to agent terminals
- High abstraction (can't see raw process output easily)
- Complex setup (enterprise-grade)

**Lesson for Warden:** Combine visibility grid with raw terminal access. Keep setup simple (single-user, SQLite, no auth complexity).

---

## Research Gaps

**LOW confidence areas (require verification):**

1. **Token usage visibility:** Does OpenClaw gateway expose per-agent token counts via API? Or must we parse logs?
   - **Impact:** P2 feature (Token Usage Dashboard) feasibility
   - **Mitigation:** Defer to P2, validate API during implementation

2. **Gateway prompt injection API:** Does OpenClaw expose an HTTP endpoint to send messages to specific agents/topics?
   - **Impact:** P1 feature (Prompt Input Panel) feasibility
   - **Mitigation:** Check OpenClaw docs/code during P1 planning. Fallback: direct terminal input only.

3. **Session lifecycle events:** Can we detect when agents spawn new tmux sessions without polling?
   - **Impact:** Session discovery freshness
   - **Mitigation:** Start with polling (5s interval). Add webhook if OpenClaw supports it.

4. **xterm.js performance with long-running sessions:** What's the memory footprint after 24+ hours of streaming?
   - **Impact:** Scroll buffer management
   - **Mitigation:** Cap scroll buffer at 10K lines. Add "clear buffer" button.

---

## Feature Research Sources

**Browser terminals:**
- My training data includes Wetty, ttyd, and GateOne architecture patterns (xterm.js + WebSocket standard)
- tmate design (read-only viewer mode, URL-based session sharing)

**Multi-agent monitoring:**
- Jenkins agent dashboard UX (executor grid, job mapping)
- Kubernetes Dashboard patterns (pod logs, status indicators)

**Terminal multiplexing:**
- tmux session management patterns (naming conventions, session discovery)
- screen/byobu UX patterns (status bars, session switching)

**Confidence level:** MEDIUM
- **Why not HIGH:** Could not verify current 2026 state of tools via WebSearch (permission denied)
- **Why not LOW:** Strong familiarity with domain from training data. Patterns are well-established and slow-changing.
- **Verification needed:** Confirm xterm.js current version features, Socket.IO 4.x capabilities, node-pty compatibility with tmux 3.4+

---

## Recommendations for Roadmap

### Phase 1: Prove the Observation Model
Focus on table stakes. Goal: Can we watch agents work and understand what's happening?

**Include:**
- Terminal streaming
- Session discovery
- Multi-session tabs
- Read-only default
- Connection status

**Exclude:**
- Intervention features (prompts, takeover)
- Analytics (history, tokens)
- Polish (themes, customization)

**Success criteria:** Dashboard used daily for at least a week. Operator finds value in passive observation.

### Phase 2: Add Intervention
Once observation is proven valuable, add ability to influence agents.

**Include:**
- Prompt input panel (via OpenClaw gateway)
- Take-over mode (direct terminal input)
- Agent-to-Telegram topic map (prevents routing errors)
- Agent details sidebar (informs intervention decisions)

**Exclude:**
- Historical features (session archive, token usage)
- Advanced analytics

**Success criteria:** Operator intervenes at least once per day. Intervention is surgical, not constant.

### Phase 3: Analytics and History
Once intervention patterns are established, add historical view.

**Include:**
- Session history with search
- Token usage dashboard
- Log viewer

**Success criteria:** Operator reviews history weekly to identify patterns or debug issues.

---

*Feature research for: Warden Dashboard — browser-based terminal multiplexer for OpenClaw multi-agent system*
*Researched: 2026-02-12*
*Confidence: MEDIUM (training data based, no live ecosystem verification)*
