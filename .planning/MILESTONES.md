# Milestones

## v1.0 MVP (Shipped: 2026-02-12)

**Phases:** 6 (Phases 1-6) | **Plans:** 9 | **Commits:** 32 | **LOC:** 2,385 TypeScript
**Timeline:** 2026-02-12 (single day)
**Git range:** `d09e12d..733e78a`

**Delivered:** Browser-based terminal multiplexer for monitoring and intervening with OpenClaw autonomous agents — live xterm.js streaming, multi-session tabs, agent metadata sidebar, prompt injection via Gateway API, session history, token usage dashboard, and production Nginx deployment.

**Key accomplishments:**
1. Real-time terminal streaming via xterm.js with Socket.IO transport and sub-100ms latency
2. Multi-session tab bar with auto-discovery of tmux agent sessions and per-session stop button
3. OpenClaw agent integration with config reading, SOUL.md preview, memory status, and Telegram topic mapping
4. Session history archive with search filters, token usage dashboard, and gateway log viewer
5. Production deployment with Nginx SSL/WebSocket config, Playwright E2E tests (12 passing), and graceful shutdown
6. Always-interactive terminals with clear Gateway prompt panel labeling

**Phases:**
- Phase 1: Core Infrastructure (2/2 plans) — `0341445`
- Phase 2: Terminal Integration (1/1 plan) — `e7e726a`
- Phase 3: Agent Integration (1/1 plan) — `18337f8`
- Phase 4: History & Analytics (1/1 plan) — `a5879f3`
- Phase 5: Production Deployment (1/1 plan) — `46c87cb`
- Phase 6: Close v1 Audit Gaps (3/3 plans) — `f669408`

**Tech debt accepted:**
- No unit tests (Playwright E2E + backend-verify.sh provide integration coverage)
- Token usage data population requires automated token scraping
- PTY resize EBADF and FitAddon zero dimensions mitigated with guards, not fixed at source

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

---

## v1.1 UX Fixes & Prompt Panel (Shipped: 2026-02-12)

**Phases:** 2 (Phases 7-8) | **Plans:** 2 | **Tasks:** 4 | **Commits:** 14
**Timeline:** 2026-02-12 (~2 hours)
**Git range:** `733e78a..595e5e9`

**Delivered:** Terminal interactivity overhaul (auto-focus, tmux mouse scrollback) and session-aware prompt panel with auto-syncing agent dropdown and working Gateway API delivery.

**Key accomplishments:**
1. Terminal auto-focus on load and tab switch — immediately interactive without click-to-focus
2. tmux mouse scrollback with 50,000-line history buffer for session debugging
3. Session-aware prompt panel with auto-syncing agent dropdown on tab switch
4. Working Send button and Ctrl+Enter prompt delivery via Gateway API
5. 8 new Playwright E2E tests covering terminal focus and prompt panel behaviors

**Phases:**
- Phase 7: Terminal Interactivity & Scrollback (1/1 plan) — `9f65d54`
- Phase 8: Prompt Panel & Gateway Integration (1/1 plan) — `effa33c`

**Tech debt accepted:**
- Gateway `/v1/chat/completions` endpoint may need explicit enabling in openclaw.json per agent
- tmux.conf is system-level (/home/forge/.tmux.conf), not tracked in repo

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

---


## v2.3 Code Hygiene & Token Usage (Shipped: 2026-03-03)

**Phases:** 4 (Phases 15-18) | **Plans:** 8 | **Commits:** 97 | **LOC:** 6,650 TypeScript (net -486 LOC)
**Timeline:** 13 days (2026-02-19 → 2026-03-03)
**Git range:** `0c82738..16839b8`

**Delivered:** Complete code hygiene pass — dead code deletion, shared type unification, UI component extraction, view decomposition, lazy tab mounting, and four bug fixes — followed by a real token usage data pipeline reading Claude Code JSONL session files with cache token tracking, auto-scan, and enhanced UI display.

**Key accomplishments:**
1. Deleted ~740 lines of dead code and orphaned components (gutted plugin file, removed AgentsView.tsx)
2. Unified GSD types into `src/shared/gsdTypes.ts` eliminating client/server type drift
3. Extracted 9 shared UI constants/components to `gsdShared.tsx` — single source of truth for GSD status rendering
4. Decomposed GsdView.tsx from 489 to 76 lines with 4 standalone tab components (AgentsTab, ControlsTab, RegistryTab, EventsTab)
5. Lazy-mount GSD tabs eliminating ~18 HTTP req/min + 60 tmux subprocess/min idle polling waste
6. Built SessionUsageReader JSONL scanner with cache token tracking, per-model pricing, and auto-scan every 5 minutes

**Phases:**
- Phase 15: Foundation — Dead code removal + shared types (2/2 plans) — `f67ada3`
- Phase 16: DRY + SRP — Shared module + tab extraction (2/2 plans) — `e423c67`
- Phase 17: Polish — Lazy-mount, fd safety, regex, setTimeout cleanup (2/2 plans) — `673cf5a`
- Phase 18: Fix token usage — JSONL session reader + DB population (2/2 plans) — `4ad39dd`

**Quick tasks shipped during milestone:** 15-22, 2029 (terminal polling stability, streaming JSONL, NaN guards, doc fixes, dead script deletion)

**Tech debt accepted:**
- detectAgentState() regex heuristics remain fragile but functional (deferred)
- xterm.js mobile touch support fundamentally broken (Phase 10 concern, deferred)

See `.planning/milestones/v2.3-ROADMAP.md` for full phase details.

---


## v3.1 Agent Control & Deep Insights (Shipped: 2026-03-04)

**Phases:** 6 (Phases 21-24, 26-27) | **Plans:** 11 | **Commits:** 43 | **LOC:** 10,685 TypeScript (net +4,092)
**Timeline:** 2 days (2026-03-03 → 2026-03-04)
**Git range:** `81d21a3..c670de2`

**Delivered:** Active operations platform — start, stop, and restart agent sessions from the dashboard with safety guards; cost velocity tracking with per-agent budget alerts; model cost comparison and CSV export; terminal session recording in asciicast v2 format with variable-speed replay.

**Key accomplishments:**
1. Agent lifecycle controls — full start/stop/restart with confirmation dialogs, real-time transitional state badges (starting/stopping), 30-minute stopped session retention for restart access
2. Token burn rate & budget alerts — cost velocity with sliding windows (Today/2-day/7-day), per-agent budget thresholds with amber/red nav badges, cost projection cards
3. Token analytics & export — model cost comparison view (grouped bar chart by sonnet/opus/haiku) and CSV export of full token usage dataset
4. Session recording & replay — complete asciicast v2 recording pipeline with PTY output tap, variable-speed replay (1x/2x/4x/8x), browsable recording library with sortable table
5. Two dedicated gap-closure phases (26, 27) resolved all integration gaps and tech debt discovered during milestone audit

**Phases:**
- Phase 21: Agent Lifecycle Controls (3/3 plans) — `93b4f4a`
- Phase 22: Token Burn Rate & Budget Alerts (2/2 plans) — `1a71a43`
- Phase 23: Token Analytics & Export (2/2 plans) — `5407146`
- Phase 26: Token Analytics Polish & Tech Debt (1/1 plan) — `16da84f`
- Phase 24: Session Recording & Replay (2/2 plans) — `35c79ce`
- Phase 27: Recording State Cleanup & Tech Debt (1/1 plan) — `832a102`

**Quick tasks shipped during milestone:** 2039-2041 (Phase 21 review, Phase 22 API key fix, Phase 22 re-verification)

**Tech debt accepted:**
- REC-05 auto-record settings panel — explicitly deferred to future milestone
- Confirmation dialogs use inline local state — could extract to shared ConfirmDialog component (info-level)

See `.planning/milestones/v3.1-ROADMAP.md` for full phase details.

---


## v3.2 Mobile Operations & UX Polish (Shipped: 2026-03-04)

**Phases:** 4 (Phases 28-31) | **Plans:** 6 | **Commits:** 28 | **LOC:** 11,229 TypeScript (net +544)
**Timeline:** 2026-03-04 (single day)
**Git range:** `247ccc9..b554bb0`

**Delivered:** Mobile operations polish and recording story completion — mobile toolbar with keyboard persistence, clickable session navigation with three-way routing, per-agent auto-record with first-frame capture, and storage rotation with configurable cap and safe two-phase deletion.

**Key accomplishments:**
1. Mobile toolbar Enter key + iOS keyboard persistence — soft keyboard stays open on all toolbar button taps via synchronous `terminal.textarea?.focus()` in `onTouchStart`
2. Three-way session navigation from history — tapping a row routes to live terminal (active), recording replay (stopped + recorded), or explanatory feedback (stopped, no recording)
3. Per-agent auto-record with PTY lifecycle hook — captures from first frame with no race condition; sparse-row DB pattern; toggle UI in recording library
4. Storage rotation with configurable cap — two-phase safe deletion (`deletion_pending` flag), periodic 5-minute scheduler, orphan crash recovery on startup
5. Storage stats UI with usage bar, cap input, and manual Prune Now button in collapsible recording library panel

**Phases:**
- Phase 28: Mobile Toolbar Fixes (1/1 plan) — `247ccc9`
- Phase 29: Session Navigation (1/1 plan) — `75adab9`
- Phase 30: Auto-Record Per Agent (2/2 plans) — `a87c9af`
- Phase 31: Storage Rotation (2/2 plans) — `1f5e425`

**Quick tasks shipped during milestone:** 2042 (next milestone proposals)

**Tech debt accepted:**
- SUMMARY frontmatter missing `requirements_satisfied` field on Phases 28, 29, 31 (doc-only gaps)
- `NAVIGABLE_STATUSES` Set declared inside component body (recreates on every render, info-level)
- Recordings fetched once on mount, not polled (new recordings require SessionHistory remount)
- Auto-record hook no-ops during 0-10s InstanceTracker sync window for organically-discovered sessions

See `.planning/milestones/v3.2-ROADMAP.md` for full phase details.

---


## v3.3 Telegram Operator Awareness (Shipped: 2026-03-05)

**Phases:** 4 (Phases 32-35) | **Plans:** 8 | **Commits:** 12 feat + docs | **LOC:** 12,252 TypeScript (net +1,023)
**Timeline:** 1 day (2026-03-04 → 2026-03-05)
**Git range:** `e4be4f1..2d119f5`
**Tests:** 90 unit tests (Vitest)

**Delivered:** Telegram-based operator awareness — Warden runs its own Telegram bot to notify the operator when agents stall on permission prompts, with one-tap approve to unblock agents without opening the browser, budget alert forwarding at amber/red thresholds, and a dashboard settings panel for all notification preferences.

**Key accomplishments:**
1. Telegram bot client (grammy) with long polling, auto-retry for rate limits, and graceful lifecycle (start on boot, stop on SIGTERM)
2. Permission prompt detection via tmux capture-pane polling with state-transition deduplication — works without browser open
3. One-tap Approve inline keyboard button with operator-only authorization, 15-minute expiry, and double-tap idempotency
4. Budget alert forwarding (amber 80% / red 100% thresholds) with configurable 10-minute cooldown deduplication
5. Notification settings panel with per-type toggles, cooldown config, and live bot connection status indicator
6. Full TDD methodology — 90 unit tests across 4 phases covering all 19 requirements

**Phases:**
- Phase 32: Bot Foundation (2/2 plans) — `105d201`
- Phase 33: Permission Prompt Detection and Forwarding (2/2 plans) — `7544fe3`
- Phase 34: One-Tap Approve (2/2 plans) — `a532962`
- Phase 35: Budget Alerts and Notification Settings (2/2 plans) — `18e2ca0`

**Tech debt accepted:**
- `gsdRoutes.ts` does not strip ANSI before `detectAgentState()` (inconsistent with NotificationPoller, pre-existing)
- `WARDEN_TELEGRAM_OPERATOR_ID` not validated at startup (misconfigured ID only discovered on first button tap)
- `NotificationPoller` polls stopped/error sessions (dead tmux capture-pane calls silently swallowed)
- PUT `/api/notifications/config` accepts cooldownMs >= 0 while UI enforces >= 60000ms

See `.planning/milestones/v3.3-ROADMAP.md` for full phase details.

---


## v3.4 Smart Session Lifecycle (Shipped: 2026-03-06)

**Phases:** 5 (Phases 36-40) | **Plans:** 10 | **Tasks:** 18 | **Commits:** 19 | **LOC:** 14,074 TypeScript (net +1,822)
**Timeline:** 1 day (2026-03-05)
**Git range:** `4eea5ed..344a9e2`
**Tests:** 31 Playwright E2E (29 passed, 1 skipped, 2 pre-existing flakes) + unit tests

**Delivered:** Autonomous session management — crash detection with 2-poll grace period, configurable auto-restart with storm rate limiting, idle timeout enforcement, one-click session launch from dashboard, lifecycle event history with filters and pagination, and Telegram pipeline pivot to send-only mode using Gideon's bot token.

**Key accomplishments:**
1. Telegram pipeline pivot — rewrote to send-only fetch using Gideon's bot token from openclaw.json, deleted approval infrastructure, fixed Markdown escaping, persisted budget alert state to SQLite
2. Crash detection backend — 2-poll grace period, lifecycle event sourcing to SQLite, Telegram crash notifications with failure isolation
3. Auto-restart engine — per-agent policy (none/once/always), 7s delayed spawn, sliding-window storm limiter (3/hr), pre-register instance for instant UI feedback, operator toast notifications
4. Idle timeout & quick-launch — per-agent idle timeout with 60s polling, auto-stop with lifecycle logging; QuickLaunchModal with agent picker and last-used project path pre-fill
5. Lifecycle history UI — LifecycleEventsView with agent/event-type filters, color-coded badges, pagination; fixed all pre-existing E2E test failures
6. 20/20 requirements satisfied across all 5 phases

**Phases:**
- Phase 36: Telegram Pipeline Pivot & Hardening (2/2 plans) — `c1560a6`
- Phase 37: Crash Detection Backend (2/2 plans) — `6e1d4bb`
- Phase 38: Auto-Restart Engine (2/2 plans) — `1defb42`
- Phase 39: Idle Timeout & Quick-Launch (2/2 plans) — `0d778b3`
- Phase 40: Lifecycle History & E2E Verification (2/2 plans) — `881b9b4`

**Quick tasks shipped during milestone:** 2045-2051 (agent sidebar enhancements, rotate session, hooks pause toggle)

**Tech debt accepted:**
- 37-01-SUMMARY.md missing requirements-completed frontmatter field (documentation gap only)
- 'once' restart mode functionally identical to 'always' (both restart up to storm limit) — UI lacks tooltip explaining semantics
- NotificationPoller polls stopped sessions (pre-existing from v3.3)
- Playwright runs against production server (port 3001) due to host ENOSPC inotify limit

See `.planning/milestones/v3.4-ROADMAP.md` for full phase details.

---

