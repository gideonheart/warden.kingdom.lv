---
phase: quick-5
plan: 01
subsystem: frontend-layout
tags: [ui, ux, terminal, sidebar, mobile]
dependency-graph:
  requires: []
  provides: [sidebar-prompt-panel, max-terminal-space]
  affects: [App.tsx, AgentSidebar.tsx]
tech-stack:
  added: []
  patterns: [flex-layout, conditional-rendering]
key-files:
  created: []
  modified:
    - path: src/client/App.tsx
      summary: Moved PromptPanel from main to both sidebar wrappers
    - path: src/client/components/AgentSidebar.tsx
      summary: Changed root div from h-full to flex-1 min-h-0 for vertical sharing
decisions: []
metrics:
  duration_seconds: 81
  tasks_completed: 1
  commits: 1
  files_modified: 2
  completed_at: "2026-02-16T00:09:39Z"
---

# Quick Task 5: Move PromptPanel to Sidebar, Keep Only Mobile Toolbar Below Terminal

**One-liner:** Relocated PromptPanel from below terminal into sidebar to maximize terminal vertical space on all devices

## Objective

Move PromptPanel from below the terminal (inside `<main>`) into the sidebar, so the terminal gets maximum vertical space. On mobile, PromptPanel is only accessible when the sidebar overlay is opened. Terminal real estate is precious, especially on mobile. The prompt panel is used occasionally and fits naturally in the sidebar alongside agent details.

## Execution Summary

Executed a single layout restructuring task that moved PromptPanel from the main terminal area into both desktop and mobile sidebar containers.

**Tasks completed:** 1/1
**Deviations:** None - plan executed exactly as written
**Duration:** 81 seconds (1.4 minutes)

## Changes Made

### Task 1: Move PromptPanel from main into sidebar wrappers

**Commit:** `8fc0c66`
**Files modified:** `src/client/App.tsx`, `src/client/components/AgentSidebar.tsx`

**Changes in App.tsx:**

1. **Removed PromptPanel from `<main>`:** The previous layout had PromptPanel as a second child in the terminals view fragment, below the terminal div. This has been removed completely from the main area.

2. **Updated desktop sidebar wrapper:** Changed from `hidden lg:block` to `hidden lg:flex lg:flex-col` to create a flex column container. Added PromptPanel as second child, conditionally rendered only when `currentView === 'terminals'`.

3. **Updated mobile sidebar wrapper:** Added `flex flex-col` to the inner wrapper div (previously just positioned absolutely). Added PromptPanel after AgentSidebar, conditionally rendered only when `currentView === 'terminals'`.

**Changes in AgentSidebar.tsx:**

4. **Changed root div height strategy:** Replaced `h-full` with `flex-1 min-h-0` so AgentSidebar becomes a flexible child that shares vertical space with PromptPanel. The sidebar scrolls independently when content overflows, while PromptPanel stays visible at the bottom.

**Result:** Terminal now occupies full vertical space in main area (no prompt panel below it). PromptPanel appears in sidebar on both desktop (inline) and mobile (overlay), only when viewing terminals. AgentSidebar scrolls when content overflows, PromptPanel stays pinned at sidebar bottom.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript typecheck passes with no errors
- Production build succeeds (`npm run build`)
- In App.tsx: no `<PromptPanel>` inside `<main>`, two `<PromptPanel>` instances inside sidebar wrappers (desktop + mobile)
- In AgentSidebar.tsx: root div uses `flex-1 min-h-0` instead of `h-full`
- PromptPanel only rendered when `currentView === 'terminals'`

## Impact

**Before:**
- Terminal had PromptPanel below it, reducing vertical space
- Mobile users saw PromptPanel below terminal (taking precious mobile space)
- Terminal area had to share vertical space with prompt panel

**After:**
- Terminal occupies full main area height (maximum vertical space)
- PromptPanel relocated to sidebar (both desktop and mobile)
- Mobile users only see MobileKeyToolbar below terminal; PromptPanel accessible via sidebar overlay
- AgentSidebar and PromptPanel share sidebar vertical space with independent scrolling

## Files Modified

| Path | Changes |
|------|---------|
| `src/client/App.tsx` | Removed PromptPanel from main, added to both sidebar wrappers |
| `src/client/components/AgentSidebar.tsx` | Changed root div from h-full to flex-1 min-h-0 |

## Task Breakdown

| Task | Name | Status | Commit | Files Modified |
|------|------|--------|--------|----------------|
| 1 | Move PromptPanel from main into sidebar wrappers | ✓ Complete | `8fc0c66` | App.tsx, AgentSidebar.tsx |

## Self-Check: PASSED

**Created files:**
- None (layout refactor only)

**Modified files:**
✓ FOUND: src/client/App.tsx
✓ FOUND: src/client/components/AgentSidebar.tsx

**Commits:**
✓ FOUND: 8fc0c66

All artifacts verified successfully.
