# Project Research Summary

**Project:** Warden Dashboard — GSD Manager Plugin (v2.1 milestone)
**Domain:** Browser-based control panel for GSD skill tooling — process spawning, command dispatch, config management, real-time log monitoring
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

The GSD Manager Plugin is an additive milestone (v2.1) that wraps existing GSD CLI tooling (`spawn.sh`, `menu-driver.sh`, `recovery-registry.json`) in a browser UI within the existing Warden Dashboard. All research confirms this is a thin integration layer, not a new product — the hard work of agent lifecycle management is already done by battle-tested bash scripts. The recommended approach is to call those scripts via `child_process.execFile` (already established in `TmuxSessionManager.ts`), expose results through a new Express route module (`gsdRoutes.ts`) following the existing route pattern, and surface data through a self-registering Vite plugin (`gsd-manager-plugin.tsx`) in the `bottom-panel` slot. Zero new npm dependencies are required — every capability maps to a Node.js 22 built-in or an already-installed package.

The architecture is a straightforward extension of patterns already in production: a new Socket.IO namespace (`/gsd-hooks`) mirrors the `/terminal` namespace; a `GsdService` singleton mirrors `OpenClawConfigReader`; route module mounting mirrors `instanceRoutes`/`agentRoutes`. The plugin auto-discovers via `import.meta.glob` without changes to existing files beyond four lines in `src/server/index.ts`. The build order has no ambiguity: shared types first, service layer second, routes third, client hook fourth, plugin component last.

The dominant risks are security and correctness, not architecture. Three pitfalls are non-negotiable from day one: shell injection through `spawn.sh`'s `tmux send-keys` path (use a strict allowlist on `firstCommand`), path traversal in `workdir` (use `path.resolve` with base-path assertion), and event loop blocking with `execFileSync` while `spawn.sh` waits 15-25 seconds for Claude TUI readiness — the API must return `202 Accepted` immediately and let `InstanceTracker` surface the new session within 10 seconds. A fourth concern (registry write collision between the Node.js API and `spawn.sh`'s `flock`-protected writes) is acceptable at single-operator scale using an atomic rename pattern, but must be documented as a known limitation.

## Key Findings

### Recommended Stack

The existing Warden stack handles everything. Express 5, Socket.IO 4, React 19, Vite 6, Tailwind CSS 4, TypeScript 5 strict, and Node.js 22 are all in production. The GSD plugin adds no new packages. All five new capabilities map directly to Node.js 22 built-ins already used in the codebase.

**Core technologies for new capabilities:**
- `child_process.execFile` (promisified): shell command proxying — established pattern in `TmuxSessionManager.ts`, bypasses shell interpreter, no injection risk at execFile boundary
- `fs.watch` (inotify-backed on Linux): real-time hook log tailing — verified working on `/tmp/gsd-hooks.log` on this machine; fires immediately on file append
- `fs/promises.readFile` + `writeFile` + `rename`: atomic JSON config read/write — POSIX rename atomicity guarantees; mirrors `spawn.sh`'s own `mv "$tmp" "$target"` pattern
- Socket.IO `/gsd-hooks` namespace: push log events to browser — identical setup pattern to existing `/terminal` namespace in `TerminalStreamService.ts`
- `import.meta.glob('./*.tsx', {eager: true})`: plugin auto-discovery — zero changes to existing plugin infrastructure; dropping the file is all that is needed

**Verified script interfaces (read from source):**
- `spawn.sh <agentId> <workdir> [firstCommand]` — takes 15-25s waiting for TUI readiness, outputs `Attach: tmux attach -t <name>`, uses `flock -x` on registry writes (lines 103-140)
- `menu-driver.sh <sessionName> <action> [args]` — action allowlist: `snapshot|enter|esc|clear_then|choose|type|submit`; `sleep 0.8` heuristic at line 49
- `recovery-registry.json` — plain JSON written by `jq`, not JSON5; `JSON.parse` works directly; confirmed live schema

**New files (9 total, no new dependencies):**

| File | Type |
|------|------|
| `src/shared/gsdTypes.ts` | Shared TypeScript interfaces |
| `src/server/services/GsdService.ts` | Shell wrapper, registry I/O, STATE.md reads |
| `src/server/services/GsdHookLogWatcher.ts` | `fs.watch` + Socket.IO emit |
| `src/server/routes/gsdRoutes.ts` | Express Router at `/api/gsd/` |
| `src/client/hooks/useGsdManager.ts` | REST polling + Socket.IO subscription |
| `src/client/plugins/gsd-manager-plugin.tsx` | Self-registering `bottom-panel` plugin |

**Modified files (1 file, 4 lines):** `src/server/index.ts` — import routes + init/stop watcher.

### Expected Features

**Must have (v2.1 launch — table stakes):**
- Agent grid with session status (active/idle/stopped per agent, from `/api/instances` + registry merge)
- Agent grid with working directory display (from registry `working_directory` field)
- Preset GSD slash commands — 6 presets: `/gsd:resume-work`, `/gsd:quick`, `/gsd:new-milestone`, `/gsd:execute-phase`, `/gsd:plan-phase`, `/gsd:progress`
- Custom command input (free-text fallback for non-preset commands)
- Command success/error feedback (same inline pattern as existing `PromptPanel`)
- Recovery registry viewer — agent list with enabled status (read-only display)
- Enabled/disabled toggle (PATCH endpoint writes registry atomically)
- Hook activity feed — last 20 events pushed via Socket.IO `/gsd-hooks` namespace
- Spawn agent form (agentName, workdir, optional firstCommand; calls `spawn.sh`)
- Inline bash reference with copy-to-clipboard (PRD requirement; operator trust)
- Collapsible sections (bottom panel space constraint)

**Should have (v2.1.x patch cycles, after validation):**
- State hint display (idle/menu/working/error badge from hook log last-line parsing per session)
- Context pressure indicator (percentage from hook log lines per agent)
- Session selector tied to active terminal tab (reduces "wrong agent" friction)
- STATE.md phase and progress display (phase X/N, progress % from `.planning/STATE.md`)
- Spawn auto-detect first command (mirror `choose_first_cmd()` logic from spawn.sh)
- Per-agent hook feed filtering (client-side filter on log lines by session name)

**Defer to v2.2+:**
- Hook log SSE streaming (5-second polling is sufficient for single-operator scale)
- Registry field editor for discrete fields beyond `enabled` (low demand)
- System prompt path field in spawn form (advanced use case; defaults are sufficient)
- Recovery diagnostics button for `diagnose-hooks.sh` (niche; already CLI-friendly)

**Anti-features confirmed (do not build):**
- Inline JSON editing of recovery-registry.json (fragile; concurrent writes dangerous; PATCH endpoints for discrete fields only)
- Editing STATE.md or PROJECT.md from UI (PRD non-goal; breaks GSD tracking assumptions)
- Real-time terminal pane in the plugin panel (duplicates terminal view; doubles PTY resources)
- Kill session button in this plugin (already in InstanceTabBar; duplication creates confusion)
- Agent auto-wake toggle (show as read-only; risk of accidentally disabling recovery for critical agent)

### Architecture Approach

The plugin integrates as a clean vertical slice. Server-side, two new service classes follow the established singleton export pattern. `GsdService` owns all shell command execution, registry I/O, and STATE.md reads. `GsdHookLogWatcher` owns the `fs.watch` handle and emits to the `/gsd-hooks` Socket.IO namespace. Client-side, `useGsdManager` encapsulates all data fetching and mutations; the plugin component is pure presentation over that hook. The `PanelComponent` receives no props (enforced by `pluginTypes.ts` `ComponentType` contract) — the hook fetches everything it needs independently.

Spawn operations use fire-and-forget (immediate `202 Accepted`) because `spawn.sh` blocks for 15-25 seconds; the new session appears in `/api/instances` via `InstanceTracker.startPeriodicSync()` within 10 seconds. Registry reads use a 30-second in-memory cache (matching `OpenClawConfigReader`); writes invalidate the cache immediately. Hook log streaming uses `GsdHookLogWatcher` as a server-side singleton that fans out to all `/gsd-hooks` namespace subscribers — there is no per-connection resource usage beyond the Socket.IO multiplexing that already exists.

**Major components:**
1. `src/shared/gsdTypes.ts` — `RegistryAgent`, `RecoveryRegistry`, `GsdHookEvent`, `GsdSessionState`, `GsdSpawnRequest`, `GsdCommandRequest`
2. `src/server/services/GsdService.ts` — `execFile` wrapper for `spawn.sh`/`menu-driver.sh`; registry read/write with TTL cache; STATE.md reads resolved via registry `working_directory`
3. `src/server/services/GsdHookLogWatcher.ts` — `fs.watch` on `/tmp/gsd-hooks.log`; incremental byte-offset reads; emits parsed `GsdHookEvent` to `/gsd-hooks` namespace; backfills last 20 events on new client connection
4. `src/server/routes/gsdRoutes.ts` — Express Router at `/api/gsd/`; 6 endpoints; input validation (agentName regex, workdir prefix assertion, action enum)
5. `src/client/hooks/useGsdManager.ts` — registry polling at 30s; Socket.IO subscription to `/gsd-hooks`; `spawnAgent`/`sendCommand` mutations
6. `src/client/plugins/gsd-manager-plugin.tsx` — self-registering `bottom-panel` plugin; AgentGrid, QuickActions, HookFeed, RegistryViewer, InlineBashReference sections

**Data flow for key operations:**
- **Spawn:** POST `/api/gsd/spawn` → validate → `execFile` fire-and-forget → 202 returned → session appears in `/api/instances` within 10s via InstanceTracker
- **Command:** POST `/api/gsd/sessions/:session/command` → enum-validate action → `execFileAsync(menu-driver.sh, ...)` with 5s timeout → 202 Accepted
- **Hook feed:** hook script appends to `/tmp/gsd-hooks.log` → `GsdHookLogWatcher.onFileChange()` → parse new bytes → `namespace.emit('gsd:hook-event', event)` → `useGsdManager` prepends to rolling buffer

### Critical Pitfalls

1. **Shell injection via `firstCommand` through `tmux send-keys`** — `execFile` prevents injection at the Node.js boundary, but `spawn.sh` passes `$first_command` directly to `tmux send-keys` where a shell is running. A payload like `/gsd:resume-work; rm -rf /home/forge` executes in the tmux pane. Prevention: use a preset enum for v2.1; if free-form text is needed, apply strict character allowlist `[/a-zA-Z0-9 @:._-]` and reject null bytes and shell metacharacters. Never use `shell: true`.

2. **Path traversal in `workdir` parameter** — `path.join('/home/forge', '../../../etc')` returns `/etc` cleanly; `path.normalize` is also insufficient per CVE-2025-27210. Prevention: `path.resolve(userInput)` then assert the result starts with `/home/forge/` before passing to `execFile` or constructing STATE.md paths.

3. **Event loop blocking from `execFileSync` on `spawn.sh`** — `spawn.sh` blocks 15-25 seconds during TUI readiness polling. Any synchronous invocation freezes all HTTP requests and Socket.IO heartbeats for that duration. Prevention: always use `execFileAsync` (promisified `execFile`) with `timeout: 30_000`; fire-and-forget spawn with immediate `202 Accepted`.

4. **`fs.watch` memory leak from dangling watchers** — each watch handle must be explicitly closed when the client disconnects. In the singleton `GsdHookLogWatcher` pattern there is no per-connection watcher, eliminating this risk. If the log tail is ever exposed as an SSE endpoint, `response.on('close', () => watcher.close())` is mandatory.

5. **Registry write collision between Node.js API and `spawn.sh` flock** — `spawn.sh` uses `flock -x` advisory locking; Node.js `fs.write` ignores this entirely. Prevention for v2.1: atomic rename pattern (`writeFile tmp → rename`), keep PATCH writes fast (<100ms), document the known race. Acceptable at single-operator scale where spawns are rare. Full `flock`-compatible locking deferred to v2.2 if demand warrants.

## Implications for Roadmap

The plugin is a single coherent vertical slice and does not need to be split across milestones. Within the implementation, the dependency chain is strict: types before services, services before routes, routes before client. The suggested roadmap structure reflects this chain while separating security-critical backend work from UI work.

### Phase 1: Backend Foundation — Types, Services, REST API, Socket.IO

**Rationale:** Security must be baked into route layer before any client code exists. Shared types define the contract for both sides. `GsdService` methods are independently verifiable via `curl` before the plugin is written. This order makes shell injection and path traversal impossible to forget — they are the first code written.

**Delivers:** Complete backend API (`/api/gsd/*` — all 6 endpoints), `GsdService` singleton, `GsdHookLogWatcher` service with `/gsd-hooks` Socket.IO namespace, shared `gsdTypes.ts`. No UI — verifiable via `curl` and `socket.io-client` test scripts.

**Addresses features from FEATURES.md:**
- All registry read/write operations
- Spawn trigger endpoint
- Command dispatch endpoint
- Hook log tail endpoint
- STATE.md read endpoint

**Avoids pitfalls:**
- Shell injection (allowlist on `firstCommand` and `action` from the first commit of `gsdRoutes.ts`)
- Path traversal (prefix assertion on `workdir` from the first commit)
- Event loop blocking (fire-and-forget spawn returns `202` immediately)
- Registry corruption (atomic rename pattern; race documented as acceptable)
- Watcher memory leak (singleton watcher pattern; lifecycle tied to server shutdown)

### Phase 2: Client Plugin — Hook and UI Components

**Rationale:** Client builds only after server API is verified working. The `useGsdManager` hook depends on all 6 REST endpoints being stable and the Socket.IO namespace active. The plugin component is pure presentation — no business logic.

**Delivers:** `useGsdManager.ts` hook (REST polling + Socket.IO subscription), `gsd-manager-plugin.tsx` with all P1 features: AgentGrid, QuickActions (preset + custom), HookFeed (socket-driven events), SpawnForm (with `202` in-progress state), RegistryViewer (read + enabled toggle with optimistic UI), InlineBashReference (copy-to-clipboard), collapsible sections.

**Implements features from FEATURES.md:**
- All 10 P1 MVP features
- UX patterns: suggest-and-confirm on spawn, in-place feedback, no confirmation modals for non-destructive actions, newest-first hook feed, optimistic toggle with revert

**Avoids pitfalls:**
- Component prop injection anti-pattern (plugin is self-contained; `PanelComponent` receives no props by contract)
- Double-click spawn (UI disables button for 5s after click; shows "Spawning..." state)
- Command feedback confusion (show "dispatched" not "executed"; reference terminal tab for visual confirmation)
- STATE.md ENOENT (show "Starting..." during spawn window; graceful fallback to "unknown")

### Phase 3: Enhancement — P2 Features After Production Validation

**Rationale:** P2 features require understanding real operator friction. State hint display and context pressure require hook log parsing that may need iteration based on real log patterns. Session selector tied to the active terminal tab requires assessing whether the plugin context workaround (fetch instances in hook) is sufficient or if `PluginSlotRenderer` needs extending.

**Delivers:** State hint badges (idle/menu/working/error), context pressure indicators (% from hook log), session selector pre-loaded from active tab, STATE.md phase/progress display, per-agent hook feed filter, spawn auto-detect first command.

**Implements features from FEATURES.md:** All P2 features from the "Should have" list.

**Avoids pitfalls:**
- STATE.md polling stale data (use hook log `state=` lines as primary state signal; STATE.md as supplement)
- Session name mismatch (cross-reference registry `tmux_session_name` with live `tmux ls` output; show warning in UI when names diverge)
- `clear_then` timing sensitivity (only surface `clear_then`-based presets when agent state shows `idle`)

### Phase Ordering Rationale

- Security cannot be retrofitted: shell injection validation must be in the first version of `gsdRoutes.ts`. Starting with the server guarantees this.
- Types before code: prevents import errors and ensures both sides agree on shapes before either side is written.
- Server before client: the hook and plugin cannot be meaningfully tested without working endpoints.
- P1 before P2: validates the control-center concept in daily use before adding complexity. The P2 features listed are enhancements, not MVP requirements.
- Fire-and-forget spawn pattern is architecturally incompatible with a synchronous pattern — establishing it in Phase 1 prevents a breaking change to client expectations in Phase 2.

### Research Flags

**Phases with standard patterns (no additional research needed):**
- **Phase 1 (backend):** All patterns copied directly from existing codebase — `execFile` from `TmuxSessionManager.ts`, route module from `instanceRoutes.ts`, Socket.IO namespace from `TerminalStreamService.ts`, service singleton from `OpenClawConfigReader.ts`. Script interfaces verified from source. No new paradigms.
- **Phase 2 (client plugin):** Plugin pattern copied from `example-plugin.tsx`; hook pattern from `useActiveInstances.ts` and `useTerminalSocket.ts`. UX patterns drawn from existing `PromptPanel` and `InstanceTabBar` components.

**Phases that may benefit from light review before planning:**
- **Phase 3 (state hints):** Hook log format for context pressure percentage (e.g., "72% [WARNING]") needs verification from a live log containing a pressure event before writing regex. Sample a live log before planning this phase.
- **Phase 3 (session selector):** The `PanelComponent` receives no props by contract (`ComponentType` in `pluginTypes.ts`). If fetching instances in the hook is insufficient for session selection, extending `PluginSlotRenderer` affects all plugins. Evaluate actual friction before planning.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All capabilities verified against running codebase; Node.js 22 built-ins manually tested on this machine; `fs.watch` confirmed inotify-backed on Linux; JSON.parse on registry confirmed; zero new dependencies |
| Features | HIGH | PRD read directly; `spawn.sh` and `menu-driver.sh` read in full; live registry schema confirmed; hook log format confirmed from live file; anti-features reasoned from PRD non-goals |
| Architecture | HIGH | All patterns read directly from existing source files; plugin contract confirmed from `pluginTypes.ts`; mount pattern confirmed from `index.ts`; `bottom-panel` slot render location confirmed at App.tsx line 318 |
| Pitfalls | HIGH | Security issues verified against actual `spawn.sh`/`menu-driver.sh` source with line numbers cited; Node.js CVE-2025-27210 referenced; `flock` usage confirmed at specific lines; `sleep 0.8` heuristic confirmed at menu-driver.sh line 49 |

**Overall confidence:** HIGH

### Gaps to Address

- **Registry write locking:** The atomic rename pattern is acceptable for v2.1 single-operator scale where spawns are rare. If concurrent spawn + PATCH becomes common (multiple operators, frequent auto-spawning), upgrade to `flock`-compatible locking (either `execFile('flock', ...)` wrapper or `proper-lockfile` npm package). Document as known limitation in code comments at the PATCH endpoint.

- **Context pressure log format:** The hook log format for context pressure values (e.g., "72% [WARNING/CRITICAL]") was identified in FEATURES.md as derivable from hook log lines, but a live log sample containing an actual pressure event was not available during research. Before building the context pressure indicator in Phase 3, sample a live pressure event from the log to confirm the exact format.

- **Plugin context / session selector:** The `PanelComponent` receives no props by contract. The workaround (fetch instances in hook) is documented and known. Assess actual operator friction from Phase 2 usage before deciding whether to extend `PluginSlotRenderer` in Phase 3.

- **`menu-driver.sh clear_then` timing:** The 800ms heuristic sleep fails when Claude is compacting context (up to 30 seconds). The v2.1 UI must document this and ideally only surface `clear_then`-based presets when the agent state shows `idle`. The enforcement mechanism depends on Phase 3 state hint implementation — accept this gap in Phase 2 with clear UX language ("dispatched, not confirmed").

## Sources

### Primary (HIGH confidence — direct file reads on this machine)
- `src/server/services/TmuxSessionManager.ts` — `execFile` promisify pattern, session management methods
- `src/server/services/TerminalStreamService.ts` — Socket.IO namespace setup pattern
- `src/server/routes/agentRoutes.ts`, `instanceRoutes.ts`, `historyRoutes.ts`, `activityRoutes.ts` — confirmed route module pattern
- `src/server/services/OpenClawConfigReader.ts` — TTL cache pattern (30s), JSON file read
- `src/server/index.ts` — route mounting, service initialization, shutdown handler pattern
- `src/client/plugins/example-plugin.tsx` — plugin contract: `{ manifest, PanelComponent }`, no props
- `src/shared/pluginTypes.ts` — `ComponentType` (no props), `PluginSlot` enum including `'bottom-panel'`
- `src/client/plugins/index.ts` — `import.meta.glob('./*.tsx', { eager: true, import: 'default' })`
- `src/client/App.tsx` line 318 — `bottom-panel` slot render location confirmed
- `src/client/hooks/useActiveInstances.ts` — polling hook pattern (5s interval, `useCallback`+`useEffect`)
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh` — full interface verified; `flock` at lines 103-140; `wait_for_claude_tui_readiness` at lines 249-268; `tmux send-keys "$first_command"` at lines 403-415
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh` — action allowlist verified; `sleep 0.8` at line 49
- `/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json` — live schema: `agent_id`, `enabled`, `working_directory`, `tmux_session_name` confirmed
- `/tmp/gsd-hooks.log` — live log format: `[ISO-timestamp] [script-name.sh] message` confirmed
- STATE.md (warden, gsd-code-skill, getcpsr projects) — consistent `Phase:`, `Plan:`, `Status:`, `Progress:`, `Last activity:` fields confirmed across 3 live files

### Secondary (MEDIUM confidence — web research, established practices)
- Agentic AI UX patterns (UX Magazine, Salesforce Architects, AufaitUX) — suggest-and-confirm, progressive disclosure, in-place feedback
- PatternFly clipboard copy design guidelines — copy-to-clipboard "Copied!" state pattern
- Polling vs streaming analysis (Svix Resources, Smashing Magazine) — confirmed 5s polling is sufficient for single-operator scale

### Security Sources (HIGH confidence — current CVEs and technical documentation)
- CVE-2025-27210 — path traversal via device names; reinforces need for prefix assertion beyond `path.normalize`
- execFile vs exec security model (StackHawk, eslint-plugin-security) — shell bypass is insufficient when args flow into a script that uses `send-keys` in a shell context
- `flock` advisory locking — bash `flock` and Node.js `fs.write` use incompatible lock mechanisms; mixing them creates silent race conditions
- Claude Code tmux send-keys concurrent corruption (GitHub Issue #23615, 2025) — confirmed interleaved keystrokes from concurrent `menu-driver.sh` calls corrupt TUI state

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
