# /gsd:quick — Warden Terminal Polling Stability Fix

Project: `/home/forge/warden.kingdom.lv`

## Context / Symptom
On mobile (and sometimes desktop), terminal is stable at first, but after instance polling cycles (~5s), UI shows reconnect overlay ("Connecting..."), terminal content becomes garbled/matrix-like, typing visibility breaks, and only hard refresh recovers.

Likely cause chain:
- `/api/instances` poll updates every 5s,
- `App.tsx` has render-time state mutation patterns,
- selected session flicker/churn causes terminal reconnect/reset/resize churn,
- terminal view gets corrupted during forced reconnect/fit cycles.

## Mission
Stabilize terminal rendering and session selection lifecycle so polling does not disrupt active terminal stream.

## Hard engineering constraints
- Apply **DRY** (remove duplicated selection/fallback logic).
- Apply **SRP** (separate session-selection policy from rendering).
- Keep fixes minimal, explicit, and deterministic.
- No regressions in manual session switching / stop-start flows.

## Required implementation plan

### 1) Refactor `src/client/App.tsx`
- Remove all `setState` calls from render body.
- Move auto-selection/fallback/sidebar-default logic into guarded `useEffect`s.
- Introduce a focused session-selection policy layer (helper/hook), e.g.:
  - derive selected session,
  - handle fallback only after stable conditions,
  - avoid transient poll flicker.
- Ensure terminal subtree remains stable unless user explicitly switches session or session truly dies.

### 2) Improve poll behavior in `src/client/hooks/useActiveInstances.ts`
- Keep polling, but avoid noisy re-renders:
  - Compare previous/next logical signature (sessionName + status + id).
  - Skip `setInstances` if unchanged.
- Add optional “missing hysteresis” support (2 consecutive misses before forced fallback), implemented cleanly and testably.

### 3) Harden terminal connection lifecycle
Review:
- `src/client/hooks/useTerminalSocket.ts`
- `src/client/components/TerminalView.tsx`
- `src/server/services/TerminalStreamService.ts`

Ensure:
- no reconnect/reset triggered by unrelated parent re-renders,
- reset semantics only when truly required,
- resize/repaint path is robust and not repeatedly nudged by poll side-effects.

### 4) Keep architecture clean (DRY/SRP)
- If selection logic is reused, extract into one place (`useSessionSelection` or utility module).
- Avoid duplicated conditions across render/effects.

## Testing requirements (mandatory)

### Unit tests (Vitest)
Add/update tests for:
1. session selection policy:
   - initial select first active session
   - do not switch on transient single-miss
   - switch after configured consecutive misses
   - preserve user-selected session when still present
2. instances hook:
   - skips state update when payload signature unchanged
   - updates on real session/status changes
3. terminal socket behavior:
   - no forced reconnect when sessionName unchanged
   - reconnect on terminal exit path only

Use existing project test conventions; create isolated testable helpers where needed.

### Integration-ish behavior checks
Add lightweight test(s) for App-level flow:
- polling updates that do not change active session must not remount/reconnect terminal view.

## Verification checklist (must run and report)
Run and provide output summary for:
1. `npm run test` (or project-equivalent vitest command)
2. `npm run build`  ← required
3. quick manual sanity:
   - open terminal, wait through multiple poll cycles,
   - verify no reconnect overlay flicker,
   - verify typing stable,
   - verify session switch still works.

## Deliverables
- Commit(s) with clear messages.
- Short root-cause summary.
- List of changed files.
- Test list + pass/fail.
- Build result.
- Any follow-up recommendations.

Do not stop at partial analysis — finish implementation + tests + build proof.
