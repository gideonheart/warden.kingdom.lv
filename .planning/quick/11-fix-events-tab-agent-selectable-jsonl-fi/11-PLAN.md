---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/index.ts
  - src/server/services/GsdEventLogService.ts
  - src/server/routes/gsdRoutes.ts
  - src/shared/gsdTypes.ts
  - src/client/hooks/useGsdEventFeed.ts
  - src/client/components/EventsTab.tsx
autonomous: true
requirements: [EVENTS-FIX-01, EVENTS-FIX-02]

must_haves:
  truths:
    - "Events tab loads JSON data without HTML/404 errors"
    - "User can see a dropdown listing available JSONL log files by agent name"
    - "Selecting an agent filters events to that agent's log file only"
    - "Default 'All agents' option shows merged events from all files"
  artifacts:
    - path: "src/server/index.ts"
      provides: "SPA fallback that skips /api/ routes"
      contains: "/api/"
    - path: "src/server/services/GsdEventLogService.ts"
      provides: "listLogFiles() and per-file event reading"
      exports: ["gsdEventLogService"]
    - path: "src/server/routes/gsdRoutes.ts"
      provides: "GET /api/gsd/events/sources and ?source= query param on /api/gsd/events"
    - path: "src/client/components/EventsTab.tsx"
      provides: "Agent source selector dropdown in EventsTab header"
  key_links:
    - from: "src/client/components/EventsTab.tsx"
      to: "/api/gsd/events/sources"
      via: "fetch in useGsdEventFeed or separate useEffect"
      pattern: "api/gsd/events/sources"
    - from: "src/client/hooks/useGsdEventFeed.ts"
      to: "/api/gsd/events?source="
      via: "fetch with source query param"
      pattern: "source="
    - from: "src/server/routes/gsdRoutes.ts"
      to: "gsdEventLogService"
      via: "getRecentEvents(limit, source)"
      pattern: "getRecentEvents"
---

<objective>
Fix two issues with the Events tab added in quick-10:

1. API returns HTML instead of JSON — the SPA fallback catch-all regex in index.ts can intercept /api/ requests when dist/client exists during dev. Fix by making the SPA fallback explicitly skip API routes.

2. Agent-selectable JSONL files — currently all JSONL files are merged. Add a source selector so users can filter events by agent log file.

Purpose: Make the Events tab functional and usable with multi-agent log files.
Output: Working Events tab with agent source selector and reliable API responses.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/server/index.ts
@src/server/services/GsdEventLogService.ts
@src/server/routes/gsdRoutes.ts
@src/shared/gsdTypes.ts
@src/client/hooks/useGsdEventFeed.ts
@src/client/components/EventsTab.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix SPA fallback and add agent source filtering to backend</name>
  <files>
    src/server/index.ts
    src/server/services/GsdEventLogService.ts
    src/server/routes/gsdRoutes.ts
    src/shared/gsdTypes.ts
  </files>
  <action>
**src/server/index.ts (SPA fallback fix):**
Change the SPA fallback at line 83 from `app.get(/.*/)` to explicitly skip API and socket.io paths. Replace:
```typescript
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
});
```
With:
```typescript
app.get(/^\/(?!api\/|socket\.io\/).*/, (_request, response) => {
  response.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
});
```
This negative lookahead ensures `/api/*` and `/socket.io/*` requests NEVER hit the SPA fallback, even if no API route matches (they'll get Express's default 404 JSON instead of HTML).

**src/shared/gsdTypes.ts:**
Add a new interface for log file source metadata:
```typescript
export interface GsdEventSource {
  filename: string;   // e.g. "agent_warden-kingdom_session_name-raw-events.jsonl"
  label: string;      // human-friendly label derived from filename, e.g. "warden-kingdom"
  sizeBytes: number;  // file size for display
}
```

**src/server/services/GsdEventLogService.ts:**
1. Add a `listLogFiles()` method that reads LOGS_DIR, filters for `*-raw-events.jsonl` files, stats each for size, and returns `GsdEventSource[]`. Derive `label` from filename by stripping the `-raw-events.jsonl` suffix (e.g. `agent_warden-kingdom_session_name-raw-events.jsonl` -> `agent_warden-kingdom_session_name`, `no-tmux-raw-events.jsonl` -> `no-tmux`).
2. Modify `getRecentEvents(limit, source?)` to accept optional `source` parameter (a filename string). When `source` is provided, read ONLY that one file instead of all files. When `source` is undefined/empty, keep current behavior (read all files, merge).
3. Validate that `source` filename matches the `*-raw-events.jsonl` pattern and does not contain path separators (`/`, `\`) to prevent directory traversal.

**src/server/routes/gsdRoutes.ts:**
1. Add new endpoint `GET /api/gsd/events/sources` that calls `gsdEventLogService.listLogFiles()` and returns `{ sources: GsdEventSource[] }`.
2. Modify existing `GET /api/gsd/events` to read optional `source` query parameter and pass it to `getRecentEvents(limit, source)`. Validate source is a string if present.
3. Add explicit `Content-Type: application/json` header to the events endpoint response for defense-in-depth: `response.setHeader('Content-Type', 'application/json')` before `response.json()`.
  </action>
  <verify>
Run `npm run typecheck` to confirm no type errors. Then start the dev server with `npm run dev` and test:
- `curl -s http://127.0.0.1:3001/api/gsd/events?limit=5 | head -c 100` should return JSON starting with `{"events":`
- `curl -s http://127.0.0.1:3001/api/gsd/events/sources | head -c 200` should return JSON with sources array
- `curl -s "http://127.0.0.1:3001/api/gsd/events?limit=5&source=no-tmux-raw-events.jsonl" | head -c 100` should return events from only that file
- `curl -s http://127.0.0.1:3001/api/nonexistent` should NOT return HTML (no SPA fallback for /api/ paths)
  </verify>
  <done>
API endpoints return JSON reliably. SPA fallback no longer intercepts /api/ paths. New /sources endpoint lists available log files. Events endpoint accepts optional source filter.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add agent source selector to EventsTab UI</name>
  <files>
    src/client/hooks/useGsdEventFeed.ts
    src/client/components/EventsTab.tsx
  </files>
  <action>
**src/client/hooks/useGsdEventFeed.ts:**
1. Add `source` parameter to the hook: `useGsdEventFeed(source?: string)`.
2. Include `source` in the fetch URL when provided: `/api/gsd/events?limit=100&source={encodeURIComponent(source)}`.
3. Add `source` to the `useCallback` dependency array so the fetch re-runs when source changes.
4. Export a separate function or add to the hook return: fetch sources list from `/api/gsd/events/sources` on mount. Return `{ events, sources, isLoading, error, selectedSource }` or keep sources fetching separate.

Preferred approach: Add a second hook `useGsdEventSources()` that fetches `/api/gsd/events/sources` once on mount (no polling needed — file list is stable). Returns `{ sources: GsdEventSource[], isLoading: boolean }`.

**src/client/components/EventsTab.tsx:**
1. Import `GsdEventSource` from `@shared/gsdTypes.js` and the new `useGsdEventSources` hook.
2. Add state: `const [selectedSource, setSelectedSource] = useState<string>('')` (empty string = all agents).
3. Pass `selectedSource || undefined` to `useGsdEventFeed(selectedSource || undefined)`.
4. Call `useGsdEventSources()` to get available sources.
5. Render a source selector above the events list. Use a simple `<select>` element styled with Tailwind (matching warden theme):
```tsx
<div className="flex items-center gap-3 mb-3">
  <label className="text-sm text-warden-text-dim shrink-0">Source:</label>
  <select
    value={selectedSource}
    onChange={(e) => setSelectedSource(e.target.value)}
    className="bg-warden-panel border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
  >
    <option value="">All agents</option>
    {sources.map((s) => (
      <option key={s.filename} value={s.filename}>
        {s.label} ({formatBytes(s.sizeBytes)})
      </option>
    ))}
  </select>
</div>
```
6. Add a small `formatBytes(bytes: number): string` helper that formats file sizes (e.g. "2.5 MB", "39 KB") for display in the dropdown options.
7. Keep existing event grouping and rendering unchanged — only the data source changes.
  </action>
  <verify>
Run `npm run typecheck` to confirm no type errors. Start `npm run dev:all` and open http://localhost:5173 in browser. Navigate to GSD view > Events tab. Verify:
- Source dropdown appears above the event list
- "All agents" is selected by default and shows merged events
- Selecting a specific agent source shows only events from that file
- Selecting back to "All agents" shows merged events again
- File sizes display correctly in dropdown options
- No console errors related to fetch or JSON parsing
  </verify>
  <done>
EventsTab shows a source selector dropdown listing available JSONL log files with human-friendly labels and file sizes. Selecting a source filters the event feed to that file only. "All agents" merges all files (original behavior).
  </done>
</task>

</tasks>

<verification>
1. `npm run typecheck` passes with no errors
2. Events tab loads without HTML/404 errors in dev mode
3. Source selector lists all available JSONL files
4. Filtering by source works correctly
5. SPA fallback does not intercept any /api/ routes
</verification>

<success_criteria>
- GET /api/gsd/events returns JSON (not HTML) in all scenarios
- GET /api/gsd/events/sources returns list of available log files
- GET /api/gsd/events?source=filename.jsonl filters to single file
- EventsTab renders source selector dropdown with agent labels
- Selecting a source updates the displayed events immediately
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-events-tab-agent-selectable-jsonl-fi/11-SUMMARY.md`
</output>
