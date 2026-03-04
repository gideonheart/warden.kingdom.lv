# Phase 29: Session Navigation - Research

**Researched:** 2026-03-04
**Domain:** React callback wiring, client-side view navigation, recording lookup
**Confidence:** HIGH

## Summary

Phase 29 is a pure client-side feature. No server changes are required. The work is entirely
callback plumbing and UI polish inside three existing files: `App.tsx`, `HistoryView.tsx`, and
`SessionHistory.tsx`.

The existing infrastructure is already 80% in place. `App.tsx` already passes
`onNavigateToSession={handleSelectSession}` into `<HistoryView>`, and `HistoryView` already
declares an `onNavigateToSession` prop. The prop is silently discarded (`_onNavigateToSession`)
and never forwarded to `<SessionHistory>`. This is the exact gap to close.

For NAV-02 (recording replay), the `RecordingEntry` type uses `sessionName` to link a recording
to a session. The recording lookup can be done with a one-time `GET /api/recordings` fetch inside
`SessionHistory` (or passed in from `HistoryView`), then matched by `sessionName` against the
tapped row's `tmuxSessionName`. The recorded entry's `stoppedAt` field distinguishes a completed
recording (playable) from an in-progress one.

For NAV-03 (no-recording feedback), a simple toast or inline badge is sufficient. The project
has no installed toast library; a lightweight in-component state variable driving a
`setTimeout`-dismissed message is the right approach, matching the project's conventions.

**Primary recommendation:** Wire `onNavigateToSession` down through `HistoryView` → `SessionHistory`,
fetch recordings once on mount in `SessionHistory`, and handle all three navigation outcomes
(active → switch terminal, stopped+recording → play recording, stopped+no recording → show
inline message) inside `SessionHistory`'s row click handler.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | User taps a history row for an active session and Terminals view opens with that session's tab selected | `handleSelectSession` in App.tsx already switches view + selects tab; just needs wiring through HistoryView → SessionHistory |
| NAV-02 | User taps a history row for a stopped session that has a recording → recording player opens immediately | `GET /api/recordings` returns all recordings with `sessionName`; match on `tmuxSessionName`; call `onPlayRecording` from App.tsx (needs new callback plumbing from App → HistoryView → SessionHistory) |
| NAV-03 | User taps a stopped session with no recording → sees explanatory feedback | In-component transient state (`noRecordingSessionId`) drives an inline message; no external toast library needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React (already installed) | 19 | UI state and callbacks | Project standard |
| TypeScript (already installed) | 5.x | Type-safe prop interfaces | Project standard |
| Tailwind CSS v4 (already installed) | 4.x | Inline styling with `warden-*` tokens | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fetch (native browser) | — | `GET /api/recordings` lookup | Already used in `RecordingLibrary.tsx` for the same endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fetch recordings in SessionHistory | Pass recordings as prop from HistoryView | Either works; fetching in SessionHistory keeps it self-contained and avoids prop-drilling through HistoryView's accordion/tab wrapper |
| In-component toast state | External toast library (react-hot-toast, sonner) | No toast library is installed; adding one for one message is overkill |

**Installation:** No new packages required.

## Architecture Patterns

### Current Wiring (what exists now)

```
App.tsx
  handleSelectSession(sessionName) → setCurrentView('terminals') + selectSession(sessionName)
  handlePlayRecording(recording)   → setActiveRecording(recording)
    ↓ passes onNavigateToSession={handleSelectSession}
  <HistoryView onNavigateToSession={handleSelectSession} />
    ↓ declares prop but silently ignores it (_onNavigateToSession)
  <SessionHistory />   ← NO callbacks passed at all
    rows render as plain <div> with no onClick
```

### Target Wiring (what Phase 29 builds)

```
App.tsx
  handleNavigateToSession(session: AgentInstance, recordings: RecordingEntry[]) → {
    if session.status in ['active', 'idle', 'starting']:  handleSelectSession(session.tmuxSessionName)
    else: find recording where r.sessionName === session.tmuxSessionName && r.stoppedAt !== null
          if found: handlePlayRecording(recording) + setCurrentView('recordings')
          else:     pass through to SessionHistory's inline "no recording" message
  }
  ↓ passes onNavigateToSession + onPlayRecording
  <HistoryView
    onNavigateToSession={handleSelectSession}
    onPlayRecording={handlePlayRecording}          ← NEW prop
  />
    ↓ forwards both to <SessionHistory>
  <SessionHistory
    onNavigateToSession={...}                      ← NEW prop
    onPlayRecording={...}                          ← NEW prop
  />
    rows become clickable
    onClick → determines which of the 3 outcomes applies → fires correct callback or shows inline message
```

### Recommended Implementation Approach

**Option A (preferred): Fetch recordings inside SessionHistory**
- `SessionHistory` fetches `GET /api/recordings` once on mount (same fetch `RecordingLibrary` uses)
- Stores recordings in local state `const [recordings, setRecordings] = useState<RecordingEntry[]>([])`
- Row click handler does the lookup locally
- Keeps the component self-contained; HistoryView is just a pass-through

**Option B: Pass recordings as prop from HistoryView**
- HistoryView fetches recordings and passes them down
- More prop-drilling but centralizes the fetch
- Not preferred: HistoryView has no other use for recordings

**Chosen:** Option A — self-contained fetch in SessionHistory.

### Pattern: Session Status Classification for Navigation

```typescript
// Source: existing App.tsx activeInstances useMemo (line 64-74)
const ACTIVE_STATUSES = new Set(['active', 'idle', 'starting', 'stopping']);

function classifySessionForNavigation(session: AgentInstance, recordings: RecordingEntry[]): 'live' | 'has-recording' | 'no-recording' {
  if (ACTIVE_STATUSES.has(session.status)) {
    return 'live';
  }
  const recording = recordings.find(
    (r) => r.sessionName === session.tmuxSessionName && r.stoppedAt !== null
  );
  return recording ? 'has-recording' : 'no-recording';
}
```

### Pattern: Inline "No Recording" Feedback (NAV-03)

No toast library is installed. Use a transient state variable with `setTimeout` auto-dismiss:

```typescript
// Inside SessionHistory
const [noRecordingMessage, setNoRecordingMessage] = useState<string | null>(null);

function showNoRecordingMessage(sessionName: string) {
  setNoRecordingMessage(`No recording available for ${sessionName}`);
  setTimeout(() => setNoRecordingMessage(null), 3000);
}

// In JSX (rendered at top of the sessions list, or below filters):
{noRecordingMessage && (
  <div className="px-3 py-2 text-sm text-warden-text-dim bg-warden-border/30 rounded">
    {noRecordingMessage}
  </div>
)}
```

### Pattern: Clickable Row with Cursor Affordance

Current row is a `<div>` with no `onClick`. Add click handler + cursor:

```typescript
<div
  key={session.id}
  onClick={() => handleRowClick(session)}
  className="bg-warden-border/20 rounded hover:bg-warden-border/30 transition-colors cursor-pointer"
>
```

### Anti-Patterns to Avoid

- **Silently navigating:** Never call `onNavigateToSession` without checking session status first. Calling `handleSelectSession` on a stopped session name that doesn't exist in `activeInstances` would select nothing in the tab bar — the operator would see a blank terminal view with no explanation.
- **Re-rendering on every poll:** Do not trigger a recordings refetch on every poll cycle. Fetch once on mount (recordings are stable data for this use case). The phase plan should explicitly note this.
- **Prop name collision:** `HistoryView` already has `onNavigateToSession?: (sessionName: string) => void`. The new `onPlayRecording` prop needs to be added to `HistoryViewProps` — don't reuse `onNavigateToSession` to carry the recording object.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recording lookup by session name | Custom server endpoint | `GET /api/recordings` + client-side `.find()` | All recordings are already returned by the list endpoint; no server change needed |
| Toast/notification system | Third-party toast library | In-component `useState` + `setTimeout` | Single use case; project has no toast lib; Tailwind styling is sufficient |
| View router | React Router or similar | Existing `currentView` state + `setCurrentView` in App.tsx | Already handles all view switching in the app |

**Key insight:** The entire feature is callback plumbing. The hardest part is identifying the three
navigation outcomes and making sure the right callback fires for each.

## Common Pitfalls

### Pitfall 1: `onNavigateToSession` Already Declared But Unused
**What goes wrong:** `HistoryView` already accepts `onNavigateToSession` but renames it with `_` prefix to suppress the unused-variable lint warning. Developer may not notice it needs to be un-prefixed and wired through.
**Why it happens:** The prop was added speculatively in a previous phase; implementation was deferred.
**How to avoid:** In the plan task, explicitly call out: "Remove the `_` prefix from `onNavigateToSession` and forward it to `SessionHistory`."
**Warning signs:** TypeScript won't complain because `_`-prefixed params are valid; lint won't either. Only missing behavior at runtime.

### Pitfall 2: Stopped Session That Is Still in activeInstances
**What goes wrong:** Sessions with `status: 'stopped'` remain in `activeInstances` for 30 minutes (per `listActiveInstances` query in `DatabaseConnection.ts`). If Nav logic only checks whether the session is in `activeInstances`, it may incorrectly treat a recently-stopped session as live.
**Why it happens:** `status` field is the true signal, not list membership.
**How to avoid:** Always gate on `session.status` in `ACTIVE_STATUSES`, not on whether the instance appears in a list.
**Warning signs:** A recently-stopped session appearing clickable in the tab bar but navigating to the correct terminal anyway (the session is still there) — this masks the bug until the 30-minute window expires.

### Pitfall 3: Recording Matched Before stoppedAt Is Set
**What goes wrong:** An in-progress recording (stoppedAt === null) would be found by `.find()` and the planner might try to play it, which fails because the `.cast` file is still being written.
**Why it happens:** `RecordingEntry.stoppedAt` is nullable; active recordings have null.
**How to avoid:** The `.find()` predicate must require `r.stoppedAt !== null` — only completed recordings are playable.
**Warning signs:** `RecordingPlayer` receives a recording where `stoppedAt` is null and shows "0:00" or fails to load.

### Pitfall 4: Recordings Fetch Fails Silently
**What goes wrong:** If `GET /api/recordings` fails, `recordings` stays `[]`, so all stopped sessions show "no recording" even when they have one.
**Why it happens:** The current `RecordingLibrary` silently catches the fetch error with `console.error`.
**How to avoid:** Same pattern is acceptable here; just document that the recording lookup is best-effort. The failure mode is a false "no recording" message, which is noisy but not dangerous.

## Code Examples

### Prop Interface Extension

```typescript
// HistoryView.tsx — extend HistoryViewProps
interface HistoryViewProps {
  onNavigateToSession?: (sessionName: string) => void;
  onPlayRecording?: (recording: RecordingEntry) => void;  // NEW
}

// HistoryView.tsx — forward both to SessionHistory (both mobile accordion and desktop tab)
<SessionHistory
  onNavigateToSession={onNavigateToSession}
  onPlayRecording={onPlayRecording}
/>

// SessionHistory.tsx — accept new props
interface SessionHistoryProps {
  onNavigateToSession?: (sessionName: string) => void;
  onPlayRecording?: (recording: RecordingEntry) => void;
}
```

### App.tsx Change

```typescript
// App.tsx — add onPlayRecording prop to HistoryView (line ~604)
// BEFORE:
<HistoryView onNavigateToSession={handleSelectSession} />

// AFTER:
<HistoryView
  onNavigateToSession={handleSelectSession}
  onPlayRecording={(recording) => {
    handlePlayRecording(recording);
    setCurrentView('recordings');
  }}
/>
```

### SessionHistory Row Click Handler

```typescript
// SessionHistory.tsx
import type { RecordingEntry } from '@shared/types.js';

const ACTIVE_STATUSES = new Set(['active', 'idle', 'starting', 'stopping']);

// Inside component:
const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
const [noRecordingMessage, setNoRecordingMessage] = useState<string | null>(null);

useEffect(() => {
  fetch('/api/recordings')
    .then((r) => r.ok ? r.json() : [])
    .then((data: RecordingEntry[]) => setRecordings(data))
    .catch(() => {/* best-effort */});
}, []);

const handleRowClick = useCallback((session: AgentInstance) => {
  if (ACTIVE_STATUSES.has(session.status)) {
    onNavigateToSession?.(session.tmuxSessionName);
    return;
  }
  const recording = recordings.find(
    (r) => r.sessionName === session.tmuxSessionName && r.stoppedAt !== null
  );
  if (recording) {
    onPlayRecording?.(recording);
    return;
  }
  setNoRecordingMessage(`No recording for "${session.tmuxSessionName}"`);
  setTimeout(() => setNoRecordingMessage(null), 3000);
}, [recordings, onNavigateToSession, onPlayRecording]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rows are static divs | Rows become clickable with cursor-pointer | Phase 29 | Rows become interactive affordance |
| onNavigateToSession ignored with `_` prefix | Prop wired through to SessionHistory | Phase 29 | Closes the full callback chain |

**Deprecated/outdated:**
- Nothing deprecated in this phase.

## Open Questions

1. **Should the "Recordings" view open when navigating via NAV-02, or stay on History with the player overlay?**
   - What we know: `handlePlayRecording` sets `activeRecording` state; if `currentView` is not 'recordings', the player won't render (it's inside the `currentView === 'recordings'` branch in App.tsx).
   - What's unclear: Should the view automatically switch to 'recordings' when a recording is opened from History? This is implicit in the current RecordingPlayer rendering logic.
   - Recommendation: Yes, set `currentView` to 'recordings' when triggering `onPlayRecording` from HistoryView, so the player renders. The App.tsx callback wrapper should call both `handlePlayRecording(recording)` and `setCurrentView('recordings')`.

2. **Visual affordance on rows: should "stopped, no recording" rows look different from "active" rows?**
   - What we know: The success criteria only requires feedback AFTER tap. There is no requirement for pre-tap differentiation.
   - What's unclear: Whether the planner should add a visual indicator (e.g., dim cursor or no-hover) for rows where navigation is known impossible.
   - Recommendation: Start simple — make all rows clickable with the same cursor. The "no recording" message on tap is sufficient per NAV-03.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/client/App.tsx`, `src/client/components/HistoryView.tsx`, `src/client/components/SessionHistory.tsx`, `src/client/components/RecordingLibrary.tsx`, `src/server/routes/recordingRoutes.ts`, `src/server/database/DatabaseConnection.ts`, `src/shared/types.ts`

### Secondary (MEDIUM confidence)
- N/A (all findings verified directly from codebase)

### Tertiary (LOW confidence)
- N/A

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — full callback chain traced from App.tsx through all components
- Pitfalls: HIGH — identified from direct code inspection (stopped status, stoppedAt null check)

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable React/TS codebase, no fast-moving dependencies)
