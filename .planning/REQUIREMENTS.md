# Requirements: Warden Dashboard

**Defined:** 2026-03-03
**Core Value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

## v3.0 Requirements

Requirements for v3.0 Operator Awareness & Terminal Power Tools. Each maps to roadmap phases.

### Operator Awareness

- [ ] **AWARE-01**: Operator sees a pulsing amber badge on the session tab when an agent is waiting for permission input
- [ ] **AWARE-02**: Badge clears automatically when operator sends input to the waiting session
- [ ] **AWARE-03**: Operator sees context window pressure percentage in the terminal view header for the active session
- [ ] **AWARE-04**: Context pressure badge shows green (<70%), amber (70-89%), or pulsing red (>=90%) based on threshold
- [ ] **AWARE-05**: Operator sees the agent state (working/idle/error/permission) as a chip in the terminal view header
- [ ] **AWARE-06**: Operator can opt in to browser notifications for permission prompts via a settings toggle
- [ ] **AWARE-07**: Browser notification fires when permission prompt is detected and the browser tab is not focused
- [ ] **AWARE-08**: Browser notification does not fire repeatedly while same permission state persists (state-transition only)

### Terminal Search

- [ ] **SRCH-01**: Operator can open a search overlay with Ctrl+F in the terminal view
- [ ] **SRCH-02**: Search finds and highlights matching text in the full terminal scrollback buffer (not just visible area)
- [ ] **SRCH-03**: Operator can navigate between matches with Next/Previous buttons or Enter/Shift+Enter
- [ ] **SRCH-04**: Search overlay shows match count ("3 / 47" or "1000+" for large result sets)
- [ ] **SRCH-05**: Scrollbar gutter markers indicate where matches appear in the buffer
- [ ] **SRCH-06**: Escape closes the search overlay and returns focus to the terminal
- [ ] **SRCH-07**: Search input debounces at 300ms to prevent UI blocking on large buffers

### Keyboard Navigation

- [ ] **KB-01**: Ctrl+1 through Ctrl+9 switch to the corresponding session tab by index
- [ ] **KB-02**: Ctrl+[ and Ctrl+] cycle through session tabs (previous/next)
- [ ] **KB-03**: Ctrl+B toggles the AgentSidebar collapsed/expanded
- [ ] **KB-04**: Escape focuses the terminal canvas when search overlay is not open
- [ ] **KB-05**: Keyboard shortcuts do not fire when focus is in a text input or textarea (focus guard)

## Future Requirements

Deferred to v3.1+. Tracked but not in current roadmap.

### Telegram Integration

- **TELE-01**: Permission prompt detections forwarded to operator's Telegram via OpenClaw Gateway topic mapping
- **TELE-02**: Critical context pressure events (>=90%) forwarded to Telegram

### Terminal Bookmarks

- **MARK-01**: Operator can set a bookmark at the current scroll position in terminal buffer
- **MARK-02**: Operator can navigate between bookmarks via keyboard shortcut or panel

### Search Enhancements

- **SRCH-08**: Operator can toggle regex mode in the search overlay
- **SRCH-09**: Search state persists across tab switches (re-highlights on tab return)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cross-session search (all buffers simultaneously) | Contradicts PTY keepalive design; each session has independent buffer |
| Auto-answering permission prompts | Removes the safety check that prompts provide |
| react-hotkeys-hook or external keyboard library | Custom useEffect is <50 LOC; no dependency justified |
| Raw PTY stream regex for permission detection | High false positive rate from ANSI-contaminated output; use detectAgentState() polling |
| Service Worker for notifications | Desktop-only operator use case; simple Notification API sufficient |
| Keyboard shortcut help overlay | Single-operator system; shortcuts documented in code |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AWARE-01 | Phase 19 | Pending |
| AWARE-02 | Phase 19 | Pending |
| AWARE-03 | Phase 19 | Pending |
| AWARE-04 | Phase 19 | Pending |
| AWARE-05 | Phase 19 | Pending |
| AWARE-06 | Phase 20 | Pending |
| AWARE-07 | Phase 20 | Pending |
| AWARE-08 | Phase 20 | Pending |
| SRCH-01 | Phase 20 | Pending |
| SRCH-02 | Phase 20 | Pending |
| SRCH-03 | Phase 20 | Pending |
| SRCH-04 | Phase 20 | Pending |
| SRCH-05 | Phase 20 | Pending |
| SRCH-06 | Phase 20 | Pending |
| SRCH-07 | Phase 20 | Pending |
| KB-01 | Phase 19 | Pending |
| KB-02 | Phase 19 | Pending |
| KB-03 | Phase 19 | Pending |
| KB-04 | Phase 19 | Pending |
| KB-05 | Phase 19 | Pending |

**Coverage:**
- v3.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 — traceability filled after roadmap creation (Phases 19-20)*
