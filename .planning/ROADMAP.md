# Roadmap: Warden Dashboard

## Overview

This roadmap delivers a browser-based terminal multiplexer for monitoring and intervening with OpenClaw autonomous agents. The journey starts with backend infrastructure (terminal streaming, session management, database persistence), adds frontend observation capabilities (xterm.js UI, multi-session tabs, real-time streaming), integrates OpenClaw-specific features (agent metadata, prompt injection, Telegram topic mapping), layers in analytics (session history, token usage, log viewer), and finishes with production deployment (Nginx config, Playwright tests, graceful shutdown).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Infrastructure** - Backend foundation with terminal streaming and session management
- [ ] **Phase 2: Terminal Integration** - Frontend UI with real-time xterm.js streaming and multi-session tabs
- [ ] **Phase 3: Agent Integration** - OpenClaw config reading, prompt injection, and take-over mode
- [ ] **Phase 4: History & Analytics** - Session archive, token usage dashboard, and log viewer
- [ ] **Phase 5: Production Deployment** - Nginx config, Playwright tests, and graceful shutdown
- [ ] **Phase 6: Close v1 Audit Gaps** - SOUL.md preview, memory status, stop button, README

## Phase Details

### Phase 1: Core Infrastructure
**Goal**: Working backend with terminal streaming, session management, and database persistence that can be tested independently without UI
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-04, TERM-01, TERM-02, TERM-04, TERM-06, SESS-01, SESS-04, SESS-05, SESS-06
**Success Criteria** (what must be TRUE):
  1. Server binds to 127.0.0.1:3001 and accepts WebSocket connections
  2. tmux sessions matching agent naming convention are auto-discovered and tracked in SQLite
  3. Terminal output from tmux sessions streams via Socket.IO with under 100ms latency
  4. Terminal auto-reconnects after network interruption without losing session data
  5. ANSI escape codes and colors from Claude Code output render correctly
  6. SQLite database persists session metadata with WAL mode and graceful shutdown checkpointing
**Plans**: 2 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md — Complete backend foundation (graceful shutdown, connection recovery, PTY cleanup)
- [ ] 01-02-PLAN.md — Backend verification and testing infrastructure

### Phase 2: Terminal Integration
**Goal**: Working dashboard UI that streams live terminal output with multi-session tabs, responsive resizing, and read-only observation mode
**Depends on**: Phase 1
**Requirements**: UIDN-01, UIDN-02, UIDN-03, UIDN-04, TERM-03, TERM-05, SESS-02, SESS-03, INTV-01
**Success Criteria** (what must be TRUE):
  1. Dashboard displays horizontal tab bar showing all active agent sessions with name, status dot, and project path
  2. User can switch between sessions by clicking tabs with under 500ms switch time
  3. Terminal view supports scroll-back through recent output and copy/paste
  4. Terminal resizes responsively when browser window changes size without breaking ncurses UIs
  5. All terminal views start in read-only mode by default with clear visual indicator
  6. Connection status indicators show green for connected, amber for reconnecting, red for disconnected
  7. Dashboard uses dark theme matching OpenClaw Gateway UI aesthetic
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Agent Integration
**Goal**: Full intervention capabilities via OpenClaw config reading, agent metadata display, prompt injection to gateway, and explicit take-over mode
**Depends on**: Phase 2
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, INTV-02, INTV-03, INTV-04
**Success Criteria** (what must be TRUE):
  1. Dashboard reads agent configuration from openclaw.json and caches with 30-second refresh interval
  2. Agent details sidebar displays SOUL.md preview, workspace path, model, and memory status
  3. Telegram topic-to-agent mapping displays as visual grid showing routing clarity
  4. User can send prompt to specific agent via OpenClaw gateway API from prompt input panel
  5. User can explicitly toggle take-over mode to enable interactive terminal input per session
  6. Take-over mode shows clear visual indicator distinguishing from read-only mode
  7. Text input sent to terminal in take-over mode appears in Claude Code session
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: History & Analytics
**Goal**: Session history archive with search, token usage dashboard with per-agent aggregation, and OpenClaw gateway log viewer
**Depends on**: Phase 3
**Requirements**: HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):
  1. User can view searchable archive of past sessions with date and agent filters
  2. Token usage dashboard shows per-agent daily aggregation with visual charts
  3. User can tail OpenClaw gateway logs filtered by specific agent
  4. Session history preserves metadata (agent, project, start/end times, status)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Production Deployment
**Goal**: Production-ready deployment with Nginx config reference, Playwright desktop UI tests, and graceful shutdown
**Depends on**: Phase 4
**Requirements**: INFR-03, INFR-05, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Vite builds React frontend and Express serves static assets in production mode
  2. Nginx config reference exists for SSL termination, IP whitelist (94.30.169.76), and WebSocket upgrade
  3. Server gracefully shuts down on SIGTERM/SIGINT, cleaning up PTY processes and checkpointing SQLite
  4. Playwright desktop UI tests verify core dashboard flows (load, tab switch, terminal view)
  5. Documentation describes how to run Playwright tests
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Close v1 Audit Gaps
**Goal**: Close all partial requirements identified by milestone audit — SOUL.md preview, memory status, stop session button, and README with test documentation
**Depends on**: Phase 5
**Requirements**: AGNT-02, SESS-06, TEST-02
**Gap Closure:** Closes gaps from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. Agent sidebar displays SOUL.md preview text read from agent's workspace directory
  2. Agent sidebar displays memory status (exists/size) for each agent
  3. Dashboard has a visible stop button that terminates a tmux session via the existing API endpoint
  4. README.md exists in project root with setup, run, and test instructions
**Plans**: 2 plans in 1 wave

Plans:
- [ ] 06-01-PLAN.md — SOUL.md preview, memory status, and stop session button
- [ ] 06-02-PLAN.md — README.md comprehensive test documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Infrastructure | 2/2 | Complete | 0341445 |
| 2. Terminal Integration | 1/1 | Complete | e7e726a |
| 3. Agent Integration | 1/1 | Complete | 18337f8 |
| 4. History & Analytics | 1/1 | Complete | a5879f3 |
| 5. Production Deployment | 1/1 | Complete | 46c87cb |
| 6. Close v1 Audit Gaps | 0/2 | Planned | - |
