# Phase 38: Auto-Restart Engine - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Warden can automatically restart crashed agent sessions based on per-agent restart policy (none/once/always) with a storm rate limiter (3/hour). Operator configures policy from the dashboard. Restart outcomes are logged to the lifecycle events table. Crash detection (Phase 37) must exist — this phase acts on detected crashes.

Out of scope: lifecycle history UI (Phase 40), idle timeout (Phase 39), quick-launch (Phase 39).

</domain>

<decisions>
## Implementation Decisions

### Policy Configuration UI
- Restart policy config lives in the **AgentSidebar** panel, next to each agent's existing info (SOUL.md preview, topic mapping)
- Control is a **dropdown selector** with three options: none / once / always
- Default is `none` — operator must explicitly enable auto-restart per agent
- Policy applies **per-agent globally** (all sessions for that agent), not per-session
- When the storm limiter auto-disables restart policy, show a **warning badge/icon** next to the dropdown indicating it was auto-disabled, with tooltip explaining why

### Restart Execution Behavior
- **Short delay (5-10 seconds)** before spawning the new session after crash detection — avoids rapid-fire, gives system time to settle
- Restart command: re-run the same `claude --dangerously-skip-permissions` command in a new tmux session with the **same project path** from the crashed session
- `once` policy semantics: **stays as 'once'** — means "restart once per crash event." Each new crash gets one restart attempt. Policy persists until operator changes it
- Under `always` policy, if the restarted session also crashes: **yes, attempt restart again** up to the storm limiter (3/hour). The rate limiter is the safety net, not the policy mode

### Storm Detection & Recovery
- Storm counter is **per-agent** (not per-session) — if agent 'gideon' crashes 3 times across any sessions within one hour, storm triggers
- After storm limiter flips policy to `none`: operator **manually re-enables** via the UI dropdown. No auto-reset/cooldown — explicit human decision required
- Telegram storm alert content: **agent name + restart count + auto-disabled notice** — e.g., "gideon restarted 3 times in 1h — auto-restart disabled. Check dashboard."
- Normal (non-storm) auto-restart events: **storm alert only** to Telegram. Individual restarts are logged to lifecycle events table but don't send Telegram notifications (crash detection in Phase 37 already sends a crash notification)

### Restart Feedback in Dashboard
- When auto-restart happens: **toast notification** — brief snackbar like "gideon auto-restarted — new session active." Non-blocking, auto-dismisses
- Restarted session **auto-appears in tab bar** via normal InstanceTracker polling (within 10s cycle). Does NOT auto-select/switch the operator's active tab
- Crashed (stopped) session **remains visible** alongside the new restarted session — operator can review crash context if needed
- Lifecycle events (restarts, storm disables) **logged to DB only** — UI to browse them comes in Phase 40 (Lifecycle History). Keeps Phase 38 focused on the engine

### Claude's Discretion
- Exact toast notification styling and duration
- Session naming for restarted sessions (e.g., append restart count or use fresh UUID)
- Internal implementation of the 1-hour sliding window for storm detection
- Database schema details for `session_lifecycle_policy` table beyond the required columns

</decisions>

<specifics>
## Specific Ideas

- Storm limiter should use a sliding window (not fixed hourly buckets) — 3 restarts in any 60-minute rolling window triggers storm
- The warning badge on auto-disabled policies should be visually distinct from normal UI — operator should notice something is wrong at a glance
- Restart delay doesn't need to be user-configurable — a sensible hardcoded value (5-10s) is fine

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-auto-restart-engine*
*Context gathered: 2026-03-05*
