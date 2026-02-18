# Requirements: Warden Dashboard

**Defined:** 2026-02-16
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v2.1 Requirements

Requirements for GSD Manager Plugin milestone. Each maps to roadmap phases.

### Agent Grid

- [ ] **GRID-01**: Operator can view all managed agents in a grid showing session status (active/idle/stopped)
- [ ] **GRID-02**: Operator can see each agent's working directory in the grid
- [ ] **GRID-03**: Operator can see a state hint badge per agent (idle/menu/working/error) derived from hook activity
- [ ] **GRID-04**: Operator can see a context pressure level per agent (percentage)
- [ ] **GRID-05**: Operator can see current phase number and progress percentage from STATE.md per agent

### Agent Control

- [ ] **CTRL-01**: Operator can spawn a new GSD agent session from the UI with agent name, working directory, and optional first command
- [ ] **CTRL-02**: Operator can send any custom command to a running agent's tmux session

### Registry Management

- [ ] **REG-01**: Operator can view all agents in the recovery registry with their configuration
- [ ] **REG-02**: Operator can toggle an agent's enabled/disabled status from the UI

### Hook Activity

- [ ] **HOOK-01**: Operator can see a live feed of the last 20 hook events streamed via Socket.IO

### Developer Experience

- [ ] **DX-01**: Every UI action displays the equivalent manual bash command with copy-to-clipboard

### Infrastructure

- [x] **INFRA-01**: Server exposes REST endpoints for registry, spawn, command dispatch, state, and hook log operations
- [x] **INFRA-02**: Server exposes a Socket.IO namespace for real-time hook event push
- [x] **INFRA-03**: All endpoints validate input to prevent shell injection and path traversal

## v2.0 Requirements (Complete)

### Plugin Registry

- [x] **PLUG-01**: Operator can register tool modules with typed metadata (name, version, description, capabilities)
- [x] **PLUG-02**: Operator can view a metadata table showing all registered plugins with status
- [x] **PLUG-03**: Operator can enable/disable plugins via toggle
- [x] **PLUG-04**: Plugin modules use build-time type-safe TypeScript registration
- [x] **PLUG-05**: Plugins render as UI panels in designated layout slots (sidebar-top, sidebar-bottom, bottom-panel, terminal-overlay)
- [x] **PLUG-06**: Plugin code, metadata, and UI are co-located in a single module file

### Activity Timeline

- [x] **ACTV-01**: System captures structured events (session start/stop, prompt injections, operator terminal input) in SQLite
- [ ] **ACTV-02**: Operator can view chronological event list (newest first) in dedicated Activity view
- [ ] **ACTV-03**: Operator can view event detail panel with full metadata
- [ ] **ACTV-04**: Operator can filter activity by agent
- [ ] **ACTV-05**: Operator can filter activity by date range
- [ ] **ACTV-06**: Operator can filter activity by event type
- [ ] **ACTV-07**: Operator can export activity events to CSV or JSON
- [x] **ACTV-08**: System parses terminal output to extract structured events (tool calls, file edits, commands)
- [x] **ACTV-09**: Events show success/failure indicators (parsed from exit codes, error patterns)
- [ ] **ACTV-10**: Operator can click an event to jump to the terminal session at that timestamp

### Mobile UI

- [ ] **MOBI-01**: Dashboard renders full-width responsive layout from 375px to 1920px
- [ ] **MOBI-02**: Agent details, session logs, and token usage render as collapsible accordion panels
- [ ] **MOBI-03**: Prompt panel renders as bottom sheet on mobile (thumb-reachable)
- [ ] **MOBI-04**: Terminal supports touch scrolling on mobile
- [ ] **MOBI-05**: Layout uses mobile-first CSS with progressive enhancement via min-width breakpoints
- [ ] **MOBI-06**: Operator can swipe between session tabs and pinch-to-zoom terminal on mobile
- [ ] **MOBI-07**: All touch targets meet 44x44px minimum with safe area insets

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Agent Control

- **CTRL-03**: Preset GSD slash commands with one-click dispatch (resume-work, quick, new-milestone, execute-phase, plan-phase, progress)
- **CTRL-04**: Command success/error feedback inline in the UI
- **CTRL-05**: Spawn auto-detects first command based on project state (mirrors spawn.sh choose_first_cmd logic)

### Agent Monitoring

- **GRID-06**: Session selector pre-loads from active terminal tab to reduce wrong-agent friction

### Hook Activity

- **HOOK-02**: Per-agent hook feed filtering (client-side filter on log lines by session name)

### Plugin Ecosystem

- **PLUG-F01**: Auto-install plugins from a registry URL
- **PLUG-F02**: Plugin marketplace UI with search and ratings
- **PLUG-F03**: Plugin sandboxing with permission system

### Activity Timeline Advanced

- **ACTV-F01**: Real-time WebSocket streaming of activity events
- **ACTV-F02**: AI-powered event summarization
- **ACTV-F03**: Immutable audit log with cryptographic verification

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Inline JSON editing of recovery-registry.json | Fragile; concurrent writes dangerous; PATCH for discrete fields only |
| Editing STATE.md or PROJECT.md from UI | PRD non-goal; breaks GSD tracking assumptions |
| Real-time terminal pane in plugin panel | Duplicates terminal view; doubles PTY resources |
| Kill session button in plugin | Already exists in InstanceTabBar; duplication creates confusion |
| Agent auto-wake toggle editing | Show as read-only; risk of accidentally disabling recovery |
| Hook log SSE streaming | 5-second polling sufficient for single-operator scale |
| Plugin auto-install from public registry | Security risk, scope creep — single-user internal tool |
| Plugin marketplace | Requires hosting, moderation, legal complexity |
| AI event summarization | API costs, unreliable for audit purposes |
| Separate native mobile app | 3x dev cost, App Store distribution overhead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRID-01 | Phase 13 | Pending |
| GRID-02 | Phase 13 | Pending |
| GRID-03 | Phase 14 | Pending |
| GRID-04 | Phase 14 | Pending |
| GRID-05 | Phase 14 | Pending |
| CTRL-01 | Phase 13 | Pending |
| CTRL-02 | Phase 13 | Pending |
| REG-01 | Phase 13 | Pending |
| REG-02 | Phase 13 | Pending |
| HOOK-01 | Phase 13 | Pending |
| DX-01 | Phase 13 | Pending |
| INFRA-01 | Phase 12 | Complete |
| INFRA-02 | Phase 12 | Complete |
| INFRA-03 | Phase 12 | Complete |
| PLUG-01 | Phase 9 | Complete |
| PLUG-02 | Phase 9 | Complete |
| PLUG-03 | Phase 9 | Complete |
| PLUG-04 | Phase 9 | Complete |
| PLUG-05 | Phase 9 | Complete |
| PLUG-06 | Phase 9 | Complete |
| ACTV-01 | Phase 11 | Complete |
| ACTV-08 | Phase 11 | Complete |
| ACTV-09 | Phase 11 | Complete |

**Coverage:**
- v2.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-18 — v2.1 roadmap created, all 14 requirements mapped to phases 12-14*
