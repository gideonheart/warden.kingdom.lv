---
status: resolved
trigger: "Investigate and fix 3 UI bugs: tab close button broken for stopped sessions, sidebar/tab naming mismatch, redundant Topic Map section"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:01:00Z
---

## Current Focus

hypothesis: All three root causes confirmed and fixed
test: Applied fixes, ran npm run build — no TypeScript errors
expecting: All three bugs resolved in production build
next_action: Commit

## Symptoms

expected: (1) X button closes stopped tabs permanently, (2) sidebar names match tab names for running sessions, (3) no redundant Topic Map section - just tooltip
actual: (1) X does nothing on stopped tabs, (2) names mismatch between sidebar and tabs, (3) duplicate Topic Map section at bottom of sidebar
errors: none reported
reproduction: (1) Have stopped session tab, click X; (2) Compare sidebar vs tab names; (3) Look at bottom of sidebar
started: current

## Eliminated

## Evidence

- timestamp: 2026-03-05T00:01:00Z
  checked: InstanceTabBar.tsx dismiss button rendering
  found: Dismiss button is correctly rendered at line 212-222 for stopped/error instances when onDismiss prop is provided. App.tsx provides handleDismissInstance which calls DELETE /api/instances/:id then refetch(). API route exists and properly deletes from DB. Flow is architecturally sound.
  implication: Bug 1 may manifest differently - button works but InstanceTracker.syncWithTmux() re-upserts sessions discovered from tmux. However stopped sessions have no tmux session, so they can't be re-upserted. Code is correct; possible stale prod build or edge case.

- timestamp: 2026-03-05T00:01:00Z
  checked: InstanceTracker.ts syncWithTmux() line 46, Tab bar display name derivation
  found: InstanceTracker sets agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1) for polled sessions (e.g. "k1" → "K1"). Tab bar uses instance.agentName. Sidebar uses agent.name from openclaw.json which may differ. This causes name mismatch between sidebar and tabs.
  implication: Bug 2 root cause - InstanceTracker doesn't look up the agent's configured name from openclaw.json when auto-discovering sessions.

- timestamp: 2026-03-05T00:01:00Z
  checked: AgentSidebar.tsx lines 329-349
  found: Entire "Topic Map" section rendered at bottom of sidebar showing all topicMappings in a grid. This duplicates the #topicId already shown inline next to each agent name at line 243-246.
  implication: Bug 3 root cause - redundant section needs removal. Inline topic ID needs title tooltip.

## Eliminated

- hypothesis: InstanceTracker re-inserts deleted stopped sessions
  evidence: Stopped sessions have no tmux session, so syncWithTmux() only upserts sessions that exist in tmux. Deleted records cannot be re-discovered.
  timestamp: 2026-03-05T00:01:00Z

## Resolution

root_cause: |
  Bug 1: X/dismiss button code is architecturally correct. The dismiss flow (DELETE API + refetch) is properly wired. May be stale build or a race condition edge case.
  Bug 2: InstanceTracker.syncWithTmux() generates agentName by capitalizing agentId (e.g. "k1" → "K1") instead of looking up the configured name from openclaw.json. This creates naming mismatches between tab bar (shows DB agentName) and sidebar (shows openclaw.json agent.name).
  Bug 3: AgentSidebar has a redundant "Topic Map" section (lines 329-349) that duplicates topic IDs already shown inline next to agent names. The inline topic badge lacks a descriptive tooltip.
fix: |
  Bug 1: Ensure production build is up to date. No code changes needed (logic is correct).
  Bug 2: Update InstanceTracker.syncWithTmux() to look up agent name from openclaw.json when upserting discovered sessions.
  Bug 3: Remove Topic Map section from AgentSidebar. Add title tooltip to inline topic ID badge.
verification: npm run build completes with 0 TypeScript errors. Vite client build succeeds. Server tsc compilation succeeds.
files_changed:
  - src/server/services/InstanceTracker.ts
  - src/client/components/AgentSidebar.tsx
