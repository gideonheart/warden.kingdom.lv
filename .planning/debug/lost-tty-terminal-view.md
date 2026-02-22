---
status: diagnosed
trigger: "lost tty messages in terminal view, possibly related to multi-device viewing"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - The dedup logic in attachSocketToSession() kills ALL existing PTY processes for a tmux session whenever ANY new connection arrives for that session. This causes "[lost tty]" because tmux's attached client has its PTY destroyed.
test: Code analysis of TerminalStreamService.ts lines 39-46 + Socket.IO reconnect behavior
expecting: N/A - root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: Terminal view should show live tmux session output reliably without dropping the connection
actual: "[lost tty]" messages appear frequently in the terminal view
errors: "[lost tty]" message displayed in the terminal
reproduction: Open terminal view for a session - happens frequently, possibly more when same tmux session is viewed from multiple devices/tabs
started: Ongoing issue

## Eliminated

## Evidence

- timestamp: 2026-02-18T00:00:10Z
  checked: tmux man page for "[lost tty]" meaning
  found: "lost tty - The client's tty(4) or pty(4) was unexpectedly destroyed"
  implication: The PTY fd that tmux's attached client is using gets destroyed/closed from under it

- timestamp: 2026-02-18T00:00:20Z
  checked: TerminalStreamService.ts attachSocketToSession() lines 39-46
  found: |
    Dedup logic kills ALL existing PTY attachments for a session before spawning a new one:
    ```
    const existingSocketIds = this.sessionStreams.get(sessionName);
    if (existingSocketIds) {
      for (const existingSocketId of existingSocketIds) {
        this.detachSocket(existingSocketId);  // calls ptyProcess.kill()
      }
    }
    ```
  implication: When a new connection arrives for the same tmux session, ALL existing PTY processes for that session are killed via detachSocket -> ptyProcess.kill()

- timestamp: 2026-02-18T00:00:30Z
  checked: detachSocket() method at line 124-142
  found: detachSocket calls stream.ptyProcess.kill() which sends SIGHUP to the node-pty process (which is running `tmux attach-session -t <name>`). The tmux client receives the signal and the PTY it was using is destroyed.
  implication: This is the direct cause of "[lost tty]" - tmux reports this when the PTY of an attached client is destroyed

- timestamp: 2026-02-18T00:00:40Z
  checked: Socket.IO reconnection behavior - does reconnect get a new socket ID?
  found: Per Socket.IO docs, socket.id is "regenerated after each reconnection". Every reconnect fires a new `connection` event on the server with a brand new socket ID.
  implication: When a Socket.IO client reconnects (e.g., transient network blip), the server sees it as a BRAND NEW connection with a new socket.id. The old socket hasn't disconnected yet (or is in the process of disconnecting). The new connection triggers the dedup logic.

- timestamp: 2026-02-18T00:00:50Z
  checked: Client-side Socket.IO config in useTerminalSocket.ts
  found: reconnection: true, reconnectionDelay: 1_000, reconnectionAttempts: 10
  implication: Auto-reconnection is enabled. Any transient disconnect will trigger reconnection, which creates a new server-side socket, which triggers the dedup kill logic.

- timestamp: 2026-02-18T00:00:55Z
  checked: Race condition in disconnect vs reconnect
  found: |
    When Socket.IO reconnects:
    1. Old socket may still be in activeStreams (disconnect event may not have fired yet)
    2. New socket arrives -> attachSocketToSession() called
    3. Dedup logic finds old socket in sessionStreams -> calls detachSocket(oldSocketId) -> kills old PTY
    4. New PTY is spawned and attached
    This is actually "working as intended" for the single-viewer case. But there's a race where the old socket's disconnect handler ALSO fires and calls detachSocket(), which tries to kill an already-deleted stream (harmless but wasteful).
  implication: The dedup logic is destructive by design - it assumes only one viewer per session.

- timestamp: 2026-02-18T00:01:00Z
  checked: Multi-device scenario
  found: |
    When Device B connects to the same tmux session that Device A is already watching:
    1. Device B's socket connects -> attachSocketToSession()
    2. Dedup logic finds Device A's socket -> kills Device A's PTY
    3. Device A's tmux client loses its PTY -> "[lost tty]" appears on Device A
    4. Device A sees "[lost tty]" in its terminal output
    5. If Device A's socket auto-reconnects -> it kills Device B's PTY
    6. Device B sees "[lost tty]"
    7. Ping-pong continues until one device gives up
  implication: Multi-device viewing creates a destructive ping-pong where each reconnection kills the other device's PTY, causing "[lost tty]" on both.

## Resolution

root_cause: |
  The dedup logic in TerminalStreamService.attachSocketToSession() (lines 39-46) kills ALL existing PTY processes
  for a tmux session whenever a new socket connection arrives for that session. This causes "[lost tty]" in two scenarios:

  **Scenario 1 (Single viewer, transient disconnect):**
  When a Socket.IO client has a transient network blip and auto-reconnects, the reconnection creates a NEW socket
  on the server (Socket.IO gives every reconnect a new socket.id). The new connection's dedup logic finds the old
  socket's PTY still in the sessionStreams map (the old disconnect event may not have fired yet) and kills it.
  The new PTY is then spawned. During this transition, the old `tmux attach-session` process loses its PTY and
  tmux outputs "[lost tty]". The new PTY picks this up and displays it to the user.

  **Scenario 2 (Multi-device viewing):**
  When two devices view the same tmux session, each new connection kills ALL existing PTY attachments for that
  session. If both devices have auto-reconnection enabled, they enter a destructive ping-pong where each
  reconnection kills the other's PTY, causing repeated "[lost tty]" messages on both.

  The fundamental design issue is that the dedup logic assumes exclusive single-viewer-per-session semantics,
  but the system needs to support:
  (a) Graceful Socket.IO reconnection (same viewer getting a new socket ID)
  (b) Multiple simultaneous viewers of the same tmux session

fix:
verification:
files_changed: []
