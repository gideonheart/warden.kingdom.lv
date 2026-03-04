# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

**Current focus:** v3.1 — Agent Control & Deep Insights

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-04 — Milestone v3.1 started

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

**v2.3 Code Hygiene & Token Usage:**
- Phases: 4 (15-18)
- Plans: 8
- Commits: 97
- Files modified: 37 (src/)
- LOC: 6,650 TypeScript (net -486 LOC)
- Timeline: 13 days (2026-02-19 → 2026-03-03)

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
| 15 | Foundation — Dead code removal (~740 LOC) | v2.3 | `f67ada3` |
| 16 | DRY/SRP — shared module + tab extraction | v2.3 | `e423c67` |
| 17 | Polish — lazy-mount tabs, fd safety, anchored regex, setTimeout cleanup | v2.3 | `673cf5a` |
| 18 | Fix token usage — JSONL session reader + DB population | v2.3 | `4ad39dd` |
| Phase 19 P02 | 2 | 2 tasks | 3 files |
| Phase 20 P02 | 2 | 2 tasks | 3 files |

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
- [Phase 18 Plan 02]: Scan Now button calls POST then re-fetches — ensures UI reflects latest scan without manual page reload
- [Phase 18 Plan 02]: isScanning state separate from isLoading — button-level spinner avoids full-page flicker during rescan
- [Phase 18 Plan 02]: Cache sub-lines in summary cards only rendered when cache tokens > 0 — clean display for agents without cache usage
- [Phase 18 Plan 02]: formatAgentId() strips home-forge- prefix to show readable project slug (e.g. warden-kingdom-lv)

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
- [Phase 16]: 4 GSD tabs extracted to standalone components (AgentsTab, ControlsTab, RegistryTab, EventsTab)
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
- [Quick-16]: readline createInterface with crlfDelay: Infinity for robust JSONL line splitting across OS line endings
- [Quick-16]: Boolean flag mutex (not queue) for scan overlap: concurrent scans silently skip rather than queue
- [Quick-16]: try/finally cleanup for both readline interface and read stream to prevent fd leaks
- [Quick-17]: Guards are pure additions — no structural changes to existing SessionUsageReader logic
- [Quick-17]: warnedModels cleared per scan cycle (not per file) to deduplicate across all projects
- [Quick-17]: ISO_DATE_REGEX validates timestamp prefix before accumulation to reject garbage date keys
- [Phase quick-2035]: v3.0 combines Operator Awareness + Terminal Power Tools — Phase 19 ships permission badge, context pressure badge, keyboard shortcuts; Phase 20 ships terminal search and browser notifications

Key decisions from Phase 19 Plan 01:
- [Phase 19 Plan 01]: useAgentLiveStatus lifted to App.tsx — single poll interval feeds TerminalView and InstanceTabBar via sessionStatusMap useMemo
- [Phase 19 Plan 01]: sessionStatusMap bridges agentId (hook key) → tmuxSessionName (component lookup) via useMemo with [liveStatus, activeInstances] deps
- [Phase 19 Plan 01]: terminalFocusRef: MutableRefObject<(() => void) | null> registered in TerminalView useEffect — Plan 02 keyboard shortcuts call without xterm instance access
- [Phase 19 Plan 01]: headerPressureText module-scope helper uses text-[10px] — distinct from text-sm PressureIndicator used in AgentsTab cards
- [Phase 19 Plan 01]: Permission regex tightened to /Do you want to proceed?|❯ 1. Yes/ — eliminates npm/git false positives
- [Phase 19 Plan 01]: Pressure thresholds corrected: critical >=90%, warning >=70% (was 80%/50%) to match UX spec

Key decisions from Phase 19 Plan 02:
- [Phase 19 Plan 02]: capture-phase addEventListener({ capture: true }) fires before xterm.js bubble-phase — mandatory for shortcut keys to not reach PTY
- [Phase 19 Plan 02]: attachCustomKeyEventHandler returning false for Ctrl+F/B/1-9/[/] provides second defense layer — prevents PTY escape sequence injection even when terminal has focus
- [Phase 19 Plan 02]: Escape not suppressed in attachCustomKeyEventHandler — TUI apps (vim, less) require Escape to work normally inside terminal
- [Phase 19 Plan 02]: handleToggleSidebar useCallback unified for header button + Ctrl+B keyboard shortcut — DRY single source of truth for sidebar toggle
- [Phase 19 Plan 02]: useGlobalHotkeys placed after handleSelectSession definition — avoid TDZ (const declarations not hoisted)

Key decisions from Phase 20 Plan 01:
- [Phase 20 Plan 01]: xterm-addon-search@0.13.0 (non-scoped) — confirmed peer-dep is xterm:^5.0.0 (not @xterm/xterm); @xterm/addon-search incompatible
- [Phase 20 Plan 01]: searchOpenRef callback pattern mirrors terminalFocusRef from Phase 19 — App.tsx creates ref, TerminalView registers callback, App's handleOpenSearch calls searchOpenRef.current?.()
- [Phase 20 Plan 01]: isInTextInput guard in useGlobalHotkeys prevents Escape double-handling when search overlay input is focused
- [Phase 20 Plan 01]: Search query persists in TerminalView state across overlay close/reopen; resets on session switch (TerminalView keyed by tmuxSessionName)
- [Phase 20 Plan 01]: overviewRulerWidth:15 must be in Terminal constructor options — silently ignored if set later
- [Phase 20 Plan 01]: matchResultCount >= 1000 displays as "1000+" — SearchAddon default highlightLimit is 1000

Key decisions for v3.0 (from research — apply from Phase 19 onwards):
- [v3.0 Research]: useAgentLiveStatus already delivers all awareness data — Phase 19 is prop-wiring, not new data infrastructure
- [v3.0 Research]: Call useAgentLiveStatus in App.tsx (not only in AgentsTab) — props-down to TerminalView and InstanceTabBar; safe because hook uses JSON comparison dedup
- [v3.0 Research]: Permission detection via detectAgentState() polling (tmux capture-pane) — raw PTY stream regex produces false positives on ANSI output
- [v3.0 Research]: Tighten detectAgentState() permission regex to /Do you want to proceed\?|❯\s+1\.\s+Yes/i — reduces badge noise from npm install and shell prompts
- [v3.0 Research]: xterm-addon-search@0.13.0 (non-scoped) — project imports from 'xterm' (non-scoped v5.3.0); @xterm/addon-search requires @xterm/xterm (scoped, incompatible)
- [v3.0 Research]: overviewRulerWidth: 15 must be added to Terminal constructor for scrollbar gutter markers — silently ignored without it
- [v3.0 Research]: attachCustomKeyEventHandler for Ctrl+F requires both event.preventDefault() AND return false — missing either opens browser native find bar or injects to PTY
- [v3.0 Research]: document.addEventListener + stopPropagation() defense for global shortcuts — xterm canvas events bubble to document; without guard, tab-switch shortcuts send escape sequences to PTY
- [v3.0 Research]: requestAnimationFrame(() => terminal.focus()) on search overlay close — browser returns focus to document.body, not terminal, on unmount
- [v3.0 Research]: highlightLimit at default 1000 + 300ms search debounce — 72k+ matches at 50k scrollback blocks main thread ~470ms without limit
- [v3.0 Research]: Notification tag option deduplicates per-session browser notifications automatically
- [v3.0 Research]: window.focus() in notification.onclick unreliable on macOS Chrome and blocked in Firefox — accept and document limitation
- [v3.0 Research]: Notification.requestPermission() must be triggered by user gesture, not page load — browser silently blocks otherwise
- [v3.0 Research]: Keyboard shortcuts do not fire when focus is in a text input or textarea — focus guard in useGlobalHotkeys
- [Phase 20]: [Phase 20 Plan 02]: State-transition detection via useRef<Set<string>> for browser notifications — fires only when session ENTERS permission_prompt, not while sustained
- [Phase 20]: [Phase 20 Plan 02]: Notification tag warden-permission-{sessionName} provides browser-level deduplication as second defense layer
- [Phase 20]: [Phase 20 Plan 02]: document.visibilityState === 'hidden' guard — notification only fires when tab is unfocused, no interruption if operator is watching

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
| 15 | Add runtime status reconciliation to resume-work: verify live deployment state before reporting gaps | 2026-02-23 | `79f274c` |
| 16 | Refactor SessionUsageReader: streaming JSONL + scan overlap guard | 2026-02-24 | `c767a5b` |
| 17 | Harden SessionUsageReader: NaN guards, timestamp validation, unknown model warn-once | 2026-02-24 | `8fb98b8` |
| 18 | Fix TOKN-01 through TOKN-06 traceability: mark Complete in REQUIREMENTS.md | 2026-02-24 | `5413480` |
| 19 | Add requirements-completed frontmatter to 18-02-SUMMARY.md for TOKN-04/05/06 | 2026-02-24 | `4d3cb5e` |
| 20 | Fix Phase 16 documentation HooksTab references to EventsTab | 2026-02-24 | `937a3d1` |
| 21 | Stabilize terminal polling: poll dedup + useSessionSelection hook with hysteresis | 2026-03-03 | `75d0d51` |
| 22 | Delete dead script reconcile-deployment-gaps.ts (301 LOC) | 2026-03-03 | `d6e2663` |
| 2029 | Fix remaining tech debt: annotate GsdHookLogWatcher refs in Phase 17 docs | 2026-03-03 | `c9c2190` |
| 2030 | Review debug fix commit 6dd185d: identify risks, untested edge cases, and follow-up tasks | 2026-03-03 | `2609278` |
| 2031 | Replace documentation-only useTerminalSocket tests with 9 real behavioral tests (fake timers, vi.mock socket.io-client) | 2026-03-03 | `63f1fbe` |
| 2032 | Add renderHook integration tests for useSessionSelection (8 new tests: manual selection persistence + polling interactions) | 2026-03-03 | `cae0592` |
| 2033 | Add targeted code comments for RISK-1 (ref-in-render), RISK-2 (PTY-exit overlay), RISK-3 (stale-closure), EDGE-2 (double-timer guard) | 2026-03-03 | `e03797e` |
| 2034 | Final readiness check: all 2030 review P1/P2 items confirmed resolved, 40 tests pass, build clean — 2030 review cycle closed | 2026-03-03 | `92dbc07` |
| 2035 | Draft v3.0 milestone scope: combined Operator Awareness & Terminal Power Tools (permission alerts, context pressure, terminal search, keyboard nav) | 2026-03-03 | `6d0c2e5` |
| 2036 | Fix v3.0 review findings: aria-label, ROADMAP checkboxes, deps cleanup | 2026-03-04 | `b48660f` |
| 2037 | Review commit 68cbdf1 (useAgentConfig poll dedup fix) for regressions; all 6 edge cases confirmed safe; v3.0 marked shipped in ROADMAP | 2026-03-04 | `1ca0dbe` |
| 2038 | Draft v3.1 milestone scope: 3 feature areas (agent orchestration, token insights, session recording), 15 requirements, 5 phases (21-25) | 2026-03-04 | `6c31ce5` |

### Roadmap Evolution

- Phase 11.1 inserted after Phase 11: Fix tmux visibility when mobile keyboard opens (URGENT)
- v2.1 roadmap created 2026-02-18: Phases 12-14 for GSD Manager Plugin
- v2.2 roadmap created 2026-02-18: Phases 15-17 for Code Hygiene
- Phase 18 added: Fix token usage — JSONL session reader and database population
- v3.0 roadmap created 2026-03-03: Phases 19-20 for Operator Awareness & Terminal Power Tools

### Pending Todos

None

### Blockers/Concerns

**Phase 10 (Mobile UI) — deferred:**
- xterm.js mobile touch support is fundamentally broken (5+ year issue)
- Options: (1) read-only mobile terminal, (2) budget 2-3 weeks debugging, (3) defer mobile terminal
- Research flag: Needs testing on real iOS/Android devices before implementation

**v3.0 Package verification (pre-Phase 20):**
- Verify `xterm-addon-search@0.13.0` peer dependency before installing: `npm show xterm-addon-search@0.13.0 peerDependencies` must return `{ "xterm": "^5.0.0" }` (non-scoped), not `@xterm/xterm`
- STACK.md finding is authoritative but contradicts two other research files — confirm before committing to Phase 20

No active blockers.

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed quick task 2038: Draft v3.1 milestone scope
Next step: Run `/gsd:new-milestone` with `.planning/milestones/v3.1-SCOPE.md` as input to begin v3.1 planning
