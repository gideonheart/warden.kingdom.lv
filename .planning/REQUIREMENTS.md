# Requirements: Warden Dashboard

**Defined:** 2026-02-12
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Terminal Streaming

- [ ] **TERM-01**: User can view live terminal output of any active tmux session in the browser via xterm.js
- [ ] **TERM-02**: Terminal output streams with under 100ms latency on local network
- [ ] **TERM-03**: Terminal view supports scroll-back through recent output
- [ ] **TERM-04**: Terminal auto-reconnects after network interruption without losing session
- [ ] **TERM-05**: Terminal resizes responsively when browser window changes size
- [ ] **TERM-06**: Terminal renders ANSI escape codes and colors correctly (Claude Code output)

### Session Management

- [ ] **SESS-01**: Dashboard auto-discovers running tmux sessions matching agent naming convention (warden-*, scout-*, builder-*, gideon-*)
- [ ] **SESS-02**: Dashboard displays horizontal tab bar showing all active agent sessions with name, status dot, and project path
- [ ] **SESS-03**: User can switch between sessions by clicking tabs with under 500ms switch time
- [ ] **SESS-04**: Session status is tracked in SQLite as active, idle, stopped, or error
- [ ] **SESS-05**: Dashboard reconciles SQLite state with actual tmux sessions periodically
- [ ] **SESS-06**: User can stop a tmux session from the dashboard

### Agent Integration

- [ ] **AGNT-01**: Dashboard reads agent configuration from openclaw.json (agent list, bindings, topic mappings)
- [ ] **AGNT-02**: Dashboard displays agent details sidebar with SOUL.md preview, workspace path, model, and memory status
- [ ] **AGNT-03**: Dashboard displays Telegram topic-to-agent mapping as a visual grid
- [ ] **AGNT-04**: User can send prompt to an agent via OpenClaw gateway API from the prompt input panel
- [ ] **AGNT-05**: Agent config is cached with 30-second refresh interval

### Intervention

- [ ] **INTV-01**: All terminal views start in read-only mode by default
- [ ] **INTV-02**: User can explicitly toggle take-over mode to enable interactive terminal input per session
- [ ] **INTV-03**: Take-over mode shows clear visual indicator distinguishing from read-only mode
- [ ] **INTV-04**: User can send text input to the terminal in take-over mode

### Infrastructure

- [ ] **INFR-01**: Express 5 server binds to 127.0.0.1:3001 with Socket.IO WebSocket support
- [ ] **INFR-02**: SQLite database with WAL mode stores instance metadata, session logs, and token usage
- [ ] **INFR-03**: Vite builds React frontend; Express serves static assets in production
- [ ] **INFR-04**: Server gracefully shuts down, cleaning up PTY processes and checkpointing SQLite
- [ ] **INFR-05**: Nginx config reference for SSL termination, IP whitelist, and WebSocket upgrade

### UI Design

- [ ] **UIDN-01**: Dashboard uses dark theme matching OpenClaw Gateway UI aesthetic
- [ ] **UIDN-02**: Connection status indicators (green=connected, amber=reconnecting, red=disconnected)
- [ ] **UIDN-03**: Loading states for session list and terminal connections
- [ ] **UIDN-04**: Error boundaries prevent terminal component errors from crashing the entire app

### History & Analytics

- [ ] **HIST-01**: User can view searchable archive of past sessions with date and agent filters
- [ ] **HIST-02**: User can view token usage dashboard with per-agent daily aggregation
- [ ] **HIST-03**: User can tail OpenClaw gateway logs filtered by agent

### Testing

- [ ] **TEST-01**: Playwright desktop UI tests verify core dashboard flows (load, tab switch, terminal view)
- [ ] **TEST-02**: Documentation describes how to run Playwright tests

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Monitoring

- **ADVM-01**: Real-time notifications when agent encounters errors
- **ADVM-02**: Agent performance metrics (response time, success rate)
- **ADVM-03**: Multi-server support (monitor agents across multiple hosts)

### Advanced Intervention

- **ADVI-01**: Prompt templates for common intervention patterns
- **ADVI-02**: Scheduled commands (send prompt at specific time)
- **ADVI-03**: Emergency stop all agents button

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Single-user internal tool, desktop browser only |
| Multi-user authentication | IP-whitelisted, single operator |
| Agent creation/deletion | Managed via openclaw.json, not the dashboard |
| Telegram bot management | Handled by OpenClaw gateway |
| Terminal themes/customization | Monitoring tool, not daily-driver terminal. Single dark theme. |
| Multi-pane terminal splits | tmux already handles layout within sessions |
| Session recording/replay | Storage cost, complexity. Session history table sufficient. |
| In-dashboard code editor | Agents edit files. Operator intervenes via prompts. |
| Real-time collaboration (multi-user) | Single operator model. No CRDT complexity. |
| Vim keybindings in dashboard | Dashboard is for observation, not editing |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 1 | Pending |
| INFR-02 | Phase 1 | Pending |
| INFR-04 | Phase 1 | Pending |
| TERM-01 | Phase 1 | Pending |
| TERM-02 | Phase 1 | Pending |
| TERM-04 | Phase 1 | Pending |
| TERM-06 | Phase 1 | Pending |
| SESS-01 | Phase 1 | Pending |
| SESS-04 | Phase 1 | Pending |
| SESS-05 | Phase 1 | Pending |
| SESS-06 | Phase 1, Phase 6 | Pending (UI gap) |
| UIDN-01 | Phase 2 | Pending |
| UIDN-02 | Phase 2 | Pending |
| UIDN-03 | Phase 2 | Pending |
| UIDN-04 | Phase 2 | Pending |
| TERM-03 | Phase 2 | Pending |
| TERM-05 | Phase 2 | Pending |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 2 | Pending |
| INTV-01 | Phase 2 | Pending |
| AGNT-01 | Phase 3 | Pending |
| AGNT-02 | Phase 3, Phase 6 | Pending (partial gap) |
| AGNT-03 | Phase 3 | Pending |
| AGNT-04 | Phase 3 | Pending |
| AGNT-05 | Phase 3 | Pending |
| INTV-02 | Phase 3 | Pending |
| INTV-03 | Phase 3 | Pending |
| INTV-04 | Phase 3 | Pending |
| HIST-01 | Phase 4 | Pending |
| HIST-02 | Phase 4 | Pending |
| HIST-03 | Phase 4 | Pending |
| INFR-03 | Phase 5 | Pending |
| INFR-05 | Phase 5 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5, Phase 6 | Pending (partial gap) |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after roadmap creation*
