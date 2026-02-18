---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/components/SearchableSelect.tsx
  - src/client/components/GsdView.tsx
autonomous: true
requirements: [QUICK-8]

must_haves:
  truths:
    - "Agent Name field shows filtered dropdown of registered agent_ids when typing"
    - "Selecting an agent auto-fills Working Directory from registry data"
    - "Working Directory remains editable after auto-fill"
    - "First Command field shows filtered dropdown of GSD slash commands"
    - "Dispatch Command field shows filtered dropdown of GSD slash commands"
    - "All searchable fields still accept arbitrary free text"
    - "Keyboard navigation (ArrowUp/Down/Enter/Escape) works in dropdowns"
  artifacts:
    - path: "src/client/components/SearchableSelect.tsx"
      provides: "Reusable combobox component"
      exports: ["SearchableSelect"]
    - path: "src/client/components/GsdView.tsx"
      provides: "Controls tab with searchable dropdowns"
      contains: "SearchableSelect"
  key_links:
    - from: "src/client/components/GsdView.tsx"
      to: "src/client/components/SearchableSelect.tsx"
      via: "import SearchableSelect"
      pattern: "import.*SearchableSelect"
    - from: "GsdView Controls tab"
      to: "useGsdRegistry agents array"
      via: "agent_id options + onSelect auto-fills workdir"
      pattern: "agent\\.working_directory"
---

<objective>
Enhance the GSD Controls tab with searchable dropdowns for Agent Name, First Command, and Dispatch Command fields. Create a reusable SearchableSelect combobox component (no npm deps) that filters options as the user types, supports keyboard navigation, and allows free-text input. When an agent is selected from the dropdown, auto-fill the Working Directory field from the registry.

Purpose: Reduce friction when spawning agents and dispatching commands — no need to remember agent names or GSD command syntax.
Output: SearchableSelect component + upgraded Controls tab in GsdView.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/components/GsdView.tsx
@src/client/hooks/useGsdRegistry.ts
@src/client/styles.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create reusable SearchableSelect combobox component</name>
  <files>src/client/components/SearchableSelect.tsx</files>
  <action>
Create a self-contained combobox component at `src/client/components/SearchableSelect.tsx` with this interface:

```tsx
interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  onSelect?: (value: string) => void;  // Called only when an option is picked from dropdown (not on free text)
}
```

Implementation details:
- Renders a text `<input>` that shows `value` and calls `onChange` on every keystroke (supports free text).
- When input is focused AND has text, show a dropdown `<div>` below the input listing options filtered by case-insensitive substring match of the current value.
- If value is empty and input is focused, show all options (so user can browse).
- Each option in the dropdown is a `<div>` with hover highlight. Clicking an option sets the value and calls both `onChange` and `onSelect`.
- Keyboard navigation: ArrowDown/ArrowUp moves a `highlightedIndex` state through filtered options. Enter selects the highlighted option. Escape closes the dropdown.
- Close dropdown on blur (use a small `setTimeout` of ~150ms on blur to allow click events on options to fire first).
- Dropdown is positioned absolutely below the input, `z-50`, with `max-h-48 overflow-y-auto`.
- Style with warden theme tokens: `bg-warden-panel border border-warden-border rounded`, option hover: `bg-warden-accent/20 text-warden-text`, highlighted: `bg-warden-accent/30`.
- Input styling passed via `className` prop (GsdView will provide existing input classes).
- No new npm dependencies. Pure React + Tailwind.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Visually: the component exports a single named export `SearchableSelect`.
  </verify>
  <done>SearchableSelect.tsx exists, exports the component, compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Integrate SearchableSelect into GsdView Controls tab</name>
  <files>src/client/components/GsdView.tsx</files>
  <action>
Import `SearchableSelect` from `./SearchableSelect.js` at the top of GsdView.tsx.

Define a constant array of GSD slash commands inside GsdView (above the component, after imports):

```tsx
const GSD_COMMANDS: string[] = [
  '/gsd:quick',
  '/gsd:resume-work',
  '/gsd:progress',
  '/gsd:plan-phase',
  '/gsd:execute-phase',
  '/gsd:verify-work',
  '/gsd:debug',
  '/gsd:new-milestone',
  '/gsd:discuss-phase',
  '/gsd:help',
  '/gsd:settings',
  '/gsd:check-todos',
  '/gsd:pause-work',
  '/gsd:health',
  '/gsd:status',
  '/gsd:research-phase',
];
```

Replace three `<input>` elements in the Controls tab:

**1. Agent Name field (Spawn form):**
Replace the `<input>` (line ~373-379) with:
```tsx
<SearchableSelect
  value={agentName}
  onChange={setAgentName}
  options={agents.map((a) => a.agent_id)}
  placeholder="e.g. forge"
  className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-40"
  onSelect={(selectedAgentId) => {
    const agent = agents.find((a) => a.agent_id === selectedAgentId);
    if (agent?.working_directory) {
      setWorkdir(agent.working_directory);
    }
  }}
/>
```

This is the critical auto-fill wiring: when an agent is selected from the dropdown, find that agent in the `agents` array (already available from `registry?.agents ?? []`) and set `workdir` to `agent.working_directory`.

**2. First Command field (Spawn form):**
Replace the `<input>` (line ~393-399) with:
```tsx
<SearchableSelect
  value={firstCommand}
  onChange={setFirstCommand}
  options={GSD_COMMANDS}
  placeholder="Optional first command"
  className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-56"
/>
```

**3. Dispatch Command field:**
Replace the `<input>` (line ~440-446) with:
```tsx
<SearchableSelect
  value={commandText}
  onChange={setCommandText}
  options={GSD_COMMANDS}
  placeholder="e.g. /gsd:status"
  className="bg-warden-bg border border-warden-border text-warden-text text-sm px-3 py-1.5 rounded w-72"
/>
```

**Leave unchanged:** Working Directory stays a plain `<input>` (pre-filled by agent selection, manually editable). Target Session stays a plain `<select>` (already works well for session picking).
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Run `npm run dev:all` and navigate to GSD > Controls tab:
- Agent Name shows dropdown of registered agents when focused; selecting one fills Working Directory.
- First Command and Dispatch Command show GSD slash command dropdown when focused.
- All three fields accept free text that is not in the dropdown list.
- Keyboard nav (arrows, enter, escape) works.
  </verify>
  <done>
Controls tab uses SearchableSelect for Agent Name, First Command, and Dispatch Command fields. Selecting an agent auto-fills Working Directory. GSD commands appear as suggestions. Free text input still works for all fields. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. GSD > Controls tab renders without console errors
3. Agent Name dropdown populated from registry agents
4. Selecting agent auto-fills Working Directory
5. Working Directory editable after auto-fill
6. First Command shows GSD slash commands dropdown
7. Dispatch Command shows GSD slash commands dropdown
8. Free text accepted in all SearchableSelect fields
9. Keyboard navigation works (Arrow keys, Enter, Escape)
</verification>

<success_criteria>
- SearchableSelect component exists and is reusable
- All three target fields use SearchableSelect with appropriate options
- Agent selection auto-fills working directory
- No new npm dependencies added
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/8-prepopulate-gsd-controls-with-searchable/8-SUMMARY.md`
</output>
