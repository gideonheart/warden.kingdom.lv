---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/components/GsdView.tsx
  - src/client/App.tsx
  - src/client/plugins/gsd-manager-plugin.tsx
autonomous: true
requirements: [QUICK-7]
must_haves:
  truths:
    - "Nav bar shows 'GSD' label where 'Agents' was (both desktop and mobile)"
    - "Clicking GSD nav opens full-page view with 4 tabs: Agents, Controls, Registry, Hooks"
    - "Agents tab shows responsive card grid (from AgentsView), not a dense table"
    - "Controls, Registry, Hooks tabs render full-page content identical to former plugin tabs"
    - "Bottom-panel GSD plugin no longer renders in Terminals view"
    - "URL hash #view=agents still works (no breaking change)"
  artifacts:
    - path: "src/client/components/GsdView.tsx"
      provides: "Full-page GSD view with 4 tabs"
      min_lines: 80
    - path: "src/client/App.tsx"
      provides: "Updated nav labels and view routing"
    - path: "src/client/plugins/gsd-manager-plugin.tsx"
      provides: "Disabled/removed bottom-panel plugin"
  key_links:
    - from: "src/client/App.tsx"
      to: "src/client/components/GsdView.tsx"
      via: "import and render in 'agents' view case"
      pattern: "<GsdView"
    - from: "src/client/components/GsdView.tsx"
      to: "src/client/hooks/useGsdRegistry.js"
      via: "hook imports for registry, live status, hook feed"
      pattern: "useGsdRegistry|useGsdHookFeed|useAgentLiveStatus|useAgentStateFiles"
---

<objective>
Move GSD Control Panel from bottom-panel plugin to a dedicated full-page nav view.

Purpose: The bottom-panel plugin has a fixed h-64 height constraint making it cramped. All GSD functionality (Agents grid, Controls, Registry, Hooks) belongs on a full-page view accessible from the nav bar, replacing the current Agents-only page.

Output: GsdView.tsx full-page component with 4 tabs, updated App.tsx nav labels (Agents -> GSD), disabled bottom-panel plugin.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/App.tsx
@src/client/components/AgentsView.tsx
@src/client/plugins/gsd-manager-plugin.tsx
@src/client/hooks/useGsdRegistry.ts
@src/client/hooks/useGsdHookFeed.ts
@src/client/hooks/useAgentLiveStatus.ts
@src/client/hooks/useAgentStateFiles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create GsdView.tsx full-page component with 4 tabs</name>
  <files>src/client/components/GsdView.tsx</files>
  <action>
Create `src/client/components/GsdView.tsx` that combines the best of AgentsView and GsdManagerPanelExpanded into a full-page tabbed view.

Structure:
1. Import all hooks: useGsdRegistry, useGsdHookFeed, useActiveInstances, useAgentLiveStatus, useAgentStateFiles
2. Define TabId type as 'agents' | 'controls' | 'registry' | 'hooks' with TABS array
3. Copy the helper components from AgentsView.tsx: StateBadge, PressureIndicator, PhaseProgress (with their color maps STATUS_COLORS, STATE_BADGE_COLORS, STATE_LABELS, PRESSURE_COLORS)
4. Also copy CopyButton and BashHint helpers from the plugin (needed by Controls tab)

Tab content:
- **Agents tab** (default): Use the responsive card grid from AgentsView.tsx (the `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4` layout with agent cards). This is the better UX for full-page. Do NOT use the dense table from the plugin.
- **Controls tab**: Copy the spawn form + command dispatch form from GsdManagerPanelExpanded (lines 321-420 of the plugin). Adapt for full-page: increase input widths, use `max-w-3xl` container, proper `space-y-6` spacing, slightly larger text (`text-sm` not `text-xs` for labels).
- **Registry tab**: Copy the registry table from GsdManagerPanelExpanded (lines 423-476). Adapt: use `text-sm` instead of `text-xs` for table text, add proper padding.
- **Hooks tab**: Copy the hooks feed table from GsdManagerPanelExpanded (lines 479-523). Adapt: `text-sm` for readability.

Outer layout:
```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {/* Header with title + tab bar */}
  <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-0">
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold text-warden-text">GSD Control Center</h2>
      {/* agent count badge, loading/error states */}
    </div>
    {/* Tab bar - horizontal buttons */}
    <div className="flex items-center gap-1 border-b border-warden-border">
      {TABS.map(tab => (
        <button ... active/inactive styles using border-b-2 for active tab>
          {tab.label}
        </button>
      ))}
    </div>
  </div>
  {/* Tab content - scrollable */}
  <div className="flex-1 overflow-y-auto p-4 lg:p-6">
    {/* Render active tab */}
  </div>
</div>
```

Tab bar styling: Use underline-style tabs (not the rounded-t tabs from the plugin). Active tab gets `border-b-2 border-warden-accent text-warden-text`, inactive gets `text-warden-text-dim hover:text-warden-text`. Each tab button has `px-4 py-2 text-sm`.

Export as named export: `export function GsdView()`
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors in GsdView.tsx</verify>
  <done>GsdView.tsx exists with 4 tabs, Agents tab uses card grid, Controls/Registry/Hooks adapted from plugin for full-page layout</done>
</task>

<task type="auto">
  <name>Task 2: Update App.tsx nav labels and routing, disable bottom-panel plugin</name>
  <files>src/client/App.tsx, src/client/plugins/gsd-manager-plugin.tsx</files>
  <action>
**In App.tsx:**

1. Replace import: Change `import { AgentsView }` to `import { GsdView }` from `./components/GsdView.js`
2. Remove the AgentsView import line entirely

3. Desktop nav (line ~196-200): Change the button label from `Agents` to `GSD` — keep the onClick as `handleViewChange('agents')` (URL hash compatibility)
4. Mobile nav (line ~253-258): Change the button label from `Agents` to `GSD` — keep the onClick as `handleViewChange('agents')`
5. Mobile active view label (line ~224): The `<span className="text-xs text-warden-accent capitalize">{currentView}</span>` will show "agents" when on GSD view. Change this to a lookup: `{currentView === 'agents' ? 'GSD' : currentView}` (capitalize the others still)

6. View rendering (line ~325-326): Replace `<AgentsView />` with `<GsdView />`

Keep the AppView type as `'terminals' | 'history' | 'plugins' | 'agents'` — no change needed. The internal value stays 'agents' for URL compatibility.

**In gsd-manager-plugin.tsx:**

Disable the plugin by changing the manifest slot to prevent it from rendering in bottom-panel. Two options — use the simpler one:

Change the `export default` at the bottom (line 554) to export a manifest with `enabled: false` by default:
```tsx
// Plugin disabled — GSD content moved to dedicated nav page (GsdView.tsx)
// Keeping file for reference; slot changed to prevent bottom-panel rendering.
const disabledManifest = { ...manifest, slot: 'disabled' as const } satisfies PluginManifest;
export default { manifest: disabledManifest, PanelComponent: GsdManagerPanel } satisfies PluginModule;
```

Wait — the PluginManifest type has `slot: 'bottom-panel' | 'sidebar-top' | ...` which won't accept 'disabled'. Simpler approach: just rename the file extension so it's not auto-discovered by `import.meta.glob('./*.tsx')`.

Actually, simplest correct approach: delete the file content and replace with a comment + re-export that makes it a no-op. But that loses the code.

Best approach: Rename `gsd-manager-plugin.tsx` to `gsd-manager-plugin.tsx.disabled` so `import.meta.glob('./*.tsx')` skips it. Use `git mv` for this.

If the slot type does not accept 'disabled', use this alternate approach in the file itself instead of renaming:
- Keep the file as-is for code reference
- Add a top-of-file comment: `// DISABLED: GSD content moved to dedicated GSD nav page (GsdView.tsx)`
- Change the PanelComponent to return `null`:
```tsx
function DisabledPanel() { return null; }
export default { manifest, PanelComponent: DisabledPanel } satisfies PluginModule;
```

This way the plugin still registers but renders nothing. The bottom-panel slot renderer will render an empty component. This is the least invasive change.
  </action>
  <verify>
1. `npx tsc --noEmit` passes
2. `npm run dev:all` starts without errors
3. Visit http://localhost:5173/#view=agents — shows GSD Control Center with 4 tabs
4. Desktop nav shows "GSD" label, not "Agents"
5. Terminals view no longer shows the collapsible GSD panel at the bottom
  </verify>
  <done>
- Nav shows "GSD" in both desktop and mobile menus
- #view=agents renders GsdView with 4 working tabs
- Agents tab shows responsive card grid
- Bottom-panel plugin disabled (renders null)
- No type errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. Navigate to each of the 4 tabs (Agents, Controls, Registry, Hooks) — all render content
3. Agents tab shows card grid layout, not a table
4. Controls tab spawn form and dispatch form both functional
5. Terminals view has no bottom-panel GSD section
6. URL #view=agents loads the GSD page correctly
7. Mobile hamburger menu shows "GSD" not "Agents"
</verification>

<success_criteria>
- GSD full-page view accessible from nav with 4 tabs
- Card grid on Agents tab (responsive, not cramped)
- Controls, Registry, Hooks tabs all work full-page
- Bottom-panel plugin no longer visible
- No regressions in other views (Terminals, History, Plugins)
</success_criteria>

<output>
After completion, create `.planning/quick/7-move-gsd-control-panel-to-dedicated-nav-/7-SUMMARY.md`
</output>
