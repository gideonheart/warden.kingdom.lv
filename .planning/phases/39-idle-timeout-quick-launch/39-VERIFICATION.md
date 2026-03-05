---
phase: 39-idle-timeout-quick-launch
verified: 2026-03-05T05:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Open AgentSidebar and change idle timeout via dropdown"
    expected: "Dropdown shows Disabled/1h/2h/4h/8h options; selecting a value calls PUT /api/idle-timeout/:agentId and the selection persists after page refresh"
    why_human: "UI interaction and persistence cannot be verified programmatically without E2E test runner"
  - test: "Click '+ New Session' button in dashboard header"
    expected: "Modal opens with all agents listed; clicking an agent that has a prior session pre-fills the project path; clicking an agent with no prior sessions shows empty input with placeholder text; Escape closes the modal"
    why_human: "Modal rendering, pre-fill behavior, and keyboard handling require browser interaction"
  - test: "Launch a session from QuickLaunchModal with a non-default project path"
    expected: "Session starts in the specified project path; /api/instances/start is called with agentId and the overridden projectPath; the new session appears in the session tab bar within 10 seconds"
    why_human: "Requires live tmux environment and observable session creation"
---

# Phase 39: Idle Timeout & Quick Launch Verification Report

**Phase Goal:** Warden automatically cleans up idle sessions and lets the operator launch new sessions with one click
**Verified:** 2026-03-05T05:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can configure per-agent idle timeout (minimum 60 minutes, or disabled) from the dashboard | VERIFIED | `IdleTimeoutDropdown` component in `AgentSidebar.tsx` (L148–187) with options Disabled/1h/2h/4h/8h; wired via `onChangeIdleTimeout` prop passed from App.tsx (L716, L748) using `updateIdleTimeout` from `useAgentConfig` |
| 2 | Sessions that remain idle beyond their configured timeout are automatically stopped, with the stop reason recorded as "idle-timeout" in lifecycle events | VERIFIED | `IdleTimeoutService.ts` polls every 60s using `detectAgentState()`, tracks idle onset in `idleSince` Map, calls `stopIdleSession()` on threshold breach; `database.insertLifecycleEvent` called with `eventType: 'idle-timeout'` and `stopReason: 'idle-timeout'` (L119–129) |
| 3 | Dashboard shows a "New Session" button that opens an agent picker with each agent's last-used project path pre-filled | VERIFIED | "+ New Session" button in desktop nav (App.tsx L518–523) and mobile dropdown (L595–600); `QuickLaunchModal` fetches `/api/agents/last-projects` on open (L34) and pre-fills `projectPath` from `lastProjectPaths[agentId]` (L72) |
| 4 | Operator can override the pre-filled project path before launching, and the session starts via the existing start API | VERIFIED | `QuickLaunchModal` renders an editable `<input>` (L187–196); `handleLaunch` calls `onLaunch(selectedAgentId, projectPath.trim())` (L85); `handleQuickLaunch` in App.tsx POSTs to `/api/instances/start` with `{ agentId, projectPath }` (L332–336); start endpoint extracts `overridePath` and uses it when non-empty (instanceRoutes.ts L113–115) |
| 5 | Quick-launch works for agents that have never been started — operator must provide a path manually | VERIFIED | `handleAgentSelect` sets `projectPath` to `lastProjectPaths[agentId] ?? ''` (L72); input placeholder reads "Enter project path (e.g., /home/forge/my-project)" (L194); Launch button disabled when `!projectPath.trim()` (L201); no prior path = empty input, manual entry required |
| 6 | Sessions with no idle timeout configured (null) are never auto-stopped | VERIFIED | `IdleTimeoutService.checkSession()` returns early when `timeoutMinutes === null` (L53–57); `idleSince` entry is also cleared in that branch |
| 7 | Idle-timeout stop is recorded as a lifecycle event with event type 'idle-timeout' and stop_reason 'idle-timeout' | VERIFIED | `database.insertLifecycleEvent({ eventType: 'idle-timeout', stopReason: 'idle-timeout' })` at IdleTimeoutService.ts L119–129; `LifecycleEventType` union in types.ts L130 includes `'idle-timeout'` |
| 8 | IdleTimeoutService is wired into server startup and shutdown | VERIFIED | `idleTimeoutService.startPolling()` called at server index.ts L147; `idleTimeoutService.stopPolling()` called in `handleShutdown()` at L166 |
| 9 | TypeScript compiles and production build succeeds | VERIFIED | `npx tsc --noEmit` produced no output (no errors); `npm run build` completed with exit 0 |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/services/IdleTimeoutService.ts` | IdleTimeoutService with idle tracking and auto-stop | VERIFIED | 134 lines; full implementation with `startPolling`, `stopPolling`, `pollAllSessions`, `checkSession`, `stopIdleSession`; singleton exported |
| `src/shared/types.ts` | `idleTimeoutMinutes` field on RestartPolicy | VERIFIED | `idleTimeoutMinutes: number \| null` present on `RestartPolicy` interface at L138; `'idle-timeout'` on `LifecycleEventType` union at L130 |
| `src/server/database/DatabaseConnection.ts` | `idle_timeout_minutes` column, getter/setter methods, `getLastProjectPaths()` | VERIFIED | ALTER TABLE migration at L886–891; `setIdleTimeout` at L644; `getIdleTimeout` at L660; `getLastProjectPaths` at L622; `getAllRestartPolicies` and `getRestartPolicy` both return `idleTimeoutMinutes` |
| `src/server/routes/instanceRoutes.ts` | PUT /api/idle-timeout/:agentId, GET /api/agents/last-projects, projectPath override in start | VERIFIED | PUT endpoint at L369–391 with min-60 validation; GET last-projects at L65–75; start endpoint extended at L82/113–115 |
| `src/client/components/AgentSidebar.tsx` | IdleTimeoutDropdown component | VERIFIED | `IdleTimeoutDropdown` function at L148–187; rendered conditionally at L264–268 when `onChangeIdleTimeout` prop is provided |
| `src/client/components/QuickLaunchModal.tsx` | QuickLaunchModal with agent picker and project path input | VERIFIED | 220 lines; full implementation with lazy fetch, agent grid, path input, launch handler, Escape key, backdrop dismiss |
| `src/client/App.tsx` | New Session button and QuickLaunchModal wiring | VERIFIED | State `isQuickLaunchOpen` at L327; `handleQuickLaunch` callback at L330–344; desktop button at L518–523; mobile menu button at L595–600; `QuickLaunchModal` rendered at L767–773 |
| `src/client/hooks/useAgentConfig.ts` | `updateIdleTimeout` callback | VERIFIED | `updateIdleTimeout` callback at L83; returned from hook at L106; fetches PUT `/api/idle-timeout/:agentId` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `IdleTimeoutService.ts` | `agentStateDetection.ts` | `detectAgentState()` call on tmux pane output | WIRED | Import at L7; call at L67 |
| `IdleTimeoutService.ts` | `DatabaseConnection.ts` | `database.getIdleTimeout()` + `database.insertLifecycleEvent()` | WIRED | `getIdleTimeout` at L52; `insertLifecycleEvent` at L119 |
| `AgentSidebar.tsx` | `/api/idle-timeout/:agentId` | PUT fetch in `useAgentConfig` hook via `onChangeIdleTimeout` prop | WIRED | `useAgentConfig.updateIdleTimeout` → fetch at hook L85; passed to sidebar via App.tsx L716, L748 |
| `QuickLaunchModal.tsx` | `/api/instances/start` | POST fetch with agentId and projectPath | WIRED | `onLaunch` prop called at L85; `handleQuickLaunch` in App.tsx POSTs at L332 |
| `QuickLaunchModal.tsx` | `/api/agents/last-projects` | GET fetch on modal open | WIRED | `fetch('/api/agents/last-projects')` in useEffect at L34, guarded by `isOpen` |
| `instanceRoutes.ts` | `DatabaseConnection.ts` | `database.getLastProjectPaths()` | WIRED | Called at instanceRoutes.ts L69 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IDLE-01 | 39-01-PLAN | Per-agent idle timeout stored in `session_lifecycle_policy` (nullable, min 60 minutes) | SATISFIED | `idle_timeout_minutes` column added (migration at DB L886); `setIdleTimeout` validates min 60 at L645; default null |
| IDLE-02 | 39-01-PLAN | Service tracks time-in-idle-state per session; auto-stops when threshold exceeded | SATISFIED | `IdleTimeoutService` tracks `idleSince` Map, computes elapsed minutes, calls `stopIdleSession()` with `stop_reason = 'idle-timeout'` |
| IDLE-03 | 39-01-PLAN | Idle timeout stop logged to `session_lifecycle_events` with event type `idle-timeout` | SATISFIED | `database.insertLifecycleEvent({ eventType: 'idle-timeout', stopReason: 'idle-timeout' })` at IdleTimeoutService.ts L119–129 |
| LNCH-01 | 39-02-PLAN | Dashboard derives launch shortcuts from openclaw.json agents combined with last-used project path from instances table | SATISFIED | `GET /api/agents/last-projects` queries instances table; modal receives `agents` from `useAgentConfig()` (openclaw.json) and last paths from API |
| LNCH-02 | 39-02-PLAN | "New Session" button opens agent picker showing available agents with last-used project path; spawns session via start API | SATISFIED | Button in desktop header and mobile dropdown; `QuickLaunchModal` shows agent grid with last paths; launch calls POST /api/instances/start |
| LNCH-03 | 39-02-PLAN | Quick-launch pre-fills agent ID and project path; operator can override project path before launch | SATISFIED | Path input pre-filled from `lastProjectPaths[agentId]` but is an editable `<input>`; `handleLaunch` uses `projectPath.trim()` from state |

**Note on IDLE-02:** The REQUIREMENTS.md spec says "NotificationPoller tracks time-in-idle-state" but the implementation uses a dedicated `IdleTimeoutService` instead. This is a functionally superior design (dedicated service, clean separation) and satisfies the requirement's intent. The requirement was written before the implementation design was settled; the PLAN.md was the authoritative design document and it specified `IdleTimeoutService` from the start.

---

## Anti-Patterns Found

None detected across all modified files. No TODOs, FIXMEs, placeholder returns, or stub implementations found.

The `placeholder` attribute in `QuickLaunchModal.tsx` L194 is a legitimate HTML `<input placeholder>` attribute, not a stub pattern.

---

## Human Verification Required

### 1. Idle Timeout Dropdown in Sidebar

**Test:** Open the dashboard in a browser, expand the Agents sidebar, locate any agent row
**Expected:** An "Idle:" label with a dropdown showing "Disabled / 1 hour / 2 hours / 4 hours / 8 hours" options; selecting an option calls PUT /api/idle-timeout/:agentId and the selection persists after page refresh
**Why human:** UI rendering and persistence require browser interaction

### 2. Quick-Launch Modal Opens and Pre-fills

**Test:** Click "+ New Session" in the dashboard header
**Expected:** Modal opens with a grid of all agents; agents with active sessions show a green dot and "Running" badge and are non-clickable; clicking an agent without an active session shows a project path input pre-filled with their last-used path (or empty if never started)
**Why human:** Modal rendering, active-agent detection, and pre-fill behavior require browser interaction

### 3. Quick-Launch Creates Session with Override Path

**Test:** Open Quick-Launch modal, click an agent, clear the pre-filled path and enter a different valid project path, click Launch
**Expected:** The modal shows "Launching..." then closes; a new session tab appears in the dashboard within 10 seconds; the session's project path matches the entered path
**Why human:** Requires live tmux environment, observable session creation, and path verification

---

## Gaps Summary

No gaps found. All phase artifacts are implemented, substantive, and fully wired. The production build and TypeScript type check both pass clean.

---

_Verified: 2026-03-05T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
