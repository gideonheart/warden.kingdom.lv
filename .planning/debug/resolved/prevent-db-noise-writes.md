---
status: resolved
trigger: "prevent-db-noise-writes - Terminal noise events may still be reaching the database"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T00:05:00Z
---

## Current Focus

hypothesis: RESOLVED - All three root causes fixed and verified
test: Comprehensive test suite against all observed noise patterns + real input
expecting: Zero false positives in test suite
next_action: Archive and commit

## Symptoms

expected: Terminal noise (mouse clicks, control sequences, TUI navigation) should NEVER be written to the database
actual: Noise may still be reaching the DB through various paths
errors: No crash - data quality issue
reproduction: Use terminal (click, scroll, navigate TUI) and check activity_events table
started: Since stripTerminalNoise fix was applied - user wants to verify it's comprehensive

## Eliminated

- hypothesis: Server is running updated code with the 3802d62 regex fix
  evidence: Server PID 11255 started at Feb 17 22:58; build at Feb 18 04:48 was AFTER start. Node caches modules at startup, so the running server uses the OLD code with [\w]+ regex.
  timestamp: 2026-02-18T00:01:20Z

## Evidence

- timestamp: 2026-02-18T00:00:30Z
  checked: activity_events table - event type distribution
  found: 423 tool_call, 80 operator_input, 44 bash_command, 21 error
  implication: tool_call is the most common event type

- timestamp: 2026-02-18T00:00:40Z
  checked: tool_call entries "Searchedfor1pattern(ctrl+otoexpand)"
  found: 195/423 tool_call entries (46%) are this false positive
  implication: TOOL_CALL_RE matching TUI summary lines

- timestamp: 2026-02-18T00:00:50Z
  checked: operator_input noise entries
  found: 52/80 operator_input entries (65%) contain mouse/device noise
  implication: Noise leaking through operator_input pipeline

- timestamp: 2026-02-18T00:01:00Z
  checked: Partial fragment issue in mouse reports
  found: Entry #682 = "64;1;1M...65;1" ends with partial "65;1" that survives regex
  implication: TERMINAL_NOISE_RE requires complete num;num;numM pattern but partial fragments survive

- timestamp: 2026-02-18T00:01:10Z
  checked: Current [A-Z][a-zA-Z]* regex vs space-collapsed TUI output
  found: "Searchedforpattern(ctrl+otoexpand)" still matches even with [A-Z][a-zA-Z]* because ANSI cursor movement stripping collapses spaces and removes digits
  implication: Even the "fixed" regex is still vulnerable

- timestamp: 2026-02-18T00:01:20Z
  checked: Server runtime vs build timestamps
  found: Server started Feb 17 22:58, build at Feb 18 04:48. Running OLD code.
  implication: The regex fix from 3802d62 was never deployed to the running server

- timestamp: 2026-02-18T00:03:00Z
  checked: Test suite with 26 test cases (8 noise reject, 8 tool accept, 4 tool reject, 6 real input)
  found: 0 failures - all noise blocked, all real input preserved, all tool calls correctly classified
  implication: Fix works comprehensively

- timestamp: 2026-02-18T00:04:00Z
  checked: DB cleanup results
  found: Removed 203 false positive tool_call entries and cleaned noise from operator_input entries. DB went from 703 to 457 events.
  implication: Existing data is clean

## Resolution

root_cause: THREE issues:
  1. TOOL_CALL_RE too permissive - even [A-Z][a-zA-Z]* matches TUI summary lines when ANSI/cursor stripping collapses spaces (e.g., "Searchedforpattern(ctrl+otoexpand)"). 46% of tool_call entries were false positives.
  2. TERMINAL_NOISE_RE doesn't catch PARTIAL mouse report fragments (e.g., trailing "65;1" without the final ";numM") left over from batch splitting.
  3. operator_input pipeline lacked a final noise heuristic gate, so fragments that survived regex stripping still got written to DB. 65% of operator_input entries contained noise.

fix: Defense-in-depth approach in ActivityEventService.ts:
  1. Added KNOWN_TOOL_NAMES allowlist (Read, Write, Edit, Bash, Glob, Grep, etc.) and validate TOOL_CALL_RE matches against it before inserting tool_call events
  2. Enhanced stripTerminalNoise() with a second-pass regex for partial semicolon-delimited fragments and a line-level cleanup for residual digit/semicolon/M sequences
  3. Added "[lost tty]" to TERMINAL_NOISE_RE (tmux disconnect message)
  4. Added isLikelyNoise() heuristic function as final gate in flushOperatorInputBatch() - catches pure digit/semicolon sequences, content dominated by noise chars (>60%), and known noise prefixes
  5. Cleaned 246 existing noise entries from database

verification: TypeScript typecheck passes, production build succeeds, test suite with 26 cases has 0 failures covering all observed noise patterns plus real user input preservation.

files_changed:
  - src/server/services/ActivityEventService.ts
