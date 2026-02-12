---
status: resolved
trigger: "prompt-panel-agent-input"
created: 2026-02-12T00:00:00Z
updated: 2026-02-12T00:40:00Z
---

## Current Focus

hypothesis: CONFIRMED ROOT CAUSE - Sessions exist with naming convention {agentId}-gsd-main, but not all have Claude Code running. forge-gsd-main is just running bash. When prompts are sent to bash, they appear as literal text. When sent to Claude Code (warden-gsd-main), they work correctly.
test: implement detection of whether Claude Code is running in the target session
expecting: can check pane_current_command to see if it's "claude" vs "bash"
next_action: add session status check to detect if Claude Code is running, warn users if not

## Symptoms

expected: Type "what is server status?" in Prompt Panel → AI agent (Claude Code) in tmux session receives it as a user prompt → agent interprets it and runs appropriate commands
actual: Text is sent via tmux send-keys and appears as literal text in the terminal. If Claude Code is not actively waiting for input, or if a shell prompt is showing, the text just appears on screen without being processed by the AI agent.
errors: No errors - the text IS being sent, but to the wrong target (raw terminal vs agent input)
reproduction: Type any question/command in Prompt Panel when viewing a session. The text appears in the terminal but isn't processed intelligently.
started: After fix commit a019158 (tmux send-keys approach)

## Eliminated

- hypothesis: tmux send-keys doesn't reach Claude Code at all
  evidence: Test showed "This is a test prompt from tmux send-keys" appeared in Claude Code's input area with message "Press up to edit queued messages"
  timestamp: 2026-02-12T00:00:00Z

## Evidence

- timestamp: 2026-02-12T00:10:00Z
  checked: Current tmux sessions
  found: warden-gsd-main exists, running `claude --dangerously-skip-permissions`, currently showing "Combobulating... 1m 30s" (busy)
  implication: Claude Code IS running in the expected session

- timestamp: 2026-02-12T00:15:00Z
  checked: Test prompt via tmux send-keys
  found: Prompt "This is a test prompt from tmux send-keys" appeared in input area with status "Press up to edit queued messages"
  implication: tmux send-keys DOES work but prompts are queued when agent is busy, not immediately processed

- timestamp: 2026-02-12T00:16:00Z
  checked: Commit a019158 changes
  found: Switched from GatewayApiClient.sendPrompt() to TmuxSessionManager.sendPromptToSession(), reason was "Gateway API creates NEW sessions instead of sending to existing ones"
  implication: Original Gateway API approach had a flaw - it created new sessions, but that doesn't mean the Gateway API can't work correctly if used properly

- timestamp: 2026-02-12T00:20:00Z
  checked: Gateway API /v1/chat/completions endpoint
  found: Sent test prompt to warden via Gateway API, got response but agent said "You have hit your ChatGPT usage limit"
  implication: Gateway API DOES work and routes to the agent, but it's not going to the tmux session - it's creating a separate session managed by OpenClaw Gateway

- timestamp: 2026-02-12T00:21:00Z
  checked: warden-gsd-main tmux session after Gateway API call
  found: No sign of the Gateway API prompt in the tmux session - still shows old "This is a test prompt from tmux send-keys" queued
  implication: Gateway API and tmux sessions are COMPLETELY SEPARATE. Gateway API creates its own ephemeral sessions that don't appear in tmux.

- timestamp: 2026-02-12T00:25:00Z
  checked: forge-gsd-main session
  found: Running bash, NOT Claude Code. Session is empty.
  implication: The naming convention {agentId}-gsd-main doesn't guarantee Claude Code is running. Sessions might be pre-created shells waiting for Claude Code to be started.

- timestamp: 2026-02-12T00:30:00Z
  checked: Process details for both sessions
  found: warden-gsd-main pane_current_command = "claude" (working correctly), forge-gsd-main pane_current_command = "bash" (will show literal text)
  implication: **ROOT CAUSE CONFIRMED** - Need to detect if Claude Code is running before sending prompts. If only bash is running, prompts appear as literal shell commands.

## Resolution

root_cause: Sessions named {agentId}-gsd-main exist but may not have Claude Code running. When tmux send-keys sends prompts to a session running only bash (not Claude Code), the text appears as literal characters typed into the shell prompt, not as prompts to an AI agent. The user's symptom is accurate - when they send to forge-gsd-main (running bash), text is literally typed. When they send to warden-gsd-main (running Claude Code), it works correctly.

Detection needed: Check tmux pane_current_command to verify "claude" is running, not just "bash".

fix: Added TmuxSessionManager.isClaudeCodeRunning() method to check if Claude Code is running in session. Updated /api/agents/:agentId/prompt endpoint to validate before sending. If Claude Code is not running, returns 400 error with helpful message instructing user to start Claude Code first.

verification:
- Test 1: Send prompt to forge-gsd-main (bash only) → Returns 400 error: "Claude Code is not running in session 'forge-gsd-main'. Please start Claude Code in this session first"
- Test 2: Send prompt to warden-gsd-main (Claude Code running) → Returns 200 success, prompt appears in Claude Code's input queue
- Test 3: Verified prompt "Test from fixed Prompt Panel - please just say OK" appears in warden session input area

files_changed:
- src/server/services/TmuxSessionManager.ts (added isClaudeCodeRunning method)
- src/server/routes/agentRoutes.ts (added validation before sending prompts)
