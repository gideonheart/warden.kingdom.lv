# Next Milestone Options

## Where We Are

Warden v3.1 shipped a full operations platform: agent start/stop/restart, cost velocity tracking with budget alerts, model cost comparison with CSV export, and asciicast-format session recording with variable-speed replay. The three carried-forward active items from that milestone are REC-05 auto-record triggers, recording storage rotation, and Telegram permission-prompt forwarding. Beyond those, the codebase is stable with no major tech debt flags. The question is whether to close out the recording story, branch into Telegram awareness, or invest in a more structural "always-on audit log" feature set.

---

## Option A — v3.2: Recording Completion

**Slug:** `v3.2-recording-completion`

**Scope:** Close the open recording story by adding auto-record triggers (REC-05), a storage rotation policy, and a compact settings panel. Everything the recording feature needs to work autonomously without operator intervention.

**Requirements:**

- REC-05: Auto-record toggle per agent — start recording automatically when a session is created (opt-in per agent, persisted in SQLite).
- REC-06: Configurable auto-record triggers — record on session start, or only when a permission prompt is detected (two modes).
- REC-07: Storage rotation — cap total recording storage at a configurable limit (e.g., 2 GB); auto-delete oldest recordings when cap is reached.
- REC-08: Per-agent storage usage view — show disk bytes used per agent in the recording library.
- REC-09: Recording settings panel — UI to configure auto-record mode and storage cap (replaces per-session toggle for auto mode).

**Estimated phases:** 3 phases (auto-record backend + trigger wiring, storage rotation daemon + pruning API, settings UI + library enhancements)

**Impact:** Medium — recordings are already usable manually; auto-recording and rotation raise the floor from "useful when remembered" to "always-on audit trail."

**Effort:** Medium — all code touches existing well-understood surfaces (TerminalStreamService, RecordingService, SQLite schema, recording library UI).

**Rationale:** This is the most direct carry-forward of v3.1 work. The recording infrastructure is complete; REC-05 and storage rotation were explicitly deferred from v3.1 scope. Doing this next keeps momentum on a feature that is already 80% built and leaves zero dangling active requirements in PROJECT.md.

---

## Option B — v3.3: Telegram Operator Awareness

**Slug:** `v3.3-telegram-awareness`

**Scope:** Forward permission prompts detected by Warden to the operator's Telegram topics, and allow the operator to respond (approve/inject a prompt) from Telegram without opening the dashboard. Closes the gap between desktop monitoring and mobile-first awareness.

**Requirements:**

- TEL-01: Permission prompt Telegram notification — when Warden detects a permission prompt badge on any session, send a Telegram message to the agent's configured topic with session name and prompt snippet.
- TEL-02: One-tap approve via Telegram — the forwarded message includes an inline keyboard button; tapping it sends a configurable approval string (e.g., "yes") back to the agent via the Gateway API.
- TEL-03: Budget alert Telegram notification — when a per-agent budget alert fires (amber/red threshold), send a Telegram message to the operator's personal topic.
- TEL-04: Duplicate suppression — do not re-notify for the same permission prompt or budget alert within a configurable cooldown window (default: 5 minutes).
- TEL-05: Notification settings — UI toggle per alert type (permission prompts / budget alerts) with cooldown configuration, persisted in SQLite.

**Estimated phases:** 4 phases (Telegram bot client service, permission prompt forwarding + dedup, budget alert forwarding, UI settings panel)

**Impact:** High — this is the primary gap between "must watch the dashboard" and "get alerted and respond from anywhere." For an autonomous multi-agent system, mobile-aware permission handling directly reduces agent stall time.

**Effort:** High — requires a new Telegram bot client service (node-telegram-bot-api or grammy), webhook or polling setup, inline keyboard handling, and careful dedup logic. The openclaw.json already has Telegram topic mappings, which reduces discovery cost.

**Rationale:** This is the highest-leverage feature for the core use case — reducing time agents spend blocked waiting for human approval. It extends Warden's operator awareness from desktop-only to always-on. The required Telegram topic mappings already exist in openclaw.json. The main cost is the bot service layer, which is well-understood territory.

---

## Option C — v4.0: Multi-Agent Audit & Replay

**Slug:** `v4.0-audit-replay`

**Scope:** Elevate Warden from session-level observability to fleet-level audit. Store a persistent structured event log of every agent action (permission prompts, state changes, cost spikes, start/stop events) and add a unified timeline view across all agents. This is a platform-level investment, not a feature addition.

**Requirements:**

- AUD-01: Structured event log — persist every state transition, permission prompt detection, budget alert, and lifecycle event to a new `events` SQLite table with timestamp, agent ID, event type, and payload.
- AUD-02: Fleet timeline view — a new dashboard tab showing all agents' events on a shared chronological timeline, filterable by agent and event type.
- AUD-03: Event-linked recording jump — clicking an event in the timeline (if a recording covers that time window) jumps directly to that moment in the recording replay.
- AUD-04: Event export — export the event log as NDJSON or CSV for external analysis.
- AUD-05: Audit retention policy — configurable event retention (default: 30 days), with automatic pruning of older events.

**Estimated phases:** 5 phases (event schema + emitters at every detection site, fleet timeline UI, recording jump integration, export + retention pruning, E2E verification)

**Impact:** High — creates a full audit trail of multi-agent activity, enabling post-hoc forensics ("what was every agent doing during this incident?"). Directly supports the stated core value of total visibility.

**Effort:** High — touches nearly every server-side service (InstanceTracker, TerminalStreamService, detectAgentState, budget alerts) to emit events, plus a new UI view and recording integration. Substantial scope.

**Rationale:** This is the most ambitious option and the one that moves Warden closest to being a production-grade multi-agent operations platform rather than a monitoring dashboard. The cost is real: 5 phases, many file touchpoints, and a schema migration. Best chosen when the operator wants to invest in infrastructure rather than add features.

---

## Recommendation

**Pick Option A (v3.2: Recording Completion).**

**Why:**

1. Zero discovery cost — all the infrastructure exists. The effort estimate is reliable because the recording service, SQLite schema, and library UI are known quantities.
2. Closes the open active items in PROJECT.md cleanly — REC-05 and storage rotation are the only two items in the `### Active` section outside of Telegram. Completing them leaves the requirements table at zero open items (excluding Telegram), which is a clean state.
3. Shortest path to shipped — 3 phases at medium effort, completable in one focused day.
4. Sequencing advantage — having auto-record in place before Telegram integration (Option B) means the Telegram forwarding milestone (likely v3.3) can also notify the operator when a recording started for the alerted session, making the Telegram feature richer at no extra cost.

**If mobile awareness is the priority**, jump to Option B instead. The Telegram topic mappings are already in openclaw.json and the permission prompt detection is wired — the integration surface is smaller than it looks. But budget 2-3 days rather than 1.

**Option C** is the right choice when the fleet grows to 5+ simultaneous agents and forensic audit becomes operationally necessary. Not now.
