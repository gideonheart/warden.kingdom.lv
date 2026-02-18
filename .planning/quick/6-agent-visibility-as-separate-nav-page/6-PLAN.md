---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/App.tsx
  - src/client/components/AgentsView.tsx
autonomous: true
requirements: [QUICK-6]

must_haves:
  truths:
    - "User sees an 'Agents' nav button in the header that navigates to a full-page agents view"
    - "Agents view shows a card grid with every registered agent displaying status, state badge, context pressure, and GSD phase/progress"
    - "URL hash updates to #view=agents when navigating to the Agents page and survives page refresh"
    - "Existing sidebar Agents toggle button remains functional (it controls the right sidebar, not this page)"
  artifacts:
    - path: "src/client/components/AgentsView.tsx"
      provides: "Full-page agent visibility grid component"
      min_lines: 80
    - path: "src/client/App.tsx"
      provides: "Updated nav with 'agents' view type and routing"
  key_links:
    - from: "src/client/components/AgentsView.tsx"
      to: "/api/gsd/registry"
      via: "useGsdRegistry hook"
      pattern: "useGsdRegistry"
    - from: "src/client/components/AgentsView.tsx"
      to: "/api/gsd/agents/live-status"
      via: "useAgentLiveStatus hook"
      pattern: "useAgentLiveStatus"
    - from: "src/client/App.tsx"
      to: "src/client/components/AgentsView.tsx"
      via: "conditional render on currentView === 'agents'"
      pattern: "currentView.*agents"
---

<objective>
Add a dedicated "Agents" page as a top-level navigation view in Warden Dashboard, providing full-page visibility into all registered agents with live state badges, context pressure indicators, and GSD phase/progress -- the same data currently buried in the bottom-panel GSD Control Center plugin, but now front-and-center as a first-class page.

Purpose: The GSD Control Center's agent grid is hidden behind an expandable bottom panel. Operators need at-a-glance agent visibility without hunting through plugin panels.
Output: New AgentsView component + updated App.tsx nav routing.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/App.tsx
@src/client/plugins/gsd-manager-plugin.tsx
@src/client/hooks/useAgentLiveStatus.ts
@src/client/hooks/useAgentStateFiles.ts
@src/client/hooks/useGsdRegistry.ts
@src/client/hooks/useActiveInstances.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create AgentsView full-page component</name>
  <files>src/client/components/AgentsView.tsx</files>
  <action>
Create a new `AgentsView` component that renders a full-page agent overview grid. This is a standalone page component (not a plugin panel), so it receives no props.

**Data sources (reuse existing hooks):**
- `useGsdRegistry()` for agent list, enabled state, toggle
- `useAgentLiveStatus()` for live state badges and context pressure
- `useAgentStateFiles(sessionNames)` for GSD phase/progress from STATE.md
- `useActiveInstances()` for tmux session status (active/idle/stopped)

**Layout:**
- Header area: "Agents" title + agent count badge + loading/error states
- Below header: responsive card grid using CSS grid (1 col mobile, 2 cols md, 3 cols lg, 4 cols xl)
- Each agent card (warden-panel background, warden-border, rounded-lg, p-4):
  - Top row: agent_id (font-mono, font-semibold) + status dot (reuse STATUS_COLORS pattern from plugin: active=warden-success, idle=warden-idle, stopped=warden-error) + status label
  - Middle section: three data rows, each a label+value pair:
    - "State:" + StateBadge (colored pill: working=warden-accent, idle=warden-idle, menu=warden-warning, permission_prompt=warden-warning, error=warden-error)
    - "Context:" + PressureIndicator (percentage with color: ok=warden-success, warning=warden-warning, critical=warden-error)
    - "Phase:" + PhaseProgress (e.g. "P14 70%")
  - Bottom row: tmux session name (text-warden-text-dim, font-mono, text-xs, truncate) + enabled/disabled toggle button
- Empty state when no agents: centered message "No agents registered" with dim text

**Important implementation details:**
- Re-implement StateBadge, PressureIndicator, PhaseProgress as local helper components within this file (do NOT import from the plugin -- plugins are not meant to export sub-components). Copy the color maps (STATE_BADGE_COLORS, PRESSURE_COLORS, STATE_LABELS) directly.
- The STATUS_COLORS map for instance status: `{ active: 'bg-warden-success', idle: 'bg-warden-idle', stopped: 'bg-warden-error', error: 'bg-warden-error' }`
- Use `useMemo` to derive `sessionNames` from registry agents (same pattern as gsd-manager-plugin line 147-150)
- Card hover effect: `hover:border-warden-accent/30 transition-colors`
- All warden-* color tokens, no hardcoded colors
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually inspect the file for correct imports and complete JSX structure.</verify>
  <done>AgentsView.tsx exists with card grid layout, all three live-status indicators (state, context, phase), responsive grid breakpoints, and proper data hook wiring.</done>
</task>

<task type="auto">
  <name>Task 2: Add Agents view to App.tsx navigation and routing</name>
  <files>src/client/App.tsx</files>
  <action>
Update App.tsx to add "Agents" as a fourth top-level navigation view.

**Changes to make:**

1. **Import:** Add `import { AgentsView } from './components/AgentsView.js';` at top.

2. **AppView type (line 15):** Change from `'terminals' | 'history' | 'plugins'` to `'terminals' | 'history' | 'plugins' | 'agents'`.

3. **parseHash function (line 21):** Add `'agents'` to the view parsing chain:
   ```
   const view: AppView = viewParam === 'history' ? 'history' : viewParam === 'plugins' ? 'plugins' : viewParam === 'agents' ? 'agents' : 'terminals';
   ```

4. **Desktop nav buttons (around line 176-199):** Add an "Agents" nav button AFTER "History" and BEFORE "Plugins":
   ```tsx
   <button
     onClick={() => handleViewChange('agents')}
     className={`px-2 py-1 min-h-[44px] text-xs transition-colors flex items-center ${currentView === 'agents' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'}`}
   >
     Agents
   </button>
   ```

5. **Rename the existing sidebar "Agents" toggle button (around line 203)** to "Sidebar" to avoid confusion with the new Agents page nav button. Just change the button text from "Agents" to "Sidebar".

6. **Mobile dropdown menu (around line 228-265):** Add an "Agents" button in the dropdown AFTER "History" and BEFORE "Plugins":
   ```tsx
   <button
     onClick={() => { handleViewChange('agents'); setShowMobileMenu(false); }}
     className={`w-full text-left px-4 py-3 min-h-[44px] text-sm transition-colors ${currentView === 'agents' ? 'text-warden-accent bg-warden-accent/10' : 'text-warden-text-dim hover:text-warden-text hover:bg-warden-border/30'}`}
   >
     Agents
   </button>
   ```

7. **Rename the mobile sidebar toggle** (around line 254) from "Agents" to "Sidebar" to match desktop change.

8. **Mobile active view label (line 217):** Already uses `capitalize` on `currentView`, so "agents" will display as "Agents" -- no change needed.

9. **Main content area routing (around line 281-316):** Add the AgentsView render branch. Currently the ternary chain is: terminals ? ... : plugins ? ... : HistoryView. Change to: terminals ? ... : agents ? AgentsView : plugins ? ... : HistoryView. Specifically, insert BEFORE the plugins check:
   ```tsx
   ) : currentView === 'agents' ? (
     <AgentsView />
   ```

10. **Bottom panel (line 318):** The GSD Control Center bottom-panel plugin currently only shows on terminals view. Keep this behavior -- do NOT show bottom-panel on the Agents page (it would be redundant since the agents grid is already the whole page).

11. **Sidebar visibility:** The right sidebar (AgentSidebar + PromptPanel) should NOT show on the Agents page view -- it is a terminals-specific feature. The sidebar already only renders plugin slots for `currentView === 'terminals'`, and the sidebar itself always renders. No change needed -- the sidebar continues to work as before (toggled by the now-renamed "Sidebar" button).
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Run `npm run dev:all` and verify in browser: (1) "Agents" button appears in nav bar between History and Plugins, (2) clicking it shows the AgentsView, (3) URL hash updates to `#view=agents`, (4) sidebar toggle now reads "Sidebar", (5) mobile hamburger menu includes "Agents" option.</verify>
  <done>App.tsx has 4 nav views (Terminals, History, Agents, Plugins), AgentsView renders as full-page content, URL hash routing works for `#view=agents`, sidebar toggle renamed to "Sidebar" to avoid confusion.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Navigate to `#view=agents` -- full-page agent card grid renders
3. Each agent card shows: status dot, state badge, context pressure %, phase/progress
4. Card grid is responsive: 1 col on mobile, 2 on md, 3 on lg, 4 on xl
5. Nav bar: Terminals | History | Agents | Plugins | [divider] | Sidebar | Refresh
6. Mobile hamburger includes Agents option
7. Clicking agent cards' enabled/disabled toggle works (calls PATCH API)
8. Existing GSD Control Center bottom panel still works on Terminals view
</verification>

<success_criteria>
- AgentsView.tsx exists as a self-contained full-page component with card grid
- App.tsx routes to AgentsView on `currentView === 'agents'`
- Nav bar has 4 views + sidebar toggle renamed to "Sidebar"
- All three agent visibility indicators (state, context pressure, phase) display correctly
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/6-agent-visibility-as-separate-nav-page/6-SUMMARY.md`
</output>
