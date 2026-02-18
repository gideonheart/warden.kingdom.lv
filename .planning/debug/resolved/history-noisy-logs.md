---
status: resolved
trigger: "History view has noisy logs: repeated 'Go to terminal' entries, 'unknown' statuses, every TUI click logged"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T00:05:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED AND FIXED
test: Build, typecheck, E2E tests all pass; DB cleaned
expecting: N/A
next_action: Archive and commit

## Symptoms

expected: History view should show meaningful session events (session start, stop, prompt sent, etc.) with proper status indicators
actual: History is cluttered with "Go to terminal" entries, many "unknown" statuses, and every tmux TUI interaction appears to be logged
errors: No crash errors - behavior/data quality issue
reproduction: Open Warden dashboard, go to History view, observe activity timeline entries
started: Likely since Phase 11 (Activity Timeline & Audit Log) was implemented

## Eliminated

## Evidence

- timestamp: 2026-02-18T00:00:30Z
  checked: Database event_type distribution
  found: 276 tool_call, 67 operator_input, 44 bash_command, 21 error, 2 session_start, 2 session_stop, 1 prompt_sent
  implication: operator_input and tool_call dominate the history making it noisy

- timestamp: 2026-02-18T00:00:45Z
  checked: operator_input event details in database
  found: Many entries contain mouse event sequences (e.g. "64;1;1M64;1;1M...") and terminal capability queries ("gb:e2e2/e8e8/f0f0\gb:0a0a/0a0a/1a1a\", "0;276;0c"). The ANSI stripping in captureOperatorInput only strips ESC-prefixed sequences, but xterm.js strips ESC before forwarding, leaving bare CSI parameters like "64;1;1M" that pass through the ANSI filter.
  implication: Mouse clicks/scrolls in the xterm.js terminal produce SGR mouse report sequences that get logged as operator input

- timestamp: 2026-02-18T00:00:50Z
  checked: tool_call event summaries
  found: Many entries like "Read1file(ctrl+otoexpand)" - these are Claude Code TUI rendering artifacts, not real tool calls. The regex matches "Read 1 file (ctrl+o to expand)" because [\w]+ allows any word chars.
  implication: The TOOL_CALL_RE regex was too loose - it matched TUI status text, not just actual tool invocations

- timestamp: 2026-02-18T00:00:55Z
  checked: "Go to terminal" in DB
  found: No "Go to terminal" text in DB event summaries. The user was seeing the "Go to terminal" BUTTON rendered in the ActivityEventRow expanded detail panel for every event. Not a data issue but a UX confusion point.
  implication: "Go to terminal" is a UI navigation button, not a logged event

- timestamp: 2026-02-18T00:01:00Z
  checked: success/unknown status
  found: tool_call events are inserted without success field (undefined -> NULL). SuccessIndicator renders NULL as dash. Expanded detail shows "Unknown" for null success.
  implication: "Unknown" label is misleading for events where success is not applicable

## Resolution

root_cause: THREE ISSUES:
  1. OPERATOR INPUT NOISE: captureOperatorInput's ANSI stripping doesn't catch mouse reports (SGR format "NN;NN;NNM"), device attribute responses, OSC color query responses, or orphaned ESC+backslash sequences. These arrive after xterm.js strips ESC prefixes. Every mouse click/scroll in the TUI was logged.
  2. TOOL_CALL REGEX TOO LOOSE: TOOL_CALL_RE used [\w]+ which matched any word characters including digits and underscores. This matched Claude Code TUI summary text like "Read 1 file (ctrl+o to expand)" because "Read" matched as tool name and "1 file (ctrl+o to expand)" as args.
  3. SUCCESS LABEL MISLEADING: Expanded detail showed "Unknown" for null success, which is misleading for events where success is not applicable (tool_call, operator_input).

fix:
  1. Added stripTerminalNoise() function with TERMINAL_NOISE_RE regex that strips SGR mouse reports, device attribute responses, OSC color query responses, mode query responses, and orphaned ESC+backslash sequences. Applied in both captureOperatorInput (early filtering) and flushOperatorInputBatch (final cleanup before DB write).
  2. Changed TOOL_CALL_RE from /[\w]+/ to /[A-Z][a-zA-Z]*/ - tool name must start with uppercase letter and contain only letters. This matches real tool names (Bash, Read, Edit, Write, Glob, Grep, WebSearch, Update, Skill) but rejects TUI summary text.
  3. Changed "Unknown" to "N/A" in ActivityEventRow expanded detail for null success values.
  4. Cleaned 46 pure-noise operator_input entries and 47 false-positive tool_call entries from existing database.

verification:
  - TypeScript typecheck passes
  - Full production build succeeds
  - All 12 Playwright E2E tests pass
  - TOOL_CALL_RE tested: matches all 9 known tool names, rejects "Read 1 file (ctrl+o)" and TUI text
  - TERMINAL_NOISE_RE tested: strips mouse reports, device attrs, color queries while preserving real text
  - Database cleaned from 413 events down to 322, removing pure noise

files_changed:
  - src/server/services/ActivityEventService.ts
  - src/client/components/ActivityEventRow.tsx
