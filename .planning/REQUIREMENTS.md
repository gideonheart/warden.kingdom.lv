# Requirements: Warden Dashboard

**Defined:** 2026-03-05
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.4 Requirements

Requirements for v3.4 Smart Session Lifecycle. Each maps to roadmap phases.

### Telegram Pipeline Hardening

- [ ] **FIX-01**: Telegram approval message edits escape or strip Markdown special characters from tmux pane excerpts, preventing `editMessageText` failures on truncated code blocks
- [ ] **FIX-02**: `TelegramBotService.sendToTopic` and `sendToTopicWithApproveButton` validate `topicId` is a finite integer before API calls; log clear diagnostic and return early on invalid
- [ ] **FIX-03**: `BudgetAlertPoller` persists `lastAlertedAt` per agent to SQLite and hydrates on startup, preventing false re-alerts after server restart

### Crash Detection & Auto-Restart

- [ ] **CRSH-01**: `InstanceTracker` distinguishes operator-initiated stops (session was in `'stopping'` state) from crashes (session was `'active'` or `'idle'` at last poll, tmux session now absent); uses `graceful_stop_marker` flag set atomically by Stop API
- [ ] **CRSH-02**: Crash events persisted to `session_lifecycle_events` SQLite table with session ID, agent ID, event type, timestamp, and outcome
- [ ] **CRSH-03**: Per-agent crash restart policy stored in `session_lifecycle_policy` SQLite table: `crash_restart_mode` (none/once/always); default `none`; configurable from dashboard
- [ ] **CRSH-04**: Auto-restart execution calls `TmuxSessionManager.spawnSession()` with saved project path when crash detected and policy allows; logs restart outcome to `session_lifecycle_events`
- [ ] **CRSH-05**: Restart storm rate limiter enforces maximum 3 restarts per hour per agent; after limit hit, flips `crash_restart_mode` to `none` and sends Telegram alert
- [ ] **CRSH-06**: Telegram notification sent on crash detection via existing notification pipeline, including agent name, session name, and crash timestamp

### Idle Timeout

- [ ] **IDLE-01**: Per-agent idle timeout stored in `session_lifecycle_policy` table: `idle_timeout_minutes` (nullable, null = disabled); default disabled; minimum configurable value 60 minutes
- [ ] **IDLE-02**: `NotificationPoller` tracks time-in-idle-state per session; when threshold exceeded and `idle_timeout_minutes` is set, auto-stops session with `stop_reason = 'idle-timeout'`
- [ ] **IDLE-03**: Idle timeout stop logged to `session_lifecycle_events` table with event type `idle-timeout`

### Quick-Launch Shortcuts

- [ ] **LNCH-01**: Dashboard derives launch shortcuts from `openclaw.json` agent configs combined with last-used project path per agent (from `instances` table); no explicit template CRUD
- [ ] **LNCH-02**: "New Session" button in dashboard opens agent picker showing available agents with their last-used project path; selecting one spawns a tmux session via existing start API
- [ ] **LNCH-03**: Quick-launch pre-fills agent ID and project path; operator can override project path before launch

### Lifecycle History

- [ ] **HIST-01**: Lifecycle events section in History view showing `session_lifecycle_events` (crashes, auto-restarts, idle-timeout stops) with agent, timestamp, event type, and outcome
- [ ] **HIST-02**: Lifecycle history filterable by agent and event type

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

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 36 | Pending |
| FIX-02 | Phase 36 | Pending |
| FIX-03 | Phase 36 | Pending |
| CRSH-01 | Phase 37 | Pending |
| CRSH-02 | Phase 37 | Pending |
| CRSH-03 | Phase 38 | Pending |
| CRSH-04 | Phase 38 | Pending |
| CRSH-05 | Phase 38 | Pending |
| CRSH-06 | Phase 37 | Pending |
| IDLE-01 | Phase 39 | Pending |
| IDLE-02 | Phase 39 | Pending |
| IDLE-03 | Phase 39 | Pending |
| LNCH-01 | Phase 39 | Pending |
| LNCH-02 | Phase 39 | Pending |
| LNCH-03 | Phase 39 | Pending |
| HIST-01 | Phase 40 | Pending |
| HIST-02 | Phase 40 | Pending |

**Coverage:**
- v3.4 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
