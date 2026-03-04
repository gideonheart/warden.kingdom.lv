# Project Research Summary

**Project:** Warden Dashboard v3.3 — Telegram Operator Awareness
**Domain:** Telegram bot notification bridge integrated into an existing Node.js monitoring dashboard
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

Warden v3.3 adds a Telegram notification and one-tap approval layer on top of a fully-shipping v3.2 codebase. The milestone is narrowly scoped: an operator away from a browser should receive a Telegram message when an agent stalls on a permission prompt and should be able to approve it with a single button tap. The recommended approach is a single new `grammy`-powered `TelegramBotService` running inside the existing Express process as a long-polling bot — no webhook infrastructure changes, no new processes, one package added (`grammy ^1.41.1`). Everything else required (topic mappings, budget status, tmux session manager, signal handlers, SQLite migration pattern) already exists in the codebase and needs only wiring, not rebuilding.

The principal architectural decision is that notification trigger detection must happen via independent `tmux capture-pane` polling rather than tapping the PTY `onData` stream. The PTY only exists while a browser tab is connected; if no browser is open the PTY is gone and no notification fires — which defeats the entire purpose of the feature. A new `NotificationPoller` service runs on a 10-second interval using the same `detectAgentState()` / tmux capture pattern already proven in `gsdRoutes.ts`, and emits typed EventEmitter events that `TelegramBotService` subscribes to. This keeps the components decoupled and SRP-clean.

The top risks are: (1) duplicate notification spam if transition-only emission and cooldown deduplication are not built into the first implementation, (2) unauthorized one-tap approvals if sender identity is not verified against a configured operator Telegram user ID, and (3) 409 Conflict bot crashes on restart if graceful `bot.stop()` shutdown is not wired into the existing SIGTERM/SIGINT handlers. All three must be addressed in Phase 1 or Phase 2 — not as post-launch followups.

---

## Key Findings

### Recommended Stack

The v3.3 stack addition is exactly one package: `grammy ^1.41.1`. grammy is TypeScript-first (ships its own declarations, no `@types` needed), actively maintained (published 2 days before research date), and directly supports the required features: `bot.api.sendMessage()` with `message_thread_id` for Telegram forum topics, `InlineKeyboard` for one-tap approve buttons, `bot.callbackQuery()` handler for button press routing, and graceful `bot.stop()` for SIGTERM integration. Long polling is used instead of webhooks — grammy's official docs recommend this for always-on single-server deployments, and it requires zero Nginx or IP-whitelist changes. Competing libraries (node-telegram-bot-api, telegraf) are either unmaintained or have inferior TypeScript support; there is no reason to choose them for new code.

Two new SQLite tables are added following the existing singleton-row pattern (`budget_config`, `rotation_config`): `notification_config` (enable/disable per alert type, cooldown duration) and optionally `notification_cooldown` (persisted dedup timestamps if restart resilience is needed). The bot token is loaded from a `WARDEN_TELEGRAM_BOT_TOKEN` environment variable — not from `openclaw.json` and not from any file tracked by git.

See: `.planning/research/STACK.md`

**Core technologies:**
- `grammy ^1.41.1`: Telegram Bot API client — long polling, inline keyboards, callback query handling, graceful shutdown. No `@types/grammy` needed; types bundled.
- `@grammyjs/auto-retry` (optional): Automatic 429 rate-limit retry with exponential backoff for high-activity multi-agent runs.
- `strip-ansi`: Strip ANSI escape codes from tmux pane captures before embedding excerpts in Telegram messages.
- `better-sqlite3` (existing): Two new tables (`notification_config`, optional `notification_cooldown`) following the singleton-row pattern already in the codebase.
- Environment variables: `WARDEN_TELEGRAM_BOT_TOKEN` — token source; `WARDEN_TELEGRAM_OPERATOR_ID` — sender verification in callback handlers.

### Expected Features

See: `.planning/research/FEATURES.md`

**Must have (table stakes for v3.3 launch):**
- `TelegramBotService` singleton — bot init from env var, graceful degradation if token absent, long polling lifecycle
- Permission prompt detection → Telegram message with inline Approve button, routed to agent's configured topic via existing `getTopicMappings()`
- `callbackQuery` handler for approve — sends `'1'` via `tmuxSessionManager.sendPromptToSession()`, edits message to remove button, calls `answerCallbackQuery()` first
- Duplicate suppression — in-memory cooldown Map, transition-only emission (state must change TO `permission_prompt`, not just sustain it), configurable cooldown (default: 2 min permission, 10 min budget)
- Budget alert forwarding — amber and red thresholds sent to operator's topic with distinct formatting; no inline button (informational only)
- Notification settings UI — enable/disable per alert type + cooldown duration, stored in SQLite `notification_config`

**Should have (competitive differentiators):**
- Edit message after approve — remove inline keyboard so button cannot be re-tapped; update text to "Approved at HH:MM"
- Per-agent Telegram topic routing — already supported by `getTopicMappings()`; each agent's alerts go to its specific topic
- Bot connection status indicator in settings UI — green/red dot showing polling state
- Sender identity verification — reject callback queries from non-operator Telegram user IDs
- ANSI-stripped pane excerpt in notification body — operator sees the actual prompt text before tapping Approve
- Timestamp expiry token in `callback_data` — approve requests older than 15 minutes return a friendly "expired" error

**Defer to v3.3.x / v3.4+:**
- Per-agent budget threshold routing (requires per-agent budget query extension; current `budget_config` is system-wide)
- Test notification button in settings UI
- Notification history log (SQLite, last 100 rows)
- Deny button (sends '2' or 'n' to permission menu)
- Context pressure alert (90% context window)
- Scheduled quiet hours

### Architecture Approach

The new code is a small service layer that wires into the existing Express process without modifying any existing services. `NotificationPoller` (extends `EventEmitter`) runs on a 10-second interval, captures tmux panes with `execFileAsync`, calls the extracted `detectAgentState()` utility, compares against previous states, and emits typed events. `TelegramBotService` subscribes to those events, checks `NotificationDeduplicator`, reads `notification_config` from SQLite, resolves topic mappings via `OpenClawConfigReader`, and sends Telegram messages via grammy. The approve callback from Telegram routes back through `TmuxSessionManager.sendPromptToSession()`. The `detectAgentState()` function is extracted from `gsdRoutes.ts` into `src/server/utils/agentStateDetection.ts` so both the route and the poller can share it without circular imports.

See: `.planning/research/ARCHITECTURE.md`

**Major components (new):**
1. `NotificationPoller` — EventEmitter; 10s interval; `tmux capture-pane` → state detection → event emission; tracks previous state per session; emits only on transitions
2. `TelegramBotService` — grammy Bot instance; event subscriptions; message sending with inline keyboards; callback query handling; lifecycle (`start`/`stop`)
3. `NotificationDeduplicator` — in-memory `Map<key, timestamp>`; cooldown gate; configurable window read from DB
4. `notificationRoutes` — `GET/PUT /api/notifications/config`; singleton-row SQLite table following `budget_config` precedent
5. `NotificationSettingsPanel` — React component; toggles + cooldown inputs; bot status indicator
6. `src/server/utils/agentStateDetection.ts` — extracted `detectAgentState()` + `extractContextPressure()`; no behavior change to existing routes

**Modified files (minimal surface):**
- `src/server/index.ts` — instantiate + start/stop new services; mount `notificationRoutes` (~12 lines)
- `src/server/database/DatabaseConnection.ts` — add `notification_config` migration + getter/upsert methods (~40 lines)
- `src/shared/types.ts` — add `NotificationConfig` interface (~8 lines)

### Critical Pitfalls

See: `.planning/research/PITFALLS.md`

1. **Duplicate notification spam** — `detectAgentState()` returns a snapshot state every poll cycle; without transition-only emission AND cooldown deduplication, the operator receives 20-40 identical messages per permission prompt. Both guards must be in the Phase 2 initial implementation. Never ship notification without dedup.

2. **409 Conflict crash on restart** — If `bot.stop()` is not called before process exit and the server is restarted quickly, Telegram returns `409 Conflict` and the bot polling loop crashes. Wire `bot.stop()` into the SIGTERM/SIGINT handler in Phase 1 before any notification code exists.

3. **Unauthorized one-tap approve** — grammy callback query handlers fire for any Telegram user who taps the button. Any group member could inject `1\n` into a live tmux session running as `forge`. Verify `ctx.from.id === OPERATOR_TELEGRAM_USER_ID` as the first check in every callback handler (Phase 3, non-negotiable).

4. **PTY `onData` tap for detection (wrong approach)** — The PTY only exists while a browser is connected; 30-second keep-alive means no browser = no PTY = no detection. Use `NotificationPoller` with `tmux capture-pane` instead — it works regardless of browser state.

5. **`answerCallbackQuery` called after async work** — Telegram requires this acknowledgement before any async operations or the button shows an infinite spinner. Call `await ctx.answerCallbackQuery()` as the absolute first line of any callback handler.

6. **False-positive permission notifications from regex** — `detectAgentState()` matches "Do you want to proceed?" which fires on npm install, git hooks, etc. For Telegram (where a false positive causes `1\n` to be sent to an unintended prompt), narrow to Claude Code's numbered menu format (`❯ 1. Yes`). Include pane excerpt in notification body so operator can verify before approving.

7. **ANSI escape codes in Telegram messages** — Raw tmux pane content includes ANSI color codes that render as garbage in Telegram. Use `strip-ansi` on all pane excerpts before composing any message text.

---

## Implications for Roadmap

Based on combined research, the milestone maps naturally to four sequential phases with hard inter-phase dependencies.

### Phase 1: Bot Foundation and Lifecycle

**Rationale:** All other phases depend on a functioning, properly initialized grammy Bot instance. Security and operational concerns (token handling, graceful shutdown, 409 prevention, rate-limit retry) must be established before any notification logic exists — retrofitting them is error-prone and creates production risk.

**Delivers:** A `TelegramBotService` that can be started and stopped cleanly, logs its status, degrades gracefully if no token is configured, and handles errors without crashing the Express process. The `notification_config` SQLite table and its getter/upsert methods are also in place. `@grammyjs/auto-retry` installed at bot init.

**Features addressed:** Bot token configuration, graceful degradation if token absent, graceful shutdown on SIGTERM/SIGINT, error isolation via `bot.catch()`, rate-limit retry.

**Pitfalls avoided:**
- Bot token leaking to source code (env var pattern established first)
- 409 Conflict on restart (SIGTERM handler wired at bot init, `deleteWebhook()` called before `bot.start()`)
- Rate limit silent drop (`@grammyjs/auto-retry` installed at bot initialization)
- Blocking `bot.start()` on main thread (fire-and-forget `void this.bot.start()` pattern)

**Research flag:** Standard patterns — grammy official docs cover all of this; SIGTERM handler already exists in the codebase as the template. No additional research needed.

---

### Phase 2: Permission Prompt Detection and Forwarding

**Rationale:** This is the core milestone deliverable. It requires Phase 1 (bot must exist), and it introduces the event architecture (`NotificationPoller`, `NotificationDeduplicator`, `agentStateDetection` utility extraction) that the budget alert phase will reuse. Building it first lets Phase 3 layer on top of existing infrastructure.

**Delivers:** When an agent stalls on a Claude Code permission prompt, the operator receives a Telegram message in the correct agent topic containing the prompt excerpt. Duplicate suppression ensures exactly one message per permission event (not one per poll cycle).

**Features addressed:** Permission prompt → Telegram message routing; per-agent topic routing via `getTopicMappings()`; `NotificationPoller` with 10s interval; `NotificationDeduplicator` with configurable cooldown; `agentStateDetection.ts` utility extraction; ANSI stripping of pane excerpts.

**Pitfalls avoided:**
- Duplicate notification spam (transition-only emission + cooldown Map, both required from the start)
- PTY `onData` tap approach (use `tmux capture-pane` in `NotificationPoller` instead)
- False-positive regex matches (narrow `detectAgentState()` regex; include pane excerpt in message body)
- ANSI codes in Telegram messages (`strip-ansi` applied before any message text is composed)

**Research flag:** The `detectAgentState()` regex narrowing deserves brief verification against actual Claude Code terminal output at Phase 2 start. Capture a real permission prompt pane output and confirm the narrowed pattern matches. Otherwise standard patterns.

---

### Phase 3: One-Tap Approve

**Rationale:** The approve mechanism is a separate concern from detection/forwarding. It requires Phase 2 (a message must exist with a button to tap). This phase adds the inline keyboard to Phase 2's notification message and wires the callback query handler back to `TmuxSessionManager`. Security verification must be part of this phase, not a followup.

**Delivers:** The Telegram notification message has an "Approve" inline button. Tapping it sends `1\n` to the correct tmux session, edits the message to remove the button, and shows the operator a confirmation. Unauthorized tappers receive an explicit rejection. Expired approvals return a friendly error rather than a silent no-op.

**Features addressed:** `InlineKeyboard` on permission prompt messages; `callbackQuery` handler; `tmuxSessionManager.sendPromptToSession('1')`; `answerCallbackQuery` first (before async work); message edit after approve; sender verification against `WARDEN_TELEGRAM_OPERATOR_ID`; timestamp expiry token in `callback_data`.

**Pitfalls avoided:**
- Callback query answer timing (answer-first pattern, non-negotiable)
- Unauthorized approval (sender ID check against env-configured operator ID)
- Stale approve button re-tap (message edited to remove keyboard after first approval)
- `callback_data` > 64 bytes (session name format validated; `approve:` + max session name is well within 64 bytes)

**Research flag:** Standard patterns — grammy callback query docs cover all mechanics with official examples. No additional research needed.

---

### Phase 4: Budget Alerts and Notification Settings UI

**Rationale:** Budget alerts reuse the `NotificationPoller` and `TelegramBotService` infrastructure built in Phases 2-3. They are informational (no inline keyboard), simpler to implement, and have no security complications. The settings UI completes the milestone by giving the operator control over notification behavior without code changes. Both belong in the same phase because the UI needs the config API, and the config API controls both budget alerts and permission alerts.

**Delivers:** Budget warning (amber) and exceeded (red) alerts forwarded to the operator's Telegram topic with distinct message formatting. A settings panel in the Warden dashboard exposes enable/disable toggles per alert type and cooldown duration inputs. Changes take effect on the next notification send without server restart.

**Features addressed:** Budget alert forwarding from `NotificationPoller`'s `getBudgetAlertStatus()` calls; worsening-only emission (ok → warning, warning → exceeded, not reverse); `notificationRoutes` (`GET/PUT /api/notifications/config`); `NotificationSettingsPanel` React component; bot status indicator.

**Pitfalls avoided:**
- Budget alert spam (10-minute cooldown default; same `NotificationDeduplicator` as Phase 2)
- Identical amber/red message formatting (distinct emoji, wording, urgency per threshold level)

**Research flag:** Standard patterns. Per-agent budget routing (requiring per-agent budget query extension) is deferred to v3.3.x — system-wide alert routing is sufficient for v3.3.

---

### Phase Ordering Rationale

- Phase 1 must come first: token security and shutdown wiring cannot be safely retrofitted after notification code is written.
- Phase 2 must come before Phase 3: the inline keyboard requires a message to attach to; the `NotificationPoller` and deduplication infrastructure are shared across both phases.
- Phase 3 must come before Phase 4's settings UI: the settings panel needs a working notification system to test against.
- Phase 4 bundles budget alerts with settings because both depend on `notification_config` and neither warrants a standalone phase.

### Research Flags

Phases likely needing brief investigation during implementation:
- **Phase 2:** The `detectAgentState()` regex should be tested against actual Claude Code terminal output for the current Claude version before narrowing the match. A 30-minute manual pane capture would confirm the `❯ 1. Yes` pattern reliably.

Phases with standard, well-documented patterns (no additional research needed):
- **Phase 1:** grammy lifecycle is fully documented in official docs; Warden's existing SIGTERM pattern is the implementation template.
- **Phase 3:** grammy callback query handling and `answerCallbackQuery` are core grammy features with official worked examples.
- **Phase 4:** Budget alert DB query already exists; `notificationRoutes` follows the same pattern as three existing route modules.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | grammy official docs verified; direct codebase inspection confirmed all existing services and their APIs; version compatibility confirmed; one-package addition validated |
| Features | HIGH | All features grounded in existing codebase hooks (`detectAgentState`, `getTopicMappings`, `sendPromptToSession`, `getBudgetAlertStatus`); grammY API verified for inline keyboards and callback queries against official docs |
| Architecture | HIGH | Component boundaries drawn from direct source inspection of v3.2 codebase; EventEmitter pattern matches existing codebase style; all integration points confirmed with file names and approximate line numbers |
| Pitfalls | HIGH | Telegram Bot API official docs + grammY official docs for all API-level pitfalls; codebase inspection confirmed PTY keep-alive behavior and `detectAgentState()` regex fragility; `PROJECT.md` tech debt notes corroborate |

**Overall confidence:** HIGH

### Gaps to Address

- **`detectAgentState()` regex specificity for Telegram:** The current regex is documented as "fragile but functional" in `PROJECT.md`. Before finalizing Phase 2 implementation, capture a real Claude Code permission prompt pane output and confirm the narrowed regex (`❯ 1. Yes`) matches reliably. Low-effort validation; do it at Phase 2 start.

- **Operator Telegram user ID sourcing:** The sender verification in Phase 3 requires `WARDEN_TELEGRAM_OPERATOR_ID` to be set. The operator needs to look this up via `@userinfobot`. Include this in the Phase 3 setup checklist — it is not a code concern but an operational prerequisite that can block testing.

- **Forge environment variable injection:** `WARDEN_TELEGRAM_BOT_TOKEN` needs to be set in the production environment before deployment. Confirm this is part of the Phase 1 deployment checklist and not an afterthought.

- **Per-agent budget routing (accepted limitation for v3.3):** The current `getBudgetAlertStatus()` returns system-wide status, not per-agent. Budget alerts in v3.3 route to a single operator topic rather than each agent's specific topic. This is a known accepted limitation; log it for v3.3.x work.

---

## Sources

### Primary (HIGH confidence — direct source inspection)

- `src/server/routes/gsdRoutes.ts` — `detectAgentState()` regex, `tmux capture-pane` pattern, `SESSION_NAME_RE`
- `src/server/services/TerminalStreamService.ts` — PTY lifecycle, 30s keep-alive behavior, `onData` tap pattern
- `src/server/services/InstanceTracker.ts` — 10s polling interval pattern adopted by `NotificationPoller`
- `src/server/services/OpenClawConfigReader.ts` — `getTopicMappings()` returning `{ agentId, groupId, topicId }`
- `src/server/services/TmuxSessionManager.ts` — `sendPromptToSession(sessionName, prompt)` existing implementation
- `src/server/database/DatabaseConnection.ts` — `getBudgetAlertStatus()`, singleton-row config table pattern
- `src/shared/types.ts` — `BudgetAlertStatus`, `AgentInstance` interfaces
- `src/shared/openclawTypes.ts` — `TopicMapping` interface
- `src/client/hooks/useBrowserNotifications.ts` — state-transition detection pattern (template for server-side `NotificationPoller`)
- `src/client/hooks/useBudgetAlerts.ts` — budget alert polling pattern; server-side equivalent in `NotificationPoller`
- `.planning/PROJECT.md` — v3.3 milestone scope; "separate notification-only bot" note; out-of-scope items; tech debt on `detectAgentState()`
- [grammy.dev/guide/](https://grammy.dev/guide/) — Bot lifecycle, long polling vs webhooks, graceful shutdown
- [grammy.dev/plugins/keyboard](https://grammy.dev/plugins/keyboard) — `InlineKeyboard` API, `answerCallbackQuery` requirement
- [grammy.dev/advanced/flood](https://grammy.dev/advanced/flood) — Rate limits, auto-retry plugin
- [grammy.dev/resources/comparison](https://grammy.dev/resources/comparison) — NTBA unmaintained, telegraf outdated
- [core.telegram.org/bots/api](https://core.telegram.org/bots/api) — `sendMessage` with `message_thread_id`, `answerCallbackQuery`, `callback_data` 64-byte limit

### Secondary (MEDIUM confidence)

- WebSearch: grammy v1.41.1 publication date (2 days before research), 339+ dependents, npm weekly downloads
- WebSearch: node-telegram-bot-api callback_query issues (#306, #621) confirming library is in maintenance mode
- python-telegram-bot wiki — Avoiding flood limits (different library, same Telegram API constraints)
- node-telegram-bot-api issue #488 — 409 Conflict (same API behavior, different library)

### Tertiary (informational)

- codex.so — Telegram Bots in Group Topics — verified against Bot API docs; confirms `message_thread_id` usage
- GitGuardian — Telegram Bot Token detector pattern for pre-commit hook reference

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
