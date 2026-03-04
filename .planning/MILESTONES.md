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

