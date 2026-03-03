---
phase: 19-operator-awareness-wiring
verified: 2026-03-03T20:30:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
human_verification:
  - test: "Open dashboard with an agent in permission_prompt state, verify amber pulsing dot on tab"
    expected: "A 2x2 amber circle with css animate-pulse appears at top-right of the tab"
    why_human: "Requires a live tmux session in permission_prompt state to trigger detection"
  - test: "Ctrl+1 selects first tab without sending ^1 to the PTY"
    expected: "Tab changes; terminal content does not receive a stray ^1 character"
    why_human: "Requires live PTY session to observe whether escape sequence reaches the shell"
  - test: "Ctrl+[ and Ctrl+] cycle tabs with wrap-around"
    expected: "First tab wraps to last (Ctrl+[); last tab wraps to first (Ctrl+])"
    why_human: "Requires multiple live sessions to exercise wrap boundary"
  - test: "Ctrl+B toggles AgentSidebar; Ctrl+F does not open browser find bar"
    expected: "Sidebar collapses/expands; no browser native find bar appears"
    why_human: "Browser UI behavior; cannot inspect browser chrome programmatically"
  - test: "Escape refocuses terminal when focus is on a button; Escape still works in vim/less"
    expected: "Focus returns to xterm canvas; TUI Escape key is not consumed by the hook"
    why_human: "Requires focus state and live TUI session to verify non-interference"
  - test: "Typing in PromptPanel textarea does not trigger keyboard shortcuts"
    expected: "Ctrl+1, Ctrl+], Ctrl+B do not fire when cursor is in the textarea"
    why_human: "Focus guard behavior requires manual interaction with the textarea"
---

# Phase 19: Operator Awareness Wiring — Verification Report

**Phase Goal:** The operator can see every agent's state at a glance — permission prompts surface as pulsing amber tab badges, context pressure is visible in the terminal header with color-coded thresholds, the agent state chip shows current working/idle/error/permission state, and keyboard shortcuts enable navigation without touching the mouse.

**Verified:** 2026-03-03T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 01 Truths (AWARE-01 through AWARE-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When an agent is in permission_prompt state, a pulsing amber dot appears on its tab | VERIFIED | `InstanceTabBar.tsx:48,59-65`: `hasPermissionBadge = agentStatus?.state === 'permission_prompt'`; renders `<span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warden-warning animate-pulse" />` |
| 2 | Permission dot disappears on next poll cycle when agent leaves permission state | VERIFIED | Badge is derived live from `sessionStatusMap?.get(instance.tmuxSessionName)` every render; no sticky local state for the badge; `useAgentLiveStatus` polls every 5s and updates the Map only when data changes |
| 3 | Terminal header shows context pressure percentage with correct color thresholds: green <70%, amber 70-89%, pulsing red >=90% | VERIFIED | `gsdRoutes.ts:54`: `percentage >= 90 ? 'critical' : percentage >= 70 ? 'warning' : 'ok'`; `TerminalView.tsx:46-51`: `headerPressureText` applies `PRESSURE_COLORS[level]` + `animate-pulse` for critical |
| 4 | Terminal header shows em-dash when pressure data is unavailable | VERIFIED | `TerminalView.tsx:47`: `if (percentage === null) return <span className="text-[10px] text-warden-text-dim">—</span>` |
| 5 | Terminal header shows agent state chip (working/idle/permission/error) from StateBadge component | VERIFIED | `TerminalView.tsx:8,570-574`: imports `StateBadge` from `gsdShared.tsx`; renders `<StateBadge state={agentLiveStatus.state} />` inside the header right-side flex div |
| 6 | State chip and pressure are grouped on right side: state chip, pressure, divider, font button | VERIFIED | `TerminalView.tsx:567-583`: right-side `<div className="flex items-center gap-2">` contains StateBadge, headerPressureText, `<span className="w-px h-3 bg-warden-border/50" />`, then the Aa font button — exact order matches spec |

#### Plan 02 Truths (KB-01 through KB-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | Ctrl+1 through Ctrl+9 switch to the corresponding session tab by 1-based index; out-of-range silently ignored | VERIFIED | `useGlobalHotkeys.ts:79-88`: parses `event.key` as digit 1-9, calls `onSelectSession(instances[digit-1].tmuxSessionName)` only if `instances[digit-1]` exists; no-op otherwise |
| 8 | Ctrl+[ cycles to previous tab with wrap-around (first wraps to last) | VERIFIED | `useGlobalHotkeys.ts:91-98`: `prevIndex = currentIndex <= 0 ? instances.length - 1 : currentIndex - 1`; also checks `event.code === 'BracketLeft'` |
| 9 | Ctrl+] cycles to next tab with wrap-around (last wraps to first) | VERIFIED | `useGlobalHotkeys.ts:101-109`: `nextIndex = currentIndex === -1 || currentIndex >= instances.length - 1 ? 0 : currentIndex + 1`; also checks `event.code === 'BracketRight'` |
| 10 | Ctrl+B toggles the AgentSidebar collapsed/expanded | VERIFIED | `useGlobalHotkeys.ts:69-73`: calls `onToggleSidebar()`; `App.tsx:73-75`: `handleToggleSidebar = useCallback(() => setShowSidebar(prev => !prev), [])` passed as `onToggleSidebar` |
| 11 | Escape focuses the terminal canvas when it does not already have focus and search overlay is not open | VERIFIED | `useGlobalHotkeys.ts:51-57`: checks `!document.activeElement?.closest('.xterm')`; calls `terminalFocusRef.current?.()` if not focused; does NOT call preventDefault/stopPropagation |
| 12 | Ctrl+F prevents the browser native find bar and does nothing else (stub for Phase 20) | VERIFIED | `useGlobalHotkeys.ts:62-65`: `event.preventDefault(); event.stopPropagation(); return;` — no search overlay opened |
| 13 | Keyboard shortcuts do not fire when the cursor is inside a text input, textarea, or contentEditable element | VERIFIED | `useGlobalHotkeys.ts:46`: `if (isInTextInput(event.target)) return;`; `isInTextInput` checks `INPUT`, `TEXTAREA`, `isContentEditable` |
| 14 | Keyboard shortcuts do not send escape sequences to the PTY when the terminal canvas has focus | VERIFIED | `TerminalView.tsx:328-346`: `attachCustomKeyEventHandler` returns `false` for Ctrl+F, Ctrl+B, Ctrl+1-9, Ctrl+[, Ctrl+]; Escape explicitly excluded from suppression |

**Score:** 14/14 truths verified (automated checks)

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|----------|----------|-----------------|----------------------|----------------|--------|
| `src/server/routes/gsdRoutes.ts` | Tightened permission regex + corrected pressure thresholds (90/70) | Yes | Contains `Do you want to proceed` (line 31) and `percentage >= 90 ? 'critical' : percentage >= 70` (line 54) | Mounted via server entry point (pre-existing) | VERIFIED |
| `src/client/App.tsx` | useAgentLiveStatus call + sessionStatusMap useMemo + props to InstanceTabBar and TerminalView | Yes | Contains `useAgentLiveStatus` (line 55), `sessionStatusMap` useMemo (lines 58-67), `useGlobalHotkeys` (line 147) | All hooks called at render time; props passed on lines 318 and 338-340 | VERIFIED |
| `src/client/components/InstanceTabBar.tsx` | Permission badge amber dot on tab when state === permission_prompt | Yes | Contains `animate-pulse` (line 61), `hasPermissionBadge` logic (lines 47-48), renders conditional `<span>` (lines 59-65) | Receives `sessionStatusMap` prop from App.tsx (line 318) | VERIFIED |
| `src/client/components/TerminalView.tsx` | State chip + context pressure in terminal header + terminalFocusRef pattern | Yes | Contains `StateBadge` import (line 8), `headerPressureText` function (lines 46-51), renders in header (lines 568-574), focus registration useEffect (lines 548-558), `attachCustomKeyEventHandler` (lines 328-346) | Receives `agentLiveStatus` and `terminalFocusRef` from App.tsx (lines 338-340) | VERIFIED |

### Plan 02 Artifacts

| Artifact | Expected | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|----------|----------|-----------------|----------------------|----------------|--------|
| `src/client/hooks/useGlobalHotkeys.ts` | Global keyboard shortcut hook with focus guard and capture-phase registration | Yes (created) | 119 lines; contains `isInTextInput`, all 6 shortcut handlers, `{ capture: true }` registration (line 113) | Imported and called in App.tsx (lines 18, 147-154) | VERIFIED |
| `src/client/App.tsx` | useGlobalHotkeys wired with instances, selection, sidebar toggle, terminal focus | Yes | Contains `useGlobalHotkeys(` (line 147) with all required params | `handleToggleSidebar` useCallback on line 73; `terminalFocusRef` on line 70 | VERIFIED |
| `src/client/components/TerminalView.tsx` | attachCustomKeyEventHandler suppressing Ctrl+1-9, Ctrl+[/], Ctrl+B, Ctrl+F from PTY | Yes | `attachCustomKeyEventHandler` at line 328; blocks all 4 key groups; Escape not suppressed | Called inside terminal init useEffect (line 292) — fires every time terminal is created | VERIFIED |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `App.tsx` | `hooks/useAgentLiveStatus.ts` | `useAgentLiveStatus()` call | WIRED | `App.tsx:16-17` imports type and hook; line 55: `const liveStatus = useAgentLiveStatus()` |
| `App.tsx` | `components/InstanceTabBar.tsx` | `sessionStatusMap=` prop | WIRED | `App.tsx:318`: `sessionStatusMap={sessionStatusMap}` passed to `<InstanceTabBar>` |
| `App.tsx` | `components/TerminalView.tsx` | `agentLiveStatus=` prop | WIRED | `App.tsx:338`: `agentLiveStatus={sessionStatusMap.get(selectedSessionName ?? '') ?? null}` |

### Plan 02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `hooks/useGlobalHotkeys.ts` | `document` | `addEventListener('keydown', ..., { capture: true })` | WIRED | `useGlobalHotkeys.ts:113`: `document.addEventListener('keydown', handleKeyDown, { capture: true })` |
| `App.tsx` | `hooks/useGlobalHotkeys.ts` | `useGlobalHotkeys(` call | WIRED | `App.tsx:18`: import; `App.tsx:147-154`: call with all params |
| `TerminalView.tsx` | xterm.js | `attachCustomKeyEventHandler` returning false | WIRED | `TerminalView.tsx:328-346`: handler installed on `terminal` instance inside the init useEffect |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AWARE-01 | 19-01-PLAN | Pulsing amber badge on tab when agent waiting for permission input | SATISFIED | `InstanceTabBar.tsx:59-65`: conditional `<span>` with `bg-warden-warning animate-pulse` |
| AWARE-02 | 19-01-PLAN | Badge clears automatically when agent leaves permission state | SATISFIED | Badge derived from live poll data each render — no sticky state; poll interval is 5s |
| AWARE-03 | 19-01-PLAN | Context window pressure percentage in terminal view header | SATISFIED | `TerminalView.tsx:571`: `{headerPressureText(agentLiveStatus.contextPressure, agentLiveStatus.contextPressureLevel)}` |
| AWARE-04 | 19-01-PLAN | Context pressure badge: green (<70%), amber (70-89%), pulsing red (>=90%) | SATISFIED | `gsdRoutes.ts:54`: thresholds 90/70; `TerminalView.tsx:49-50`: `PRESSURE_COLORS[level]` + conditional `animate-pulse` for critical |
| AWARE-05 | 19-01-PLAN | Agent state chip (working/idle/error/permission) in terminal view header | SATISFIED | `TerminalView.tsx:570`: `<StateBadge state={agentLiveStatus.state} />` in header |
| KB-01 | 19-02-PLAN | Ctrl+1 through Ctrl+9 switch to corresponding session tab by index | SATISFIED | `useGlobalHotkeys.ts:79-88` |
| KB-02 | 19-02-PLAN | Ctrl+[ and Ctrl+] cycle through session tabs (previous/next) | SATISFIED | `useGlobalHotkeys.ts:91-109` |
| KB-03 | 19-02-PLAN | Ctrl+B toggles the AgentSidebar collapsed/expanded | SATISFIED | `useGlobalHotkeys.ts:69-73` + `App.tsx:73-75` |
| KB-04 | 19-02-PLAN | Escape focuses the terminal canvas when search overlay is not open | SATISFIED | `useGlobalHotkeys.ts:51-57` |
| KB-05 | 19-02-PLAN | Keyboard shortcuts do not fire when focus is in a text input or textarea | SATISFIED | `useGlobalHotkeys.ts:46`: `isInTextInput` guard |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps AWARE-01 through AWARE-05 and KB-01 through KB-05 to Phase 19. All 10 IDs are claimed by plans 01 and 02. No orphaned requirements.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `TerminalView.tsx` | 108 | `placeholder="Tap and paste here"` | Info | HTML input placeholder attribute — this is correct UX usage, not a stub anti-pattern |

No blockers or warnings found. The single "placeholder" hit is an HTML `placeholder` attribute on a `<textarea>` input element in the mobile paste UI — not a code stub.

---

## Build Verification

Production build succeeds with no TypeScript errors:

```
vite v6.4.1 building for production...
102 modules transformed.
dist/client/assets/index-5x2R06mk.js  608.12 kB
built in 6.00s
```

The chunk size warning is pre-existing (xterm.js bundle) and unrelated to Phase 19.

---

## Commit Verification

All four phase commits exist in git log:

- `25ef7e3` — fix(19-01): tighten permission regex and correct pressure thresholds
- `348987f` — feat(19-01): wire useAgentLiveStatus to UI — permission badge, state chip, pressure
- `e394e86` — feat(19-02): add useGlobalHotkeys hook and wire in App.tsx
- `497f453` — feat(19-02): add attachCustomKeyEventHandler for PTY key suppression in TerminalView

---

## Human Verification Required

These items require live browser interaction to confirm. All automated checks passed.

### 1. Permission badge visual appearance

**Test:** Start a Claude Code session that shows a permission prompt ("Do you want to proceed?" or "1. Yes"). Open dashboard in browser, observe the tab for that session.
**Expected:** A small amber pulsing dot appears at top-right of the tab. Dot disappears within 5s after sending input to dismiss the prompt.
**Why human:** Requires a real tmux session in permission_prompt state to trigger detection.

### 2. Ctrl+1-9 tab switch without PTY injection

**Test:** With two or more active sessions in the Terminals view, press Ctrl+1 while the terminal canvas has keyboard focus.
**Expected:** Tab switches to the first session; the terminal does not receive a `^1` character.
**Why human:** PTY escape sequence injection is not visible in source code — requires live terminal observation.

### 3. Ctrl+[ and Ctrl+] wrap-around cycling

**Test:** With three or more active sessions, press Ctrl+] repeatedly until the last tab, then press Ctrl+] once more.
**Expected:** Selection wraps to the first tab.
**Why human:** Requires multiple live sessions.

### 4. Ctrl+B sidebar toggle and Ctrl+F suppression

**Test:** Press Ctrl+B; press Ctrl+F.
**Expected:** Sidebar collapses/expands with Ctrl+B; browser native find bar does NOT appear with Ctrl+F.
**Why human:** Browser UI chrome cannot be inspected programmatically.

### 5. Escape refocuses terminal / does not break TUI Escape

**Test:** Click a nav button (so terminal loses focus), then press Escape.
**Expected:** Terminal regains focus (xterm cursor blinks). Then open vim inside the terminal and press Escape — vim returns to normal mode without switching tabs or triggering any dashboard action.
**Why human:** Focus state and TUI interaction require live browser + PTY observation.

### 6. Focus guard — shortcuts inert in textarea

**Test:** Click into the PromptPanel textarea and type a message. While cursor is inside the textarea, press Ctrl+1.
**Expected:** First session is NOT selected; the character "1" appears in the textarea (or nothing, if Ctrl+1 is not a printable combination).
**Why human:** Requires live focus interaction with the textarea.

---

## Summary

Phase 19 goal is achieved. All 14 observable truths verified programmatically:

- **Plan 01 (AWARE-01 through AWARE-05):** Permission detection regex tightened to Claude-specific strings (`Do you want to proceed?` / `❯ 1. Yes`). Pressure thresholds corrected to 90%/70%. `useAgentLiveStatus` lifted to App.tsx root — single poll interval. InstanceTabBar renders pulsing amber dot for `permission_prompt` state. TerminalView header renders `StateBadge` chip + color-coded pressure with em-dash fallback. `terminalFocusRef` wired end-to-end.

- **Plan 02 (KB-01 through KB-05):** `useGlobalHotkeys` hook created with capture-phase document listener and `isInTextInput` focus guard. All six shortcut categories implemented. `attachCustomKeyEventHandler` in TerminalView blocks PTY escape sequence injection for all shortcut keys (Escape excluded to preserve TUI compatibility). Production build passes cleanly.

Six human verification items documented for final operator confirmation in a live browser environment.

---

_Verified: 2026-03-03T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
