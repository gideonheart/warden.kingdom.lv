---
phase: 20-terminal-search-browser-notifications
verified: 2026-03-03T21:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
human_verification:
  - test: "Press Ctrl+F in the terminal view"
    expected: "Search overlay slides in from top-right; browser native find bar does not open"
    why_human: "Browser event suppression behavior cannot be verified by static analysis alone"
  - test: "Type a search term with an active terminal session"
    expected: "Matches highlighted yellow (all) and orange (active); yellow gutter ticks appear on scrollbar track; match count updates to N / M format"
    why_human: "xterm.js rendering, SearchAddon decoration rendering, and overviewRuler gutter ticks require visual inspection in a live browser"
  - test: "Click the bell icon in terminal header for the first time (permission not yet granted)"
    expected: "Browser shows native permission prompt. After granting, bell icon turns accent color"
    why_human: "Notification.requestPermission() triggers a native browser dialog that cannot be exercised statically"
  - test: "With notifications enabled, switch away from the Warden tab, then trigger permission_prompt state in a session"
    expected: "Desktop notification appears with title 'Warden — Permission Required' and body showing the session name. Clicking the notification focuses the Warden tab and switches to the alerting session tab"
    why_human: "Browser tab focus/visibility state and OS-level notification delivery require a live browser session"
---

# Phase 20: Terminal Search + Browser Notifications Verification Report

**Phase Goal:** The operator can search the full terminal scrollback buffer in any session, see match count and gutter markers, navigate matches with keyboard or buttons, and optionally receive a browser notification when a permission prompt fires while the browser tab is not focused.
**Verified:** 2026-03-03T21:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pressing Ctrl+F in the terminal view opens a search overlay without triggering the browser's native find bar | VERIFIED | `useGlobalHotkeys.ts:70-76` calls `preventDefault` + `stopPropagation` + `onOpenSearch?.()` for Ctrl+F; xterm `attachCustomKeyEventHandler` at `TerminalView.tsx:360-362` also returns `false` to suppress PTY forwarding |
| 2 | Typing in the search overlay highlights matching text throughout the full terminal scrollback buffer | VERIFIED | `TerminalSearchOverlay.tsx:83-86` calls `searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATIONS })` after 300ms debounce; SearchAddon searches full scrollback |
| 3 | Search overlay shows match count in N / M format; displays 1000+ when resultCount >= 1000 | VERIFIED | `TerminalSearchOverlay.tsx:138-143` — `matchCountDisplay()` returns `"${resultIndex+1} / 1000+"` when `matchResultCount >= 1000`, else `"${activeIndex} / ${resultCount}"` |
| 4 | Yellow gutter markers appear on the scrollbar track at match positions | VERIFIED | `TerminalView.tsx:341` sets `overviewRulerWidth: 15` at Terminal construction time; `SEARCH_DECORATIONS.matchOverviewRuler: '#f59e0b'` and `activeMatchColorOverviewRuler: '#f97316'` in `TerminalSearchOverlay.tsx:9,12` |
| 5 | Enter navigates to next match; Shift+Enter navigates to previous match; Next/Previous buttons work identically | VERIFIED | `TerminalSearchOverlay.tsx:119-126` handles Enter/Shift+Enter; `findNext`/`findPrevious` buttons at lines 165-178 |
| 6 | Escape closes the search overlay and returns keyboard focus to the terminal canvas | VERIFIED | `TerminalSearchOverlay.tsx:126-130` — Escape calls `handleClose()`; `handleClose` calls `onClose()` + `requestAnimationFrame(() => terminalFocusRef?.current?.())` at lines 101-106; `isInTextInput` guard in `useGlobalHotkeys.ts:52` prevents double-handling |
| 7 | Search input is debounced at 300ms so rapid typing does not block the UI | VERIFIED | `TerminalSearchOverlay.tsx:83-89` — 300ms `setTimeout` with cleanup |
| 8 | A bell icon toggle in the terminal header bar lets the operator opt in to browser notifications | VERIFIED | `TerminalView.tsx:617-639` — SVG bell button renders when `notificationPermission !== 'unsupported'`; styled with accent color when enabled |
| 9 | Toggle state persists in localStorage across page reloads | VERIFIED | `useBrowserNotifications.ts:39-45` initializes from `localStorage.getItem(NOTIFICATION_STORAGE_KEY)`; written on every toggle at lines 107, 117, 127 |
| 10 | When opted in and browser tab is unfocused, a notification fires when an agent enters permission state | VERIFIED | `useBrowserNotifications.ts:74-86` — `document.visibilityState === 'hidden'` guard + `new Notification(...)` call |
| 11 | Notification does not repeat while the same agent stays in permission state (state-transition only) | VERIFIED | `useBrowserNotifications.ts:56,72,90` — `permissionStateSessionsRef.current` Set tracks current permission sessions; notification fires only when `!permissionStateSessionsRef.current.has(sessionName)` |
| 12 | Clicking the notification focuses the Warden browser tab and switches to the alerting agent's session tab | VERIFIED | `useBrowserNotifications.ts:80-84` — `notification.onclick` calls `window.focus()` + `onSelectSession(sessionName)` + `notification.close()` |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/client/components/TerminalSearchOverlay.tsx` | Floating search overlay UI with input, match count, prev/next buttons | VERIFIED | 190 lines (min_lines: 80 met); contains floating overlay, debounced search, `onDidChangeResults` subscription, navigation, Escape close |
| `src/client/components/TerminalView.tsx` | SearchAddon lifecycle, overviewRulerWidth, searchAddonRef, search open/close state | VERIFIED | `overviewRulerWidth: 15` at line 341; `SearchAddon` loaded at lines 348-350; `searchAddonRef`, `isSearchOpen`, `searchQuery` state at lines 205-207; `searchOpenRef` registration at lines 593-599 |
| `src/client/hooks/useGlobalHotkeys.ts` | Ctrl+F handler wired to onOpenSearch callback | VERIFIED | `onOpenSearch?: () => void` in interface at line 13; handler calls `onOpenSearch?.()` at line 74; listed in dep array at line 128 |
| `src/client/hooks/useBrowserNotifications.ts` | Browser notification hook with opt-in toggle, state-transition detection, localStorage persistence | VERIFIED | 135 lines (min_lines: 50 met); contains all three features |
| `src/client/App.tsx` | useBrowserNotifications wired with sessionStatusMap and activeInstances | VERIFIED | Import at line 19; called at lines 174-178; all three return values passed to TerminalView at lines 365-367 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useGlobalHotkeys.ts` | `App.tsx` | `onOpenSearch` callback in `UseGlobalHotkeysParams` | WIRED | `App.tsx:168` passes `onOpenSearch: handleOpenSearch`; handler calls `searchOpenRef.current?.()` |
| `TerminalView.tsx` | `TerminalSearchOverlay.tsx` | `searchAddonRef` passed as prop; `isSearchOpen` controls render | WIRED | `TerminalView.tsx:657-665` renders `<TerminalSearchOverlay searchAddonRef={searchAddonRef} .../>` when `isSearchOpen` is true |
| `TerminalSearchOverlay.tsx` | `xterm-addon-search` | `searchAddonRef.current.findNext/findPrevious/onDidChangeResults` | WIRED | All three API methods called at lines 63, 84, 110, 115 |
| `App.tsx` | `useBrowserNotifications.ts` | `useBrowserNotifications` hook consuming `sessionStatusMap` | WIRED | `App.tsx:174` destructures `{ notificationsEnabled, toggleNotifications, notificationPermission }` |
| `useBrowserNotifications.ts` | Notification API | `new Notification()` with tag-based deduplication | WIRED | `useBrowserNotifications.ts:75` — `new Notification('Warden — Permission Required', { tag: \`warden-permission-${sessionName}\` })` |
| `App.tsx` | `TerminalView.tsx` | `notificationsEnabled` + `toggleNotifications` props | WIRED | `App.tsx:365-367` passes all three notification props; `TerminalView.tsx:617` renders bell button conditionally |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SRCH-01 | 20-01 | Operator can open a search overlay with Ctrl+F in the terminal view | SATISFIED | `useGlobalHotkeys.ts:70-76`; `TerminalView.tsx:593-599`; overlay renders at `TerminalView.tsx:657` |
| SRCH-02 | 20-01 | Search finds and highlights matching text in the full terminal scrollback buffer | SATISFIED | SearchAddon operates on full `scrollback: 5000` buffer; `findNext` with decorations in `TerminalSearchOverlay.tsx:84` |
| SRCH-03 | 20-01 | Operator can navigate between matches with Next/Previous buttons or Enter/Shift+Enter | SATISFIED | Buttons at `TerminalSearchOverlay.tsx:165-178`; keyboard at lines 119-126 |
| SRCH-04 | 20-01 | Search overlay shows match count ("3 / 47" or "1000+" for large result sets) | SATISFIED | `matchCountDisplay()` at `TerminalSearchOverlay.tsx:138-143` |
| SRCH-05 | 20-01 | Scrollbar gutter markers indicate where matches appear in the buffer | SATISFIED | `overviewRulerWidth: 15` at `TerminalView.tsx:341`; `matchOverviewRuler: '#f59e0b'` in `TerminalSearchOverlay.tsx:9` |
| SRCH-06 | 20-01 | Escape closes the search overlay and returns focus to the terminal | SATISFIED | `TerminalSearchOverlay.tsx:126-130`; `handleClose` with `requestAnimationFrame` at lines 101-106 |
| SRCH-07 | 20-01 | Search input debounces at 300ms to prevent UI blocking on large buffers | SATISFIED | `TerminalSearchOverlay.tsx:83-89` — 300ms `setTimeout` |
| AWARE-06 | 20-02 | Operator can opt in to browser notifications for permission prompts via a settings toggle | SATISFIED | Bell icon button at `TerminalView.tsx:617-639`; `toggleNotifications` callback in `useBrowserNotifications.ts:95-132` |
| AWARE-07 | 20-02 | Browser notification fires when permission prompt is detected and the browser tab is not focused | SATISFIED | `useBrowserNotifications.ts:74-86` — `document.visibilityState === 'hidden'` + `new Notification()` |
| AWARE-08 | 20-02 | Browser notification does not fire repeatedly while same permission state persists (state-transition only) | SATISFIED | `permissionStateSessionsRef` Set at `useBrowserNotifications.ts:56,72,90` |

All 10 requirement IDs from PLAN frontmatter (SRCH-01 through SRCH-07, AWARE-06 through AWARE-08) are satisfied. No orphaned requirements found in REQUIREMENTS.md — all 10 are marked `[x]` at Phase 20.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `TerminalSearchOverlay.tsx` | 157 | `placeholder="Search terminal..."` | INFO | HTML input placeholder attribute — not a stub; expected UI pattern |

No blockers or warnings found. The single match above is an HTML `placeholder` attribute on an `<input>` element, which is correct UI behavior.

---

## Human Verification Required

### 1. Ctrl+F opens overlay without browser native find bar

**Test:** With Warden running and a terminal session active, press Ctrl+F.
**Expected:** The floating search overlay slides in from the top-right of the terminal pane. The browser's native find bar does NOT open.
**Why human:** `preventDefault()` and `stopPropagation()` suppress the browser behavior, but confirmation requires a live browser session.

### 2. Search highlights and gutter markers render correctly

**Test:** With the search overlay open, type a string that appears multiple times in the terminal buffer.
**Expected:** All matches are highlighted yellow; the active match is orange; yellow tick marks appear on the scrollbar gutter; match count shows "N / M" format (or "N / 1000+" when over the limit).
**Why human:** xterm.js rendering, SearchAddon decoration rendering, and the overviewRuler canvas require visual inspection.

### 3. Bell icon triggers permission prompt on first click

**Test:** Click the bell icon in the terminal header when browser notification permission has not been granted yet.
**Expected:** The browser shows a native notification permission prompt. After granting, the bell icon changes to accent color.
**Why human:** `Notification.requestPermission()` triggers a native browser dialog that cannot be exercised by static analysis.

### 4. Desktop notification fires and routes correctly when tab is unfocused

**Test:** Enable notifications, switch to a different browser tab, then trigger a `permission_prompt` state in an agent session.
**Expected:** A desktop notification appears with title "Warden — Permission Required" and the session name in the body. Clicking it brings focus to the Warden tab and switches to the alerting session.
**Why human:** OS-level notification delivery and browser tab focus behavior require a live end-to-end test.

---

## Summary

Phase 20 goal is fully achieved. All 12 observable truths are verified against the actual codebase:

**Terminal Search (SRCH-01 through SRCH-07):** `TerminalSearchOverlay.tsx` is a fully substantive 190-line component — not a placeholder — with debounced `findNext/findPrevious`, `onDidChangeResults` subscription for live match counts, yellow/orange decoration constants, keyboard handler (Enter/Shift+Enter/Escape), and CSS slide-in animation. `overviewRulerWidth: 15` is set at Terminal construction time in `TerminalView.tsx` as required. The full Ctrl+F wiring chain is confirmed: `useGlobalHotkeys` intercepts Ctrl+F in capture phase → calls `handleOpenSearch` in `App.tsx` → invokes `searchOpenRef.current()` → `TerminalView.setIsSearchOpen(true)` → renders overlay.

**Browser Notifications (AWARE-06 through AWARE-08):** `useBrowserNotifications.ts` is a substantive 135-line hook with localStorage-persisted opt-in, `permissionStateSessionsRef` Set for state-transition detection (fires only on entry, not while sustained), `document.visibilityState === 'hidden'` guard, tag-based deduplication, and `notification.onclick` wired to `onSelectSession`. The bell icon is correctly rendered in `TerminalView.tsx` with three visual states (enabled/disabled/denied) and is hidden entirely when `notificationPermission === 'unsupported'`.

**Build:** Production build succeeds with zero TypeScript errors. All four phase commits (b9c4231, 18775cd, 272093e, 797ff01) are confirmed in git history.

Four items require human verification in a live browser (visual rendering, native browser dialogs, OS notifications) — these cannot be confirmed programmatically.

---

_Verified: 2026-03-03T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
