# Requirements: Warden Dashboard

**Defined:** 2026-02-16
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v2.2 Requirements

Requirements for Code Hygiene milestone. Pure refactor — zero feature changes, net-negative LOC.

### Dead Code Removal

- [x] **DEAD-01**: Delete dead `GsdManagerPanelExpanded` component body from `gsd-manager-plugin.tsx` (keep only `DisabledPanel` export)
- [x] **DEAD-02**: Delete orphaned `AgentsView.tsx` (superseded by Agents tab in `GsdView.tsx`)

### DRY — Shared Component Extraction

- [x] **DRY-01**: Extract `STATUS_COLORS`, `STATE_BADGE_COLORS`, `STATE_LABELS`, `PRESSURE_COLORS` constants to shared module
- [x] **DRY-02**: Extract `StateBadge`, `PressureIndicator`, `PhaseProgress`, `CopyButton`, `BashHint` components to shared module
- [x] **DRY-03**: Update all consumers (`GsdView.tsx`, remaining plugin code) to import from shared module

### SRP — View Decomposition

- [x] **SRP-01**: Extract `AgentsTab` from `GsdView.tsx` into own component file
- [x] **SRP-02**: Extract `ControlsTab` from `GsdView.tsx` into own component file
- [x] **SRP-03**: Extract `RegistryTab` from `GsdView.tsx` into own component file
- [x] **SRP-04**: Extract `HooksTab` from `GsdView.tsx` into own component file
- [x] **SRP-05**: `GsdView.tsx` becomes thin shell: tab state + router, under 100 LOC

### Types — Shared Type Unification

- [x] **TYPE-01**: Create `src/shared/gsdTypes.ts` with `RegistryAgent`, `GsdRegistry`, `AgentStateHint`, `PressureLevel`
- [x] **TYPE-02**: Update server imports (`gsdRoutes.ts`, `GsdRegistryService.ts`) to use shared types
- [x] **TYPE-03**: Update client imports (hooks, views) to use shared types

### Performance — Lazy Tab Mounting

- [x] **PERF-01**: Conditionally render only the active GSD tab (lazy mount), so hooks only run when tab is visible
- [x] **PERF-02**: Verify polling stops when switching away from Agents/Controls tabs

### Bug Fixes

- [x] **FIX-01**: Wrap `openSync`/`closeSync` in spawn handler with `try/finally` for fd safety
- [x] **FIX-02**: Clean up `setTimeout` calls in form handlers on component unmount
- [x] **FIX-03**: Stabilize `useAgentLiveStatus` Map reference to prevent unnecessary re-renders
- [x] **FIX-04**: Improve `extractContextPressure()` to reduce false positives (anchor to Claude status bar format)

## v2.1 Requirements (Complete)

### Agent Grid

- [x] **GRID-01**: Operator can view all managed agents in a grid showing session status (active/idle/stopped)
- [x] **GRID-02**: Operator can see each agent's working directory in the grid
- [x] **GRID-03**: Operator can see a state hint badge per agent (idle/menu/working/error) derived from hook activity
- [x] **GRID-04**: Operator can see a context pressure level per agent (percentage)
- [x] **GRID-05**: Operator can see current phase number and progress percentage from STATE.md per agent

### Agent Control

- [x] **CTRL-01**: Operator can spawn a new GSD agent session from the UI with agent name, working directory, and optional first command
- [x] **CTRL-02**: Operator can send any custom command to a running agent's tmux session

### Registry Management

- [x] **REG-01**: Operator can view all agents in the recovery registry with their configuration
- [x] **REG-02**: Operator can toggle an agent's enabled/disabled status from the UI

### Hook Activity

- [x] **HOOK-01**: Operator can see a live feed of the last 20 hook events streamed via Socket.IO

### Developer Experience

- [x] **DX-01**: Every UI action displays the equivalent manual bash command with copy-to-clipboard

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
- [x] **ACTV-08**: System parses terminal output to extract structured events (tool calls, file edits, commands)
- [x] **ACTV-09**: Events show success/failure indicators (parsed from exit codes, error patterns)

## Phase 18 Requirements

Requirements for Token Usage — JSONL session reader and database population.

### Token Usage Data Pipeline

- [x] **TOKN-01**: SessionUsageReader service scans all Claude Code JSONL session files under ~/.claude/projects/ and extracts token usage from assistant messages
- [x] **TOKN-02**: token_usage table schema includes cache_creation_input_tokens and cache_read_input_tokens columns alongside existing input/output tokens
- [x] **TOKN-03**: Token usage is aggregated per project directory per day and upserted into SQLite with no duplicates on re-scan

### Token Usage Display

- [x] **TOKN-04**: SessionUsageReader starts automatically on server boot and scans every 5 minutes
- [x] **TOKN-05**: POST /api/history/token-usage/scan endpoint allows manual scan trigger from the UI
- [x] **TOKN-06**: TokenUsageView displays cache creation and cache read tokens alongside input/output, with a Scan Now button for manual refresh

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
| Any new features | v2.2 is strictly refactor — no behavior changes |
| detectAgentState() rewrite | Regex heuristics are fragile but functional; full rewrite deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEAD-01 | Phase 15 | Complete |
| DEAD-02 | Phase 15 | Complete |
| TYPE-01 | Phase 15 | Complete |
| TYPE-02 | Phase 15 | Complete |
| TYPE-03 | Phase 15 | Complete |
| DRY-01 | Phase 16 | Complete |
| DRY-02 | Phase 16 | Complete |
| DRY-03 | Phase 16 | Complete |
| SRP-01 | Phase 16 | Complete |
| SRP-02 | Phase 16 | Complete |
| SRP-03 | Phase 16 | Complete |
| SRP-04 | Phase 16 | Complete |
| SRP-05 | Phase 16 | Complete |
| PERF-01 | Phase 17 | Complete |
| PERF-02 | Phase 17 | Complete |
| FIX-01 | Phase 17 | Complete |
| FIX-02 | Phase 17 | Complete |
| FIX-03 | Phase 17 | Complete |
| FIX-04 | Phase 17 | Complete |
| GRID-01 | Phase 13 | Complete |
| GRID-02 | Phase 13 | Complete |
| GRID-03 | Phase 14 | Complete |
| GRID-04 | Phase 14 | Complete |
| GRID-05 | Phase 14 | Complete |
| CTRL-01 | Phase 13 | Complete |
| CTRL-02 | Phase 13 | Complete |
| REG-01 | Phase 13 | Complete |
| REG-02 | Phase 13 | Complete |
| HOOK-01 | Phase 13 | Complete |
| DX-01 | Phase 13 | Complete |
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
| TOKN-01 | Phase 18 | Planned |
| TOKN-02 | Phase 18 | Planned |
| TOKN-03 | Phase 18 | Planned |
| TOKN-04 | Phase 18 | Planned |
| TOKN-05 | Phase 18 | Planned |
| TOKN-06 | Phase 18 | Planned |

**Coverage:**
- v2.2 requirements: 19 total
- Phase 18 requirements: 6 total
- Mapped to phases: 25 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-23 — Phase 18 token usage requirements added (TOKN-01 through TOKN-06)*
