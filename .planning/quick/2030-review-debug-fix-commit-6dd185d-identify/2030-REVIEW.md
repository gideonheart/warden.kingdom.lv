# Review: Commit 6dd185d — Terminal Polling Stability Fix

## Summary

Commit 6dd185d correctly identifies and resolves four interlocking root causes behind the
polling-triggered terminal reconnect overlay regression. The primary fix (callback-ref pattern
in useTerminalSocket) is the industry-standard React solution and eliminates the core socket
instability. The overlay delay is a practical UX improvement that hides unavoidable sub-500ms
reconnect cycles. The ref-mutation fix in useSessionSelection addresses a real React concurrent-mode
anti-pattern. The dimension guard in TerminalView is a well-targeted defensive measure for the
iOS keyboard transition path. All four changes are architecturally sound and address the correct
root causes. The test suite quality is mixed: useActiveInstances and useSessionSelection have
genuine behavioral tests, while useTerminalSocket tests are documentation-only and provide zero
regression protection for the hook's runtime behavior.

---

## Findings

### [RISK-1] Ref assignment in render body violates React purity rule (severity: low)

- **File:** `src/client/hooks/useTerminalSocket.ts` (lines 55–57)
- **Description:** `onTerminalOutputRef.current = onTerminalOutput` (and the two sibling lines)
  execute in the render body, not inside an effect. This is technically a side-effect during
  render. React's concurrent mode can discard renders and replay them, meaning these assignments
  may run for a render that was never committed to the DOM.
- **Impact:** In practice this is benign — the ref simply receives the same (or newer) callback
  value on replay. No data is lost and no stale value is used. React 19 does not currently
  double-invoke these assignments in a way that causes observable bugs. The pattern is widely
  used as a pragmatic exception to the purity rule (see React docs on "escape hatches" for refs).
  This codebase does not enable StrictMode double-render (no `<React.StrictMode>` wrapper
  observed), so concurrent-mode replay is not triggered during development either.
- **Recommendation:** Accept as-is. The strictly correct alternative is `useLayoutEffect` for ref
  sync, but the added complexity is not justified at this scale. Document the accepted deviation
  with a comment. If StrictMode is ever enabled, verify no double-assignment side effects emerge.

---

### [RISK-2] Overlay delay does not suppress the PTY-exit reconnect cycle (severity: low)

- **File:** `src/client/hooks/useTerminalSocket.ts` (lines 20, 142–144)
- **Description:** `OVERLAY_DELAY_MS = 500` but the PTY-exit reconnect cycle is:
  `socket.disconnect()` → `setTimeout 2000ms` → `setReconnectGeneration(n+1)` → new socket
  connects. The total reconnect time is >2000ms, well beyond the 500ms overlay threshold. The
  overlay WILL appear (after 500ms) and remain visible for approximately 1500ms during every
  PTY-exit auto-reconnect cycle.
- **Impact:** This is partially by design — the overlay showing during PTY exit is acceptable
  because the session genuinely needs a new PTY spawned. The 500ms delay only eliminates the
  flash for network-level hiccups where Socket.IO auto-reconnects quickly. The current behavior
  is: brief hiccups (< 500ms) = invisible. PTY exit = overlay shows for ~1.5s. This is
  the best achievable without removing the 2s wait before reconnectGeneration++.
- **Recommendation:** Document the overlay behavior in a comment near `OVERLAY_DELAY_MS` and
  near the `setTimeout 2000` in the exit handler. Callers should not assume the overlay is
  always suppressed for PTY exits. Consider whether reducing the PTY-exit delay from 2000ms to
  1000ms (with increased reconnection attempts) would improve perceived responsiveness, but
  this is out of scope for this fix.

---

### [RISK-3] Stale closure in useSessionSelection effect (severity: low)

- **File:** `src/client/hooks/useSessionSelection.ts` (lines 95, 121)
- **Description:** `const currentSession = selectedSessionName` captures the state variable from
  the closure at effect-run time. `selectedSessionName` is intentionally excluded from the
  effect's dependency array. This creates a potential stale closure: if `selectSession('B')` and
  a poll-triggered effect run in the same React batch, the effect may read the pre-selection
  state value.
- **Impact:** Step-by-step analysis of the problematic scenario:
  1. User clicks session-B → `selectSession('B')` calls `setSelectedSessionName('B')` synchronously.
  2. Poll arrives → `activeSessionNamesKey` changes → effect re-runs.
  3. React processes state updates in the order committed. The `selectSession` call sets state
     to 'B'. The effect runs AFTER the commit, so `selectedSessionName` in the closure is 'B'
     (the committed value), not 'A'.
  4. `resolveSessionFallback('B', [list], missCount, false)` sees session-B is present → returns
     `{ selectedSession: 'B', resetMissCount: true }`. No incorrect fallback occurs.
  - The stale closure concern is real in theory but benign in practice because React effects always
    run after a commit, not during batched render phase. The closure captures the post-commit value.
- **Recommendation:** Add a code comment explicitly documenting why `selectedSessionName` is
  excluded from deps and why this is safe (effects run after commit, not mid-batch). This
  prevents future maintainers from adding it to the dep array as an "obvious fix" that would
  break the hysteresis logic (every selection change would re-run the effect, potentially
  undoing the selection).

---

### [RISK-4] consecutiveMissCountRef increment ordering relative to setState (severity: low)

- **File:** `src/client/hooks/useSessionSelection.ts` (lines 103–119)
- **Description:** `consecutiveMissCountRef.current += 1` is called BEFORE `setSelectedSessionName`.
  If a re-render from an unrelated source fires between these two lines (impossible in synchronous
  React but worth noting), the ref increment could be read with a stale state context.
- **Impact:** In JavaScript's single-threaded execution model, nothing can interleave between
  two synchronous statements in an effect body. Both the ref mutation and the setState are
  synchronous. The ref will always be incremented exactly once per effect run. This risk is
  theoretical only.
- **Recommendation:** No action needed. The comment in the source already explains the rationale.
  This is documented here for completeness.

---

### [EDGE-1] First-mount 500ms window with no visual feedback (severity: low)

- **File:** `src/client/hooks/useTerminalSocket.ts` (lines 37, 30)
- **Description:** `showConnectingOverlay` initializes to `false` while `isConnected` also
  initializes to `false`. On first mount there is a 500ms window where the terminal area is
  blank with no spinner and no overlay. The socket is connecting but the user sees nothing.
- **Impact:** On a fast local network the socket connects in <100ms so the window is imperceptible.
  On mobile 3G or high-latency connections the user may see a blank terminal area for 500ms
  before the spinner appears, then another variable delay before content arrives.
- **Recommendation:** Consider initializing `showConnectingOverlay` to `true` on first mount
  (or when `sessionName !== null`) so the overlay appears immediately on the very first
  connection. The 500ms delay logic would then apply only to subsequent disconnects. This is a
  P3 UX improvement, not a correctness issue.

---

### [EDGE-2] Rapid isConnected false→true→false transitions within one batch (severity: low)

- **File:** `src/client/hooks/useTerminalSocket.ts` (lines 60–81)
- **Description:** The `[isConnected]` effect starts a timer when `isConnected` becomes `false`.
  The timer cleanup is split: the `isConnected` effect has an empty cleanup (`return () => {}`)
  while a separate `[]` unmount effect clears `overlayDelayTimerRef`. If React batches state
  updates such that `isConnected` transitions `false → true → false` in rapid succession, the
  `[isConnected]` effect could theoretically run twice for `false` before the `true` cancellation
  runs, creating two simultaneous timer instances.
- **Impact:** The guard `if (overlayDelayTimerRef.current === null)` on line 70 prevents a
  second timer from being created if the first is still pending. So the first timer continues
  running even if a second `false` state arrives. When `isConnected` becomes `true`, the running
  timer is cleared. This sequence is safe: the guard ensures at most one timer exists. The only
  gap is: if `true` arrives and clears the timer (line 63–65), then `false` immediately follows
  in the same batch, the `true` cleanup runs first (clearing the timer), then `false` starts a
  new timer — correct behavior.
- **Recommendation:** The current implementation is correct. Consider adding a single comment
  on line 70 explaining why the `null` guard prevents double-timer creation.

---

### [EDGE-3] iOS mid-transition resize event — terminal stale dimensions (severity: low)

- **File:** `src/client/components/TerminalView.tsx` (lines 459–476)
- **Description:** If the LAST resize event during an iOS keyboard dismiss fires when the
  container is mid-transition (clientHeight < 20px), the guard skips the fit call. The terminal
  stays at stale dimensions until the next resize event.
- **Impact:** iOS Safari's `visualViewport` fires a final resize event after the keyboard is
  fully dismissed and layout is stable. The guard only skips intermediate events. The final
  event arrives at full dimensions and triggers `refitTerminal` successfully. iOS Safari
  behavior is consistent on this point.
- **Recommendation:** No action required for modern iOS Safari (v15+). For older iOS versions
  or edge cases where the final event doesn't fire, a 300ms recovery timer could be added
  after keyboard dismissal, but this adds complexity for a rare edge case.

---

### [EDGE-4] 20px dimension threshold is arbitrary (severity: very low)

- **File:** `src/client/components/TerminalView.tsx` (line 464)
- **Description:** `containerEl.clientWidth < 20 || containerEl.clientHeight < 20` uses 20px
  as the minimum viable terminal dimension. If TerminalView is ever embedded in a narrow
  container (e.g., sidebar embed, split-pane mode), legitimate small-but-valid sizes could be
  permanently rejected.
- **Impact:** Currently TerminalView always occupies the full content area. The 20px threshold
  is far below any realistic terminal dimension. The current architecture has no use case where
  a 20px terminal would be desired.
- **Recommendation:** Add a comment explaining the threshold is keyed to the keyboard-transition
  layout collapse scenario, not a general size restriction.

---

### [TEST-1] useTerminalSocket tests are documentation-only — zero behavioral coverage (severity: high)

- **File:** `tests/unit/useTerminalSocket.test.ts`
- **Description:** All 5 tests assert structural invariants: `expect(true).toBe(true)`,
  `expect(500).toBeGreaterThan(0)`, and `expect(invariants).toHaveLength(7)`. None of these
  would fail if the hook were completely broken. They are valuable as documentation of the
  design intent but provide zero regression protection.
- **Impact:** If a future change re-adds callbacks to the socket effect deps, or removes the
  overlay delay, no test would catch it. The primary fix (callback refs) has no behavioral test.
- **Recommendation:** Add behavioral tests using `@testing-library/react-hooks` (or
  `renderHook` from `@testing-library/react`). Priority tests to add:
  - (a) Overlay does NOT appear within 500ms of `isConnected` becoming false
  - (b) Overlay DOES appear after 500ms of sustained disconnect
  - (c) Socket effect only runs when `sessionName` changes, not when callbacks change identity
  These require fake timers (`vi.useFakeTimers()`) and a mocked `socket.io-client`.
  See follow-up tasks table.

---

### [TEST-2] useSessionSelection hook-level behavior is untested (severity: medium)

- **File:** `tests/unit/useSessionSelection.test.ts`
- **Description:** The test file covers `resolveSessionFallback` (pure function — 8 tests,
  excellent) and its idempotency properties (2 tests, good). The `useSessionSelection` hook
  itself has zero tests — specifically, the ref mutation ordering and the stale-closure behavior
  are only tested indirectly through the pure function. The `consecutiveMissCountRef` increment
  happening outside the setState updater (the key fix) has no direct test.
- **Impact:** The pure function tests provide strong protection for the resolution logic.
  The hook-level behavior (ref mutation timing, effect re-run conditions, interaction with
  `selectSession` manual override) could regress without detection.
- **Recommendation:** Add a `renderHook` test that simulates: (1) manual session selection
  followed by an immediate poll, verifying the manual selection is not overwritten; (2) two
  consecutive misses triggering fallback; (3) `selectSession` resetting miss count to 0.

---

### [TEST-3] useActiveInstances test coverage is strong — no action needed (severity: none)

- **File:** `tests/unit/useActiveInstances.test.ts`
- **Description:** 12 tests covering `computeInstanceSignature`. All are genuinely behavioral:
  they verify that the signature changes on structural modifications (status, name, id,
  add/remove instances) and stays stable on non-structural field changes (lastActiveAt,
  agentName, projectPath, telegramTopicId). Sort-order invariance is tested. These tests would
  reliably catch regressions in the dedup layer.
- **Impact:** Strong regression protection for the first line of the polling stability chain.
- **Recommendation:** No changes needed. The test suite for this module is complete.

---

## Follow-Up Tasks

| # | Task | Priority | Effort | Files |
|---|------|----------|--------|-------|
| 1 | Add behavioral tests for useTerminalSocket: fake timers for overlay delay, socket mock for effect-dep invariant | P1 | medium | `tests/unit/useTerminalSocket.test.ts`, may need `tests/__mocks__/socket.io-client.ts` |
| 2 | Add comment near `OVERLAY_DELAY_MS` documenting that PTY-exit reconnects (>2s) will still show the overlay | P2 | small | `src/client/hooks/useTerminalSocket.ts` |
| 3 | Add comment on `selectedSessionName` stale-closure exclusion from effect deps explaining why it is safe | P2 | small | `src/client/hooks/useSessionSelection.ts` |
| 4 | Add renderHook behavioral tests for useSessionSelection hook: manual selection + poll interaction, miss-count reset | P2 | medium | `tests/unit/useSessionSelection.test.ts` |
| 5 | Consider initializing `showConnectingOverlay` to `true` on first mount when sessionName is non-null | P3 | small | `src/client/hooks/useTerminalSocket.ts` |
| 6 | Add dimension guard comment explaining 20px threshold is for keyboard-collapse detection, not general size restriction | P3 | small | `src/client/components/TerminalView.tsx` |
| 7 | Add comment on `if (overlayDelayTimerRef.current === null)` guard explaining it prevents double-timer creation | P3 | small | `src/client/hooks/useTerminalSocket.ts` |

---

## Risk Summary

| Finding | Severity | Action Required |
|---------|----------|-----------------|
| RISK-1: Ref in render body | low | Accept + comment |
| RISK-2: PTY-exit overlay still shows | low | Document in comment |
| RISK-3: Stale closure in session effect | low | Document in comment |
| RISK-4: Ref increment before setState | low | No action |
| EDGE-1: First-mount blank window | low | P3 improvement |
| EDGE-2: Rapid isConnected transitions | low | No action |
| EDGE-3: iOS mid-transition resize | low | No action |
| EDGE-4: 20px threshold arbitrary | very low | Comment only |
| TEST-1: useTerminalSocket no behavior tests | high | Add tests (P1) |
| TEST-2: useSessionSelection hook untested | medium | Add tests (P2) |
| TEST-3: useActiveInstances coverage strong | none | No action |

**Overall verdict:** The commit is safe to ship. No correctness regressions introduced.
The highest-priority follow-up is adding behavioral tests for useTerminalSocket (TEST-1),
which is currently a coverage blind spot for the most critical part of the fix.
