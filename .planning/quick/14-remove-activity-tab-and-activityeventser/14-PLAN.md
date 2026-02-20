---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/components/HistoryView.tsx
  - src/client/components/ActivityView.tsx         # DELETE
  - src/client/components/ActivityEventRow.tsx      # DELETE
  - src/server/services/ActivityEventService.ts     # DELETE
  - src/server/routes/activityRoutes.ts             # DELETE
  - src/server/services/TerminalStreamService.ts
  - src/server/services/InstanceTracker.ts
  - src/server/routes/agentRoutes.ts
  - src/server/index.ts
  - src/server/database/DatabaseConnection.ts
  - src/shared/types.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "History view loads without errors and shows Sessions, Token Usage, Gateway Logs tabs"
    - "No Activity tab visible in History view (desktop or mobile)"
    - "Server starts without importing or initializing ActivityEventService"
    - "Terminal streaming works without ActivityEventService side-channel tap"
    - "InstanceTracker discovers sessions without logging activity events"
    - "Prompt sending via agentRoutes works without capturing activity events"
    - "Build succeeds with zero TypeScript errors"
  artifacts:
    - path: "src/client/components/HistoryView.tsx"
      provides: "History view with 3 tabs (sessions, tokens, logs) — no activity"
    - path: "src/server/services/TerminalStreamService.ts"
      provides: "Terminal streaming without ActivityEventService import"
    - path: "src/server/index.ts"
      provides: "Server entry without activityRoutes or activityEventService"
  key_links:
    - from: "src/server/services/TerminalStreamService.ts"
      to: "node-pty onData handler"
      via: "Direct broadcast only, no setImmediate activity tap"
      pattern: "ptyProcess.onData"
---

<objective>
Remove the Activity tab and all supporting infrastructure (ActivityEventService, activityRoutes, client components, database methods, shared types). The Events tab in GSD view now provides the same data at higher fidelity via structured Claude Code hook callbacks.

Purpose: Dead code removal — Activity was a PTY regex parser producing lower-quality data than the Events tab's hook-based approach.
Output: Cleaner codebase with ~800 LOC removed across 4 deleted files and 7 modified files.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/client/components/HistoryView.tsx
@src/client/components/ActivityView.tsx
@src/client/components/ActivityEventRow.tsx
@src/server/services/ActivityEventService.ts
@src/server/services/TerminalStreamService.ts
@src/server/services/InstanceTracker.ts
@src/server/routes/activityRoutes.ts
@src/server/routes/agentRoutes.ts
@src/server/index.ts
@src/server/database/DatabaseConnection.ts
@src/shared/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete Activity client components and remove Activity tab from HistoryView</name>
  <files>
    src/client/components/ActivityView.tsx
    src/client/components/ActivityEventRow.tsx
    src/client/components/HistoryView.tsx
  </files>
  <action>
    1. DELETE `src/client/components/ActivityView.tsx` entirely.
    2. DELETE `src/client/components/ActivityEventRow.tsx` entirely.
    3. Edit `src/client/components/HistoryView.tsx`:
       - Remove the `import { ActivityView } from './ActivityView.js';` line.
       - Change the `HistoryTab` type from `'sessions' | 'tokens' | 'logs' | 'activity'` to `'sessions' | 'tokens' | 'logs'`.
       - Change default tab from `useState<HistoryTab>('activity')` to `useState<HistoryTab>('sessions')`.
       - Remove the `{ id: 'activity', label: 'Activity' }` entry from the `tabs` array.
       - Remove `{activeTab === 'activity' && <ActivityView onNavigateToSession={onNavigateToSession} />}` from the desktop tab content.
       - Remove the entire `<MobileAccordionSection title="Activity" defaultOpen>` block from the mobile accordion. Change the Sessions accordion to `defaultOpen` instead.
  </action>
  <verify>Run `npx tsc --noEmit` — no TypeScript errors in client code related to Activity imports or types.</verify>
  <done>ActivityView.tsx and ActivityEventRow.tsx deleted. HistoryView shows 3 tabs (Sessions as default, Token Usage, Gateway Logs) with no Activity tab in desktop or mobile layouts.</done>
</task>

<task type="auto">
  <name>Task 2: Remove ActivityEventService from server — delete service, routes, strip all references</name>
  <files>
    src/server/services/ActivityEventService.ts
    src/server/routes/activityRoutes.ts
    src/server/services/TerminalStreamService.ts
    src/server/services/InstanceTracker.ts
    src/server/routes/agentRoutes.ts
    src/server/index.ts
    src/server/database/DatabaseConnection.ts
    src/shared/types.ts
  </files>
  <action>
    1. DELETE `src/server/services/ActivityEventService.ts` entirely.
    2. DELETE `src/server/routes/activityRoutes.ts` entirely.

    3. Edit `src/server/services/TerminalStreamService.ts`:
       - Remove `import { activityEventService } from './ActivityEventService.js';` line.
       - In `ptyProcess.onData` handler (line ~121-133): Remove the entire `setImmediate` block that calls `activityEventService.processTerminalChunk`. Keep the broadcast loop to subscribers.
       - In `ptyProcess.onExit` handler (line ~135): Remove `activityEventService.clearSessionBuffer(sessionName);` call.
       - In `setupSocketInputHandlers` `terminal:input` handler (line ~166-171): Remove the two lines that extract agentId and call `activityEventService.captureOperatorInput`. Keep the `session.ptyProcess.write(userInput)` line.
       - In `cleanupSession` method (line ~215): Remove `activityEventService.clearSessionBuffer(sessionName);` call.

    4. Edit `src/server/services/InstanceTracker.ts`:
       - Remove `import { activityEventService } from './ActivityEventService.js';` line.
       - In `syncWithTmux`: Remove the block that calls `activityEventService.captureSessionStart` for newly discovered sessions (lines ~42-49). Keep the upsert and everything else.
       - Remove the block that calls `activityEventService.captureSessionStop` for stopping instances (lines ~53-58). Keep `database.markMissingSessionsStopped(activeSessionNames)`.

    5. Edit `src/server/routes/agentRoutes.ts`:
       - Remove `import { activityEventService } from '../services/ActivityEventService.js';` line.
       - In the POST `/api/agents/:agentId/prompt` handler: Remove both `activityEventService.capturePromptSent(...)` calls (one in try block on success, one in catch block on failure). Keep all other logic intact.

    6. Edit `src/server/index.ts`:
       - Remove `import { activityRoutes } from './routes/activityRoutes.js';` line.
       - Remove `import { activityEventService } from './services/ActivityEventService.js';` line.
       - Remove `app.use(activityRoutes);` line.
       - Remove `activityEventService.startRetentionCleanup();` line.
       - Remove `activityEventService.stopRetentionCleanup();` from `handleShutdown`.

    7. Edit `src/server/database/DatabaseConnection.ts`:
       - Remove the `ActivityEvent` import from the types import line (keep `AgentInstance, AgentInstanceCreateParams, AgentInstanceStatus`).
       - Remove the `insertActivityEvent` method entirely (lines ~187-213).
       - Remove the `updateActivityEventSuccess` method entirely (lines ~215-219).
       - Remove the `queryActivityEvents` method entirely (lines ~221-273).
       - Remove the `getDistinctEventTypes` method entirely (lines ~275-279).
       - Remove the `purgeOldActivityEvents` method entirely (lines ~281-286).
       - Keep the `activity_events` table creation in `runMigrations` — existing DBs have the table and removing it from migration is harmless (CREATE TABLE IF NOT EXISTS is idempotent). This avoids needing a DROP migration.

    8. Edit `src/shared/types.ts`:
       - Remove the `ActivityEventType` type alias (lines ~41-49).
       - Remove the `ActivityEvent` interface (lines ~51-62).
       - Remove the `ActivityEventsResponse` interface (lines ~64-67).
       - Keep all other types (`AgentInstance`, `AgentInstanceStatus`, `AgentInstanceCreateParams`, `TmuxSessionInfo`, `TerminalResizePayload`, `TerminalExitPayload`).
  </action>
  <verify>
    1. `npx tsc --noEmit` — zero TypeScript errors.
    2. `npm run build` — production build succeeds for both client and server.
    3. Grep confirms no remaining references: `grep -r "activityEvent\|ActivityEvent\|activityRoutes\|ActivityView\|ActivityEventRow" src/` should return zero results.
  </verify>
  <done>ActivityEventService.ts and activityRoutes.ts deleted. All 5 consumer files (TerminalStreamService, InstanceTracker, agentRoutes, index.ts, DatabaseConnection) no longer import or call any activity-related code. Shared types cleaned. Build passes.</done>
</task>

</tasks>

<verification>
1. `npm run build` completes with zero errors (both client and server).
2. `grep -r "ActivityEvent\|activityEvent\|ActivityView\|ActivityEventRow\|activityRoutes" src/` returns empty.
3. `grep -r "activity_events" src/server/database/` returns only the CREATE TABLE IF NOT EXISTS migration (acceptable).
4. HistoryView.tsx has exactly 3 tabs: sessions, tokens, logs.
</verification>

<success_criteria>
- Four files deleted: ActivityView.tsx, ActivityEventRow.tsx, ActivityEventService.ts, activityRoutes.ts
- Seven files modified: HistoryView.tsx, TerminalStreamService.ts, InstanceTracker.ts, agentRoutes.ts, index.ts, DatabaseConnection.ts, types.ts
- Production build succeeds
- No remaining imports or references to Activity infrastructure in src/
</success_criteria>

<output>
After completion, create `.planning/quick/14-remove-activity-tab-and-activityeventser/14-SUMMARY.md`
</output>
