# Pitfalls Research: GSD Manager Plugin (v2.1)

**Domain:** Adding shell-proxying, process spawning, file watching, and config editing features to existing Express 5 dashboard
**Researched:** 2026-02-18
**Confidence:** HIGH (verified with current sources 2025-2026, cross-checked against actual spawn.sh / menu-driver.sh source)

---

## Critical Pitfalls

### Pitfall 1: Shell Injection via spawn.sh and menu-driver.sh Argument Proxying

**What goes wrong:**
The API receives user-supplied values for `agentName`, `workdir`, `firstCommand`, `sessionName`, and `action` then passes them to `execFile('bash', [scriptPath, agentName, workdir, firstCommand])`. If any value contains shell metacharacters — semicolons, backtick subshell expansion, `$(...)` patterns, newlines, or null bytes — and the script is invoked with `shell: true` or through an intermediate bash invocation, arbitrary commands execute on the server. Even with `execFile`, passing a `firstCommand` of `$(rm -rf /)` as a positional argument to `spawn.sh` may propagate into `tmux send-keys` where the shell IS invoked.

Concrete attack chain: `POST /api/gsd/spawn` with `firstCommand: "/gsd:resume-work; rm -rf /home/forge"` → `spawn.sh warden /path "/gsd:resume-work; rm -rf /home/forge"` → `tmux send-keys ... "$first_command" Enter` — the tmux session now executes the injected command.

**Why it happens:**
Developers using `execFile` (not `exec`) feel safe because "execFile doesn't invoke a shell." But `spawn.sh` itself is a bash script — it uses `tmux send-keys ... "$first_command" Enter` at line 403-415. The value lands inside a tmux pane where a shell is running. `execFile` skipping shell interpretation only prevents injection at the `execFile` boundary; the payload travels through to the tmux layer intact.

**How to avoid:**
1. **Allowlist action values for menu-driver.sh:** Only accept enum values (`snapshot`, `enter`, `esc`, `clear_then`, `choose`, `type`, `submit`). Reject anything else with 400.
2. **Restrict agentName to known prefixes:** Validate against `KNOWN_AGENT_PREFIXES` array (`gideon`, `warden`, `scout`, `builder`, `forge`). Reject names containing `/`, `\`, `;`, `$`, backticks, spaces, null bytes.
3. **Validate workdir with path canonicalization:** After `path.resolve()`, verify it starts with an allowlisted base path prefix (e.g., `/home/forge`). Reject `..`, null bytes, URL-encoded traversal sequences.
4. **Restrict firstCommand to a known slash-command allowlist** if a preset enum model is used (recommended for Phase 1). If free-form is required (Phase 2), apply strict character allowlist: `[/a-zA-Z0-9 @:._-]` only.
5. **Never use `shell: true`** with execFile for these invocations. The existing `execFile` usage in TmuxSessionManager is correct — follow the same pattern.
6. **Use `execFile` with explicit args array:** `execFile('/path/to/spawn.sh', [agentName, workdir, firstCommand])` not `execFile('bash', ['-c', `spawn.sh ${args}`])`.

**Warning signs:**
- Arguments to `execFile` include concatenated template literals from request body
- `shell: true` appears anywhere near gsdRoutes
- No validation of `agentName` format before passing to spawn.sh
- `firstCommand` accepted as arbitrary freeform string without validation
- Route handler passes `req.body.action` directly to menu-driver.sh without enum check

**Phase to address:**
Phase 1 (API routes and spawn) — inject security from the first line of gsdRoutes.ts. Cannot be retrofitted safely once routes are deployed.

---

### Pitfall 2: Path Traversal in workdir Parameter Escapes to Arbitrary Filesystem Access

**What goes wrong:**
`POST /api/gsd/spawn` with `workdir: "/home/forge/../../../etc"` reaches spawn.sh which calls `[ -d "$workdir" ]` — this succeeds if the directory exists. Claude Code then starts in `/etc` with `--dangerously-skip-permissions`. Similarly, `GET /api/gsd/sessions/:session/state` reads `{workdir}/.planning/STATE.md` — if session workdir is attacker-controlled, it reads arbitrary files.

**Why it happens:**
Node.js `path.join()` does not prevent traversal — it normalizes the path but allows the result to escape the intended base. `path.join('/home/forge', '../../../etc')` returns `/etc` cleanly. A 2025 CVE (CVE-2025-27210) confirmed even `path.normalize` is insufficient on Windows. On Linux, the vulnerability is classic `../` traversal.

**How to avoid:**
```typescript
import path from 'path';

const ALLOWED_WORKDIR_BASE = '/home/forge';

function validateWorkdir(userInput: string): string {
  const resolved = path.resolve(userInput); // Resolves symlinks, normalizes
  if (!resolved.startsWith(ALLOWED_WORKDIR_BASE + '/') && resolved !== ALLOWED_WORKDIR_BASE) {
    throw new Error(`workdir must be under ${ALLOWED_WORKDIR_BASE}`);
  }
  return resolved;
}
```
Apply this check BEFORE passing to execFile. For STATE.md reads, derive the path from the registry (trusted source), not from user-supplied session parameters.

**Warning signs:**
- `workdir` from request body passed to `path.join` without boundary check
- STATE.md read path derived from raw request params
- No assertion that resolved path starts with allowed prefix
- Tests only pass paths like `/home/forge/project`, never test `../` escapes

**Phase to address:**
Phase 1 (API routes) — before spawn endpoint goes live.

---

### Pitfall 3: Race Condition When API and Hook Scripts Write recovery-registry.json Concurrently

**What goes wrong:**
Two writes to `recovery-registry.json` happen simultaneously: the web UI calls `PATCH /api/gsd/registry/agents/:agentId` to toggle `enabled: false`, while `spawn.sh` runs `upsert_agent_entry_in_registry` at the same time. Both read the file, compute a new state, write to a `.tmp` file, then `mv` to the final path. The last write wins, discarding the other's changes. Alternatively, a partially written `.tmp` file is read mid-write by the hook scripts.

`spawn.sh` uses `flock -x 200` around its jq transform (verified in source, lines 103-140). But the Node.js API side has no flock equivalent — `fs.readFileSync` + `fs.writeFileSync` is not atomic and does not respect the bash `flock` lock.

**Why it happens:**
bash `flock` is advisory — it only works when ALL writers use the same lock file. If the Node.js API writes directly to the file using `fs` without acquiring the `.lock` file, it bypasses the bash flock entirely.

**How to avoid:**
Option A (recommended — simpler): **In the Node.js API, acquire the bash-compatible lock before writing.**
```typescript
import { execFile } from 'child_process';

// Use flock via shell to acquire the same lock bash uses
async function writeRegistryAtomically(transformFn: (registry: Registry) => Registry): Promise<void> {
  return new Promise((resolve, reject) => {
    // -x: exclusive, -w 5: wait up to 5s, 200: fd number
    execFile('flock', ['-x', '-w', '5', REGISTRY_LOCK_PATH, '-c',
      `node -e "...transform script..."`
    ], (err) => err ? reject(err) : resolve());
  });
}
```
Option B (preferred, no shell): Use Node.js `proper-lockfile` npm package with the same `.lock` file path that spawn.sh uses (`recovery-registry.json.lock`), then do atomic write via temp file + rename:
```typescript
import lockfile from 'proper-lockfile';

async function updateRegistry(transform: (r: Registry) => Registry): Promise<void> {
  const release = await lockfile.lock(REGISTRY_PATH, { retries: { retries: 5, minTimeout: 100 } });
  try {
    const current = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const updated = transform(current);
    const tmpPath = REGISTRY_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2));
    fs.renameSync(tmpPath, REGISTRY_PATH); // atomic on same filesystem
  } finally {
    await release();
  }
}
```
Note: `proper-lockfile` uses `mkdir` strategy (atomic on NFS) rather than `O_EXCL` which has NFS bugs. The bash `flock` and Node `proper-lockfile` are compatible if both check the same `.lock` file — but they use different mechanisms. Best approach: have the Node.js API shell out `flock` itself OR use only one writer (make the API the only writer, have hook scripts call the API).

**Warning signs:**
- Node.js API calls `fs.readFileSync` + `fs.writeFileSync` on registry without acquiring lock
- No `.lock` file acquisition in gsdRoutes.ts
- Tests never simulate concurrent spawn.sh + API writes
- Registry corruption detected by `validate_registry_json` (corrupt backup created)
- API and hook scripts disagree on agent enabled/disabled state

**Phase to address:**
Phase 1 (registry API) — must design atomic writes before first PATCH endpoint lands.

---

### Pitfall 4: Log File Tailing Memory Leak and File Rotation Gaps

**What goes wrong:**
`GET /api/gsd/hooks/log` starts watching `/tmp/gsd-hooks.log` with `fs.watch` or `fs.createReadStream`. Two failure modes:
1. **Memory leak:** The watcher is never closed when the HTTP response ends (client disconnects, SSE stream closes). Each request creates a new dangling watcher. After 50 requests, 50 watchers hold the process active with no cleanup.
2. **File rotation gap:** `/tmp/gsd-hooks.log` is a flat append-only file (no rotation). If the file is deleted and recreated by a script (e.g., a cron that truncates it), `fs.watch` on the old inode gets no events. The reader misses all new entries.
3. **Missing newlines:** The last line appended by hook scripts may not end with `\n` if the script was interrupted. A naive `readline` interface will buffer forever waiting for the newline, never emitting the last line.

**Why it happens:**
`fs.watch` returns a watcher that must be explicitly `.close()`d. SSE/streaming responses in Express have `res.on('close')` and `req.on('close')` events for cleanup — but developers often forget to register cleanup handlers on the response close event. File rotation awareness requires re-opening the file by name, not holding the original file descriptor.

**How to avoid:**
```typescript
router.get('/api/gsd/hooks/log', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('X-Accel-Buffering', 'no'); // Prevents nginx buffering SSE

  // Tail last N lines on connect
  const initialLines = readLastNLines(GSD_HOOKS_LOG_PATH, 100);
  initialLines.forEach(line => response.write(`data: ${JSON.stringify(line)}\n\n`));

  // Watch for new content
  let fileSize = fs.existsSync(GSD_HOOKS_LOG_PATH) ? fs.statSync(GSD_HOOKS_LOG_PATH).size : 0;
  const watcher = fs.watch(GSD_HOOKS_LOG_PATH, { persistent: false }, () => {
    const newSize = fs.statSync(GSD_HOOKS_LOG_PATH).size;
    if (newSize < fileSize) {
      // File was truncated/rotated — reset position
      fileSize = 0;
    }
    if (newSize > fileSize) {
      const stream = fs.createReadStream(GSD_HOOKS_LOG_PATH, { start: fileSize, end: newSize });
      stream.on('data', chunk => response.write(`data: ${JSON.stringify(chunk.toString())}\n\n`));
      stream.on('end', () => { fileSize = newSize; });
    }
  });

  // CRITICAL: Always close watcher when client disconnects
  response.on('close', () => {
    watcher.close();
    console.log('[GSD] Log tail watcher closed for disconnected client');
  });
});
```
For the missing-newline edge case: when reading new bytes, split on `\n` and hold incomplete last line in a buffer until the next read appends to it.

**Warning signs:**
- No `response.on('close', () => watcher.close())` in log streaming endpoint
- `watcher.close()` not called in any code path (including error paths)
- Using `fs.readFileSync` in a polling interval (creates N file reads per second, never streaming)
- No handling for `newSize < fileSize` (truncation detection)
- Process watcher count grows with each request to the log endpoint

**Phase to address:**
Phase 2 (hook activity feed) — implement SSE correctly from the start; memory leak only visible under sustained use.

---

### Pitfall 5: Concurrent tmux Session Operations Create Double-Spawn and State Confusion

**What goes wrong:**
Two UI interactions fire within milliseconds: user clicks "Spawn" while the 10-second `InstanceTracker.syncWithTmux()` interval fires. Or a mobile user with flaky connection double-taps the spawn button, sending two `POST /api/gsd/spawn` requests. Both proceed through spawn.sh, both call `resolve_tmux_session_name` which checks `tmux has-session` — if the first spawn hasn't created the session yet (it's in the `wait_for_claude_tui_readiness` 3-15 second wait), the second spawn also proceeds, creating two sessions.

Similarly: `menu-driver.sh clear_then "/gsd:resume-work"` while another menu-driver call is in-flight sends `C-u /clear Enter` twice into the same tmux pane, corrupting the Claude Code TUI state.

**Why it happens:**
`spawn.sh`'s `resolve_tmux_session_name` uses a TOCTOU (time-of-check-time-of-use) pattern: check if session exists, then create it. The 3-15 second window between check and creation allows double-spawn. `menu-driver.sh` sends keystrokes to a specific tmux pane — interleaved keystrokes from two concurrent invocations are indistinguishable to the receiving process.

**How to avoid:**
1. **Per-session mutex in gsdRoutes.ts:** Use a `Map<string, Promise>` to track in-flight spawn/command operations per agent:
```typescript
const inflightOperations = new Map<string, Promise<unknown>>();

async function withAgentLock<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
  const existing = inflightOperations.get(agentId);
  if (existing) {
    await existing; // Wait for in-flight operation to complete
  }
  const newOperation = operation();
  inflightOperations.set(agentId, newOperation.finally(() => inflightOperations.delete(agentId)));
  return newOperation;
}
```
2. **Idempotent spawn:** Before calling spawn.sh, check if a session for this agent already exists via `tmuxSessionManager.sessionExists()`. Return 409 Conflict if already running.
3. **UI-level debounce:** Disable spawn/command buttons for 5 seconds after click. Show in-progress state.
4. **Timeout on long-running operations:** spawn.sh can take 15+ seconds waiting for TUI readiness. Add a 30-second `execFile` timeout to prevent hanging HTTP requests.

**Warning signs:**
- No in-flight operation tracking per agent
- Spawn endpoint doesn't check if session already exists
- UI buttons not disabled after click
- No timeout on execFile calls for spawn.sh (default: no timeout = hang forever)
- Logs show sessions like `warden-main-2`, `warden-main-3` accumulating unexpectedly

**Phase to address:**
Phase 1 (spawn API) — idempotency check is trivial; the mutex pattern must be established with first route implementation.

---

### Pitfall 6: spawn.sh Takes 15+ Seconds — Blocking the Node.js Event Loop if Using execFileSync

**What goes wrong:**
`spawn.sh` calls `wait_for_claude_tui_readiness` which does `sleep 3` then polls every 500ms for up to 20 seconds (lines 249-268). If the API calls `execFileSync` instead of the async `execFileAsync`, the Node.js event loop is completely blocked for up to 23 seconds. During this time: all other HTTP requests stall, Socket.IO heartbeats don't fire, and the browser disconnects. Multiple concurrent spawns multiply this: 3 concurrent spawns = 69 seconds of stall.

**Why it happens:**
`execFileSync` is synchronous and blocks the event loop. It is tempting to use because error handling looks simpler (try/catch instead of callbacks). The PRD says "No new dependencies required — uses execFile" but a developer might reach for the Sync variant.

**How to avoid:**
Always use `execFileAsync` (promisified `execFile`) for spawn.sh invocations:
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Always async — spawn.sh takes 3-23 seconds
const { stdout, stderr } = await execFileAsync(
  SPAWN_SCRIPT_PATH,
  [agentName, workdir, firstCommand],
  { timeout: 30_000 } // 30-second hard limit
);
```
The existing `TmuxSessionManager.executeTmuxCommand` follows this pattern correctly — copy it.

**Warning signs:**
- `execFileSync` anywhere in gsdRoutes.ts or related services
- `/api/gsd/spawn` response time > 100ms (should return immediately or return a job ID for async tracking)
- All other API endpoints slow down when spawn is in progress
- No timeout parameter on execFileAsync for spawn.sh

**Phase to address:**
Phase 1 (spawn API) — code review gate: ban `execFileSync` in gsdRoutes.ts.

---

### Pitfall 7: STATE.md Polling vs. Real-Time — Stale Data Masking Agent State Changes

**What goes wrong:**
The agent grid polls `GET /api/gsd/sessions/:session/state` every N seconds (or on demand). If polling interval is 10 seconds but an agent transitions from `working` → `menu` → `idle` within that window, the UI shows stale state. Worse: STATE.md is written by GSD hook scripts via the hook system — the file content is updated by stop-hook.sh after each Claude stop event. If the API reads STATE.md at the wrong moment, it may read a partially written file.

Separately: the PRD shows context pressure percentage and phase progress. These values are in STATE.md. Reading STATE.md with `fs.readFileSync` on every poll can cause ENOENT errors if the agent is mid-transition (directory being created by spawn.sh).

**Why it happens:**
STATE.md is a simple flat file maintained by hook scripts. The file is written atomically per GSD conventions (`mv tmp → final`), but there is a brief window. The polling approach shows state that may be 10-30 seconds stale — acceptable for this single-operator use case, but the UI may mislead the operator during active agent transitions.

**How to avoid:**
1. **Handle ENOENT gracefully:** Wrap STATE.md reads in try/catch; return `{ state: 'unknown', phase: null }` if file not found.
2. **Use the hook log as primary state source:** `/tmp/gsd-hooks.log` is appended in real-time — parse its last few lines to extract current state instead of relying on STATE.md polling alone. The hook log format is well-structured (verified from source).
3. **Choose polling interval consciously:** 5 seconds is adequate for single-operator use; 10 seconds creates too much stale appearance. State polling does NOT need to be real-time — the terminal view already shows live output.
4. **Never parse STATE.md as live state for critical decisions:** It's for display only. Use `tmux has-session` for existence checks; use the terminal view for real-time state.

**Warning signs:**
- STATE.md read without ENOENT error handling
- Polling interval > 10 seconds for agent state
- UI state shown as "working" long after terminal shows idle prompt
- ENOENT errors in server logs from STATE.md reads during spawn

**Phase to address:**
Phase 2 (agent state grid) — design state polling strategy before building the component.

---

### Pitfall 8: registry.json Toggle Silently Ignored When Warden Session Name Doesn't Match

**What goes wrong:**
The `PATCH /api/gsd/registry/agents/:agentId` route sets `enabled: false` for agent `warden`. The hooks read the registry using `select(.tmux_session_name == $session)` (verified in stop-hook.sh line 61-65). If the running session is `warden-main-2` (because `warden-main` was already taken, see spawn.sh `resolve_tmux_session_name`) but the registry stores `warden-main`, the hook exits early with "no agent matched." The toggle appears to succeed from the API perspective but has no effect on running hooks.

**Why it happens:**
spawn.sh resolves name conflicts by appending `-2`, `-3` suffix (lines 223-234) AND writes the actual session name back to the registry (line 418). But if the Warden API reads the registry and finds `tmux_session_name: "warden-main"` while the actual session is `warden-main-2`, toggling `enabled` on `warden` affects only the `warden-main` entry — not the running session. The session name written by spawn.sh might be stale if spawn.sh was called externally (from CLI) and the API hasn't refreshed its view.

**How to avoid:**
1. **Cross-reference registry with live tmux sessions:** When reading registry for display, augment each agent entry with the actual running session name from `tmuxSessionManager.listAgentSessions()`.
2. **Registry viewer shows discrepancy:** If `registry.tmux_session_name` differs from actual live session, show a warning in the UI ("Running as: warden-main-2, registry shows: warden-main").
3. **Always refresh registry from disk before returning:** Don't cache registry in memory; always read from file on each GET request (file is small, this is fine).
4. **PATCH operation validates against live session:** Before toggling, verify the agent's registered session name matches a live tmux session; if not, show a warning.

**Warning signs:**
- Registry shows `warden-main` but `tmux ls` shows `warden-main-2`
- Toggling `enabled: false` has no effect on hook behavior
- API caches registry in memory without refresh on write
- No cross-referencing between registry session names and live tmux sessions

**Phase to address:**
Phase 1 (registry viewer) — design around live session cross-referencing from day one.

---

### Pitfall 9: menu-driver.sh clear_then Races with Claude TUI State

**What goes wrong:**
`clear_then <slash-command>` in menu-driver.sh sends: `C-u /clear Enter` → `sleep 0.8` → `C-u <slash-command> Enter`. This 800ms sleep is designed for interactive use by a human-speed orchestrator. When called via the web API from a browser click, the 800ms feels like success — but if Claude TUI takes longer to process `/clear` (e.g., compacting context, which can take 5-30 seconds), the slash-command fires into a mid-processing TUI and is ignored or corrupts the session state.

The API gets a 0 exit code from menu-driver.sh (it doesn't verify the TUI processed the command) and returns `200 OK`, but the agent never received the command.

**Why it happens:**
menu-driver.sh's `sleep 0.8` is a fixed heuristic that works 90% of the time interactively. The web API has no feedback mechanism to know whether the command was actually received and processed. tmux `send-keys` always succeeds if the session exists — it doesn't confirm the application received the input.

**How to avoid:**
1. **Return 202 Accepted, not 200 OK** for command-send operations: the command was dispatched, not confirmed received.
2. **Document the `clear_then` latency** in the UI: show "Command sent (may take up to 30s to appear if context is compacting)."
3. **For the initial phase, limit available actions** to those with lower collision risk: `enter`, `esc`, `submit`, `choose` are safer than `clear_then` which depends on timing.
4. **Consider snapshot-and-compare verification** for critical commands: after sending, capture `menu-driver.sh snapshot` after 2 seconds and verify the command appears in pane output. This is complex — defer to a later phase.

**Warning signs:**
- API returns 200 OK for `clear_then` without any verification
- UI shows "Command sent successfully" without acknowledging the fixed timing assumption
- No documentation about `clear_then` timing sensitivity
- `clear_then` available for all agent states (should only be available when agent is `idle`)

**Phase to address:**
Phase 1 (command API) — use 202 Accepted and document timing from the start.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `execFileSync` for spawn.sh | Simpler try/catch error handling | Event loop blocks 3-23 seconds, all requests stall | Never |
| Pass `firstCommand` directly without allowlist | Simpler API, supports any command | Shell injection via tmux send-keys | Never — even for internal single-user tool |
| No lock on registry writes from Node.js | Simpler code, no npm dependency | Silent data loss when spawn.sh runs concurrently | Never — data corruption is silent and hard to detect |
| Open-ended `workdir` without boundary check | Supports any project directory | Path traversal to arbitrary filesystem locations | Never |
| `fs.watch` without cleanup on response close | Simple log streaming implementation | Memory leak from dangling watchers | Never |
| Poll STATE.md every 1 second | "Real-time" state | File descriptor churn, unnecessary I/O | Never — 5s polling is sufficient |
| No per-session spawn mutex | Simpler request handling | Double-spawn sessions accumulate, confusing operator | Never — mutex is ~20 LOC |
| No timeout on execFile for spawn.sh | Simpler code | Zombie HTTP requests, eventual memory leak | Never — 30s timeout is one argument |
| Return 200 for dispatched commands | Cleaner REST semantics appearance | False confidence that command was received | Acceptable only if UI documents the behavior |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| spawn.sh via API | Calling with `shell: true` or through `bash -c` | `execFile('/path/to/spawn.sh', [args], { timeout: 30000 })` |
| menu-driver.sh action enum | Accepting any string as action | Validate against `['snapshot','enter','esc','clear_then','choose','type','submit']` |
| recovery-registry.json + Node.js writes | Using `fs.readFileSync` + `fs.writeFileSync` without lock | Use `proper-lockfile` with same `.lock` path spawn.sh uses |
| InstanceTracker + gsdRoutes | Creating separate registry cache in gsdRoutes | Read registry from disk fresh on each request; use tmuxSessionManager for live session data |
| Log tail SSE endpoint | Forgetting `response.on('close')` cleanup | Always register watcher cleanup on `response.on('close')` |
| spawn.sh 15s TUI wait | Returning before spawn completes | Return job confirmation immediately; state will update via InstanceTracker sync |
| TmuxSessionManager.sessionExists | Using it in TOCTOU spawn guard | sessionExists + spawn is not atomic; use per-agent mutex around the whole operation |
| STATE.md reads | Assuming file always exists | Wrap in try/catch, return `{ state: 'unknown' }` on ENOENT |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `execFileSync` for spawn.sh | All HTTP requests stall for 3-23s | Always use async `execFileAsync` | First spawn request |
| Polling STATE.md every 1s per session | High file I/O on many sessions | Poll every 5-10s; batch state reads for all sessions | >3 active sessions |
| No SSE for hook log (polling instead) | Repeated full log reads, bandwidth waste | Use SSE with byte-range reads from last offset | >10 UI clients |
| Registry read on every route handler invocation | File descriptor churn | Read once, cache 1-2s | High-frequency polling |
| No timeout on spawn.sh execFile | HTTP request hangs forever | `{ timeout: 30_000 }` parameter | First hung spawn.sh (TUI never ready) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing raw `firstCommand` to spawn.sh | Remote code execution via tmux send-keys | Allowlist: preset enum OR strict character regex `[/a-zA-Z0-9 @:._-]` |
| Accepting any string as `agentName` | Path traversal / session name injection | Validate against `KNOWN_AGENT_PREFIXES`; allow only `[a-z-]` characters |
| `workdir` without boundary check | Claude Code starts in arbitrary directory | `path.resolve` + assert starts with `/home/forge` |
| `shell: true` in execFile for scripts | Bypasses execFile's shell bypass protection | Never use `shell: true` |
| Serving hook log without access control | Leaks internal agent state and operations | Already IP-whitelisted at server level; sufficient for single-operator tool |
| No size limit on hook log tail | Memory exhaustion if log is gigabytes | Limit: read last 500 lines maximum, or last 100KB |
| `menu-driver.sh type <text>` with unsanitized text | Keystroke injection into Claude TUI | Validate `text` parameter: max 500 chars, no null bytes, restrict to printable ASCII |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Spawn returns 200 after 15+ seconds | Browser times out, user unclear if spawn worked | Return 202 immediately with session name; let InstanceTracker discover and surface the new session |
| "Command sent" on menu-driver dispatch | User thinks command was executed, may resend causing double-command | Show "Command dispatched" + terminal tab for visual confirmation |
| Toggle enabled/disabled with no feedback on mismatch | Operator changes registry but hooks still fire | Show live session cross-reference warning when names diverge |
| Hook log shows raw log format without parsing | Operator must parse `[timestamp] [script] message` manually | Parse log lines into structured entries (timestamp, script, message) |
| No loading state on registry toggle | Double-click causes two PATCH requests | Disable toggle for 2s after click, show spinner |
| State shown as "unknown" when STATE.md missing | Confusing during agent initialization | Show "Starting..." during spawn window, transition to parsed state once file appears |

## "Looks Done But Isn't" Checklist

- [ ] **spawn.sh security:** Often missing validation — verify `agentName` regex, `workdir` boundary check, and `firstCommand` allowlist exist before first request
- [ ] **execFile timeout:** Often missing — verify `execFile` calls for spawn.sh have `timeout: 30_000` parameter
- [ ] **Per-session mutex:** Often missing — verify double-clicking Spawn button doesn't create two sessions
- [ ] **Registry lock on writes:** Often missing — verify concurrent spawn.sh + API write doesn't corrupt registry (test: run spawn.sh while PATCH fires)
- [ ] **SSE watcher cleanup:** Often missing — verify watching connections > 0 after all clients disconnect is impossible (check watcher count)
- [ ] **ENOENT handling:** Often missing — verify `/api/gsd/sessions/:session/state` returns 200 with `state: 'unknown'` when STATE.md doesn't exist
- [ ] **menu-driver action enum:** Often missing — verify sending action `"foo"` to command endpoint returns 400, not 500
- [ ] **202 vs 200 on command dispatch:** Often wrong — verify command endpoints return 202 Accepted, not 200 OK
- [ ] **Session name mismatch warning:** Often missing — verify registry viewer shows warning when `registry.tmux_session_name` != live session name

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shell injection via firstCommand | HIGH | Audit all tmux send-keys payloads; add allowlist validation; review tmux sessions for injected commands |
| Path traversal in workdir | HIGH | Add boundary check; audit any Claude Code sessions started in unexpected directories |
| Registry corruption from concurrent writes | MEDIUM | Validate registry JSON (`validate_registry_json` in spawn.sh handles this); restore from `.corrupt-*` backup |
| Memory leak from dangling watchers | MEDIUM | Restart server; add `response.on('close')` cleanup; verify with connection count monitoring |
| Double-spawn sessions accumulating | LOW | `tmux kill-session` for duplicate sessions; add spawn mutex; clean up registry entries |
| Event loop blocked by execFileSync | HIGH | Replace with execFileAsync; restart server; no data loss but live sessions may have missed sync ticks |
| menu-driver race condition corrupting TUI | MEDIUM | `C-u` + Enter in the affected tmux session clears partial input; session resumes normally |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Shell injection via args | Phase 1: gsdRoutes.ts | Send malicious firstCommand; verify 400 returned, no tmux keystrokes sent |
| Path traversal in workdir | Phase 1: gsdRoutes.ts | Send `../../../etc` as workdir; verify 400 returned |
| Registry race condition | Phase 1: registry PATCH | Run spawn.sh + PATCH concurrently 10 times; verify registry not corrupted |
| Log tail memory leak | Phase 2: hook feed | Open 10 SSE connections, close all; verify watcher count drops to 0 |
| Double-spawn race condition | Phase 1: spawn endpoint | Rapid double-click simulation; verify single session created |
| execFileSync event loop block | Phase 1: spawn endpoint | Code review: no execFileSync in gsdRoutes.ts |
| STATE.md ENOENT crash | Phase 2: agent state grid | Stop a session; verify state endpoint returns gracefully |
| Session name mismatch | Phase 1: registry viewer | Spawn externally via CLI; verify UI shows mismatch warning |
| menu-driver timing assumption | Phase 1: command API | Verify 202 returned; verify UI shows "dispatched not confirmed" language |

## Sources

**Confidence: HIGH** — All findings verified against actual spawn.sh and menu-driver.sh source code (read in full), existing TmuxSessionManager.ts patterns, and 2025-2026 Node.js security documentation.

### Shell Injection & execFile Security
- [Prevent Command Injection Node.js Child_Process: Safer Execution with execFile](https://securecodingpractices.com/prevent-command-injection-node-js-child-process/) — execFile vs exec safety model
- [NodeJS Command Injection Guide: Examples and Prevention](https://www.stackhawk.com/blog/nodejs-command-injection-examples-and-prevention/)
- [eslint-plugin-security: avoid-command-injection-node](https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/avoid-command-injection-node.md)

### Path Traversal in Node.js
- [Node.js Path Traversal Guide](https://www.stackhawk.com/blog/node-js-path-traversal-guide-examples-and-prevention/)
- [CVE-2025-27210: Node.js path traversal via device names](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows) — 2025 CVE showing path.normalize is insufficient
- [Secure Coding Practices: path traversal](https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities)

### Concurrent File Writes & Locking
- [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile) — mkdir-strategy advisory locking compatible with multi-process access
- [Node.js race conditions](https://nodejsdesignpatterns.com/blog/node-js-race-conditions/)
- spawn.sh source: `flock -x 200` around `jq` transform (lines 103-140) — verified

### fs.watch and Log Tailing
- [node-tailfd: tail through rotation and truncation](https://github.com/soldair/node-tailfd)
- [Node.js fs.watch issues: fs.watch memory leak on Windows](https://github.com/nodejs/node/issues/52769) — confirmed leak if not closed
- [chokidar: normalizes fs.watch events](https://github.com/paulmillr/chokidar) — alternative if fs.watch proves unreliable

### tmux Race Conditions
- [Agent teams tmux send-keys race condition](https://github.com/anthropics/claude-code/issues/23615) — confirmed concurrent send-keys corruption in 2025
- menu-driver.sh source: `sleep 0.8` fixed heuristic (line 49) — verified

### Zombie Processes & Async Execution
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) — timeout parameter, SIGTERM behavior
- [Zombie processes in Node.js child_process](https://saturncloud.io/blog/what-is-a-zombie-process-and-how-to-avoid-it-when-spawning-nodejs-child-processes-on-cloud-foundry/)

### SSE vs Polling for Log Streaming
- [WebSockets vs SSE vs Long Polling comparison](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [SSE comeback in 2025](https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/)
- [Server-Sent Events in Node.js](https://techsimple.in/blog/server-sent-events-in-nodejs)

---
*Pitfalls research for: Warden v2.1 GSD Manager Plugin (shell-proxying, process spawning, config editing, log tailing)*
*Researched: 2026-02-18*
*Confidence: HIGH (verified against actual scripts + 2025-2026 sources)*
