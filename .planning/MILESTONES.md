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

