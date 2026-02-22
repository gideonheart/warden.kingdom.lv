---
status: testing
phase: 13-client-plugin
source: 13-01-SUMMARY.md
started: 2026-02-18T10:30:00Z
updated: 2026-02-18T10:30:00Z
---

## Current Test

number: 1
name: Panel Collapsed on Load
expected: |
  On the Terminals view, a thin bar appears at the bottom below the terminal with text "GSD Control Center" and an expand chevron/arrow. The terminal retains its full height. No extra polling or Socket.IO connections are active.
awaiting: user response

## Tests

### 1. Panel Collapsed on Load
expected: On the Terminals view, a thin bar appears at the bottom below the terminal with text "GSD Control Center" and an expand chevron/arrow. The terminal retains its full height.
result: [pending]

### 2. Panel Expand and Tab Navigation
expected: Clicking the collapsed header bar expands the panel to show 4 tabs: Agents, Controls, Registry, Hooks. Clicking each tab switches content. The default active tab is "Agents".
result: [pending]

### 3. Agent Grid with Live Status
expected: The Agents tab shows a table of managed agents with columns for status (colored dot: green=active, yellow=idle, red=stopped), Agent ID, Tmux Session, Working Directory, and an Enabled toggle. Data updates without page refresh.
result: [pending]

### 4. Spawn Form with Loading State
expected: The Controls tab has a spawn form with Agent Name, Working Directory, and optional First Command fields. Submitting disables the button and shows "Spawning..." while the request completes. After completion, a success or error message appears.
result: [pending]

### 5. Command Dispatch with Session Selector
expected: The Controls tab has a command dispatch form with a session dropdown (populated from active sessions) and a command text input. Submitting shows "Dispatched" confirmation on success.
result: [pending]

### 6. Registry Table with Optimistic Toggle
expected: The Registry tab shows a detailed table of all agents with columns including agent_id, enabled (toggle), working_directory, tmux_session_name. Toggling enabled immediately flips the switch visually (optimistic UI) before the server responds.
result: [pending]

### 7. Live Hook Feed via Socket.IO
expected: The Hooks tab shows a list of recent hook events (up to 20), newest first. Each event shows timestamp, hook script name, event name, agent ID, and session. New events appear automatically without manual refresh.
result: [pending]

### 8. Bash Hints with Copy-to-Clipboard
expected: The Controls tab forms show the equivalent bash command below each form (e.g., spawn.sh or menu-driver.sh commands). A "Copy" button next to each command copies it to clipboard and briefly shows "Copied!" confirmation.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
