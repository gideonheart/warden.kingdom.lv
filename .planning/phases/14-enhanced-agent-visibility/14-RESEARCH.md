# Phase 14: Enhanced Agent Visibility - Research

**Researched:** 2026-02-18
**Domain:** Server-side tmux pane inspection, per-session log analysis, STATE.md parsing
**Confidence:** HIGH

## Summary

Phase 14 adds three columns to the Agents grid: a color-coded state badge (idle/menu/working/error), a context pressure percentage, and the current GSD phase/progress from STATE.md. The central research question was: where does the data come from?

The key finding is that the hook scripts log `state=` to the **per-session** log file (e.g., `~/.openclaw/workspace/skills/gsd-code-skill/logs/warden-main-3.log`) after Phase 2 redirect, NOT to the shared `/tmp/gsd-hooks.log` that GsdHookLogWatcher watches. Context pressure (`72% [CRITICAL]`) is computed by the hook scripts but never written to any log file — it goes only into the wake message sent to OpenClaw. This means the current hook log infrastructure cannot serve state or pressure data to Warden as-is.

The clean solution requires no hook modifications. Warden's server can call `tmux capture-pane -pt SESSION:0.0 -S -5` for any active session and run the same pattern matching the hook scripts use. This yields both state and context pressure in a single call. A new server endpoint `GET /api/gsd/agents/live-status` returns all agents' state/pressure in one request. STATE.md data uses the already-existing `GET /api/gsd/sessions/:session/state` endpoint. Client polls live-status every 5 seconds and STATE.md every 30 seconds.

**Primary recommendation:** Add a single new server endpoint using `tmux capture-pane`, two new client hooks using polling (not Socket.IO), and extend the Agents grid with three new columns. No hook script modifications, no new npm dependencies.

## Data Source Investigation

### GRID-03: State Hints

**Where state is currently logged (per-session log):**

```
[2026-02-18T08:58:19Z] [stop-hook.sh] state=permission_prompt
[2026-02-18T08:45:57Z] [notification-permission-hook.sh] state=menu
[2026-02-18T10:33:39Z] [stop-hook.sh] state=error
```

Confirmed from: `/home/forge/.openclaw/workspace/skills/gsd-code-skill/logs/warden-main-3.log`

**Why the shared hooks.log does NOT have state= for current sessions:**

In `stop-hook.sh` (and all other hooks), there is a Phase 2 redirect:

```bash
debug_log "tmux_session=$SESSION_NAME"   # Phase 1 — goes to shared log
GSD_HOOK_LOG="${SKILL_LOG_DIR}/${SESSION_NAME}.log"  # redirect
debug_log "=== log redirected ==="
# All subsequent debug_log including state= go to per-session file
debug_log "state=$STATE"   # Phase 2 — goes to per-session ONLY
```

The shared log (`/tmp/gsd-hooks.log` or `SKILL_LOG_DIR/hooks.log`) only gets Phase 1 lines: `FIRED`, `stdin:`, `tmux_session=`, and exit guards. It never gets `state=` or pressure data for current hook versions.

**Historical note:** `/tmp/gsd-hooks.log` contains `state=` lines from warden-main-2 era (Feb 17) because the per-session redirect did not exist in that earlier version of the hooks. Those lines are from a prior implementation.

**Selected approach: Server-side tmux capture-pane**

The server calls `tmux capture-pane` per active session. This is the same method the hooks use internally. No hook modifications required. Works immediately for any active tmux session without needing the hook to have fired.

### GRID-04: Context Pressure

**Confirmed: context pressure is never logged to any file.**

The hooks compute pressure and put it in the wake message:

```bash
CONTEXT_PRESSURE="${PERCENTAGE}% [CRITICAL]"  # or [WARNING] or [OK]
WAKE_MESSAGE="...
[CONTEXT PRESSURE]
${CONTEXT_PRESSURE}
..."
openclaw agent --session-id "$OPENCLAW_SESSION_ID" --message "$WAKE_MESSAGE" >> "$GSD_HOOK_LOG" 2>&1 &
```

The `>> "$GSD_HOOK_LOG"` captures `openclaw` tool stdout, not the wake message contents. `CONTEXT_PRESSURE` variable is never passed to `debug_log`. No log file anywhere contains `context_pressure=`.

**Selected approach: Extract from tmux pane content, same as the hooks.**

The Claude Code status bar always shows the context fill percentage. Confirmed from live capture of warden-main-3:

```
  Opus 4.6 │ warden.kingdom.lv █████░░░░░ 55%
```

Extraction: `paneLines.slice(-5).join('\n').match(/(\d{1,3})%/)`
Returns `55` — confirmed working.

### GRID-05: GSD Phase and Progress

**Already implemented:** `GET /api/gsd/sessions/:session/state` in `src/server/routes/gsdRoutes.ts`

Returns `{ sessionName, stateContent: string | null }` where stateContent is the raw STATE.md content.

STATE.md format (confirmed from live `.planning/STATE.md`):
```
Phase: 13 — Client Plugin
Progress: [███████░░░] 70%
```

Client parses with:
- Phase number: `/Phase:\s+(\d+)/m` → `"13"`
- Progress: `/Progress:.*?(\d+)%/m` → `"70"`

Falls back to `"—"` gracefully when `stateContent` is null.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `child_process.execFile` | built-in | tmux pane capture on server | Already used in TmuxSessionManager |
| React `useState` + `useEffect` | React 19 | Client polling hooks | Existing pattern in useGsdRegistry, useActiveInstances |
| Tailwind CSS warden-* tokens | v4 | State badge colors | Already defined in styles.css |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Express Router | Express 5 | New live-status endpoint | Already imported in gsdRoutes.ts |
| `fs/promises.readFile` | built-in | STATE.md reading (already in gsdRoutes) | Existing pattern |

**No new npm dependencies required.**

### Existing Color Tokens (from styles.css — confirmed)

| Token | Hex | Use |
|-------|-----|-----|
| `warden-success` | `#22c55e` | Pressure OK (<50%), idle state |
| `warden-warning` | `#f59e0b` | Pressure WARNING (50-79%), menu/permission states |
| `warden-error` | `#ef4444` | Pressure CRITICAL (>=80%), error state |
| `warden-accent` | `#6366f1` | Working state |
| `warden-idle` | `#64748b` | Idle state |

## Architecture Patterns

### Recommended Project Structure

Phase 14 adds:

```
src/
├── client/hooks/
│   ├── useAgentLiveStatus.ts    # NEW: polls /api/gsd/agents/live-status every 5s
│   └── useAgentStateFiles.ts   # NEW: polls STATE.md endpoints every 30s
├── server/routes/
│   └── gsdRoutes.ts            # EXTEND: add GET /api/gsd/agents/live-status
└── client/plugins/
    └── gsd-manager-plugin.tsx  # EXTEND: add 3 columns to Agents grid
```

### Pattern 1: Server-Side Pane Capture

**What:** Server calls `tmux capture-pane` for each active agent session, runs hook-equivalent pattern matching.
**When to use:** Any time Warden needs real-time pane state without modifying hook scripts.

```typescript
// In gsdRoutes.ts — new endpoint
// Source: mirrors TmuxSessionManager.executeTmuxCommand pattern
const paneOutput = await execFileAsync('tmux', [
  'capture-pane',
  '-pt',
  `${agent.tmux_session_name}:0.0`,
  '-S', '-5',   // last 5 lines of scrollback above visible area
]);

const paneContent = paneOutput.stdout;

// State detection — mirrors stop-hook.sh section 8 exactly
function detectAgentState(pane: string): AgentStateHint {
  if (/enter to select|numbered.*option/i.test(pane)) return 'menu';
  if (/permission|allow|dangerous/i.test(pane)) return 'permission_prompt';
  if (/what can i help|waiting for/i.test(pane)) return 'idle';
  const lines = pane.split('\n');
  if (lines.some(l => /error|failed|exception/i.test(l) && !/error handling/i.test(l))) return 'error';
  return 'working';
}

// Pressure extraction — mirrors stop-hook.sh section 9
function extractContextPressure(pane: string): ContextPressureResult {
  const lastLines = pane.split('\n').slice(-5).join('\n');
  const match = lastLines.match(/(\d{1,3})%/);
  if (!match) return { percentage: null, level: null };
  const pct = parseInt(match[1], 10);
  if (pct >= 80) return { percentage: pct, level: 'critical' };
  if (pct >= 50) return { percentage: pct, level: 'warning' };
  return { percentage: pct, level: 'ok' };
}
```

### Pattern 2: Bulk Live-Status Endpoint

**What:** Single endpoint returns state + pressure for ALL registry agents. Avoids N parallel client requests.
**When to use:** When client needs status for all agents simultaneously.

```typescript
// Source: gsdRoutes.ts pattern — mirrors existing registry route
router.get('/api/gsd/agents/live-status', async (_request, response) => {
  const registry = await gsdRegistryService.getRegistry();

  const results = await Promise.allSettled(
    registry.agents.map(async (agent) => {
      if (!agent.tmux_session_name) {
        return { agentId: agent.agent_id, sessionName: null, state: null, contextPressure: null, contextPressureLevel: null };
      }
      try {
        const { stdout } = await execFileAsync('tmux', [
          'capture-pane', '-pt', `${agent.tmux_session_name}:0.0`, '-S', '-5'
        ]);
        return {
          agentId: agent.agent_id,
          sessionName: agent.tmux_session_name,
          state: detectAgentState(stdout),
          ...extractContextPressure(stdout),
        };
      } catch {
        // Session not running
        return { agentId: agent.agent_id, sessionName: agent.tmux_session_name, state: null, contextPressure: null, contextPressureLevel: null };
      }
    })
  );

  response.json({
    agents: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
  });
});
```

### Pattern 3: Client Polling Hook

**What:** Poll endpoint at fixed interval, return derived data. Follows existing `useGsdRegistry` pattern.
**When to use:** For data that updates frequently but doesn't require Socket.IO push.

```typescript
// Source: mirrors useGsdRegistry.ts polling pattern
export function useAgentLiveStatus() {
  const [liveStatus, setLiveStatus] = useState<Map<string, AgentLiveStatus>>(new Map());

  useEffect(() => {
    const fetchStatus = async () => {
      const response = await fetch('/api/gsd/agents/live-status');
      if (!response.ok) return;
      const data = await response.json() as { agents: AgentLiveStatusEntry[] };
      const map = new Map(data.agents.map(a => [a.agentId, a]));
      setLiveStatus(map);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5_000);
    return () => clearInterval(interval);
  }, []);

  return { liveStatus };
}
```

### Pattern 4: STATE.md Parsing in Client

**What:** Parse STATE.md content string for Phase number and progress percentage.
**When to use:** Displaying GSD workflow progress per agent.

```typescript
// Source: derived from STATE.md format confirmed in .planning/STATE.md
interface GsdStateInfo {
  phase: string | null;       // "13"
  progress: number | null;    // 70
}

function parseStateFile(stateContent: string | null): GsdStateInfo {
  if (!stateContent) return { phase: null, progress: null };
  const phaseMatch = stateContent.match(/^Phase:\s+(\d+)/m);
  const progressMatch = stateContent.match(/Progress:.*?(\d+)%/m);
  return {
    phase: phaseMatch ? phaseMatch[1] : null,
    progress: progressMatch ? parseInt(progressMatch[1], 10) : null,
  };
}
```

### Pattern 5: State Badge Component

**What:** Color-coded badge for state hints. Uses existing warden-* color tokens.
**When to use:** Rendering state in the Agents grid.

```typescript
// Source: mirrors STATUS_COLORS pattern already in gsd-manager-plugin.tsx
const STATE_COLORS: Record<string, string> = {
  working:            'bg-warden-accent text-warden-bg',
  idle:               'bg-warden-idle text-warden-bg',
  menu:               'bg-warden-warning text-warden-bg',
  permission_prompt:  'bg-warden-warning text-warden-bg',
  error:              'bg-warden-error text-warden-bg',
};

const STATE_LABELS: Record<string, string> = {
  working:            'working',
  idle:               'idle',
  menu:               'menu',
  permission_prompt:  'perm',   // abbreviated to fit grid
  error:              'error',
};

function StateBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-warden-text-dim">—</span>;
  const colorClass = STATE_COLORS[state] ?? 'bg-warden-idle text-warden-bg';
  const label = STATE_LABELS[state] ?? state;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${colorClass}`}>
      {label}
    </span>
  );
}
```

### Pattern 6: Pressure Indicator

**What:** Percentage number with color reflecting safe/warning/critical level.

```typescript
const PRESSURE_COLORS: Record<string, string> = {
  ok:       'text-warden-success',
  warning:  'text-warden-warning',
  critical: 'text-warden-error',
};

function PressureIndicator({ percentage, level }: { percentage: number | null; level: string | null }) {
  if (percentage === null) return <span className="text-warden-text-dim">—</span>;
  const colorClass = PRESSURE_COLORS[level ?? 'ok'] ?? 'text-warden-success';
  return <span className={`font-mono ${colorClass}`}>{percentage}%</span>;
}
```

### Anti-Patterns to Avoid

- **Modifying hook scripts to add logging:** Adds coupling and risk to production hook scripts that fire during every Claude Code stop. Server-side capture works without hook changes.
- **Watching per-session log files:** Per-session log path is `SKILL_LOG_DIR/${SESSION_NAME}.log`. The log has `state=` but NOT pressure. Mixing log watching (for state) with pane capture (for pressure) adds complexity with no benefit.
- **Using Socket.IO push for state/pressure:** The `/gsd-hooks` namespace streams hook log lines that don't contain state/pressure data in the current hook version. Polling the live-status endpoint is simpler and sufficient.
- **Polling STATE.md at 5s interval:** STATE.md changes only when GSD workflow completes a plan step (minutes between changes). 30s is adequate. 5s would be noisy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context pressure from pane | Custom regex parser | Stop-hook.sh's proven pattern: `pane.split('\n').slice(-5).join('\n').match(/(\d{1,3})%/)` | Hooks have already validated this against Claude Code's status bar format |
| State detection | Custom ML/heuristic | Same grep patterns as stop-hook.sh section 8 | Hook patterns are validated against real Claude Code pane content |
| Tmux pane access | Custom pty reader | `execFile('tmux', ['capture-pane', ...])` | TmuxSessionManager already uses this; tmux handles all terminal complexity |
| Color tokens | Inline hex colors | `warden-success`, `warden-warning`, `warden-error` tokens | Already defined in styles.css, used throughout project |
| Polling infrastructure | Custom interval management | `useEffect` + `setInterval` + cleanup | Same pattern as `useGsdRegistry` and `useActiveInstances` |

## Common Pitfalls

### Pitfall 1: tmux capture-pane returns empty for dead sessions

**What goes wrong:** `execFile('tmux', ['capture-pane', '-pt', 'SESSION:0.0'])` throws when the session doesn't exist. The error is not a null return — it's a rejected promise.
**Why it happens:** tmux exits with code 1 and stderr `"can't find session: SESSION"` for non-existent sessions.
**How to avoid:** Wrap each per-agent capture in try/catch. Return `{ state: null, contextPressure: null }` on catch. The `Promise.allSettled` pattern in the bulk endpoint handles this.
**Warning signs:** Endpoint crashes or returns 500 when any agent session is stopped.

### Pitfall 2: Context pressure percentage matches numbers other than context fill

**What goes wrong:** Lines like "Phase: 13 of 14 — 70% complete" or "2 of 5 tasks (40%)" could match the pressure regex.
**Why it happens:** The regex `(\d{1,3})%` is broad. The stop-hook uses `tail -5` to scope to the status bar area.
**How to avoid:** Only search in the last 5 lines of pane output (`.slice(-5)`). The Claude Code status bar is always at the bottom. Filter out empty lines before taking the slice.
**Warning signs:** Pressure shows unexpected values like "40" when no context pressure indicator is visible.

### Pitfall 3: `tmux capture-pane -S -5` returns 139+ lines

**What goes wrong:** The `-S -5` flag means "start 5 lines from the top of the scrollback" NOT "last 5 lines". The command returns the visible terminal area plus 5 lines of scrollback history above it — typically 100-200 lines total.
**Why it happens:** tmux `-S` is a start offset, not a line count. `-S -5` with negative value means 5 lines above the visible area.
**How to avoid:** After capture, use `.split('\n').slice(-5)` in code to get just the last 5 lines. The hooks do this: `echo "$PANE_CONTENT" | tail -5`.
**Confirmed from testing:** `tmux capture-pane -pt warden-main-3:0.0 -S -5` returned 139 lines; `tail -5` correctly extracted the status bar with "55%".

### Pitfall 4: STATE.md polling for all agents creates N parallel requests

**What goes wrong:** With 5 agents, client fires 5 simultaneous `GET /api/gsd/sessions/:session/state` calls every 30s.
**Why it happens:** Individual polling hooks per agent.
**How to avoid:** Use a single `useAgentStateFiles(agentSessions)` hook that fetches all STATE.md endpoints in `Promise.allSettled` for all active agents. Alternatively, add a bulk endpoint `GET /api/gsd/agents/state-files`. For 1-5 agents, individual parallel calls are acceptable.

### Pitfall 5: `permission_prompt` vs `dangerous` false positives

**What goes wrong:** Normal agent output containing words like "dangerous" or "allow" triggers `permission_prompt` state even when the agent is working normally.
**Why it happens:** The stop-hook pattern `grep -Eiq 'permission|allow|dangerous'` is intentionally broad for Claude Code-specific contexts. Source code reviews, error messages, tool descriptions can all contain these words.
**How to avoid:** This is a known limitation in the hook scripts themselves. Document that state detection is best-effort. Consider tightening regex to `/(permission|allow|dangerous)\s+(this|me|to|for)/i` but this increases false negative risk. For Phase 14, use the same patterns as the hooks for consistency.

### Pitfall 6: Grid becomes too wide with 3 new columns

**What goes wrong:** Adding State, Pressure, and GSD Phase columns to the existing 5-column grid creates overflow on typical panel widths.
**Why it happens:** The panel is fixed-height at 64px. The table has no horizontal scroll.
**How to avoid:** Abbreviate column headers ("State" not "State Hint", "Ctx" not "Context Pressure", "Phase" not "GSD Phase"). Keep badges compact (px-1.5 py-0.5). Use short label for `permission_prompt` → `"perm"`. Consider removing the "Working Dir" column from the grid view (it's already in the Registry tab).

## Code Examples

### Server: live-status endpoint (complete)

```typescript
// Source: gsdRoutes.ts — follows existing route patterns
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

type AgentStateHint = 'working' | 'idle' | 'menu' | 'permission_prompt' | 'error';
type PressureLevel = 'ok' | 'warning' | 'critical';

interface AgentLiveStatusEntry {
  agentId: string;
  sessionName: string | null;
  state: AgentStateHint | null;
  contextPressure: number | null;
  contextPressureLevel: PressureLevel | null;
}

function detectAgentState(pane: string): AgentStateHint {
  if (/enter to select|numbered.*option/i.test(pane)) return 'menu';
  if (/permission|allow|dangerous/i.test(pane)) return 'permission_prompt';
  if (/what can i help|waiting for/i.test(pane)) return 'idle';
  const lines = pane.split('\n');
  if (lines.some(l => /error|failed|exception/i.test(l) && !/error handling/i.test(l))) {
    return 'error';
  }
  return 'working';
}

function extractContextPressure(pane: string): { contextPressure: number | null; contextPressureLevel: PressureLevel | null } {
  const lastLines = pane.split('\n').filter(l => l.trim()).slice(-5).join('\n');
  const match = lastLines.match(/(\d{1,3})%/);
  if (!match) return { contextPressure: null, contextPressureLevel: null };
  const pct = parseInt(match[1], 10);
  const level: PressureLevel = pct >= 80 ? 'critical' : pct >= 50 ? 'warning' : 'ok';
  return { contextPressure: pct, contextPressureLevel: level };
}

router.get('/api/gsd/agents/live-status', async (_request, response) => {
  try {
    const registry = await gsdRegistryService.getRegistry();

    const results = await Promise.allSettled(
      registry.agents.map(async (agent): Promise<AgentLiveStatusEntry> => {
        if (!agent.tmux_session_name) {
          return { agentId: agent.agent_id, sessionName: null, state: null, contextPressure: null, contextPressureLevel: null };
        }
        try {
          const { stdout } = await execFileAsync('tmux', [
            'capture-pane', '-pt', `${agent.tmux_session_name}:0.0`, '-S', '-5',
          ]);
          return {
            agentId: agent.agent_id,
            sessionName: agent.tmux_session_name,
            state: detectAgentState(stdout),
            ...extractContextPressure(stdout),
          };
        } catch {
          return { agentId: agent.agent_id, sessionName: agent.tmux_session_name, state: null, contextPressure: null, contextPressureLevel: null };
        }
      })
    );

    const agents = results
      .filter((r): r is PromiseFulfilledResult<AgentLiveStatusEntry> => r.status === 'fulfilled')
      .map(r => r.value);

    response.json({ agents });
  } catch (error) {
    console.error('[GsdRoutes] Failed to get live status:', error);
    response.status(500).json({ error: 'Failed to get live status' });
  }
});
```

### Client: useAgentLiveStatus hook

```typescript
// Source: src/client/hooks/useAgentLiveStatus.ts
// Mirrors useGsdRegistry.ts polling pattern
import { useState, useEffect } from 'react';

const LIVE_STATUS_POLL_MS = 5_000;

export type AgentStateHint = 'working' | 'idle' | 'menu' | 'permission_prompt' | 'error';
export type PressureLevel = 'ok' | 'warning' | 'critical';

export interface AgentLiveStatus {
  state: AgentStateHint | null;
  contextPressure: number | null;
  contextPressureLevel: PressureLevel | null;
}

export function useAgentLiveStatus(): Map<string, AgentLiveStatus> {
  const [statusMap, setStatusMap] = useState<Map<string, AgentLiveStatus>>(new Map());

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/gsd/agents/live-status');
        if (!response.ok) return;
        const data = await response.json() as { agents: (AgentLiveStatus & { agentId: string })[] };
        setStatusMap(new Map(data.agents.map(a => [a.agentId, {
          state: a.state,
          contextPressure: a.contextPressure,
          contextPressureLevel: a.contextPressureLevel,
        }])));
      } catch {
        // Network error — leave previous data in place
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, LIVE_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return statusMap;
}
```

### Client: useAgentStateFiles hook

```typescript
// Source: src/client/hooks/useAgentStateFiles.ts
// Uses existing /api/gsd/sessions/:session/state endpoint
import { useState, useEffect } from 'react';

const STATE_FILE_POLL_MS = 30_000;

export interface GsdStateInfo {
  phase: string | null;
  progress: number | null;
}

export function useAgentStateFiles(sessionNames: string[]): Map<string, GsdStateInfo> {
  const [stateMap, setStateMap] = useState<Map<string, GsdStateInfo>>(new Map());

  useEffect(() => {
    if (sessionNames.length === 0) return;

    const fetchAll = async () => {
      const results = await Promise.allSettled(
        sessionNames.map(async (session) => {
          const response = await fetch(`/api/gsd/sessions/${session}/state`);
          if (!response.ok) return [session, { phase: null, progress: null }] as const;
          const data = await response.json() as { stateContent: string | null };
          return [session, parseStateFile(data.stateContent)] as const;
        })
      );
      const entries = results
        .filter((r): r is PromiseFulfilledResult<readonly [string, GsdStateInfo]> => r.status === 'fulfilled')
        .map(r => r.value);
      setStateMap(new Map(entries));
    };

    fetchAll();
    const interval = setInterval(fetchAll, STATE_FILE_POLL_MS);
    return () => clearInterval(interval);
  }, [sessionNames.join(',')]);

  return stateMap;
}

function parseStateFile(stateContent: string | null): GsdStateInfo {
  if (!stateContent) return { phase: null, progress: null };
  const phaseMatch = stateContent.match(/^Phase:\s+(\d+)/m);
  const progressMatch = stateContent.match(/Progress:.*?(\d+)%/m);
  return {
    phase: phaseMatch ? phaseMatch[1] : null,
    progress: progressMatch ? parseInt(progressMatch[1], 10) : null,
  };
}
```

### Updated Agents grid table header (columns to add)

```tsx
// Source: gsd-manager-plugin.tsx — extend thead in Agents grid
<thead>
  <tr className="text-warden-text-dim border-b border-warden-border">
    <th className="text-left py-1 pr-3 font-normal">Status</th>
    <th className="text-left py-1 pr-3 font-normal">Agent ID</th>
    <th className="text-left py-1 pr-3 font-normal">Session</th>
    {/* NEW COLUMNS */}
    <th className="text-left py-1 pr-3 font-normal">State</th>
    <th className="text-left py-1 pr-3 font-normal">Ctx</th>
    <th className="text-left py-1 pr-3 font-normal">Phase</th>
    {/* REMOVED: Working Dir (available in Registry tab) */}
    <th className="text-left py-1 font-normal">Enabled</th>
  </tr>
</thead>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hook log state= in shared log | Per-session log redirect added | Phase 12 implementation | state= no longer in /tmp/gsd-hooks.log for current sessions |
| No state/pressure in Warden | Server-side pane capture (Phase 14) | Now | Clean solution without hook modifications |
| N individual STATE.md fetches | Single bulk endpoint or parallel allSettled | Phase 14 | Reduces per-render request fan-out |

**Deprecated/outdated:**
- `/tmp/gsd-hooks.log` as source for state= data: Works for pre-Phase-12 hook versions only. Current hook version redirects state= to per-session logs. Do not rely on this for Phase 14.
- Hook modification approach: Researched and rejected. Modifying production hook scripts adds risk. Server-side pane capture is equivalent in output.

## Open Questions

1. **State detection false positives for 'dangerous' in agent output**
   - What we know: Hook scripts use broad pattern matching by design
   - What's unclear: Whether agent outputs (code reviews, tool descriptions) frequently contain trigger words like "dangerous" or "allow"
   - Recommendation: Use same patterns as hooks for consistency. If false positives become noisy in practice, tighten regex in a follow-up.

2. **Context pressure when agent is not running Claude Code**
   - What we know: Pressure % comes from Claude Code's status bar. If session is active but agent is at a bash prompt (not in Claude Code), there may be no % in pane.
   - What's unclear: What the pane looks like for a spawned agent session at the shell prompt
   - Recommendation: Return `{ contextPressure: null }` when no % is found. The UI shows "—" gracefully.

3. **Column width in Agents grid with 3 new columns**
   - What we know: Current grid has 5 columns in a 64px-height panel at h-64
   - What's unclear: Whether removing "Working Dir" column frees enough space, or if grid needs scroll
   - Recommendation: Remove "Working Dir" column from grid tab (it's in Registry tab). Use abbreviated labels. Test visually during implementation.

## Sources

### Primary (HIGH confidence)

- Direct file inspection: `/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/stop-hook.sh` — confirmed state= is written AFTER Phase 2 redirect, context_pressure is never debug_log'd
- Direct file inspection: `notification-idle-hook.sh`, `notification-permission-hook.sh` — same pattern as stop-hook.sh
- Live log inspection: `/home/forge/.openclaw/workspace/skills/gsd-code-skill/logs/warden-main-3.log` — confirmed state= lines present, no context_pressure lines
- Live log inspection: `/tmp/gsd-hooks.log` — confirmed state= lines are from warden-main-2 (pre-Phase-12 hook version), none from warden-main-3
- Live command execution: `tmux capture-pane -pt warden-main-3:0.0 -S -5` + extraction — confirmed "55%" extracted from status bar
- Live API test: `GET http://localhost:3001/api/gsd/sessions/warden-main-3/state` — confirmed endpoint returns `{ sessionName, stateContent: string }`
- Codebase inspection: `src/server/services/GsdHookLogWatcher.ts` — confirmed watches `/tmp/gsd-hooks.log`
- Codebase inspection: `src/server/routes/gsdRoutes.ts` — confirmed STATE.md endpoint exists at `/api/gsd/sessions/:session/state`
- Codebase inspection: `src/client/styles.css` — confirmed warden-success, warden-warning, warden-error, warden-idle, warden-accent tokens

### Secondary (MEDIUM confidence)

- Pattern validation: STATE.md regex `/Phase:\s+(\d+)/m` and `/Progress:.*?(\d+)%/m` tested against live `.planning/STATE.md` content
- Architecture: Bulk endpoint pattern inferred from existing Promise.allSettled use in TmuxSessionManager

## Metadata

**Confidence breakdown:**
- Data sources (state, pressure, STATE.md): HIGH — confirmed from live files and live API calls
- Server-side tmux capture approach: HIGH — confirmed working with actual pane capture
- Context pressure format: HIGH — "55%" confirmed from live capture of Claude Code status bar
- Hook script behavior: HIGH — read source code directly, confirmed with log file inspection
- Client polling architecture: HIGH — mirrors existing useGsdRegistry pattern exactly
- Grid column layout: MEDIUM — visual outcome depends on actual rendered widths

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — hooks may change but pane capture pattern is stable)

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|-----------------|
| GRID-03 | Color-coded state badge per agent (idle/menu/working/error) from hook activity, updating within 5s | Server-side tmux capture-pane with state pattern matching (same as hook scripts). New endpoint `GET /api/gsd/agents/live-status`. Client polls at 5s via `useAgentLiveStatus`. |
| GRID-04 | Context pressure percentage per agent with safe/warning/critical visual indicator | Same tmux capture-pane call as GRID-03. Extract `(\d{1,3})%` from last 5 pane lines (confirmed: "55%" from live capture). Levels: <50% ok, 50-79% warning, >=80% critical. |
| GRID-05 | Current GSD phase number and progress % from STATE.md, fallback "—" when absent | Use existing `GET /api/gsd/sessions/:session/state` endpoint. Client parses with `/Phase:\s+(\d+)/m` and `/Progress:.*?(\d+)%/m`. New hook `useAgentStateFiles` polls every 30s. |
</phase_requirements>
