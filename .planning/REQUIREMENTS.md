# Requirements: Warden Dashboard

**Defined:** 2026-03-04
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.2 Requirements

Requirements for v3.2 Mobile Operations & UX Polish. Each maps to roadmap phases.

### Mobile Toolbar

- [x] **MOB-01**: User can tap Enter button in mobile terminal toolbar to submit commands
- [x] **MOB-02**: Soft keyboard stays open when user taps any toolbar button (Enter, Tab, Esc, Ctrl+C, arrows, PgUp/PgDn, Copy, Paste)

### Session Navigation

- [x] **NAV-01**: User can tap a history session row to navigate to its live terminal (if session is active)
- [x] **NAV-02**: User can tap a history session row to open recording replay (if session is stopped and recording exists)
- [x] **NAV-03**: User sees explanatory feedback when tapping a stopped session with no recording available

### Auto-Record

- [x] **REC-05**: User can enable auto-record per agent via toggle in recording library UI
- [x] **REC-06**: Sessions for auto-record-enabled agents begin recording automatically on creation (first frame captured)

### Storage Rotation

- [x] **ROT-01**: Operator can set a maximum total storage cap for recordings (configurable in MB/GB)
- [x] **ROT-02**: System auto-deletes oldest recordings when storage cap is exceeded (two-phase deletion, safe for concurrent playback)
- [ ] **ROT-03**: Storage rotation UI shows current usage stats and manual prune button in recording library

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Auto-Record (Advanced)

- **REC-07**: Auto-record triggers on permission prompt detection (depends on detectAgentState reliability)
- **REC-08**: Streaming write mode for frame buffer (prevents OOM on long sessions)

### Session Navigation (Advanced)

- **NAV-04**: Events tab row click navigates to relevant session's terminal

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Telegram permission prompt forwarding | Agents run --dangerously-skip-permissions; no prompts to forward |
| detectAgentState() rewrite | Regex heuristics fragile but functional; not blocking v3.2 features |
| Recording external sharing (S3, asciinema.org) | Out of scope for single-operator tool |
| VirtualKeyboard API usage | Chrome 94+ only; not available on iOS Safari which is the primary target |
| Recording library pagination | Not needed at current scale; track for v3.3 if recording count exceeds 200 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOB-01 | Phase 28 | Complete |
| MOB-02 | Phase 28 | Complete |
| NAV-01 | Phase 29 | Complete |
| NAV-02 | Phase 29 | Complete |
| NAV-03 | Phase 29 | Complete |
| REC-05 | Phase 30 | Complete |
| REC-06 | Phase 30 | Complete |
| ROT-01 | Phase 31 | Complete |
| ROT-02 | Phase 31 | Complete |
| ROT-03 | Phase 31 | Pending |

**Coverage:**
- v3.2 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap creation (Phases 28-31)*
