# Requirements: Warden Dashboard

**Defined:** 2026-03-04
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.1 Requirements

Requirements for v3.1 Agent Control & Deep Insights. Each maps to roadmap phases.

### Agent Orchestration

- [ ] **ORCH-01**: Operator can start a new agent session by selecting an agent from the config and clicking Start — tmux session appears in tab bar within 15 seconds with Claude Code running inside
- [ ] **ORCH-02**: Operator can stop a running agent session with two-phase graceful shutdown (Ctrl+C to Claude Code, 5s grace period, then kill tmux session)
- [ ] **ORCH-03**: Operator can restart a stopped or errored agent session — equivalent to stop + start with the same agent identity and project path
- [ ] **ORCH-04**: Session status badges in InstanceTabBar reflect full lifecycle (starting/active/stopping/stopped) in real time with appropriate visual indicators
- [ ] **ORCH-05**: Safety guards — stop/restart require confirmation dialog, start button disabled for agents with active sessions, server returns 409 on duplicate start attempts

### Token Insights

- [ ] **TOKN-10**: Burn rate (cost/hour) displayed per agent with sliding window selector (1h/4h/24h), updating on each scan cycle
- [ ] **TOKN-11**: Per-agent daily budget threshold stored in SQLite with visual warning at 80% (amber badge) and alert at 100% (red badge), visible on History nav tab
- [ ] **TOKN-12**: Model comparison view showing cost breakdown by model variant (sonnet/opus/haiku) per agent as bar chart or table
- [ ] **TOKN-13**: Cost projection showing estimated daily/weekly spend at current burn rate, updating when burn rate window changes
- [ ] **TOKN-14**: Export button downloads full token usage dataset as CSV with columns: date, agent_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd

### Session Recording

- [ ] **REC-01**: PTY output captured as timestamped asciicast v2 recording files when recording is active, with metadata stored in SQLite recordings table
- [ ] **REC-02**: Record button in terminal view header starts/stops recording per session with visual indicator (red pulse when recording)
- [ ] **REC-03**: Completed recordings replay in read-only xterm.js terminal at variable speed (1x/2x/4x/8x) with pause/resume controls
- [ ] **REC-04**: Recording library shows browsable list of past recordings with agent name, project, date, duration, file size — click to open in replay player
- [ ] **REC-05**: Auto-record settings panel with options: always, never, on-permission-prompt — triggers recording automatically based on configured condition

## v3.0 Requirements (Complete)

All v3.0 Operator Awareness & Terminal Power Tools requirements shipped.

### Operator Awareness

- [x] **AWARE-01**: Operator sees a pulsing amber badge on the session tab when an agent is waiting for permission input
- [x] **AWARE-02**: Badge clears automatically when operator sends input to the waiting session
- [x] **AWARE-03**: Operator sees context window pressure percentage in the terminal view header for the active session
- [x] **AWARE-04**: Context pressure badge shows green (<70%), amber (70-89%), or pulsing red (>=90%) based on threshold
- [x] **AWARE-05**: Operator sees the agent state (working/idle/error/permission) as a chip in the terminal view header
- [x] **AWARE-06**: Operator can opt in to browser notifications for permission prompts via a settings toggle
- [x] **AWARE-07**: Browser notification fires when permission prompt is detected and the browser tab is not focused
- [x] **AWARE-08**: Browser notification does not fire repeatedly while same permission state persists (state-transition only)

### Terminal Search

- [x] **SRCH-01**: Operator can open a search overlay with Ctrl+F in the terminal view
- [x] **SRCH-02**: Search finds and highlights matching text in the full terminal scrollback buffer (not just visible area)
- [x] **SRCH-03**: Operator can navigate between matches with Next/Previous buttons or Enter/Shift+Enter
- [x] **SRCH-04**: Search overlay shows match count ("3 / 47" or "1000+" for large result sets)
- [x] **SRCH-05**: Scrollbar gutter markers indicate where matches appear in the buffer
- [x] **SRCH-06**: Escape closes the search overlay and returns focus to the terminal
- [x] **SRCH-07**: Search input debounces at 300ms to prevent UI blocking on large buffers

### Keyboard Navigation

- [x] **KB-01**: Ctrl+1 through Ctrl+9 switch to the corresponding session tab by index
- [x] **KB-02**: Ctrl+[ and Ctrl+] cycle through session tabs (previous/next)
- [x] **KB-03**: Ctrl+B toggles the AgentSidebar collapsed/expanded
- [x] **KB-04**: Escape focuses the terminal canvas when search overlay is not open
- [x] **KB-05**: Keyboard shortcuts do not fire when focus is in a text input or textarea (focus guard)

## Future Requirements

Deferred beyond v3.1. Tracked but not in current roadmap.

### Telegram Integration

- **TELE-01**: Permission prompt detections forwarded to operator's Telegram via OpenClaw Gateway topic mapping
- **TELE-02**: Critical context pressure events (>=90%) forwarded to Telegram

### Terminal Bookmarks

- **MARK-01**: Operator can set a bookmark at the current scroll position in terminal buffer
- **MARK-02**: Operator can navigate between bookmarks via keyboard shortcut or panel

### Search Enhancements

- **SRCH-08**: Operator can toggle regex mode in the search overlay
- **SRCH-09**: Search state persists across tab switches (re-highlights on tab return)

### Token Insights Extensions

- **TOKN-15**: Multi-model budget tracking (per-model thresholds, not just per-agent total)

### Recording Extensions

- **REC-06**: Recording sharing or export (download/upload/share)
- **REC-07**: Live-follow replay mode (stream recording in real time)
- **REC-08**: Storage rotation policy for recordings (auto-delete, cap total storage)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-user access control or role-based permissions | Single-operator tool (IP-whitelisted) |
| Agent creation/deletion from dashboard | Agents defined in openclaw.json, not managed by Warden |
| Remote server agent management | Single-server deployment only; no SSH or remote tmux |
| Video recording of terminal | asciicast text format is lightweight and compatible |
| Real-time streaming replay | Only completed recordings can be replayed; no live-follow mode |
| Multi-model budget tracking | Budget alerts per-agent total; extend in v3.2 if needed |
| Recording sharing or export | Recordings local to server; no download/upload in v3.1 |
| Cross-session search | Contradicts PTY keepalive design; each session has independent buffer |
| Auto-answering permission prompts | Removes the safety check that prompts provide |
| detectAgentState() rewrite | Regex heuristics remain fragile but functional; deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORCH-01 | Phase 21 | Pending |
| ORCH-02 | Phase 21 | Pending |
| ORCH-03 | Phase 21 | Pending |
| ORCH-04 | Phase 21 | Pending |
| ORCH-05 | Phase 21 | Pending |
| TOKN-10 | Phase 22 | Pending |
| TOKN-11 | Phase 22 | Pending |
| TOKN-12 | Phase 23 | Pending |
| TOKN-13 | Phase 22 | Pending |
| TOKN-14 | Phase 23 | Pending |
| REC-01 | Phase 24 | Pending |
| REC-02 | Phase 24 | Pending |
| REC-03 | Phase 24 | Pending |
| REC-04 | Phase 24 | Pending |
| REC-05 | Phase 25 | Pending |
| AWARE-01 | Phase 19 | Complete |
| AWARE-02 | Phase 19 | Complete |
| AWARE-03 | Phase 19 | Complete |
| AWARE-04 | Phase 19 | Complete |
| AWARE-05 | Phase 19 | Complete |
| AWARE-06 | Phase 20 | Complete |
| AWARE-07 | Phase 20 | Complete |
| AWARE-08 | Phase 20 | Complete |
| SRCH-01 | Phase 20 | Complete |
| SRCH-02 | Phase 20 | Complete |
| SRCH-03 | Phase 20 | Complete |
| SRCH-04 | Phase 20 | Complete |
| SRCH-05 | Phase 20 | Complete |
| SRCH-06 | Phase 20 | Complete |
| SRCH-07 | Phase 20 | Complete |
| KB-01 | Phase 19 | Complete |
| KB-02 | Phase 19 | Complete |
| KB-03 | Phase 19 | Complete |
| KB-04 | Phase 19 | Complete |
| KB-05 | Phase 19 | Complete |

**Coverage:**
- v3.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 — v3.1 milestone requirements defined*
