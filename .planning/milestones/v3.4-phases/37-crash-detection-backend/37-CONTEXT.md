# Phase 37: Crash Detection Backend - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect when agent tmux sessions crash (disappear without an operator-initiated stop), persist crash events to a `session_lifecycle_events` SQLite table, and send Telegram notifications via the existing notification pipeline. Covers CRSH-01, CRSH-02, CRSH-06. Auto-restart policies (CRSH-03/04/05) and idle timeouts are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Crash Notification Content
- Rich notifications: include agent name, session name, project slug, uptime, and crash timestamp
- Route crash alerts to the agent's own Telegram topic (keeps context together with other agent notifications)
- Include a deep link to the Warden dashboard session history when feasible
- One alert per crash, always — no throttling or batching (Phase 38 adds restart storm protection if needed)

### Detection Sensitivity
- Grace period: confirm crash on 2nd consecutive missed poll (~20s) before declaring crash — avoids false positives from one-off tmux glitches
- Server restart recovery: re-discover running tmux sessions silently on startup, match to DB records, resume tracking without firing crash alerts for sessions that survived
- Between-poll flickers are invisible by design (poll-based model) — no special handling needed
- Best-effort crash cause detection: if tmux exposes exit codes or signals, store them; don't block on it

### Event Logging Detail
- Store rich metadata per crash event: session_id, agent_id, event_type, timestamp, outcome, plus uptime, project slug, last known state, and stop_reason
- Track all lifecycle events (started, stopped, crashed, idle-detected) — the table becomes the authoritative session timeline, useful for Phase 38/39 downstream
- Keep events indefinitely — SQLite handles this scale fine, full history always available
- Add a GET /api/lifecycle-events endpoint so the dashboard can query crash history immediately

### Stop vs Crash Edge Cases
- Graceful stop marker: database field on instances table (e.g., `status = 'stopping'`) — survives restarts, queryable, consistent with existing DB-first architecture
- Stop timeout: Claude's discretion on reasonable timeout before escalating a stalled stop to crash
- Only classify as crash if session was previously confirmed active (polled as 'active' at least once) — prevents noise from sessions that fail to start
- Stop API should return the new 'stopping' state so the dashboard can reflect the transition

### Claude's Discretion
- Exact stop timeout duration (suggest something reasonable)
- Deep link URL format and whether it's clickable in Telegram
- Exact `session_lifecycle_events` schema column types and indexes
- Migration strategy for the new table
- Error handling for Telegram notification failures during crash alerts

</decisions>

<specifics>
## Specific Ideas

- The existing `InstanceTracker` already polls every 10s and upserts sessions — the graceful stop marker and crash detection logic should integrate into this existing poll loop, not add a separate poller
- The `session_lifecycle_events` table name comes from CRSH-02 requirements — keep that naming
- Telegram notifications should use the same pipeline established in Phase 36 — no new notification infrastructure

</specifics>

<deferred>
## Deferred Ideas

- Crash restart policies (auto-restart, restart modes) — Phase 38
- Restart storm rate limiting — Phase 38
- Idle timeout detection — Phase 39
- Dashboard UI for crash history visualization — future phase
- Crash notification throttling/batching — revisit if noise becomes a problem

</deferred>

---

*Phase: 37-crash-detection-backend*
*Context gathered: 2026-03-05*
