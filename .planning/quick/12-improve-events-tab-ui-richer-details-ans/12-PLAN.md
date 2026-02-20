---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/shared/gsdTypes.ts
  - src/client/utils/gsdEventGrouping.ts
  - src/client/components/EventsTab.tsx
autonomous: true
requirements: [UI-DETAIL, UI-ANSWERS, UI-SESSION-FILTER, CODE-SRP]

must_haves:
  truths:
    - "Bash events show description field as primary summary instead of raw command"
    - "Read/Write events show relative path (stripped /home/forge/) instead of bare filename"
    - "AskUserQuestion summary shows first question text truncated, not just 'AskUserQuestion'"
    - "Clicking an event row expands to show full details (full command, full path, error)"
    - "Session filter dropdown filters events by unique session values"
    - "Grouping logic lives in a separate utility file, not in EventsTab.tsx"
  artifacts:
    - path: "src/client/utils/gsdEventGrouping.ts"
      provides: "groupRawEvents, buildToolSummary, truncate, and helper functions extracted from EventsTab"
      exports: ["groupRawEvents"]
    - path: "src/client/components/EventsTab.tsx"
      provides: "Rendering: expandable rows, session filter, improved summaries"
    - path: "src/shared/gsdTypes.ts"
      provides: "GsdDisplayEvent with optional detail field for expandable view"
      contains: "detail?"
  key_links:
    - from: "src/client/components/EventsTab.tsx"
      to: "src/client/utils/gsdEventGrouping.ts"
      via: "import { groupRawEvents }"
      pattern: "import.*groupRawEvents.*gsdEventGrouping"
    - from: "src/client/utils/gsdEventGrouping.ts"
      to: "src/shared/gsdTypes.ts"
      via: "import types"
      pattern: "import.*GsdRawEvent.*GsdDisplayEvent.*gsdTypes"
---

<objective>
Improve the Events tab with richer event details, expandable rows, answer visibility for AskUserQuestion events, session filtering, and extract grouping logic for SRP.

Purpose: The Events tab currently shows minimal one-line summaries that are not descriptive enough. Users cannot see full details, cannot tell what was answered for questions, and cannot filter by session within a source. The grouping logic is also co-located with rendering code violating SRP.

Output: Enhanced EventsTab with expandable detail rows, better summaries (Bash description, relative paths, question text), session filter dropdown, and extracted utility module.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/components/EventsTab.tsx
@src/shared/gsdTypes.ts
@src/client/hooks/useGsdEventFeed.ts
@src/client/components/ActivityEventRow.tsx (reference for expandable row pattern)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract grouping logic to utility and enhance GsdDisplayEvent type</name>
  <files>
    src/shared/gsdTypes.ts
    src/client/utils/gsdEventGrouping.ts
  </files>
  <action>
**1. Update GsdDisplayEvent in `src/shared/gsdTypes.ts`:**

Add an optional `detail` field to `GsdDisplayEvent` for expandable row content:

```typescript
export interface GsdDisplayEvent {
  // ... existing fields ...
  detail?: string;         // full detail text shown in expanded view (full command, full path, etc.)
}
```

**2. Create `src/client/utils/gsdEventGrouping.ts`:**

Extract from EventsTab.tsx lines 10-217 into this new file:
- `truncate()` function
- `getToolInput()` function
- `AskQuestion` interface
- `buildToolSummary()` function — with these improvements:
  - **Bash**: Use `toolInput.description` as primary summary if present and non-empty, falling back to truncated command text. Example: description "Record plan start time" is better than `node /home/forge/.claude/get-shit-done/bin/...`
  - **Read/Write**: Strip `/home/forge/` prefix from file_path to show relative path (e.g. `warden.kingdom.lv/src/client/components/EventsTab.tsx`), NOT just the basename. Keep truncate to 80 chars.
  - **AskUserQuestion**: Use the first question text truncated to 60 chars as the summary instead of the static string "AskUserQuestion". Access questions via `(toolInput.questions as AskQuestion[])`. If no questions, fall back to "AskUserQuestion".
  - **Grep**: Include path if present: `truncate(pattern, 40)` + ` in ${path}` if toolInput.path exists.
- `groupRawEvents()` function — with these additions:
  - Populate `detail` field on each GsdDisplayEvent during grouping:
    - **Bash tools**: `detail` = full command text (`String(toolInput.command ?? '')`)
    - **Read tools**: `detail` = full file_path (no truncation)
    - **Write tools**: `detail` = full file_path
    - **Grep tools**: `detail` = `"pattern: ${pattern}"` + `"\npath: ${path}"` if path exists + `"\nglob: ${glob}"` if glob exists
    - **Glob tools**: `detail` = `"pattern: ${pattern}"` + `"\npath: ${path}"` if path exists
    - **AskUserQuestion**: `detail` = undefined (handled by QuestionDisplay component)
    - **tool_failure**: Append full error message to `detail` (not truncated, unlike the `error` field which stays truncated for the summary line)
    - **Standalone events (prompt, lifecycle)**: `detail` = full prompt text for UserPromptSubmit (not truncated), undefined for lifecycle events

Export only `groupRawEvents` (the helpers are internal). Keep the file focused — no rendering code.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm type correctness. Verify the new file exists and exports groupRawEvents. Verify GsdDisplayEvent has the detail field.
  </verify>
  <done>
Grouping logic extracted to standalone utility. GsdDisplayEvent has optional detail field. buildToolSummary produces improved summaries: Bash uses description, Read/Write show relative paths, AskUserQuestion shows first question text. All tool events populate detail for expanded view.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add expandable rows, session filter, and update EventsTab rendering</name>
  <files>
    src/client/components/EventsTab.tsx
  </files>
  <action>
**1. Update imports:**

Remove the extracted code (lines 10-217: truncate, getToolInput, AskQuestion, buildToolSummary, groupRawEvents). Import `groupRawEvents` from `../utils/gsdEventGrouping.js`. Keep all other imports (React hooks, types, useGsdEventFeed, useGsdEventSources, GSD_NOISE_EVENTS import can be removed since grouping handles it).

**2. Add session filter state and logic:**

Add state: `const [selectedSession, setSelectedSession] = useState<string>('');`

Derive unique sessions from displayEvents:
```typescript
const uniqueSessions = useMemo(() => {
  const sessions = new Set(displayEvents.map((e) => e.session));
  return Array.from(sessions).sort();
}, [displayEvents]);
```

Apply session filter:
```typescript
const filteredEvents = useMemo(() => {
  if (!selectedSession) return displayEvents;
  return displayEvents.filter((e) => e.session === selectedSession);
}, [displayEvents, selectedSession]);
```

**3. Add session filter dropdown next to the source selector:**

After the existing source `<select>`, add a second dropdown:
```tsx
<label className="text-sm text-warden-text-dim shrink-0">Session:</label>
<select
  value={selectedSession}
  onChange={(e) => setSelectedSession(e.target.value)}
  className="bg-warden-panel border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
>
  <option value="">All sessions</option>
  {uniqueSessions.map((s) => (
    <option key={s} value={s}>{s}</option>
  ))}
</select>
```

Wrap both source and session selectors in a flex row with `flex-wrap` so they stack on narrow screens. Reset `selectedSession` to `''` when `selectedSource` changes (use a useEffect or handle in the source onChange).

**4. Add expandable row state:**

Add state: `const [expandedId, setExpandedId] = useState<string | null>(null);`

Toggle handler: clicking a row sets `expandedId` to the event's id (or null if already expanded).

**5. Update event row rendering:**

Use `filteredEvents` instead of `displayEvents` for the map.

For each event row, follow the expandable pattern from ActivityEventRow.tsx:

- Make the row clickable with `role="button"`, `tabIndex={0}`, `cursor-pointer`, click/keydown handlers
- Add a small chevron indicator (Unicode &#9660;) that rotates when expanded: `transition-transform ${isExpanded ? 'rotate-180' : ''}`
- When expanded (`event.id === expandedId`), render an expanded detail panel below the summary row:

```tsx
{event.id === expandedId && (
  <div className="bg-warden-bg/50 border-t border-warden-border/30 px-4 py-2 text-xs space-y-2">
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      <div>
        <span className="text-warden-text-dim">Session: </span>
        <span className="font-mono text-warden-text">{event.session}</span>
      </div>
      <div>
        <span className="text-warden-text-dim">Time: </span>
        <span className="font-mono text-warden-text">{event.timestamp}</span>
      </div>
      {event.toolName && (
        <div>
          <span className="text-warden-text-dim">Tool: </span>
          <span className="text-warden-text">{event.toolName}</span>
        </div>
      )}
    </div>
    {event.detail && (
      <div>
        <span className="text-warden-text-dim block mb-1">Detail:</span>
        <pre className="font-mono bg-warden-bg rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-warden-text">
          {event.detail}
        </pre>
      </div>
    )}
    {event.error && (
      <div>
        <span className="text-red-400 block mb-1">Error:</span>
        <pre className="font-mono bg-red-900/20 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-red-300">
          {event.error}
        </pre>
      </div>
    )}
    {/* AskUserQuestion detail stays as QuestionDisplay */}
    {event.eventType === 'ask_question' && event.questions && event.questions.length > 0 && (
      <QuestionDisplay questions={event.questions} />
    )}
  </div>
)}
```

**6. Remove the old always-visible Q&A and error sections:**

The old code renders QuestionDisplay and error details below every matching event unconditionally (lines 410-421). Remove those — they now only appear in the expanded view.

**7. Keep existing components in EventsTab.tsx:**

Keep in EventsTab.tsx (do NOT extract):
- `EVENT_BADGE_CLASSES` and `EVENT_BADGE_LABELS` constants
- `QuestionDisplay` component
- `formatBytes` helper
- `EventsTab` main component

These are rendering concerns that belong with the component.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Run `npm run dev:all` and open the Events tab in the browser. Verify:
1. Events show improved summaries (Bash description, relative paths for Read/Write)
2. AskUserQuestion events show first question text in summary line
3. Clicking any event row expands to show full detail panel
4. Clicking again collapses it
5. Session filter dropdown appears next to source selector
6. Selecting a session filters events to only that session
7. "All sessions" option shows everything
  </verify>
  <done>
EventsTab has expandable rows showing full details on click, session filter dropdown populated from unique session values, improved summary text for all tool types, and clean separation — rendering in EventsTab.tsx, grouping in gsdEventGrouping.ts.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. EventsTab.tsx imports groupRawEvents from utils/gsdEventGrouping.ts
3. No grouping logic remains in EventsTab.tsx (search for "groupRawEvents" function definition should only be in utility file)
4. GsdDisplayEvent type has optional `detail` field
5. Bash events show description when available
6. Read/Write events show path relative to /home/forge/
7. AskUserQuestion summary shows first question text
8. Click-to-expand works on all event types
9. Session filter shows unique sessions from loaded events
10. EventsTab.tsx is shorter than the original 428 lines (grouping logic extracted)
</verification>

<success_criteria>
- Grouping logic (groupRawEvents + helpers) extracted to src/client/utils/gsdEventGrouping.ts
- EventsTab.tsx focused on rendering only
- All event types show improved, descriptive summaries
- Expandable rows reveal full detail (command, path, error, Q&A)
- Session filter dropdown works as client-side filter
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/12-improve-events-tab-ui-richer-details-ans/12-SUMMARY.md`
</output>
