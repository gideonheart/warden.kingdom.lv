---
status: resolved
trigger: "activity-event-success-tracking: Tool call events store NULL for success, previous N/A rename should be reverted, need actual success tracking or remove misleading UI"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED
test: TypeScript typecheck, production build, Playwright E2E tests
expecting: All pass
next_action: Archive and commit

## Symptoms

expected: Activity events (especially tool_call type) should have a proper success/failure indicator based on the actual outcome of the tool call
actual: Tool call events store NULL for success because the system only captures the tool invocation line from PTY output, not the result/outcome
errors: No crash — data completeness issue
reproduction: Open History view, look at activity events — tool calls all show Unknown/N/A for success
started: Since Phase 11 (Activity Timeline) was implemented

## Eliminated

- hypothesis: Success can't be determined from PTY output
  evidence: Claude Code TUI output DOES show result indicators after tool calls. The system already has regexes for them (FILE_EDIT_SUCCESS_RE, RESULT_ERROR_RE, BASH_EXIT_RE) but they create separate events instead of updating the tool_call event.
  timestamp: 2026-02-18T00:01:00Z

## Evidence

- timestamp: 2026-02-18T00:01:00Z
  checked: ActivityEventService.ts parseAndCaptureEvents method
  found: Tool invocation and result are captured as independent events with no correlation
  implication: Need to add session state to track pending tool_call and update it when result arrives

- timestamp: 2026-02-18T00:01:00Z
  checked: Claude Code TUI output patterns
  found: Tool call format uses result indicators (Updated/Created/Wrote, Error, exit code) that follow the tool invocation
  implication: Can correlate by tracking "last tool call event ID" per session

- timestamp: 2026-02-18T00:01:00Z
  checked: Database queryActivityEvents SQL
  found: SQLite INTEGER (0/1/NULL) was being cast to TypeScript as-is, but frontend checks used === true/false which fails against numbers 0/1
  implication: Additional bug — success indicators were NEVER rendering correctly for ANY event type, not just tool_call

- timestamp: 2026-02-18T00:05:00Z
  checked: TypeScript typecheck, production build, Playwright E2E (12 tests)
  found: All pass
  implication: Fix is correct and causes no regressions

## Resolution

root_cause: |
  Three issues combined:
  1. ActivityEventService.parseAndCaptureEvents captured tool invocations and results as
     independent events with NO correlation. Tool_call events were inserted with success=NULL
     because at invocation time, success is unknown.
  2. The UI (ActivityEventRow) unconditionally showed a success indicator for ALL event types,
     including types where success is not applicable (session_start, session_stop, operator_input).
  3. The database query returned SQLite INTEGER values (0/1/NULL) but the frontend compared
     with === true / === false, which NEVER matched, so success indicators were broken for
     ALL event types including file_edit and bash_command that already had success data.

fix: |
  Part 1 - Backend: Pending tool call tracking (ActivityEventService.ts)
  - Added pendingToolCallIds Map<string, number> to track last tool_call event ID per session
  - When a tool_call is inserted, its row ID is captured and stored as pending
  - When a result indicator arrives (file_edit, error, bash_command), the pending tool_call's
    success is updated via UPDATE before creating the result event
  - When a NEW tool call arrives with a still-pending predecessor, the predecessor is
    assumed successful (no error was detected)
  - On session cleanup (clearSessionBuffer), any pending tool call is resolved as successful

  Part 2 - Database layer (DatabaseConnection.ts)
  - Changed insertActivityEvent to return the inserted row ID (was void)
  - Added updateActivityEventSuccess(eventId, success) method
  - Fixed queryActivityEvents to convert SQLite INTEGER (0/1/NULL) to JavaScript boolean/null
    using post-processing map instead of relying on CASE expression

  Part 3 - UI (ActivityEventRow.tsx)
  - Added EVENT_TYPES_WITH_SUCCESS set defining which event types track success
  - SuccessIndicator now accepts eventType prop; shows empty spacer for non-tracked types
  - For tracked types with null success, shows vertical ellipsis (pending) instead of minus
  - Expanded detail panel only shows "Success:" row for tracked event types
  - Reverted the cosmetic "N/A" label — no longer needed since the field is hidden for
    non-applicable types and shows "Pending" for not-yet-resolved tracked types

verification: |
  - TypeScript typecheck: PASS (no errors)
  - Production build: PASS (vite build + tsc)
  - Playwright E2E: 12/12 tests PASS
  - Manual code review of all three changed files: correct

files_changed:
  - src/server/services/ActivityEventService.ts
  - src/server/database/DatabaseConnection.ts
  - src/client/components/ActivityEventRow.tsx
