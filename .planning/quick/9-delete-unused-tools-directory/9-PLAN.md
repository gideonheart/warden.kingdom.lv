---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [QUICK-9]

must_haves:
  truths:
    - "tools/ directory no longer exists in the repository"
    - "No references to tools/ remain in git tracking"
  artifacts: []
  key_links: []
---

<objective>
Delete the unused tools/ directory and its 4 files (gideon-gsd-poller.sh, warden-gsd-watchdog.sh, poller.out, gideon-gsd-poller.log) from the repository.

Purpose: Remove standalone operator scripts that are not referenced anywhere in the Warden codebase.
Output: Clean repository with tools/ directory removed and deletion committed.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete tools/ directory and commit</name>
  <files>tools/gideon-gsd-poller.sh, tools/warden-gsd-watchdog.sh, tools/poller.out, tools/gideon-gsd-poller.log</files>
  <action>
    1. Run `rm -rf tools/` to delete the entire directory and its 4 files:
       - gideon-gsd-poller.sh (standalone GSD poller script)
       - warden-gsd-watchdog.sh (standalone watchdog script)
       - poller.out (poller output log)
       - gideon-gsd-poller.log (empty log file)
    2. Run `git add -u tools/` to stage the deletions.
    3. Verify no remaining references to any of these files exist in the codebase (grep for "gideon-gsd-poller", "warden-gsd-watchdog", "poller.out" across src/ and config files).
    4. Commit with message: "chore: delete unused tools/ directory (4 operator scripts)"
  </action>
  <verify>
    - `ls tools/` returns "No such file or directory"
    - `git status` shows clean working tree after commit
    - `grep -r "tools/gideon\|tools/warden\|tools/poller" src/ package.json` returns no matches
  </verify>
  <done>The tools/ directory and all 4 files are deleted from the repository and committed to git.</done>
</task>

</tasks>

<verification>
- `test ! -d tools/ && echo "PASS: tools/ deleted"` prints PASS
- `git log --oneline -1` shows the deletion commit
</verification>

<success_criteria>
- tools/ directory does not exist
- Deletion is committed to git
- No dangling references to deleted files anywhere in the codebase
</success_criteria>

<output>
After completion, create `.planning/quick/9-delete-unused-tools-directory/9-SUMMARY.md`
</output>
