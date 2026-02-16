# Requirements: Warden Dashboard v2.0

**Defined:** 2026-02-16
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v2.0 Requirements

Requirements for v2.0 Mission Control milestone. Each maps to roadmap phases.

### Plugin Registry

- [ ] **PLUG-01**: Operator can register tool modules with typed metadata (name, version, description, capabilities)
- [ ] **PLUG-02**: Operator can view a metadata table showing all registered plugins with status
- [ ] **PLUG-03**: Operator can enable/disable plugins via toggle
- [ ] **PLUG-04**: Plugin modules use build-time type-safe TypeScript registration
- [ ] **PLUG-05**: Plugins render as UI panels in designated layout slots (sidebar-top, sidebar-bottom, bottom-panel, terminal-overlay)
- [ ] **PLUG-06**: Plugin code, metadata, and UI are co-located in a single module file

### Activity Timeline

- [ ] **ACTV-01**: System captures structured events (session start/stop, prompt injections, operator terminal input) in SQLite
- [ ] **ACTV-02**: Operator can view chronological event list (newest first) in dedicated Activity view
- [ ] **ACTV-03**: Operator can view event detail panel with full metadata
- [ ] **ACTV-04**: Operator can filter activity by agent
- [ ] **ACTV-05**: Operator can filter activity by date range
- [ ] **ACTV-06**: Operator can filter activity by event type
- [ ] **ACTV-07**: Operator can export activity events to CSV or JSON
- [ ] **ACTV-08**: System parses terminal output to extract structured events (tool calls, file edits, commands)
- [ ] **ACTV-09**: Events show success/failure indicators (parsed from exit codes, error patterns)
- [ ] **ACTV-10**: Operator can click an event to jump to the terminal session at that timestamp

### Mobile UI

- [ ] **MOBI-01**: Dashboard renders full-width responsive layout from 375px to 1920px
- [ ] **MOBI-02**: Agent details, session logs, and token usage render as collapsible accordion panels
- [ ] **MOBI-03**: Prompt panel renders as bottom sheet on mobile (thumb-reachable)
- [ ] **MOBI-04**: Terminal supports touch scrolling on mobile
- [ ] **MOBI-05**: Layout uses mobile-first CSS with progressive enhancement via min-width breakpoints
- [ ] **MOBI-06**: Operator can swipe between session tabs and pinch-to-zoom terminal on mobile
- [ ] **MOBI-07**: All touch targets meet 44x44px minimum with safe area insets

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Plugin Ecosystem

- **PLUG-F01**: Auto-install plugins from a registry URL
- **PLUG-F02**: Plugin marketplace UI with search and ratings
- **PLUG-F03**: Plugin sandboxing with permission system

### Activity Timeline Advanced

- **ACTV-F01**: Real-time WebSocket streaming of activity events
- **ACTV-F02**: AI-powered event summarization
- **ACTV-F03**: Immutable audit log with cryptographic verification

## Out of Scope

| Feature | Reason |
|---------|--------|
| Plugin auto-install from public registry | Security risk, scope creep — single-user internal tool |
| Plugin marketplace | Requires hosting, moderation, legal complexity |
| AI event summarization | API costs, unreliable for audit purposes |
| Separate native mobile app | 3x dev cost, App Store distribution overhead |
| Predictive touch input (Mosh pattern) | High complexity, conflicts with Socket.IO transport |
| Blockchain-backed immutable logs | Massive overkill for single-user tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | — | Pending |
| PLUG-02 | — | Pending |
| PLUG-03 | — | Pending |
| PLUG-04 | — | Pending |
| PLUG-05 | — | Pending |
| PLUG-06 | — | Pending |
| ACTV-01 | — | Pending |
| ACTV-02 | — | Pending |
| ACTV-03 | — | Pending |
| ACTV-04 | — | Pending |
| ACTV-05 | — | Pending |
| ACTV-06 | — | Pending |
| ACTV-07 | — | Pending |
| ACTV-08 | — | Pending |
| ACTV-09 | — | Pending |
| ACTV-10 | — | Pending |
| MOBI-01 | — | Pending |
| MOBI-02 | — | Pending |
| MOBI-03 | — | Pending |
| MOBI-04 | — | Pending |
| MOBI-05 | — | Pending |
| MOBI-06 | — | Pending |
| MOBI-07 | — | Pending |

**Coverage:**
- v2.0 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23 (pending roadmap creation)

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
