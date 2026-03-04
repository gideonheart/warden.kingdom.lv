# Requirements: Warden Dashboard

**Defined:** 2026-03-04
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.3 Requirements

Requirements for Telegram Operator Awareness milestone. Each maps to roadmap phases.

### Bot Foundation

- [x] **BOT-01**: Warden runs its own Telegram bot client using grammy with long polling
- [x] **BOT-02**: Bot token loaded from environment variable, never logged or committed
- [x] **BOT-03**: Bot starts on server boot and stops gracefully on shutdown (SIGTERM/SIGINT)
- [x] **BOT-04**: Bot handles Telegram API rate limits with auto-retry

### Permission Notifications

- [ ] **PERM-01**: Operator receives Telegram notification when any agent enters permission prompt state
- [ ] **PERM-02**: Notification sent to agent's configured Telegram topic with pane excerpt (ANSI-stripped)
- [ ] **PERM-03**: Detection runs via tmux capture-pane polling (works without browser open)
- [ ] **PERM-04**: Only state transitions trigger notifications (entering permission state, not sustained)
- [ ] **PERM-05**: Duplicate notifications suppressed within configurable cooldown (default 2 min)

### One-Tap Approve

- [ ] **APRV-01**: Permission notification includes inline keyboard Approve button
- [ ] **APRV-02**: Tapping Approve sends input to agent's tmux session to unblock it
- [ ] **APRV-03**: Only configured operator Telegram user ID can trigger approve action
- [ ] **APRV-04**: Approve button removed from message after processing (edit-after-approve)
- [ ] **APRV-05**: Approval requests expire after configurable timeout (default 15 min)

### Budget Alerts

- [ ] **BUDG-01**: Operator receives Telegram notification when agent reaches budget threshold (amber/red)
- [ ] **BUDG-02**: Budget notifications suppressed within separate cooldown (default 10 min)

### Notification Settings

- [ ] **NSET-01**: Dashboard panel with toggles per notification type (permission prompts, budget alerts)
- [ ] **NSET-02**: Configurable cooldown windows per notification type in settings panel
- [ ] **NSET-03**: Notification preferences persisted in SQLite notification_config table

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notification Enhancements

- **PERM-06**: Deny button (send Ctrl+C to agent) alongside Approve
- **PERM-07**: Agent lifecycle notifications (started/stopped/errored) to Telegram
- **NSET-04**: Per-agent notification preferences (enable/disable notifications per agent)
- **BUDG-03**: Per-agent budget alert routing to different Telegram topics

## Out of Scope

| Feature | Reason |
|---------|--------|
| Telegram bot management | OpenClaw gateway manages the main bot; Warden runs a separate notification-only bot |
| Webhook mode for Telegram | Long polling sufficient for always-on server; webhook adds Nginx complexity |
| Multi-user approve authorization | Single operator (IP-whitelisted); operator ID verification sufficient |
| Rich media in notifications | Text + inline keyboard sufficient; no images/files needed |
| Notification history view | Dashboard already has events tab; Telegram chat is the history |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BOT-01 | Phase 32 | Complete |
| BOT-02 | Phase 32 | Complete |
| BOT-03 | Phase 32 | Complete |
| BOT-04 | Phase 32 | Complete |
| PERM-01 | Phase 33 | Pending |
| PERM-02 | Phase 33 | Pending |
| PERM-03 | Phase 33 | Pending |
| PERM-04 | Phase 33 | Pending |
| PERM-05 | Phase 33 | Pending |
| APRV-01 | Phase 34 | Pending |
| APRV-02 | Phase 34 | Pending |
| APRV-03 | Phase 34 | Pending |
| APRV-04 | Phase 34 | Pending |
| APRV-05 | Phase 34 | Pending |
| BUDG-01 | Phase 35 | Pending |
| BUDG-02 | Phase 35 | Pending |
| NSET-01 | Phase 35 | Pending |
| NSET-02 | Phase 35 | Pending |
| NSET-03 | Phase 35 | Pending |

**Coverage:**
- v3.3 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap creation (Phases 32-35)*
