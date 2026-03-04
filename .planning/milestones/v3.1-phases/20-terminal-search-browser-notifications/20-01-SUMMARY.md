---
phase: 20-terminal-search-browser-notifications
plan: 01
subsystem: ui
tags: [xterm.js, xterm-addon-search, react, terminal-search, keyboard-shortcuts]

# Dependency graph
requires:
  - phase: 19-operator-awareness-wiring
    provides: terminalFocusRef pattern + useGlobalHotkeys Ctrl+F stub + searchOpenRef-ready architecture
provides:
  - xterm-addon-search@0.13.0 integrated with SearchAddon loaded in Terminal constructor
  - TerminalSearchOverlay component: floating top-right search bar with debounce, match count, navigation
  - overviewRulerWidth: 15 in Terminal constructor enabling scrollbar gutter markers
  - Ctrl+F keyboard shortcut wired end-to-end: useGlobalHotkeys → App.tsx → TerminalView → overlay
  - Search query persistence within session; auto-clear on session switch via key= remount
affects: [21-future-phases, browser-notifications-plan]

# Tech tracking
tech-stack:
  added: [xterm-addon-search@0.13.0]
  patterns:
    - "searchOpenRef MutableRefObject<(() => void) | null> pattern — mirrors terminalFocusRef for callback registration without state lifting"
    - "isInTextInput guard in useGlobalHotkeys prevents Escape double-handling when search input is focused"
    - "overviewRulerWidth must be set at Terminal construction time; cannot be added later"

key-files:
  created:
    - src/client/components/TerminalSearchOverlay.tsx
  modified:
    - package.json
    - package-lock.json
    - src/client/components/TerminalView.tsx
    - src/client/hooks/useGlobalHotkeys.ts
    - src/client/App.tsx

key-decisions:
  - "xterm-addon-search@0.13.0 (non-scoped) — project uses xterm@5.3.0 (non-scoped); @xterm/addon-search requires @xterm/xterm (scoped, incompatible)"
  - "searchOpenRef callback registration in TerminalView useEffect — mirrors terminalFocusRef pattern from Phase 19; avoids prop-drilling isSearchOpen state"
  - "Search query persists in TerminalView state across overlay close/reopen; resets automatically on session switch because TerminalView is keyed by tmuxSessionName"
  - "isInTextInput guard in useGlobalHotkeys prevents Escape from double-firing when search input has focus — overlay's onKeyDown handles Escape exclusively"
  - "onDidChangeResults subscription for match count — SearchAddon fires this after each search, providing resultIndex + resultCount without polling"
  - "300ms debounce on search query — research confirmed 50k+ scrollback blocks main thread ~470ms without limit; debounce prevents per-keystroke blocking"
  - "matchResultCount >= 1000 displays as 1000+ — SearchAddon highlightLimit default is 1000"

patterns-established:
  - "Callback ref pattern (searchOpenRef): external callers register callbacks via MutableRefObject without React state lifting"
  - "Search decoration constants module-scoped: single source of truth for yellow/orange match colors"
  - "Overlay close + rAF terminal focus: requestAnimationFrame(() => terminalFocusRef?.current?.()) after overlay unmount — browser returns focus to document.body without this"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 20 Plan 01: Terminal Scrollback Search Summary

**xterm-addon-search@0.13.0 with VS Code-style floating search bar: Ctrl+F opens overlay, 300ms debounced findNext/findPrevious, yellow/orange match highlighting, scrollbar gutter markers, match count display with 1000+ cap**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-03T20:54:34Z
- **Completed:** 2026-03-03T20:59:03Z
- **Tasks:** 2
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments

- Installed `xterm-addon-search@0.13.0` (non-scoped, compatible with project's `xterm@5.3.0`)
- Created `TerminalSearchOverlay` component with auto-focus, debounced search, match count in N/M format (1000+ cap), prev/next navigation, Escape to close, CSS slide-in animation
- Integrated `SearchAddon` into TerminalView's Terminal constructor with `overviewRulerWidth: 15` for scrollbar gutter markers
- Wired full Ctrl+F flow: `useGlobalHotkeys` → `App.handleOpenSearch` → `searchOpenRef.current()` → `TerminalView.setIsSearchOpen(true)`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SearchAddon + create TerminalSearchOverlay + integrate into TerminalView** - `b9c4231` (feat)
2. **Task 2: Wire Ctrl+F in useGlobalHotkeys and App.tsx** - `18775cd` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/client/components/TerminalSearchOverlay.tsx` - Floating search overlay; debounced findNext/findPrevious, onDidChangeResults for match count, Escape → onClose, slide-in CSS animation
- `src/client/components/TerminalView.tsx` - Added SearchAddon + overviewRulerWidth:15 in Terminal constructor; searchAddonRef + isSearchOpen/searchQuery state; searchOpenRef prop + useEffect registration; TerminalSearchOverlay conditional render
- `src/client/hooks/useGlobalHotkeys.ts` - onOpenSearch param; Ctrl+F handler calls onOpenSearch in terminals view; updated JSDoc; added onOpenSearch to dep array
- `src/client/App.tsx` - searchOpenRef + handleOpenSearch useCallback; passes onOpenSearch to useGlobalHotkeys and searchOpenRef to TerminalView
- `package.json` / `package-lock.json` - Added xterm-addon-search@0.13.0

## Decisions Made

- **xterm-addon-search@0.13.0 (non-scoped)**: Project imports from 'xterm' v5.3.0 (non-scoped). The scoped `@xterm/addon-search` peer-depends on `@xterm/xterm` (incompatible). Non-scoped package peer-deps `xterm: ^5.0.0` — confirmed with `npm show`.
- **searchOpenRef callback pattern**: Mirrors `terminalFocusRef` from Phase 19. App.tsx creates the ref, TerminalView registers the callback in a useEffect, App's `handleOpenSearch` calls `searchOpenRef.current?.()`. No state lifting required.
- **isInTextInput guard handles Escape correctly**: When search input has focus, `event.target` is an INPUT, so `useGlobalHotkeys` returns early. The overlay's own `onKeyDown` handles Escape exclusively — no conflicts.
- **Search query persists in TerminalView state**: `searchQuery` state in TerminalView persists across overlay close/reopen. On session switch, TerminalView remounts (keyed by `tmuxSessionName`), resetting state to `''` automatically.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `npm show xterm-addon-search@0.13.0 peerDependencies` pre-check confirmed `{ xterm: '^5.0.0' }` (not `@xterm/xterm`), validating the research finding before installation.

## User Setup Required

None - no external service configuration required. The search feature is fully functional in production build.

## Next Phase Readiness

- Terminal search is fully implemented and compiles with zero TypeScript errors
- Browser notifications (Phase 20 Plan 02) can proceed independently — no search dependencies
- The `searchOpenRef` pattern is proven and can be reused for other overlay-open callbacks if needed

---
*Phase: 20-terminal-search-browser-notifications*
*Completed: 2026-03-03*
