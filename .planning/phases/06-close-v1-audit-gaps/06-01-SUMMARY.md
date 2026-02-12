---
phase: 06-close-v1-audit-gaps
plan: 01
subsystem: agent-details-ui
tags: [ui, openclaw-integration, agent-details, session-management]
dependency-graph:
  requires: [openclaw-config-reader, agent-sidebar, instance-tab-bar]
  provides: [soul-preview-display, memory-status-display, session-stop-button]
  affects: [agent-details-api, dashboard-ui]
tech-stack:
  added: []
  patterns: [async-file-reading, graceful-fallbacks, loading-states]
key-files:
  created: []
  modified:
    - src/shared/openclawTypes.ts
    - src/server/services/OpenClawConfigReader.ts
    - src/client/components/AgentSidebar.tsx
    - src/client/components/InstanceTabBar.tsx
    - src/client/App.tsx
decisions:
  - Truncate SOUL.md preview at last newline after 100 chars (max 200 chars) for clean display
  - Format memory size using KB/MB/GB units with 1 decimal place
  - Show green status dot when MEMORY.md exists, dim dot when missing
  - Stop button shows "Stopping..." during API call and is disabled for already-stopped sessions
  - Use graceful fallbacks: "No SOUL.md found" and "No MEMORY.md" when files missing
metrics:
  duration: 243s
  tasks_completed: 2
  files_modified: 5
  commits: 2
  completed_at: 2026-02-12T15:48:53Z
---

# Phase 06 Plan 01: Close v1 Audit Gaps Summary

**One-liner:** Implemented SOUL.md preview with truncation, memory status display with size formatting, and per-session stop button with loading states in dashboard UI.

## Overview

Closed three v1.0 milestone audit gaps by adding missing functionality to the agent details sidebar and session tab bar. Agent sidebar now displays SOUL.md preview text and memory status, while each session tab has a visible stop button that terminates tmux sessions.

**Requirements satisfied:**
- AGNT-02: Agent details sidebar displays SOUL.md preview and memory status
- SESS-06: Dashboard has stop session button that terminates tmux sessions

## Tasks Completed

### Task 1: Add SOUL.md preview and memory status to server and shared types
**Commit:** `4848a70`
**Files:** `src/shared/openclawTypes.ts`, `src/server/services/OpenClawConfigReader.ts`

- Added `memoryExists` and `memorySizeBytes` fields to `AgentDetails` interface
- Implemented `readSoulPreview()` private method that:
  - Resolves workspace path (absolute or relative to `~/.openclaw`)
  - Reads SOUL.md and truncates to 200 chars
  - Finds last newline after char 100 for clean truncation
  - Returns null gracefully on ENOENT, logs other errors
- Implemented `getMemoryStatus()` private method that:
  - Resolves workspace path same way as readSoulPreview
  - Uses fs.stat to check MEMORY.md existence and size
  - Returns { exists, sizeBytes } structure
  - Handles ENOENT gracefully
- Updated `getAgents()` to async/await pattern with Promise.all
- Each agent now includes real soulPreview, memoryExists, and memorySizeBytes data

### Task 2: Add SOUL.md preview and memory status to sidebar, stop button to tab bar
**Commit:** `a727b28`
**Files:** `src/client/components/AgentSidebar.tsx`, `src/client/components/InstanceTabBar.tsx`, `src/client/App.tsx`

**AgentSidebar changes:**
- Added `formatBytes()` helper function for human-readable size display (KB/MB/GB with 1 decimal)
- Added SOUL.md preview section after Model field:
  - Displays preview text if available
  - Shows "No SOUL.md found" fallback in italic/dimmed style
- Added Memory status section with:
  - Green status dot when MEMORY.md exists, dim dot when missing
  - Formatted size display using formatBytes()
  - "No MEMORY.md" text when file doesn't exist

**InstanceTabBar changes:**
- Added `useState` for tracking stopping session
- Extended props with optional `onSessionStopped` callback
- Implemented async `handleStop()` function that:
  - Sets loading state
  - POSTs to `/api/instances/:id/stop`
  - Calls onSessionStopped callback on success
  - Shows alert on error
  - Clears loading state in finally block
- Restructured each tab from single button to div wrapper containing:
  - Tab selection button (existing functionality)
  - Stop button with red tinted background
  - Shows "Stopping..." while loading
  - Disabled when already stopping or status is "stopped"
  - Uses e.stopPropagation() to prevent tab selection when clicking stop

**App.tsx changes:**
- Added `handleSessionStopped()` callback using useCallback
- Calls `refetch()` to refresh instance list after stop
- Wired callback to InstanceTabBar via onSessionStopped prop

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compilation: ✓ No errors in modified files
- Production build: ✓ Succeeded (both client and server)
- GET /api/agents endpoint: ✓ Returns soulPreview, memoryExists, memorySizeBytes fields
- Agent sidebar: ✓ Renders SOUL.md preview or "No SOUL.md found" fallback
- Agent sidebar: ✓ Renders memory status dot (green if exists) and formatted size
- Stop button: ✓ Visible on each session tab
- Stop button: ✓ Shows loading state and disables during API call
- Stop button: ✓ Disabled for already-stopped sessions
- Stop button: ✓ Calls POST /api/instances/:id/stop endpoint
- Stop button: ✓ Triggers instance list refresh after successful stop

## Technical Details

**File resolution pattern:**
The workspace path resolution logic checks if path is absolute; if not, joins with `~/.openclaw/` as base. This handles both absolute paths (e.g., `/home/user/agent-workspace`) and relative paths (e.g., `agents/scout`).

**SOUL.md truncation logic:**
Reads first 200 characters, then finds the last newline after character 100. If found past char 100, truncates there for clean line break. Otherwise uses full 200-char slice. This prevents cutting words mid-sentence.

**Memory status display:**
Uses a two-part approach: boolean `memoryExists` for presence check and `memorySizeBytes` for size. The UI shows a visual status dot (green/dim) and formatted size text, making it easy to see at a glance whether memory exists.

**Stop button UX:**
The stop button uses a loading state pattern with disabled button during the API call. The "Stopping..." text provides immediate feedback, and the button remains disabled for sessions already in "stopped" status to prevent redundant calls.

## Impact

**Completed requirements:**
- AGNT-02 (agent details): Now FULLY satisfied
- SESS-06 (stop session): Now FULLY satisfied

**User-visible improvements:**
1. Agent sidebar shows meaningful agent details (SOUL.md preview gives context about agent purpose)
2. Memory status visibility helps debug agent memory usage
3. Users can now stop sessions directly from the dashboard without CLI commands

## Next Steps

This plan completes the first set of v1 audit gaps. Next plans should address remaining gaps identified in the v1.0 milestone audit.

## Self-Check: PASSED

Verifying all created files and commits exist.

**Modified files:**
- ✓ FOUND: src/shared/openclawTypes.ts
- ✓ FOUND: src/server/services/OpenClawConfigReader.ts
- ✓ FOUND: src/client/components/AgentSidebar.tsx
- ✓ FOUND: src/client/components/InstanceTabBar.tsx
- ✓ FOUND: src/client/App.tsx

**Commits:**
- ✓ FOUND: 4848a70 (Task 1)
- ✓ FOUND: a727b28 (Task 2)
