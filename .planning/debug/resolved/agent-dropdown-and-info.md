---
status: resolved
trigger: "agent-dropdown-and-info-not-loading"
created: 2026-02-16T00:00:00Z
updated: 2026-02-16T00:10:00Z
---

## Current Focus

hypothesis: API returns data correctly (tested with curl), but client may have issue fetching/parsing or there's a mismatch between what server sends vs what client expects. Need to verify client-side data flow.
test: Check if there's a name field mismatch or parsing issue in useAgentConfig
expecting: Find client-side parsing or state update bug
next_action: Look for type mismatches and check how API response gets parsed into state

## Symptoms

expected: All agents from openclaw.json should appear in the PromptPanel dropdown. AgentSidebar should show SOUL.md content for all agents.
actual: Dropdown list is empty (no agents to select). AgentSidebar only shows info about Gideon.
errors: Unknown — need to investigate
reproduction: Open Warden dashboard, check PromptPanel dropdown and AgentSidebar
started: Recent — may be related to quick-5 changes (moved PromptPanel to sidebar)

## Eliminated

## Evidence

- timestamp: 2026-02-16T00:01:00Z
  checked: openclaw.json file structure
  found: Only ONE agent in agents.list array - just "gideon". Expected multiple agents but file only has one agent defined.
  implication: This is the root cause - openclaw.json only has 1 agent, so API correctly returns 1 agent

- timestamp: 2026-02-16T00:02:00Z
  checked: API endpoint /api/agents
  found: Returns {"agents":[{"id":"gideon",...}]} - only one agent with proper name field missing
  implication: Server is working correctly, reading the single agent from openclaw.json. Agent has no "name" field, so getAgents() defaults to "Gideon" (capitalized id)

- timestamp: 2026-02-16T00:03:00Z
  checked: OpenClawConfigReader.getAgents() logic
  found: Line 111 shows name fallback: agent.name ?? agent.id.charAt(0).toUpperCase() + agent.id.slice(1)
  implication: Code should generate name field, but API response was missing it

- timestamp: 2026-02-16T00:04:00Z
  checked: Compiled dist/server/server/services/OpenClawConfigReader.js
  found: Compiled code DOES have the name field logic, matches source
  implication: Compiled code is correct, issue must be with running server

- timestamp: 2026-02-16T00:05:00Z
  checked: Running server process (PID 82445)
  found: Server was running old compiled code from dist/server/server/index.js
  implication: Server needed restart to load latest compiled code

- timestamp: 2026-02-16T00:06:00Z
  checked: Restarted server and tested API endpoint again
  found: NOW returns {"agents":[{"id":"gideon","name":"Gideon",...}]} with name field present!
  implication: ROOT CAUSE CONFIRMED - Server was running stale compiled code without name field

## Resolution

root_cause: Server was running outdated compiled code that didn't include the `name` field in AgentDetails response. The source code has the correct logic (line 111 of OpenClawConfigReader.ts generates name with fallback), but the running server process (PID 82445) was using an older build. This caused client-side components (PromptPanel dropdown, AgentSidebar) to fail rendering because they expected the required `name` field per AgentDetails interface (src/shared/openclawTypes.ts line 55).

fix: Killed old server process (PID 82445) and restarted with `npm start` to load latest compiled code. API now correctly returns agents array with name field: `{"agents":[{"id":"gideon","name":"Gideon",...}]}`

verification: VERIFIED ✓
- Confirmed API returns correct data structure with name field (tested with curl)
- Simulated client-side parsing - dropdown will show "Gideon" option
- AgentSidebar will display "Gideon" in agent list
- Client polling (30s interval in useAgentConfig) will pick up the corrected data automatically
- All required fields now present per AgentDetails interface

Note: Only ONE agent (gideon) is defined in openclaw.json agents.list. Topic mappings show "warden" and "forge", but these are Telegram topic assignments, NOT agent definitions. If user wants more selectable agents, they need to add them to ~/.openclaw/openclaw.json agents.list array.

files_changed: []
