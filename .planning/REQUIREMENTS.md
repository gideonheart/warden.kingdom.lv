# Requirements: Warden Dashboard

**Defined:** 2026-03-05
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.4 Requirements

Requirements for v3.4 Smart Session Lifecycle. Each maps to roadmap phases.

### Telegram Pipeline Pivot & Hardening

- [x] **FIX-01**: Rewrite `TelegramBotService` to read bot token from `openclaw.json` (`channels.telegram.botToken`) via `OpenClawConfigReader` instead of `WARDEN_TELEGRAM_BOT_TOKEN` env var; send-only mode (no long-polling), using Gideon's bot to deliver notifications to the correct project topic
- [x] **FIX-02**: Remove `ApprovalCallbackHandler`, `ApprovalStateTracker`, inline Approve button, `sendToTopicWithApproveButton()`, and `WARDEN_TELEGRAM_OPERATOR_ID` env var — approval now happens via Warden dashboard or Gideon conversation
- [x] **FIX-03**: Escape or strip Markdown special characters from tmux pane excerpts in notification messages, preventing `sendMessage` failures on truncated code blocks
- [x] **FIX-04**: `TelegramBotService.sendToTopic` validates `topicId` is a finite integer before API calls; log clear diagnostic and return early on invalid
- [x] **FIX-05**: `BudgetAlertPoller` persists `lastAlertedAt` per agent to SQLite and hydrates on startup, preventing false re-alerts after server restart
- [x] **FIX-06**: Update `NotificationSettingsPanel` UI — replace "Bot connected/disconnected" with "Bot configured/not configured" (no polling status to check), remove references to Approve button

### Crash Detection & Auto-Restart

- [x] **CRSH-01**: `InstanceTracker` distinguishes operator-initiated stops (session was in `'stopping'` state) from crashes (session was `'active'` or `'idle'` at last poll, tmux session now absent); uses `graceful_stop_marker` flag set atomically by Stop API
- [x] **CRSH-02**: Crash events persisted to `session_lifecycle_events` SQLite table with session ID, agent ID, event type, timestamp, and outcome
- [x] **CRSH-03**: Per-agent crash restart policy stored in `session_lifecycle_policy` SQLite table: `crash_restart_mode` (none/once/always); default `none`; configurable from dashboard
- [x] **CRSH-04**: Auto-restart execution calls `TmuxSessionManager.spawnSession()` with saved project path when crash detected and policy allows; logs restart outcome to `session_lifecycle_events`
- [x] **CRSH-05**: Restart storm rate limiter enforces maximum 3 restarts per hour per agent; after limit hit, flips `crash_restart_mode` to `none` and sends Telegram alert
- [x] **CRSH-06**: Telegram notification sent on crash detection via existing notification pipeline, including agent name, session name, and crash timestamp

### Idle Timeout

- [x] **IDLE-01**: Per-agent idle timeout stored in `session_lifecycle_policy` table: `idle_timeout_minutes` (nullable, null = disabled); default disabled; minimum configurable value 60 minutes
- [x] **IDLE-02**: `NotificationPoller` tracks time-in-idle-state per session; when threshold exceeded and `idle_timeout_minutes` is set, auto-stops session with `stop_reason = 'idle-timeout'`
- [x] **IDLE-03**: Idle timeout stop logged to `session_lifecycle_events` table with event type `idle-timeout`

### Quick-Launch Shortcuts

- [x] **LNCH-01**: Dashboard derives launch shortcuts from `openclaw.json` agent configs combined with last-used project path per agent (from `instances` table); no explicit template CRUD
- [x] **LNCH-02**: "New Session" button in dashboard opens agent picker showing available agents with their last-used project path; selecting one spawns a tmux session via existing start API
- [x] **LNCH-03**: Quick-launch pre-fills agent ID and project path; operator can override project path before launch

### Lifecycle History

- [x] **HIST-01**: Lifecycle events section in History view showing `session_lifecycle_events` (crashes, auto-restarts, idle-timeout stops) with agent, timestamp, event type, and outcome
- [x] **HIST-02**: Lifecycle history filterable by agent and event type

## Future Requirements

Deferred to future milestones.

### Analytics & Insights

- **ANLX-01**: Cost time-series chart with per-agent daily aggregates
- **ANLX-02**: Per-agent efficiency metrics (cost per session, cost per hour)
- **ANLX-03**: Cost anomaly detection (2x rolling average flagging)
- **ANLX-04**: Spend trend indicators with linear regression slope

### Health Monitoring

- **HLT-01**: Health score calculation with sliding-window output velocity
- **HLT-02**: Stall pattern detection (idle-too-long, repeated-output-loop)
- **HLT-03**: Per-agent health policy (watch-only/auto-ping/auto-restart)
- **HLT-04**: Auto-intervention execution on stall detection

### Quality Foundation

- **QUAL-04**: detectAgentState() unit test suite (10+ cases)
- **QUAL-05**: DatabaseConnection.ts decomposition into domain repositories
- **QUAL-06**: Vite bundle code splitting (reduce initial chunk below 450KB)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-record on crash detection | Depends on detectAgentState reliability — deferred |
| Session template CRUD | Quick-launch from openclaw.json + last-used path covers the need without new data models |
| Multi-server crash detection | Single-server architecture constraint |
| detectAgentState() rewrite | Regex heuristics fragile but functional; deferred to health monitoring milestone |
| Agent creation/deletion | Managed via openclaw.json, not the dashboard |
| Fleet coordination view | Deferred to v4.x when fleet size warrants it |
| One-tap Telegram Approve button | Requires Warden to run its own bot polling loop, conflicting with Gideon's bot; operator approves via Warden dashboard or Gideon conversation instead |
| Standalone Warden Telegram bot | Warden uses Gideon's bot token (send-only) to avoid running a second bot process |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 36 | Complete |
| FIX-02 | Phase 36 | Complete |
| FIX-03 | Phase 36 | Complete |
| FIX-04 | Phase 36 | Complete |
| FIX-05 | Phase 36 | Complete |
| FIX-06 | Phase 36 | Complete |
| CRSH-01 | Phase 37 | Complete |
| CRSH-02 | Phase 37 | Complete |
| CRSH-03 | Phase 38 | Complete |
| CRSH-04 | Phase 38 | Complete |
| CRSH-05 | Phase 38 | Complete |
| CRSH-06 | Phase 37 | Complete |
| IDLE-01 | Phase 39 | Complete |
| IDLE-02 | Phase 39 | Complete |
| IDLE-03 | Phase 39 | Complete |
| LNCH-01 | Phase 39 | Complete |
| LNCH-02 | Phase 39 | Complete |
| LNCH-03 | Phase 39 | Complete |
| HIST-01 | Phase 40 | Complete |
| HIST-02 | Phase 40 | Complete |

**Coverage:**
- v3.4 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
