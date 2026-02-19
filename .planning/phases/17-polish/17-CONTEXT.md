# Phase 17: Polish - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Lazy-mount GSD tabs so hooks only run when visible (eliminating ~18 HTTP req/min + 60 tmux subprocess/min waste), and fix 4 known minor defects: fd leak in spawn handler, setTimeout cleanup on unmount, Map re-creation in useAgentLiveStatus, regex false positives in extractContextPressure.

Pure technical quality work. No behavior changes visible to the operator. Net result: fewer wasted resources and more robust internals.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All 6 requirements (PERF-01, PERF-02, FIX-01, FIX-02, FIX-03, FIX-04) specify exact expected behaviors. No user-facing decisions needed. Claude has full discretion on:

- Tab state persistence strategy (cache vs refetch on tab switch)
- Polling restart timing when returning to a tab
- Exact regex anchoring pattern for extractContextPressure
- Map comparison strategy for useAgentLiveStatus stabilization
- try/finally structure for fd safety in spawn handler
- setTimeout cleanup approach (useEffect return vs useRef)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — all behaviors are defined in REQUIREMENTS.md success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-polish*
*Context gathered: 2026-02-19*
