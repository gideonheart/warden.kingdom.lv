---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/16-dry-srp/16-VERIFICATION.md
  - .planning/phases/16-dry-srp/16-02-SUMMARY.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/PROJECT.md
  - .planning/v2.2-MILESTONE-AUDIT.md
autonomous: true
requirements: [SRP-04]

must_haves:
  truths:
    - "Zero references to HooksTab.tsx remain in Phase 16 documentation files"
    - "All updated references correctly say EventsTab.tsx (or note the rename)"
    - "Historical accuracy preserved — docs note the component was originally HooksTab, later replaced by EventsTab in quick-10"
  artifacts:
    - path: ".planning/phases/16-dry-srp/16-VERIFICATION.md"
      provides: "Updated verification report with EventsTab annotations"
    - path: ".planning/phases/16-dry-srp/16-02-SUMMARY.md"
      provides: "Updated summary with EventsTab annotations"
  key_links: []
---

<objective>
Fix stale HooksTab.tsx references across Phase 16 documentation and related planning files.

Purpose: Quick-10 replaced HooksTab.tsx with EventsTab.tsx, but Phase 16 docs were written before that change and still reference HooksTab. The v2.2 milestone audit flagged this as tech debt item #3. These references create confusion when reading historical documentation.

Output: All Phase 16 and related documentation files updated with accurate EventsTab references while preserving historical context about the rename.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/v2.2-MILESTONE-AUDIT.md
@.planning/phases/16-dry-srp/16-VERIFICATION.md
@.planning/phases/16-dry-srp/16-02-SUMMARY.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update Phase 16 VERIFICATION.md and 16-02-SUMMARY.md</name>
  <files>
    .planning/phases/16-dry-srp/16-VERIFICATION.md
    .planning/phases/16-dry-srp/16-02-SUMMARY.md
  </files>
  <action>
Update HooksTab references in Phase 16 documentation to reflect the quick-10 rename. Use the pattern "EventsTab.tsx (originally HooksTab.tsx, replaced in quick-10)" for first mention in each file, then "EventsTab.tsx" for subsequent mentions.

**16-VERIFICATION.md changes:**
- Line 37: Truth #9 — change "HooksTab.tsx renders the hook event feed table" to "EventsTab.tsx (originally HooksTab.tsx, replaced in quick-10) renders the event feed" and update evidence text
- Line 60: Artifacts table — change `src/client/components/HooksTab.tsx` to `src/client/components/EventsTab.tsx` with note "(renamed from HooksTab.tsx in quick-10)"
- Line 81: Key links table — change `HooksTab.tsx` to `EventsTab.tsx` in the From, Via, and Details columns; update the tab key from 'hooks' to 'events'
- Line 97: SRP-04 row — change "HooksTab" references to "EventsTab (originally HooksTab)"
- Line 118: Human verification section — change "Hooks" tab reference to "Events" tab
- Line 142: Commits — keep the original commit message text as-is (it is a historical git commit message and must not be altered), but add a note that HooksTab was later renamed to EventsTab in quick-10
- Line 143: Same commit line — add annotation after the commit message

**16-02-SUMMARY.md changes:**
- Frontmatter key-files.created: change `src/client/components/HooksTab.tsx` to `src/client/components/EventsTab.tsx` with inline comment noting rename
- Frontmatter provides: change "HooksTab standalone component" to "EventsTab standalone component (originally HooksTab, renamed in quick-10)"
- Frontmatter key-decisions: update "HooksTab uses HookEvent type" to note the rename
- Line 14: provides list — update HooksTab reference
- Line 62: Accomplishments — update "Extracted HooksTab" to "Extracted HooksTab (later renamed EventsTab in quick-10)"
- Line 70: Task 2 description — keep original commit message text, add annotation
- Line 76: Files list — update path to EventsTab.tsx with rename note
- Line 80: Decisions — update HooksTab reference

Do NOT alter git commit message text (these are historical records). Instead, add annotations like "(note: HooksTab was later renamed to EventsTab in quick-10)".
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && ! grep -n 'HooksTab' .planning/phases/16-dry-srp/16-VERIFICATION.md .planning/phases/16-dry-srp/16-02-SUMMARY.md | grep -v 'originally HooksTab\|renamed from HooksTab\|renamed.*HooksTab\|commit message\|extract RegistryTab and HooksTab' || echo "PASS: No unqualified HooksTab references remain"</automated>
    <manual>Read both files and confirm HooksTab references are either annotated with rename context or are preserved historical commit messages</manual>
  </verify>
  <done>Phase 16 VERIFICATION.md and 16-02-SUMMARY.md contain no bare HooksTab references — all occurrences either annotated with EventsTab rename context or are preserved historical commit message text</done>
</task>

<task type="auto">
  <name>Task 2: Update STATE.md, ROADMAP.md, REQUIREMENTS.md, PROJECT.md, and milestone audit</name>
  <files>
    .planning/STATE.md
    .planning/ROADMAP.md
    .planning/REQUIREMENTS.md
    .planning/PROJECT.md
    .planning/v2.2-MILESTONE-AUDIT.md
  </files>
  <action>
Update remaining HooksTab references across planning files:

**STATE.md:**
- Line 138 decision: Change "4 GSD tabs extracted to standalone components (AgentsTab, ControlsTab, RegistryTab, HooksTab)" to "4 GSD tabs extracted to standalone components (AgentsTab, ControlsTab, RegistryTab, EventsTab)" — this is a current-state summary, not a historical commit, so use the current name

**ROADMAP.md:**
- Line 214 success criteria: Change "HooksTab.tsx" to "EventsTab.tsx" — this describes what must exist now, so use the current name

**REQUIREMENTS.md:**
- Line 26 SRP-04: Change "Extract `HooksTab` from `GsdView.tsx`" to "Extract `EventsTab` (originally `HooksTab`) from `GsdView.tsx`" — preserves the requirement ID context while noting the rename

**PROJECT.md:**
- Line 45: Change "(AgentsTab, ControlsTab, RegistryTab, HooksTab)" to "(AgentsTab, ControlsTab, RegistryTab, EventsTab)"

**v2.2-MILESTONE-AUDIT.md:**
- Update the tech_debt item for phase 16-dry-srp (line 21) to mark it as resolved: change the text to note it has been fixed by quick-20
- Line 71 SRP-04 row: Already says "(now EventsTab)" — no change needed
- Update the Documentation Drift section (line 118 item 3) to mark it as resolved
  </action>
  <verify>
    <automated>cd /home/forge/warden.kingdom.lv && grep -rn 'HooksTab' .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/PROJECT.md | grep -v 'originally.*HooksTab\|renamed.*HooksTab' | wc -l | xargs -I{} test {} -eq 0 && echo "PASS" || echo "FAIL: unqualified HooksTab references remain"</automated>
    <manual>Verify STATE.md, ROADMAP.md, REQUIREMENTS.md, and PROJECT.md all use EventsTab as the current component name</manual>
  </verify>
  <done>All planning files use EventsTab as the current component name. No bare HooksTab references remain outside of historical commit messages or rename annotations. Milestone audit tech debt item #3 marked as resolved.</done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `grep -rn 'HooksTab' .planning/` should return ONLY lines that include context about the rename (e.g., "originally HooksTab", "renamed from HooksTab") or are preserved historical git commit messages
2. `npm run build` passes (documentation-only changes, but verify no accidental source edits)
</verification>

<success_criteria>
- Zero unqualified HooksTab references in Phase 16 VERIFICATION.md and SUMMARY.md
- Zero unqualified HooksTab references in STATE.md, ROADMAP.md, REQUIREMENTS.md, PROJECT.md
- v2.2 milestone audit tech debt item #3 marked as resolved
- Historical commit messages preserved verbatim
- Build still passes
</success_criteria>

<output>
After completion, create `.planning/quick/20-fix-phase-16-documentation-references-fr/20-SUMMARY.md`
</output>
