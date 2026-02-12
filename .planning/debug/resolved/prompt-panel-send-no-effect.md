---
status: resolved
trigger: "prompt-panel-send-no-effect"
created: 2026-02-12T00:00:00Z
updated: 2026-02-12T00:08:00Z
---

## Current Focus

hypothesis: Architecture mismatch - Gateway /v1/chat/completions creates NEW sessions, not send to existing tmux Claude Code sessions
test: Checked tmux sessions and OpenClaw architecture - "send me in topic" works because Claude interprets it naturally, not via API
expecting: Need to send keystrokes to tmux session, not API calls to gateway
next_action: Implement tmux keystroke sending mechanism

## Symptoms

expected: Typing a message in the Prompt Panel input and clicking Send should deliver the prompt to the active Claude Code agent session (via tmux)
actual: Green success toast appears briefly, then disappears. Nothing happens in the Claude TUI terminal. No visible error.
errors: None visible - the success message is green (implying the API call succeeded)
reproduction: Type any message in the Prompt Panel input field, click Send. Observe that nothing reaches the Claude TUI.
started: Current behavior. The "send me in topic 450 hey from forge" command works fine through the same input, suggesting the gateway API is reachable.

## Eliminated

## Evidence

- timestamp: 2026-02-12T00:01:00Z
  checked: PromptPanel.tsx (frontend)
  found: Sends POST to `/api/agents/${agentId}/prompt` with prompt text. Shows success when response.ok is true.
  implication: UI is correctly calling the API endpoint

- timestamp: 2026-02-12T00:01:30Z
  checked: agentRoutes.ts (backend route handler)
  found: POST /api/agents/:agentId/prompt calls gatewayApiClient.sendPrompt(agentId, prompt) and returns result
  implication: Route handler delegates to gateway API client

- timestamp: 2026-02-12T00:02:00Z
  checked: GatewayApiClient.ts (gateway integration)
  found: sendPrompt() calls `${gatewayUrl}/v1/chat/completions` (OpenAI-compatible endpoint) with model: "openclaw:{agentId}" and messages array. Returns success:true if response.ok.
  implication: This is an OpenAI-compatible API call to Gateway, NOT sending keystrokes to tmux. Gateway should handle forwarding to Claude.

- timestamp: 2026-02-12T00:02:30Z
  checked: Code flow analysis
  found: No tmux keystroke sending code exists in this flow. The sendPrompt function only makes an HTTP API call to the gateway.
  implication: The "send me in topic 450 hey from forge" command must use a completely different mechanism (likely keywords parsed by gateway or a different endpoint)

- timestamp: 2026-02-12T00:03:00Z
  checked: OpenClaw gateway direct test with curl
  found: Gateway responds with 200 OK but echoes the prompt back as assistant content: {"message":{"role":"assistant","content":"test"}}. Gateway config shows port 3434, mode "local", auth token present.
  implication: Gateway API is working but NOT forwarding prompts to the actual Claude agent - it's just echoing. This is the root cause!

- timestamp: 2026-02-12T00:04:00Z
  checked: tmux sessions and OpenClaw architecture understanding
  found: warden-gsd-main session is running in default tmux socket (not OpenClaw socket). OpenClaw gateway /v1/chat/completions endpoint creates NEW sessions (agent:gideon:openai:xxx), not send to existing tmux Claude Code sessions. The "send me in topic 450" command works because the CURRENT Claude agent interprets it as natural language.
  implication: ROOT CAUSE CONFIRMED - The Prompt Panel is calling the wrong mechanism. Gateway API creates new sessions; we need to send keystrokes to the existing tmux Claude Code session.

## Resolution

root_cause: The Prompt Panel sends prompts via OpenClaw Gateway API (/v1/chat/completions), which creates NEW agent sessions instead of sending input to the existing Claude Code tmux session. The success message is genuine (API call succeeds), but it doesn't reach the running Claude Code agent because that agent is in a separate tmux session waiting for terminal input, not listening to gateway API.
fix:
1. Added sendPromptToSession() method to TmuxSessionManager that uses tmux send-keys to send text+Enter to a session
2. Updated /api/agents/:agentId/prompt route to use tmux send-keys instead of gateway API
3. Route now checks if session exists (pattern: {agentId}-gsd-main) and returns 404 if not found
verification:
- timestamp: 2026-02-12T00:06:30Z
  test: curl POST to /api/agents/warden/prompt with test message
  result: API returned success:true, and "test prompt from debug" appeared in warden-gsd-main tmux session
  status: SUCCESS - Prompts reach the Claude Code agent

- timestamp: 2026-02-12T00:07:00Z
  test: curl POST with /clear command to test command execution
  result: Command was queued in the Claude prompt input as expected
  status: SUCCESS - Commands are delivered correctly

- timestamp: 2026-02-12T00:07:30Z
  test: curl POST to non-existent agent "nonexistent"
  result: API returned 404 with clear error message about missing session
  status: SUCCESS - Error handling works correctly

VERIFICATION COMPLETE: All tests passed. Original issue resolved.
files_changed:
- src/server/services/TmuxSessionManager.ts
- src/server/routes/agentRoutes.ts
