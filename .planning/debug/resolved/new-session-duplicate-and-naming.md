---
status: resolved
trigger: "New Session button creates duplicate sessions and naming issues"
created: 2026-03-12T00:00:00Z
updated: 2026-03-12T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - Fixed suffix "123" causes session name collision. Random suffix causes un-differentiated UI labels.
test: Traced full flow from button click to tmux session creation
expecting: Fix by using sequential counter suffix and updating UI
next_action: Implement fixes

## Symptoms

expected: |
  Bug 1: Clicking "New Session" button should create exactly one new tmux session for the agent.
  Bug 2: Session names should use "123" as suffix (not random), and in the UI, multiple sessions
  for the same agent should show sequential numbering like "Casper-1", "Casper-2", "Casper-3".
actual: |
  Bug 1: Two sessions are created - one works, one errors out.
  Bug 2: Sessions end with random 4-digit numbers, and all sessions for the same agent look
  identical in the UI making them hard to differentiate.
errors: One of the duplicate sessions errors out (exact error unknown)
reproduction: Click the "New Session" button in the terminal header bar
started: Recent - New Session button was just added (commit c5f46d8)

## Eliminated

- hypothesis: Double-click on the button triggers two spawns
  evidence: No debounce but each gets unique random name; one would just be a parallel session
  timestamp: 2026-03-12
- hypothesis: InstanceTracker.syncWithTmux creates duplicate DB records
  evidence: upsertInstance looks up by tmuxSessionName (UNIQUE), always updates existing records
  timestamp: 2026-03-12

## Evidence

- timestamp: 2026-03-12
  checked: buildSessionName in TmuxSessionManager.ts
  found: Uses crypto.randomUUID().slice(0, 4) for random 4-char hex suffix
  implication: "Bug 2 source: random suffix makes sessions hard to differentiate"

- timestamp: 2026-03-12
  checked: InstanceTabBar.tsx displayName logic
  found: displayName = instance.agentName || instance.agentId; no disambiguation for multi-session agents
  implication: "Bug 2b source: all sessions for same agent show identical label"

- timestamp: 2026-03-12
  checked: /api/instances/spawn route flow
  found: |
    buildSessionName() -> upsertInstance() -> updateStatus('starting') -> createSessionWithClaude() fire-and-forget
    If createSessionWithClaude fails (e.g., tmux session name collision with existing session), status set to 'error'
    InstanceTracker poll (10s) finds the orphaned tmux session, sets status back to 'active'
    This creates two visible sessions: old working one + new errored one
  implication: "Bug 1 source: fixed '123' suffix would cause guaranteed collision if session already exists with that name"

- timestamp: 2026-03-12
  checked: Design intent from bug report
  found: |
    "use '123' as suffix" means sequential numbers (1, 2, 3) not literal "123"
    UI should show "Casper-1", "Casper-2" based on sequence among same-agent sessions
  implication: "Fix approach: use sequential counter for suffix, update InstanceTabBar for sequential display"

## Resolution

root_cause: |
  Bug 1: buildSessionName used crypto.randomUUID().slice(0, 4) for a random 4-char hex suffix.
  If a previously-created tmux session with the same randomly-generated name still existed in
  tmux (orphaned from a prior error state where DB was cleaned but tmux was not), then
  createSessionWithClaude would fail at 'tmux new-session' (duplicate name), causing the
  .catch() handler to set the new instance status to 'error'. The existing working session
  continued running, and the failed new instance appeared as 'error' in the tab bar.
  Additionally, if the suffix was changed to a fixed value like "123", every subsequent spawn
  for the same agent+project would generate the SAME session name, causing a guaranteed
  collision on every spawn after the first.

  Bug 2: buildSessionName generated a random hex suffix, producing unreadable names like
  "casper-myproject-a1b2" instead of sequential "casper-myproject-1".

  Bug 2b: InstanceTabBar computed displayName as `instance.agentName || instance.agentId`
  without any disambiguation, making multiple sessions for the same agent appear identical
  in the tab bar (e.g., three "Casper" tabs with no way to tell them apart).
fix: |
  1. TmuxSessionManager.buildSessionName: Changed signature from (agentId, projectSlug) to
     (agentId, projectSlug, sequenceNumber = 1). Removed crypto.randomUUID() usage.
     Session names now follow pattern: "{agentId}-{projectSlug}-{number}" e.g. "casper-myproject-1".

  2. DatabaseConnection: Added countAllInstancesByAgentId(agentId) method that counts all
     historical instances (any status) for the given agent. Used to determine next sequence number.

  3. instanceRoutes.ts /start, /spawn, /restart endpoints: Each computes
     existingCount = database.countAllInstancesByAgentId(agentId) and passes (existingCount + 1)
     as the sequenceNumber to buildSessionName. This ensures monotonically increasing, unique names.

  4. AutoRestartService.ts: Same pattern - computes next sequence number before calling buildSessionName.

  5. InstanceTabBar.tsx: Added buildDisplayLabels() helper that assigns sequential labels
     "AgentName-1", "AgentName-2", etc. when multiple instances share the same agentId.
     Single sessions continue to show just "AgentName" without a suffix.
verification: |
  npm run build passes cleanly (vite + tsc compilation both succeed).
  Pre-existing TS error in TerminalView.tsx (line 458) confirmed to be unrelated to these changes
  (exists on the base branch before any modifications).
files_changed:
  - src/server/services/TmuxSessionManager.ts
  - src/server/database/DatabaseConnection.ts
  - src/server/routes/instanceRoutes.ts
  - src/server/services/AutoRestartService.ts
  - src/client/components/InstanceTabBar.tsx
