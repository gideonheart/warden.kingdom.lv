# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

**Current focus:** v2.3 Token Usage — Phase 18: JSONL session reader and database population

## Current Position

Phase: 18 — Fix token usage JSONL session reader and database population
Plan: 01 of 02 complete
Status: Phase 18 in progress — SessionUsageReader service created, token_usage schema updated
Last activity: 2026-02-23 - Completed Phase 18 Plan 01: SessionUsageReader + token_usage cache column migration

Progress: [##########] 50% (Phase 18 — 1/2 plans done)

## Performance Metrics

**v1.0 MVP:**
- Phases: 6 (1-6)
- Plans: 9
- Commits: 32
- Files: 66
- LOC: 2,385 TypeScript
- Timeline: 2026-02-12 (single day)

**v1.1 UX Fixes & Prompt Panel:**
- Phases: 2 (7-8)
- Plans: 2
- Tasks: 4
- Commits: 14
- Files modified: 25
- LOC: 2,644 TypeScript (total src + tests)
- Timeline: 2026-02-12 (~2 hours)

**v2.0 Mission Control:**
- Phases: 3 (9-11)
- Plans: 5 (+ 1 decimal phase 11.1)
- Timeline: 2026-02-17 to 2026-02-18

**v2.1 GSD Manager Plugin:**
- Phases: 3 (12-14)
- Plans: 4
- Timeline: 2026-02-18

**Completed Phases:**

| Phase | Description | Milestone | Commit |
|-------|-------------|-----------|--------|
| 1 | Core Infrastructure | v1.0 | `0341445` |
| 2 | Frontend Terminal UI | v1.0 | `e7e726a` |
| 3 | Agent Integration | v1.0 | `18337f8` |
| 4 | History & Analytics | v1.0 | `a5879f3` |
| 5 | Testing & Deployment | v1.0 | `46c87cb` |
| 6 | Close v1 Audit Gaps | v1.0 | `f669408` |
| 7 | Terminal Interactivity & Scrollback | v1.1 | `9f65d54` |
| 8 | Prompt Panel & Gateway Integration | v1.1 | `effa33c` |
| 9 | Plugin Registry Foundation | v2.0 | `918d6d5` |
| 10 | Mobile-First UI Restructure | v2.0 | `39eeea8` |
| 11 | Activity Timeline & Audit Log | v2.0 | `24306a0` |
| 11.1 | Fix tmux visibility when mobile keyboard opens | v2.0 | `b6e0de0` |
| 12 | Backend Foundation (GSD Registry + Hooks + Routes) | v2.1 | `96be120` |
| 13 | Client Plugin (GSD Manager 4-tab panel) | v2.1 | `648a5dd` |
| 14 | Enhanced Agent Visibility (live state, ctx pressure, GSD phase) | v2.1 | `01b447f` |
| 15 | Foundation — Dead code removal (~740 LOC) | v2.2 | `f67ada3` |
| 16 | DRY/SRP — shared module + tab extraction | v2.2 | `e423c67` |
| 17 | Polish — lazy-mount tabs, fd safety, anchored regex, setTimeout cleanup | v2.2 | `673cf5a` |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.

Recent decisions affecting v2.0:
- v1.0: SRP service architecture — each service does one thing (applies to plugin system)
- v1.0: Always-interactive terminals — informs mobile terminal strategy decision
- v2.0: Plugin registry with build-time type-safe registration — avoid over-engineering
- v2.0: Vite import.meta.glob for auto-discovery — zero manual plugin registration
- v2.0: 185 LOC total for complete plugin system — under 200 LOC budget
- [Phase 11]: Inline ansi-regex@5 pattern instead of importing strip-ansi (CJS incompatible with ESM project)
- [Phase 11]: setImmediate for PTY output tap ensures zero terminal latency impact on event capture
- [Phase 11]: Operator input batched: flush on Enter or 2s inactivity (prevents per-keystroke event explosion)
- [Phase 11]: Activity tab placed first and default in HistoryView
- [Phase 11]: Export fetches full filtered dataset (limit=10000), not just current page
- [Phase 11.1]: Use visualViewport API (not window.resize) for iOS keyboard detection in TerminalView and MobilePromptSheet
- [Phase 11.1]: 100ms debounce + requestAnimationFrame on refitTerminal to prevent FitAddon collapse bug (xterm.js #5320)

Key decisions from v2.1 research (apply from Phase 12 onwards):
- Fire-and-forget spawn: POST /api/gsd/spawn returns 202 immediately; spawn.sh blocks 15-25s; session appears via InstanceTracker within 10s
- Atomic rename for registry writes: writeFile to tmp then rename (mirrors spawn.sh mv pattern); POSIX atomicity; race with spawn.sh flock is acceptable at single-operator scale
- execFile (not exec or execFileSync): prevents shell injection at Node.js boundary; async version prevents event loop blocking
- path.resolve + prefix assertion for workdir: path.normalize insufficient per CVE-2025-27210; assert result starts with /home/forge/
- firstCommand strict character allowlist [/a-zA-Z0-9 @:._-]: execFile does not protect against send-keys shell context injection downstream in spawn.sh
- GsdHookLogWatcher singleton: singleton with namespace fan-out — no per-connection watcher resource leak
- Socket.IO /gsd-hooks namespace: mirrors /terminal namespace pattern; backfills last 20 events on connect
- 30s registry TTL cache: matches OpenClawConfigReader pattern; PATCH writes invalidate immediately
- GSD plugin in bottom-panel slot: confirmed at App.tsx line 318; no changes to existing plugin infrastructure
- No new npm dependencies: all capabilities map to Node.js 22 built-ins or already-installed packages
- [Phase 12]: Used fs.watchFile (not fs.watch) for /tmp/gsd-hooks.log — watchFile polls and works when file does not yet exist
- [Phase 12]: GsdRegistryService: atomic registry writes via writeFile+rename (.tmp then rename), cache invalidated immediately after patchAgent
- [Phase 12]: String(request.params.x) cast resolves Express 5 ParamsDictionary string|string[] type error
- [Phase 12]: readLastLines made public on GsdHookLogWatcher for REST endpoint access without wrapper method
- [Phase 13]: Hooks extracted to src/client/hooks/ (not co-located in plugin) because plugin grew to 481 LOC; separation keeps plugin file focused on rendering
- [Phase 13]: Panel starts collapsed (isExpanded=false) — GsdManagerPanelExpanded conditionally rendered so Socket.IO and polling hooks never activate until operator expands
- [Phase 13]: useActiveInstances() called directly inside plugin per zero-props PanelComponent contract; no need to extend PluginSlotRenderer
- [Phase 14]: Promise.allSettled for live-status: parallel tmux captures with per-agent error isolation — dead sessions return nulls
- [Phase 14]: extractContextPressure reads last 5 non-empty pane lines to capture Claude Code status bar percentage
- [Phase 14]: sessionNames.join(',') as stable useEffect dependency key in useAgentStateFiles — avoids re-registering intervals on every render
- [Quick-7]: GSD bottom-panel plugin disabled via DisabledPanel returning null — keeps file for code reference, avoids renaming/deletion
- [Quick-8]: onMouseDown (not onClick) on SearchableSelect dropdown options — fires before blur timeout closes dropdown
- [Quick-8]: GSD_COMMANDS as static module-level constant — commands are stable, no server API needed

Key decisions for Phase 18 (token usage):
- [Phase 18 Plan 01]: Upsert replaces full daily totals (not accumulates) — scanner always computes correct aggregate, making re-runs idempotent and safe
- [Phase 18 Plan 01]: agentId derived by stripping leading dash from Claude project dir name (-home-forge-X → home-forge-X)
- [Phase 18 Plan 01]: Model pricing map with fallback to sonnet-4-6 for unknown models — safe default for new variants
- [Phase 18 Plan 01]: Idempotent ALTER TABLE migration wrapped in try/catch — SQLite errors on duplicate ADD COLUMN
- [Phase 18 Plan 01]: COALESCE for cache columns in read queries — backward compatible with NULL values in old rows

Key decisions for v2.2:
- TYPE-01 must land before DRY/SRP work: shared types are the dependency anchor for all import path updates
- DEAD code deleted first: removes noise before extraction work begins, shrinks diff surface area
- SRP tab extraction happens after DRY extraction: tab sub-components import from shared module, so shared module must exist first
- PERF lazy-mount implemented after SRP decomposition: only makes sense when tabs are standalone components with their own hook lifecycle
- FIX bugs addressed in Phase 17 alongside PERF: same pass through the codebase, low risk changes
- [Phase 15]: Dead GsdManagerPanelExpanded body deleted (not extracted) - content lives in GsdView.tsx from Quick-7
- [Phase 15]: AgentsView.tsx deleted entirely - orphaned after Quick-6 created Agents tab inside GsdView.tsx
- [Phase 16]: All 9 GSD shared symbols (4 constants + 5 components) extracted to single gsdShared.tsx module
- [Phase 16]: AgentStateHint/PressureLevel type imports removed from GsdView.tsx since no direct references remain
- [Phase 16]: 4 GSD tabs extracted to standalone components (AgentsTab, ControlsTab, RegistryTab, HooksTab)
- [Phase 16]: ControlsTab owns all spawn/dispatch state — GsdView passes only data props, zero form state
- [Phase 16]: GSD_COMMANDS constant moved into ControlsTab since only Controls tab uses it
- [Phase 16]: GsdView.tsx reduced from 489 to 76 lines — pure tab router shell
- [Phase 17]: try/finally (not try/catch) for fd cleanup — ensures cleanup on both success and error paths
- [Phase 17]: extractContextPressure filters to lines < 80 chars + anchors to Unicode block chars or "context" keyword
- [Phase 17]: JSON.stringify of Map entries for useAgentLiveStatus shallow comparison — negligible cost for 3-8 agents
- [Phase 17]: Header badge/spinner/error moved from GsdView into AgentsTab — only Agents tab needs registry status display
- [Phase 17]: Each tab calls its own hooks independently (no shared state lifting) for clean unmount lifecycle
- [Phase 17]: useRef + useEffect cleanup pattern for all setTimeout calls in ControlsTab and CopyButton
- [Quick-11]: SPA fallback regex /^\/(?!api\/|socket\.io\/).*/ prevents index.html being served to API routes when dist/client exists
- [Quick-11]: source filter validation in service layer (not route): must end with -raw-events.jsonl, no path separators, no ..
- [Quick-11]: useGsdEventSources fetches once on mount (no polling) — file list stable between sessions
- [Quick-11]: sourceSelector JSX variable computed once, included in all render branches so dropdown persists during loading/error/empty states
- [Quick-12]: groupRawEvents + helpers extracted to src/client/utils/gsdEventGrouping.ts — SRP: grouping logic separated from rendering
- [Quick-12]: Bash buildToolSummary uses description field as primary summary — Claude Code always sets description as human-readable intent
- [Quick-12]: toRelativePath strips /home/forge/ prefix for Read/Write summaries — shows project-relative path instead of just basename
- [Quick-12]: AskUserQuestion summary shows first question text (60 chars) instead of static label
- [Quick-12]: expandedId state (not per-row) — single expanded row at a time, standard accordion pattern
- [Quick-12]: Q&A details and error details moved to expanded view only — removes always-visible clutter below every matching event
- [Quick-12]: Session filter resets via useEffect when source changes — prevents stale filter after agent switch

### Quick Tasks Completed

| # | Description | Date | Commit |
|---|-------------|------|--------|
| 2 | Terminal auto-copy selection to clipboard with toast | 2026-02-12 | `3204868` |
| 3 | Mobile responsiveness, PTY dedup, URL hash routing, Alt+click, long-press copy | 2026-02-15 | `3c5e961` |
| 4 | iOS keyboard toolbar visibility & 3x scroll-down escape | 2026-02-15 | `c2d7756` |
| 5 | Move PromptPanel to sidebar for maximum terminal vertical space | 2026-02-16 | `8fc0c66` |
| 6 | Agents full-page nav view with responsive card grid (state, context, phase) | 2026-02-18 | `d45a5ed` |
| 7 | GSD Control Center as full-page 4-tab nav view (replaces bottom-panel plugin) | 2026-02-18 | `fc76d8b` |
| 8 | Searchable dropdowns for GSD Controls (agent name, commands) with auto-fill | 2026-02-18 | `b1ea88c` |
| 9 | Delete unused tools/ directory | 2026-02-19 | `eeaa55b` |
| 10 | Replace Hooks tab with Events tab (JSONL event log reader) | 2026-02-20 | `a25cce7` |
| 11 | Fix Events tab: SPA fallback patch + agent-selectable JSONL source filter | 2026-02-20 | `1318417` |
| 12 | Improve Events tab: expandable rows, session filter, richer summaries, SRP extraction | 2026-02-20 | `8a38889` |
| 13 | Enrich Events tab: Skill/Task/Edit/TaskCreate/TaskUpdate/TaskOutput tool summaries | 2026-02-20 | `ddade67` |
| 14 | Remove Activity tab and ActivityEventService — dead code removal (~800 LOC) | 2026-02-20 | `cca98cf` |

### Roadmap Evolution

- Phase 11.1 inserted after Phase 11: Fix tmux visibility when mobile keyboard opens (URGENT)
- v2.1 roadmap created 2026-02-18: Phases 12-14 for GSD Manager Plugin
- v2.2 roadmap created 2026-02-18: Phases 15-17 for Code Hygiene
- Phase 18 added: Fix token usage — JSONL session reader and database population

### Pending Todos

None

### Blockers/Concerns

**Phase 10 (Mobile UI) — deferred:**
- xterm.js mobile touch support is fundamentally broken (5+ year issue)
- Options: (1) read-only mobile terminal, (2) budget 2-3 weeks debugging, (3) defer mobile terminal
- Research flag: Needs testing on real iOS/Android devices before implementation

No active blockers for v2.2.

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed Phase 18 Plan 01 — SessionUsageReader service + token_usage schema
Next step: Phase 18 Plan 02 — wire sessionUsageReader into server startup and expose scan API endpoint
