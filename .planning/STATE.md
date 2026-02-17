# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Real-time visibility into all active Claude Code agent sessions from a single browser tab

**Current focus:** Phase 11.1 - Fix tmux visibility when mobile keyboard opens

## Current Position

Phase: 11.1 (Fix tmux visibility when mobile keyboard opens)
Plan: 1 of 1 in current phase
Status: Phase complete
Last activity: 2026-02-17 — Phase 11.1 plan 01 complete

Progress: [██████████] 100% (12/12 phases complete)

## Performance Metrics

**v1.0 MVP:**
- Phases: 6 (1-6)
- Plans: 9
- Commits: 32
- Files: 66
- LOC: 2,385 TypeScript
- Timeline: 2026-02-12 (single day)

**v1.1 UX Fixes & Prompt Panel:**
- Phases: 2 (7-8)
- Plans: 2
- Tasks: 4
- Commits: 14
- Files modified: 25
- LOC: 2,644 TypeScript (total src + tests)
- Timeline: 2026-02-12 (~2 hours)

**Completed Phases:**

| Phase | Description | Milestone | Commit |
|-------|-------------|-----------|--------|
| 1 | Core Infrastructure | v1.0 | `0341445` |
| 2 | Frontend Terminal UI | v1.0 | `e7e726a` |
| 3 | Agent Integration | v1.0 | `18337f8` |
| 4 | History & Analytics | v1.0 | `a5879f3` |
| 5 | Testing & Deployment | v1.0 | `46c87cb` |
| 6 | Close v1 Audit Gaps | v1.0 | `f669408` |
| 7 | Terminal Interactivity & Scrollback | v1.1 | `9f65d54` |
| 8 | Prompt Panel & Gateway Integration | v1.1 | `effa33c` |
| 9 | Plugin Registry Foundation | v2.0 | `918d6d5` |
| 10 | Mobile-First UI Restructure | v2.0 | `39eeea8` |
| 11 | Activity Timeline & Audit Log | v2.0 | `24306a0` |
| 11.1 | Fix tmux visibility when mobile keyboard opens | v2.0 | `b6e0de0` |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full list with outcomes.
Recent decisions affecting v2.0:

- v1.0: SRP service architecture — each service does one thing (applies to plugin system)
- v1.0: Always-interactive terminals — informs mobile terminal strategy decision
- v2.0: Plugin registry with build-time type-safe registration — avoid over-engineering
- v2.0: Vite import.meta.glob for auto-discovery — zero manual plugin registration
- v2.0: 185 LOC total for complete plugin system — under 200 LOC budget
- [Phase 11]: Inline ansi-regex@5 pattern instead of importing strip-ansi (CJS incompatible with ESM project)
- [Phase 11]: setImmediate for PTY output tap ensures zero terminal latency impact on event capture
- [Phase 11]: Operator input batched: flush on Enter or 2s inactivity (prevents per-keystroke event explosion)
- [Phase 11]: Activity tab placed first and default in HistoryView
- [Phase 11]: Export fetches full filtered dataset (limit=10000), not just current page
- [Phase 11.1-fix-tmux-visibility-when-mobile-keyboard-opens]: Use visualViewport API (not window.resize) for iOS keyboard detection in TerminalView and MobilePromptSheet
- [Phase 11.1-fix-tmux-visibility-when-mobile-keyboard-opens]: 100ms debounce + requestAnimationFrame on refitTerminal to prevent FitAddon collapse bug (xterm.js #5320)

### Quick Tasks Completed

| # | Description | Date | Commit |
|---|-------------|------|--------|
| 2 | Terminal auto-copy selection to clipboard with toast | 2026-02-12 | `3204868` |
| 3 | Mobile responsiveness, PTY dedup, URL hash routing, Alt+click, long-press copy | 2026-02-15 | `3c5e961` |
| 4 | iOS keyboard toolbar visibility & 3x scroll-down escape | 2026-02-15 | `c2d7756` |
| 5 | Move PromptPanel to sidebar for maximum terminal vertical space | 2026-02-16 | `8fc0c66` |

### Roadmap Evolution

- Phase 11.1 inserted after Phase 11: Fix tmux visibility when mobile keyboard opens (URGENT)

### Pending Todos

None

### Blockers/Concerns

**Phase 10 (Mobile UI) — deferred:**
- xterm.js mobile touch support is fundamentally broken (5+ year issue)
- Options: (1) read-only mobile terminal, (2) budget 2-3 weeks debugging, (3) defer mobile terminal
- Research flag: Needs testing on real iOS/Android devices before implementation

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 11.1-fix-tmux-visibility-when-mobile-keyboard-opens-01-PLAN.md
Next step: Phase 11.1 complete — all phases done
