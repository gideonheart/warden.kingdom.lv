---
status: resolved
trigger: "Multiple related UI bugs in Warden dashboard — agent sidebar shows wrong status, Start button creates broken tabs, close button doesn't work, mobile tab overflow"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — all four bugs have been root-caused
test: reading source + querying live API
expecting: implement fixes
next_action: fix all four issues

## Symptoms

expected:
1. Agent sidebar should show "Running" for agents that have active tmux sessions (visible in terminal tabs)
2. Start button should launch a new working terminal session
3. Close (x) button should close/remove a terminal tab
4. On mobile, tab bar should be scrollable/usable with all buttons accessible

actual:
1. Only "Warden" agent shows "Running" label in sidebar — all other agents show "Start" button even though they have active sessions in the tabs
2. Clicking "Start" opens a new terminal tab but it immediately fails — shows red dot, "error" label, and "Restart" button
3. "Restart" button tries but fails, close (x) button does not work at all — tab stays
4. On mobile phone, tab names are too wide and don't fit the screen — Restart and X buttons are pushed outside viewport, unreachable

errors: The started session name format shows 'k1-rust-karbit-friend.kingdom.lv-53e7' suggesting the session creation may be using unexpected naming

reproduction:
1. Open Warden dashboard
2. Look at agent sidebar — notice non-Warden agents show "Start" even with active sessions
3. Click "Start" on any agent — observe new tab appears then goes to error state
4. Try clicking X to close — nothing happens
5. View on mobile — tabs overflow

started: Current behavior, unclear when it started

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-05T00:10:00Z
  checked: tmux sessions vs API instances
  found: |
    tmux sessions: agent_g2-gateway_session_name, agent_k1-karbit, agent_warden-kingdom_session_name
    API instances: agentId=warden (tmux: agent_warden-*), agentId=g2 (tmux: agent_g2-gateway_*), agentId=k1 (tmux: agent_k1-karbit)
    MISMATCH: extractAgentIdFromSessionName('agent_g2-gateway_session_name') returns 'g2' but openclaw config has id='g2-gateway'
    extractAgentIdFromSessionName('agent_k1-karbit') returns 'k1' but openclaw config has id='k1-rust'
  implication: |
    For sessions with prefix 'agent_', extractAgentIdFromSessionName slices off 'agent_' then takes split('-')[0].
    So 'agent_g2-gateway_session_name' -> 'g2-gateway_session_name' -> 'g2' (first segment before '-')
    And 'agent_k1-karbit' -> 'k1-karbit' -> 'k1' (first segment before '-')
    These do NOT match openclaw agent IDs 'g2-gateway' and 'k1-rust'
    So activeAgentIds never contains 'g2-gateway' or 'k1-rust' — sidebar always shows "Start" for them.

- timestamp: 2026-03-05T00:11:00Z
  checked: TmuxSessionManager.buildSessionName and createSessionWithClaude
  found: |
    buildSessionName(agentId, projectSlug) = `${agentId}-${projectSlug}-${shortId}`
    For k1-rust + workspace-k1-rust: slug = 'workspace-k1-rust' or similar
    Session name example from symptoms: 'k1-rust-karbit-friend.kingdom.lv-53e7'
    Actual tmux session: 'k1-rust-karbit-friend_kingdom_lv-7072' (dots replaced with underscores by tmux)
    KNOWN_AGENT_PREFIXES = ['agent', 'gideon', 'warden', 'scout', 'builder', 'forge']
    'k1-rust' is NOT in KNOWN_AGENT_PREFIXES so newly created sessions are NOT discovered by InstanceTracker
    Also 'g2-gateway' and 'g2-frontend' are NOT in KNOWN_AGENT_PREFIXES
  implication: |
    When Start button creates a session for 'k1-rust', the session name starts with 'k1-rust-'
    InstanceTracker.listAgentSessions filters by KNOWN_AGENT_PREFIXES and 'k1-rust' is not there
    So the created tmux session is never picked up / stays in 'starting' state, then times out to 'error' after 30s

- timestamp: 2026-03-05T00:12:00Z
  checked: InstanceTabBar dismiss (X button) behavior
  found: |
    Dismiss button calls handleDismiss(instance.tmuxSessionName) which adds to dismissedSessions local state
    visibleInstances = instances.filter(not in dismissedSessions)
    PROBLEM: App passes activeInstances to InstanceTabBar, and activeInstances is recomputed every time instances changes
    But dismissedSessions is LOCAL to InstanceTabBar. When refetch() is called (every poll), instances changes,
    causing activeInstances to recompute with a new array reference.
    BUT InstanceTabBar receives instances as a prop — dismissedSessions persists inside InstanceTabBar as local state
    So dismiss should work... Let me re-examine.
    Actually — dismiss works for stopped/error tabs. But the "error" session created by Start is being re-fetched
    from the server which still returns it. dismissedSessions persists correctly.
    HOWEVER: The X button is only shown when (instance.status === 'stopped' || instance.status === 'error')
    AND the session goes to error state 30s after start timeout. During those 30s, the tab shows 'starting'
    with no X button at all. After going to error, there is an X button...
    Let me re-read the symptoms: "close (x) button does not work at all"
    Wait — the session that fails via Restart: restart creates a new DB entry but the old error entry might persist
    AND the new session also goes to error. There could be two entries visible.
    Also after restart, the newly created session for 'k1-rust' is not found by InstanceTracker (prefix issue),
    so it times out to error, and user can see the error tab but the X button adds to dismissedSessions...
    BUT: on next refetch() (within 10s), instances is reloaded from server — but the dismissedSessions Set
    persists in React component state. So dismiss DOES work... unless the refetch returns the same session.
    Actually the session keeps coming back from DB (status=error) and dismissedSessions is in LOCAL state.
    After refetch(), the component re-renders with new instances prop. dismissedSessions is local state —
    it persists through re-renders. So if user dismisses, it stays dismissed through refetches.
    CONCLUSION: The X button SHOULD work for stopped/error tabs. Need to recheck if there's another issue.

- timestamp: 2026-03-05T00:13:00Z
  checked: Mobile tab overflow
  found: |
    InstanceTabBar container: className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto touch-scroll tab-snap"
    Each tab: whitespace-nowrap - correct for horizontal scroll
    BUT: The tab contains session name display which for complex paths is very long
    Line 124: instance.tmuxSessionName.split('-').slice(1).join('-') shows full path slug
    'k1-rust-karbit-friend.kingdom.lv-53e7' → split('-') → ['k1','rust','karbit','friend.kingdom.lv','53e7'] → slice(1) → 'rust-karbit-friend.kingdom.lv-53e7'
    This is very long on mobile. Plus action buttons (Restart, x) add more width.
    The container has overflow-x-auto which SHOULD allow scrolling, but action buttons might still be off-screen
    if the tab is wider than viewport — scrolling works but you need to scroll per-tab to reach the buttons.

## Resolution

root_cause: |
  BUG 1 — Sidebar "Running" label wrong for most agents:
    extractAgentIdFromSessionName() in TmuxSessionManager splits on '-' and returns first segment.
    Session 'agent_g2-gateway_session_name' → strips 'agent_' → 'g2-gateway_session_name' → split('-')[0] = 'g2'
    But openclaw agent id is 'g2-gateway'. The agentId stored in instances table is 'g2', not 'g2-gateway'.
    So activeAgentIds never has 'g2-gateway' — sidebar always shows "Start" for it.
    Same for k1-rust: session 'agent_k1-karbit' → 'k1-karbit' → 'k1', not 'k1-rust'.
    Only 'warden' works because 'agent_warden-kingdom_session_name' → 'warden-kingdom_session_name' → 'warden' ✓

    The REAL FIX: extractAgentIdFromSessionName for 'agent_' prefix should use underscore as separator not dash.
    'agent_warden-kingdom_session_name' → after 'agent_' → 'warden-kingdom_session_name' → split('_')[0] + dash-parts
    Actually the pattern is agent_{agentId}_{rest}. So the extraction should use '_' after 'agent_' to find agentId.
    But 'agent_g2-gateway_session_name' → the part after 'agent_' is 'g2-gateway_session_name' → split('_')[0] = 'g2-gateway' ✓
    And 'agent_warden-kingdom_session_name' → 'warden-kingdom_session_name' → split('_')[0] = 'warden-kingdom' ✗ (too much)

    Actually warden session is 'agent_warden-kingdom_session_name'. The agentId is 'warden'.
    So the naming convention for 'agent_' sessions seems to be 'agent_{agentId}-{rest}' where rest uses '-'.
    So 'agent_warden-kingdom_session_name' → agentId = 'warden' (before first '-' after the prefix)
    And 'agent_g2-gateway_session_name' → agentId = 'g2' ← WRONG, should be 'g2-gateway'

    The tmux session naming appears to be a legacy external convention ('agent_' prefix sessions were named manually).
    The CORRECT fix is: for 'agent_' prefix sessions, use underscore ('_') to find where the project part begins.
    'agent_g2-gateway_session_name' → after 'agent_' → first '_' separates agentId from rest → 'g2-gateway' ✓
    'agent_warden-kingdom_session_name' → after 'agent_' → first '_' → 'warden-kingdom' ✗
    Hmm, 'warden-kingdom' is not right either. 'warden' is the agentId.

    The naming is inconsistent. 'agent_g2-gateway_session_name' uses _ between agentId and rest.
    But 'agent_warden-kingdom_session_name' uses - between agentId and kingdom (the project name).
    So 'warden' is the agentId and 'kingdom' is part of project path here.

    The reliable fix: compare extracted prefix against known openclaw agent IDs from the config.
    OR: accept that these legacy sessions have an agentId extracted the current way, and instead make
    activeAgentIds track instances by their stored agentId (which is 'g2' for the g2-gateway session).
    But that still won't match 'g2-gateway' in openclaw agent list.

    REAL ROOT CAUSE: The mismatch is between what InstanceTracker stores as agentId (truncated from tmux name)
    and what openclaw config uses as agent id ('g2-gateway', 'k1-rust').
    The activeAgentIds set in App.tsx is built from instances[].agentId ('g2', 'k1'),
    but the AgentSidebar checks activeAgentIds.has(agent.id) where agent.id is from openclaw ('g2-gateway', 'k1-rust').

    SIMPLEST FIX: When the Start API call creates a session with correct agentId from openclaw,
    and that session IS later tracked (if prefix is in KNOWN_AGENT_PREFIXES), its DB agentId matches.
    But pre-existing manually-named sessions ('agent_' prefix) are tracked with truncated agentId.

    TWO FIXES NEEDED:
    a) extractAgentIdFromSessionName: improve to handle 'agent_' prefix sessions by finding the agentId
       segment correctly (use the first '_' after 'agent_' as separator: 'agent_g2-gateway_...' → 'g2-gateway')
    b) KNOWN_AGENT_PREFIXES: add all actual agent IDs so newly started sessions are discoverable

  BUG 2 — Start button creates failing sessions:
    KNOWN_AGENT_PREFIXES = ['agent', 'gideon', 'warden', 'scout', 'builder', 'forge']
    Missing: 'g2-gateway', 'g2-frontend', 'k1-rust'
    When Start creates session 'k1-rust-karbit-friend.kingdom.lv-XXXX', InstanceTracker.listAgentSessions()
    filters by KNOWN_AGENT_PREFIXES and skips it (no prefix matches 'k1-rust-').
    Session never transitions from 'starting' to 'active', times out to 'error' after 30s.
    FIX: Add missing agent IDs to KNOWN_AGENT_PREFIXES OR make prefix detection dynamic from openclaw config.

  BUG 3 — X button doesn't work:
    The X dismiss button IS in the code and adds to dismissedSessions local state.
    Re-examining: it should work. BUT: user said it doesn't work.
    Likely the dismiss works visually but on next poll (within 10s) the session comes back from server.
    Wait — dismissedSessions is React local state, persists through re-renders.
    BUT: dismissedSessions is INSIDE InstanceTabBar component. If App re-renders and passes new instances prop,
    InstanceTabBar re-renders but keeps its local state (useState is stable). So dismiss should persist.
    HOWEVER: If InstanceTabBar itself is unmounted and remounted (key change), state resets.
    Looking at App.tsx line 620: <InstanceTabBar> is rendered without a key. So it shouldn't remount.
    ACTUAL ISSUE: The error tab from failed Start has status='error'. X button IS shown for error status.
    BUT: When Restart is clicked, it calls handleRestartInstance(instance.id) which calls refetch().
    After restart, a NEW instance record is created with a different id and different tmuxSessionName.
    The OLD error instance is still in DB as 'error' status (not cleaned up) AND the new instance is 'starting'.
    Both return from API. User sees TWO tabs.
    When they click X on the new 'starting' one — no X button shown (starting status has no X).
    When they click X on the old 'error' one — that one is dismissed locally.
    But if they try again, new instances keep getting created.
    Also: After restart, the 'starting' instance never transitions to 'active' (same BUG 2 — prefix not known).
    So it too goes to 'error', making both tabs 'error', both dismissable.
    But the fundamental UX issue: user expects X to close a session cleanly, not just hide it locally.
    The dismiss is LOCAL state only, so if the page refreshes or component remounts, dismissed tabs return.

  BUG 4 — Mobile tab overflow:
    tab-snap CSS applies scroll-snap-type: x mandatory to the container and scroll-snap-align: start to each tab.
    This means EACH TAB snaps to start of viewport on scroll. On mobile, when a tab is wider than viewport,
    the snap forces you to see only one tab at a time. The Restart and X buttons are inside the same tab div,
    so they should be reachable by scrolling within the snapped tab... but the outer container clips at tab boundary.
    The scroll-snap forces next snap to next tab, so buttons at end of wide tab may be unreachable.
    FIX: Either remove scroll-snap from tab bar, or truncate the session name in tabs on mobile.

fix:
  1. TmuxSessionManager.extractAgentIdFromSessionName: fix 'agent_' prefix parsing to use '_' as separator
     after stripping 'agent_' prefix: 'agent_g2-gateway_session_name' → split on first '_' after prefix → 'g2-gateway'
     BUT this breaks 'agent_warden-kingdom_session_name' → would give 'warden-kingdom' not 'warden'.
     BETTER APPROACH: Add all openclaw agent IDs to KNOWN_AGENT_PREFIXES dynamically OR
     fix the known prefixes to include 'g2-gateway', 'g2-frontend', 'k1-rust', 'k1'.
     And for extractAgentIdFromSessionName with 'agent_' prefix: use the first underscore to split.
     'agent_g2-gateway_session_name' → 'g2-gateway' ← correct
     'agent_warden-kingdom_session_name' → 'warden-kingdom' ← wrong, should be 'warden'
     The 'agent_' sessions are external naming; we can't always parse them correctly.

     PRAGMATIC FIX: Read openclaw agent list at startup, populate KNOWN_AGENT_PREFIXES dynamically.
     AND for 'agent_' prefix: try to match against known openclaw agent IDs (longest match wins).

  2. KNOWN_AGENT_PREFIXES: make dynamic OR add 'g2', 'k1', 'g2-gateway', 'g2-frontend', 'k1-rust'

  3. Mobile tab overflow: Remove tab-snap CSS from InstanceTabBar OR truncate session name on mobile

  4. Tab X dismiss: the local dismiss is correct behavior (no server delete needed), but need to verify
     it persists. If the issue is that the session reappears after page refresh, the DB should be cleaned up.
     Add explicit DELETE from DB when user dismisses a stopped/error tab (call a delete API endpoint).

verification: |
  - Server restarted with new build, startup log confirms:
    "[Warden] Registered 6 openclaw agent prefixes: gideon, warden, forge, g2-gateway, g2-frontend, k1-rust"
  - API instances now show agentId='g2-gateway' for agent_g2-gateway_session_name (was 'g2')
  - API instances now show agentId='g2-frontend' and agentId='k1-rust' for new-format sessions
  - DELETE /api/instances/30 successfully removed the error instance (verified via API response)
  - TypeScript type check: zero errors
  - Production build: successful
  - Mobile: session name slug hidden on mobile (hidden sm:inline), overflow-x-auto without snap allows reaching buttons

files_changed:
  - src/server/services/TmuxSessionManager.ts
  - src/server/index.ts
  - src/server/database/DatabaseConnection.ts
  - src/server/routes/instanceRoutes.ts
  - src/client/components/InstanceTabBar.tsx
  - src/client/App.tsx
