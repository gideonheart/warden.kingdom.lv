---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/utils/gsdEventGrouping.ts
autonomous: true
requirements: [QUICK-13]

must_haves:
  truths:
    - "Skill events show skill name and args (e.g. 'gsd:discuss-phase 2') instead of just 'Skill'"
    - "Task events show subagent type and description (e.g. 'gsd-planner — Quick plan: Improve Events tab') instead of just 'Task'"
    - "Edit events show relative file path (like Read/Write) instead of just 'Edit'"
    - "TaskCreate events show their subject text instead of just 'TaskCreate'"
    - "TaskUpdate events show task ID and status instead of just 'TaskUpdate'"
    - "TaskOutput events show task_id instead of just 'TaskOutput'"
    - "All existing tool summaries (Read, Write, Bash, Grep, Glob, AskUserQuestion) remain unchanged"
  artifacts:
    - path: "src/client/utils/gsdEventGrouping.ts"
      provides: "Enriched buildToolSummary and buildToolDetail for 6 additional tool types"
      contains: "case 'Skill'"
  key_links:
    - from: "src/client/utils/gsdEventGrouping.ts"
      to: "EventsTab rendering"
      via: "buildToolSummary/buildToolDetail called during groupRawEvents"
      pattern: "buildToolSummary\\(toolName"
---

<objective>
Enrich the Events tab buildToolSummary and buildToolDetail functions to produce meaningful summaries for tool types that currently fall through to the default case: Skill, Task, Edit, TaskCreate, TaskUpdate, TaskOutput.

Purpose: Events tab rows for these tool types currently show bare tool names like "Skill" or "Task" which are useless for understanding what happened. Real JSONL payloads contain structured data (skill name, subagent type, file path, subject, status) that should be surfaced.

Output: Updated gsdEventGrouping.ts with 6 new switch cases in both buildToolSummary and buildToolDetail.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/utils/gsdEventGrouping.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add summary and detail cases for Skill, Task, Edit, TaskCreate, TaskUpdate, TaskOutput</name>
  <files>src/client/utils/gsdEventGrouping.ts</files>
  <action>
Add 6 new cases to the switch statement in `buildToolSummary()` (before the `default` case at line 69):

**Skill:** `tool_input: { skill: string, args?: string }`
- Summary: `${skill} ${args}` (truncated to 80). If no skill, return "Skill".
- Example: `gsd:discuss-phase 2`

**Task:** `tool_input: { subagent_type?: string, description?: string, model?: string }`
- Summary: `${subagent_type} — ${description}` (truncated to 80). If only description, use that. If neither, return "Task".
- Example: `gsd-planner — Quick plan: Improve Events tab`

**Edit:** `tool_input: { file_path: string, old_string?: string, new_string?: string }`
- Summary: `toRelativePath(file_path)` (truncated to 80) — same pattern as Read/Write.
- Example: `warden.kingdom.lv/.planning/STATE.md`

**TaskCreate:** `tool_input: { subject?: string, description?: string }`
- Summary: `subject` text (truncated to 80). If no subject, return "TaskCreate".
- Example: `Validate plans and commit`

**TaskUpdate:** `tool_input: { taskId?: string, status?: string }`
- Summary: `#{taskId} -> {status}` if both present. If only taskId, `#{taskId}`. If only status, `-> {status}`. Otherwise "TaskUpdate".
- Example: `#1 -> completed`

**TaskOutput:** `tool_input: { task_id?: string }`
- Summary: `task: {task_id}` (truncated to 60). If no task_id, return "TaskOutput".

Add corresponding 6 cases to the switch statement in `buildToolDetail()` (before the `default` case at line 103):

**Skill:** Return `skill: ${skill}\nargs: ${args}` (omit args line if empty).

**Task:** Return `subagent: ${subagent_type}\nmodel: ${model}\ndescription: ${description}` (omit missing fields).

**Edit:** Return full `file_path` string (same as Read/Write detail).

**TaskCreate:** Return `subject: ${subject}\ndescription: ${description}` (omit missing fields, truncate description to 200).

**TaskUpdate:** Return `taskId: ${taskId}\nstatus: ${status}` (omit missing fields).

**TaskOutput:** Return `task_id: ${task_id}` or undefined if empty.

Do NOT modify any existing cases (Read, Write, Bash, Grep, Glob, AskUserQuestion). Only add new cases before `default`.
  </action>
  <verify>
Run `npm run typecheck` to confirm no TypeScript errors. Then visually inspect the switch statements to confirm:
1. All 6 new cases exist in buildToolSummary
2. All 6 new cases exist in buildToolDetail
3. Existing cases are untouched
4. The default fallback still exists as final case
  </verify>
  <done>
buildToolSummary returns meaningful text for Skill, Task, Edit, TaskCreate, TaskUpdate, and TaskOutput tool types using real payload fields. buildToolDetail returns structured multi-line details for the same 6 types. All existing behavior preserved.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with no errors
- `npm run build` succeeds
- The switch statements in buildToolSummary and buildToolDetail each handle 12 cases (6 original + 6 new) plus default
</verification>

<success_criteria>
- Skill events display as "gsd:discuss-phase 2" not "Skill"
- Task events display as "gsd-planner — Quick plan: ..." not "Task"
- Edit events display relative file paths not "Edit"
- TaskCreate events display subject text not "TaskCreate"
- TaskUpdate events display "#1 -> completed" not "TaskUpdate"
- TaskOutput events display task ID not "TaskOutput"
- All existing tool type summaries unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/13-enrich-events-tab-skill-details-askuserq/13-SUMMARY.md`
</output>
