---
status: resolved
trigger: "After VPS server reboot, Warden auto-restarts all tmux agent sessions but they all start in the wrong working directory"
created: 2026-03-08T00:00:00Z
updated: 2026-03-08T00:00:00Z
---

## Current Focus

hypothesis: InstanceTracker.syncWithTmux() upserts discovered sessions with projectPath='' (empty string). When sessions are later detected as crashed, the instance object passed to AutoRestartService has an empty projectPath, causing createSessionWithClaude to use '' as the -c flag value (which tmux interprets as cwd).
test: Trace the data flow from InstanceTracker upsert through crash detection to AutoRestartService
expecting: projectPath will be '' at each step, confirming the bug
next_action: Verify upsertInstance does not overwrite projectPath on existing rows, then confirm the full chain

## Symptoms

expected: After VPS reboot, each agent's tmux session should auto-restart in its own correct working directory (as configured per agent)
actual: All auto-restarted sessions use `/home/forge/warden.kingdom.lv` as their working directory
errors: None reported — sessions do start, just in wrong directory
reproduction: Reboot the VPS server, observe that all restarted agent tmux sessions have working directory set to Warden's directory
started: Happens every time VPS is rebooted

## Eliminated

## Evidence

- timestamp: 2026-03-08T00:01:00Z
  checked: InstanceTracker.syncWithTmux() line 67-73
  found: upsertInstance is called with projectPath='' (hardcoded empty string) for every tmux session discovered by polling
  implication: Sessions discovered via tmux polling never get their projectPath populated

- timestamp: 2026-03-08T00:02:00Z
  checked: DatabaseConnection.upsertInstance() lines 117-126
  found: When session already exists (by tmuxSessionName), upsert ONLY updates status, agent_id, agent_name, last_active_at — does NOT update project_path. When session is NEW, it calls insertInstance which saves projectPath (but it's '' from InstanceTracker).
  implication: Two paths, both bad — existing sessions keep whatever projectPath they had, new sessions get empty projectPath

- timestamp: 2026-03-08T00:03:00Z
  checked: AutoRestartService.attemptRestart() line 56
  found: Uses crashedInstance.projectPath directly — if it's '' then tmux new-session -c '' defaults to the current working directory (which is Warden's directory since that's where the server process runs)
  implication: Empty projectPath flows straight through to tmux command, causing the wrong working directory

- timestamp: 2026-03-08T00:04:00Z
  checked: crash detection flow in InstanceTracker.detectCrashesAndMarkStopped() line 165
  found: onCrashDetected fires with the instance object from database — instance.projectPath will be whatever was stored in DB
  implication: The full chain is confirmed: empty projectPath in DB -> empty projectPath in crash event -> empty projectPath passed to tmux

- timestamp: 2026-03-08T00:05:00Z
  checked: How projectPath gets populated for non-polling paths (instanceRoutes.ts lines 103-135)
  found: The /api/instances/start and /api/instances/spawn endpoints correctly look up working directory from GsdRegistryService or OpenClawConfigReader. InstanceTracker polling path does NOT do this lookup.
  implication: The fix should make InstanceTracker resolve the working directory from registry/config when discovering sessions

## Resolution

root_cause: InstanceTracker.syncWithTmux() hardcodes projectPath='' when upserting sessions discovered via tmux polling. All active instances in the DB have empty project_path (confirmed via sqlite3 query). When crash detection triggers auto-restart after VPS reboot, AutoRestartService passes this empty projectPath to tmux new-session -c, which defaults to the Warden server's cwd (/home/forge/warden.kingdom.lv).
fix: Three-layer fix: (1) InstanceTracker.syncWithTmux() now resolves working directories from GsdRegistryService and OpenClawConfigReader before upserting, matching the same resolution logic used by /api/instances/start. (2) DatabaseConnection.upsertInstance() now backfills project_path on existing records that have an empty one when a non-empty value is provided. (3) AutoRestartService.attemptRestart() now has a defensive fallback that resolves the working directory from config sources if the crashed instance has an empty projectPath.
verification: Build succeeds. TypeScript compiles. No new type errors introduced.
files_changed:
  - src/server/services/InstanceTracker.ts
  - src/server/database/DatabaseConnection.ts
  - src/server/services/AutoRestartService.ts
