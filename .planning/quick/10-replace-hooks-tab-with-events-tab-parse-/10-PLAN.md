---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/shared/gsdTypes.ts
  - src/server/services/GsdEventLogService.ts
  - src/server/routes/gsdRoutes.ts
  - src/server/index.ts
  - src/client/hooks/useGsdEventFeed.ts
  - src/client/components/EventsTab.tsx
  - src/client/components/GsdView.tsx
  - src/server/services/GsdHookLogWatcher.ts
  - src/client/hooks/useGsdHookFeed.ts
  - src/client/components/HooksTab.tsx
autonomous: true
requirements: [QUICK-10]

must_haves:
  truths:
    - "GSD Events tab shows recent agent events from JSONL logs, grouped by tool_use_id"
    - "AskUserQuestion events show question text, option chips, and the selected answer highlighted"
    - "Tool use events show tool name and a short summary (file path, pattern, command)"
    - "Noise events (Notification, PermissionRequest) are filtered out"
    - "All hooks code (server watcher, socket namespace, client hook, HooksTab) is deleted"
    - "Events auto-refresh every 5 seconds via polling"
  artifacts:
    - path: "src/shared/gsdTypes.ts"
      provides: "GsdEvent types and discriminated unions"
      contains: "GsdRawEvent"
    - path: "src/server/services/GsdEventLogService.ts"
      provides: "JSONL log reader service"
      exports: ["gsdEventLogService"]
    - path: "src/server/routes/gsdRoutes.ts"
      provides: "GET /api/gsd/events endpoint"
      contains: "/api/gsd/events"
    - path: "src/client/hooks/useGsdEventFeed.ts"
      provides: "Polling hook for events API"
      exports: ["useGsdEventFeed"]
    - path: "src/client/components/EventsTab.tsx"
      provides: "Events tab with grouped event display"
      exports: ["EventsTab"]
  key_links:
    - from: "src/client/components/EventsTab.tsx"
      to: "/api/gsd/events"
      via: "useGsdEventFeed polling hook"
      pattern: "useGsdEventFeed"
    - from: "src/server/routes/gsdRoutes.ts"
      to: "src/server/services/GsdEventLogService.ts"
      via: "getRecentEvents call"
      pattern: "gsdEventLogService\\.getRecentEvents"
    - from: "src/client/components/GsdView.tsx"
      to: "src/client/components/EventsTab.tsx"
      via: "tab rendering"
      pattern: "EventsTab"
---

<objective>
Replace the dead Hooks tab (which watches /tmp/gsd-hooks.log text format) with an Events tab that reads agent JSONL event log files, groups Pre/PostToolUse pairs into single entries, and displays readable summaries including AskUserQuestion Q&A rendering.

Purpose: The hooks log system is obsolete. Agent events are now written as structured JSONL by the GSD skill. This gives operators real visibility into what agents are doing.
Output: Working Events tab replacing Hooks, all hooks code deleted.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/shared/gsdTypes.ts
@src/server/services/GsdHookLogWatcher.ts
@src/server/services/GsdRegistryService.ts
@src/server/routes/gsdRoutes.ts
@src/server/index.ts
@src/client/hooks/useGsdHookFeed.ts
@src/client/hooks/useGsdRegistry.ts
@src/client/components/HooksTab.tsx
@src/client/components/GsdView.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add shared types, create server event log service, and wire REST endpoint</name>
  <files>
    src/shared/gsdTypes.ts
    src/server/services/GsdEventLogService.ts
    src/server/routes/gsdRoutes.ts
    src/server/index.ts
    src/server/services/GsdHookLogWatcher.ts
    src/client/hooks/useGsdHookFeed.ts
    src/client/components/HooksTab.tsx
  </files>
  <action>
**1. Add event types to `src/shared/gsdTypes.ts`** (append to existing file):

```ts
// --- GSD Event Log Types ---

export type GsdEventType =
  | 'SessionStart' | 'Stop' | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'SubagentStart' | 'SubagentStop'
  | 'Notification' | 'PermissionRequest';

// Noise events to skip in display
export const GSD_NOISE_EVENTS: Set<string> = new Set(['Notification', 'PermissionRequest']);

export interface GsdRawEvent {
  timestamp: string;
  event: GsdEventType;
  session: string;
  payload: Record<string, unknown>;
}

// Grouped display event — Pre+Post merged into one entry
export interface GsdDisplayEvent {
  id: string;             // tool_use_id or timestamp-based unique key
  timestamp: string;
  session: string;        // short session name
  eventType: 'tool' | 'tool_failure' | 'prompt' | 'ask_question' | 'lifecycle';
  toolName?: string;
  summary: string;        // one-line human-readable summary
  error?: string;         // for PostToolUseFailure
  // AskUserQuestion specifics
  questions?: Array<{
    question: string;
    header?: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
    answer?: string;       // from PostToolUse response
    notes?: string;        // from PostToolUse annotations
  }>;
}
```

**2. Create `src/server/services/GsdEventLogService.ts`:**

- Derive logs directory from REGISTRY_PATH pattern: `path.resolve(path.dirname(REGISTRY_PATH), '../logs')` where REGISTRY_PATH = `/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/agent-registry.json`. Hardcode LOGS_DIR = `/home/forge/.openclaw/workspace/skills/gsd-code-skill/logs`.
- Class `GsdEventLogService` with method `async getRecentEvents(limit: number = 100): Promise<GsdRawEvent[]>`:
  - Use `readdir` to find all `*-raw-events.jsonl` files in LOGS_DIR
  - For each file, read with `readFile(path, 'utf-8')`, split on `\n`, filter empty lines, JSON.parse each line
  - Wrap each file read in try/catch (skip unreadable files gracefully)
  - Merge all events, sort by timestamp descending
  - Filter out noise events (Notification, PermissionRequest) server-side
  - Return the last `limit` events (most recent first)
- For performance: only read the last ~50KB of each file (similar to GsdHookLogWatcher.readLastLines pattern) since files can grow large. Use `stat` + `createReadStream` with `start` option, or `open` + `read` from offset. Read last 64KB per file to get recent events.
- Export singleton: `export const gsdEventLogService = new GsdEventLogService();`

**3. Add REST endpoint in `src/server/routes/gsdRoutes.ts`:**

- Add new route `GET /api/gsd/events` that accepts `?limit=N` query param (default 100, max 500)
- Calls `gsdEventLogService.getRecentEvents(limit)` and returns `{ events: GsdRawEvent[] }`
- Import `gsdEventLogService` from the new service file

**4. Remove all hooks code:**

- **Delete file** `src/server/services/GsdHookLogWatcher.ts`
- **Delete file** `src/client/hooks/useGsdHookFeed.ts`
- **Delete file** `src/client/components/HooksTab.tsx`
- In `src/server/routes/gsdRoutes.ts`: remove the `GET /api/gsd/hooks/log` route (lines 321-335) and remove the `gsdHookLogWatcher` import
- In `src/server/index.ts`: remove import of `gsdHookLogWatcher`, remove `gsdHookLogWatcher.setupSocketNamespace(socketServer)` (line 96), remove `gsdHookLogWatcher.startWatching()` (line 97), remove `gsdHookLogWatcher.stopWatching()` from shutdown handler (line 115)
  </action>
  <verify>
- `npm run typecheck` passes with no errors
- `curl http://localhost:3001/api/gsd/events?limit=10` returns JSON with `events` array containing parsed JSONL events
- Confirm deleted files no longer exist: `test ! -f src/server/services/GsdHookLogWatcher.ts && test ! -f src/client/hooks/useGsdHookFeed.ts && test ! -f src/client/components/HooksTab.tsx`
  </verify>
  <done>
Server reads JSONL event logs from disk, serves them via REST, all hooks infrastructure is deleted. Typecheck passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create client EventsTab with grouped event display and AskUserQuestion rendering</name>
  <files>
    src/client/hooks/useGsdEventFeed.ts
    src/client/components/EventsTab.tsx
    src/client/components/GsdView.tsx
  </files>
  <action>
**1. Create `src/client/hooks/useGsdEventFeed.ts`:**

Follow the `useGsdRegistry` polling pattern exactly:
- `POLL_INTERVAL_MS = 5_000` (5 seconds, matching GSD polling cadence)
- `useCallback` for `fetchEvents`, `useEffect` with `setInterval` + immediate call on mount
- Fetch `GET /api/gsd/events?limit=100`
- Return `{ events: GsdRawEvent[], isLoading, error }`
- Import `GsdRawEvent` from `@shared/gsdTypes.js`

**2. Create `src/client/components/EventsTab.tsx`:**

This is the main display component. It takes raw events and groups/renders them.

**Grouping logic** (implemented as a `useMemo` over raw events):
- Build a Map keyed by `tool_use_id` from payload
- PreToolUse + PostToolUse/PostToolUseFailure with same `tool_use_id` become ONE `GsdDisplayEvent`
- Events without `tool_use_id` (SessionStart, Stop, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop) become standalone entries
- PermissionRequest and Notification are already filtered server-side, but also skip client-side as safety

**Summary generation per event type:**
- `UserPromptSubmit`: truncate `payload.prompt` to 200 chars with ellipsis
- `PreToolUse`/`PostToolUse` (grouped as 'tool'):
  - `Read`/`Write`: show `payload.tool_input.file_path` (basename only)
  - `Grep`: show `payload.tool_input.pattern` (truncated to 60 chars)
  - `Bash`: show `payload.tool_input.command` (truncated to 80 chars)
  - `Glob`: show `payload.tool_input.pattern`
  - `AskUserQuestion`: eventType = 'ask_question', populate `questions` array from PreToolUse `tool_input.questions` and PostToolUse `tool_response.answers` + `tool_response.annotations`
  - Default: show tool name
- `PostToolUseFailure`: eventType = 'tool_failure', show `payload.error` truncated to 120 chars
- `SessionStart`: "Session started" + `payload.source` if present
- `Stop`: "Agent stopped"
- `SessionEnd`: "Session ended" + `payload.reason` if present
- `SubagentStart`/`SubagentStop`: "Subagent {agent_type} started/stopped"

**Rendering layout:**
Each event row is a `div` with horizontal layout:
- Time column: `HH:MM:SS` format, `text-warden-text-dim`, monospace, ~70px wide
- Session column: short session name (strip common prefixes if too long, or just use raw), `text-warden-text-dim`, ~120px wide
- Event badge: small rounded badge with event type name. Colors:
  - `tool`: `bg-blue-900/40 text-blue-300`
  - `tool_failure`: `bg-red-900/40 text-red-300`
  - `prompt`: `bg-green-900/40 text-green-300`
  - `ask_question`: `bg-purple-900/40 text-purple-300`
  - `lifecycle`: `bg-warden-border text-warden-text-dim`
- Summary: the main text, `text-warden-text`, flex-1

**AskUserQuestion expanded rendering** (when eventType === 'ask_question'):
Below the summary row, render each question:
- Question text in `text-sm text-warden-text`
- Options as horizontal flex-wrap chips: `px-2 py-0.5 rounded text-xs`
  - Selected answer: `bg-warden-accent/20 text-warden-accent border border-warden-accent/40`
  - Unselected: `bg-warden-panel text-warden-text-dim border border-warden-border`
  - For multiSelect, split answer by `, ` and highlight each matching option
- If notes exist: show in `text-xs text-warden-text-dim italic` below options

**Empty state:** "No agent events found. Events appear as agents perform actions." in `text-sm text-warden-text-dim`.

**List container:** `space-y-1` for compact rows, with `divide-y divide-warden-border/30` between events. Newest events at top (server returns descending order).

**3. Update `src/client/components/GsdView.tsx`:**

- Replace `import { HooksTab }` with `import { EventsTab }`
- Change TabId union: `'hooks'` becomes `'events'`
- Change TABS array: `{ id: 'events', label: 'Events' }` instead of hooks
- Change render: `{activeTab === 'events' && <EventsTab />}` instead of HooksTab
  </action>
  <verify>
- `npm run typecheck` passes
- `npm run dev:all` — navigate to GSD Control Center, Events tab visible, shows event rows from JSONL logs
- Verify AskUserQuestion events render with option chips and highlighted answers (check using the `all-sample-events.jsonl` log data which contains AskUserQuestion events)
  </verify>
  <done>
Events tab displays grouped agent events with readable summaries. AskUserQuestion shows Q&A with option chips and highlighted answers. Hook references fully replaced. Tab label reads "Events" not "Hooks". 5-second auto-refresh works.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` — zero errors
- `npm run build` — production build succeeds
- No references to GsdHookLogWatcher, useGsdHookFeed, HooksTab, or '/gsd-hooks' remain in src/
- `curl http://localhost:3001/api/gsd/events?limit=5` returns valid JSON with events array
- Events tab renders in browser at GSD Control Center view
- Grep for "hooks" in src/ returns no hits (except comments/docs if any)
</verification>

<success_criteria>
1. Hooks tab fully replaced by Events tab in GSD Control Center
2. Events tab shows grouped tool use events (Pre+Post merged), prompt submissions, and lifecycle markers
3. AskUserQuestion events render question text, option chips, highlighted selected answer, and notes
4. Noise events (Notification, PermissionRequest) are filtered out
5. All hooks code deleted: GsdHookLogWatcher service, /gsd-hooks Socket.IO namespace, useGsdHookFeed hook, HooksTab component, /api/gsd/hooks/log endpoint
6. TypeScript compiles cleanly, production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/10-replace-hooks-tab-with-events-tab-parse-/10-SUMMARY.md`
</output>
