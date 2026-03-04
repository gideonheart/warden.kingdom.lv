# Phase 28: Mobile Toolbar Fixes - Research

**Researched:** 2026-03-04
**Domain:** iOS Safari soft keyboard persistence, xterm.js mobile input
**Confidence:** HIGH

## Summary

Phase 28 addresses two concrete mobile UX gaps in `TerminalView.tsx`. First, the Enter key is absent from `MOBILE_KEYS`, so users must reach a physical keyboard to submit commands. Second, every toolbar button tap causes iOS Safari to dismiss the soft keyboard because the toolbar handlers call `sendInput()` and action handlers without explicitly retaining focus on `terminal.textarea` — the only DOM element that keeps the keyboard open.

The fix is purely client-side and contained to one file: `src/client/components/TerminalView.tsx`. No server changes, no new dependencies, no new components required. The single plan in the roadmap (28-01) is correct: add Enter to `MOBILE_KEYS` and wire the keyboard-persistence focus fix across all toolbar button handlers.

The keyboard-persistence mechanism is well-understood from the project's prior research (captured in STATE.md): iOS Safari keeps the soft keyboard open only while a focusable input element (`<input>` or `<textarea>`) holds focus. When `event.preventDefault()` is called on `onTouchStart`, the browser does not dismiss the keyboard immediately — but focus must be explicitly restored to `terminal.textarea` synchronously inside that same `onTouchStart` handler. Calling `terminal.focus()` (the public method) or using `requestAnimationFrame` / `setTimeout` does not work on iOS because iOS ignores programmatic focus calls that do not originate directly from a user interaction event handler.

**Primary recommendation:** Inside every `onTouchStart` handler in `MobileKeyToolbar`, call `terminalRef.current?.textarea?.focus()` synchronously after `event.preventDefault()`. Add `{ label: 'Enter', seq: '\r' }` as the first entry in `MOBILE_KEYS`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOB-01 | User can tap Enter button in mobile terminal toolbar to submit commands | Add `{ label: 'Enter', seq: '\r' }` to `MOBILE_KEYS` array — `\r` is the standard carriage-return sequence that terminals/shells interpret as Enter |
| MOB-02 | Soft keyboard stays open when user taps any toolbar button | Pass `terminalInstanceRef` down to `MobileKeyToolbar`; call `terminalRef.current?.textarea?.focus()` synchronously in every `onTouchStart` handler; this is the only approach that works on iOS Safari |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xterm | ^5.3.0 | Terminal emulator (already in project) | `terminal.textarea` is a public `readonly` API (`HTMLTextAreaElement | undefined`) — calling `.focus()` on it is the correct way to retain soft keyboard on iOS |
| React | 19 (already in project) | Component model | `useRef` to pass `terminalInstanceRef` to child component without prop drilling re-renders |

### No New Dependencies
This phase requires zero npm changes. All needed APIs are already available.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Change Scope
```
src/client/components/TerminalView.tsx
├── MOBILE_KEYS array        # Add Enter key as first entry
├── MobileKeyToolbarProps    # Add terminalRef prop
├── MobileKeyToolbar         # Use terminalRef in all onTouchStart handlers
└── TerminalViewInner JSX    # Pass terminalInstanceRef to MobileKeyToolbar
```

### Pattern 1: Adding Enter to MOBILE_KEYS

**What:** `MOBILE_KEYS` drives the scrollable button row. Each entry maps a display label to an escape sequence. Enter submits the current line — it belongs at the front as the most-used action key.

**When to use:** Always. Enter is the primary submit key in any terminal.

**Implementation:**
```typescript
// In TerminalView.tsx — MOBILE_KEYS constant
const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Enter', seq: '\r' },   // ADD THIS — carriage return, not \n
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: '\u2191', seq: '\x1b[A' },
  { label: '\u2193', seq: '\x1b[B' },
  { label: '\u2190', seq: '\x1b[D' },
  { label: '\u2192', seq: '\x1b[C' },
  { label: 'PgUp', seq: '\x1b[5~' },
  { label: 'PgDn', seq: '\x1b[6~' },
];
```

**Why `\r` not `\n`:** Terminals use carriage return (`\r` / `0x0D`) as the Enter key sequence. Line feed (`\n`) is a different control character. The shell reads `\r` as "end of input line". This is verified by how xterm.js itself maps the Enter key press (`terminal.onData` receives `\r` when Enter is pressed on hardware keyboard).

### Pattern 2: Keyboard Persistence via terminal.textarea?.focus()

**What:** iOS Safari keeps the soft keyboard visible only when a `<textarea>` or `<input>` element holds DOM focus. xterm.js uses a hidden `<textarea>` (class `xterm-helper-textarea`) to receive keyboard input — `terminal.textarea` is the public API to access it. When a toolbar button is tapped, focus moves to the button briefly, which would normally dismiss the keyboard. Calling `event.preventDefault()` alone stops the button from stealing focus in some browsers but is insufficient on iOS. The reliable fix is to explicitly call `.focus()` on `terminal.textarea` synchronously within the `onTouchStart` handler.

**Critical iOS constraint:** On iOS Safari, `.focus()` is only honoured when called synchronously during a user interaction event handler. Deferred calls (`requestAnimationFrame`, `setTimeout`, `Promise.then`) are silently ignored.

**Implementation approach — add `terminalRef` prop to `MobileKeyToolbar`:**

```typescript
// Step 1: Extend MobileKeyToolbarProps
interface MobileKeyToolbarProps {
  sendInput: (data: string) => void;
  selectMode: boolean;
  onToggleCopyMode: () => void;
  terminalRef: React.MutableRefObject<Terminal | null>;   // ADD
}

// Step 2: Update MobileKeyToolbar signature
function MobileKeyToolbar({
  sendInput,
  selectMode,
  onToggleCopyMode,
  terminalRef,               // ADD
}: MobileKeyToolbarProps) {

  // Helper called in every onTouchStart after event.preventDefault()
  const refocusTerminal = () => {
    terminalRef.current?.textarea?.focus();
  };

  // Step 3: Apply to every button's onTouchStart
  // Copy button:
  onTouchStart={(event) => {
    event.preventDefault();
    refocusTerminal();
    onToggleCopyMode();
  }}

  // Paste button:
  onTouchStart={(event) => {
    event.preventDefault();
    refocusTerminal();
    handlePaste();         // async OK — focus is already restored before await
  }}

  // Esc button:
  onTouchStart={(event) => {
    event.preventDefault();
    refocusTerminal();
    sendInput('\x1b');
  }}

  // MOBILE_KEYS map (includes Enter after fix):
  onTouchStart={(event) => {
    event.preventDefault();
    refocusTerminal();
    sendInput(key.seq);
  }}

  // Cancel button in paste input panel:
  onTouchStart={(event) => {
    event.preventDefault();
    refocusTerminal();
    setShowPasteInput(false);
  }}
}

// Step 4: Pass terminalInstanceRef in TerminalViewInner JSX
{IS_TOUCH_DEVICE && (
  <MobileKeyToolbar
    sendInput={sendInput}
    selectMode={selectMode}
    onToggleCopyMode={handleToggleCopyMode}
    terminalRef={terminalInstanceRef}    // ADD
  />
)}
```

### Pattern 3: Paste button special case

The Paste button calls `handlePaste()` which is `async` (uses `navigator.clipboard.readText()`). This is fine because `.focus()` is called synchronously BEFORE the await boundary. The clipboard API await happens after the keyboard is already pinned open.

When `navigator.clipboard.readText()` fails and the fallback paste textarea appears (`setShowPasteInput(true)`), focus moves to `pasteInputRef.current` via `useEffect` — this is a regular textarea so the keyboard stays open naturally. No special handling needed for this path.

### Anti-Patterns to Avoid

- **`terminal.focus()` instead of `terminal.textarea?.focus()`:** The public `terminal.focus()` method dispatches a synthetic focus event through xterm.js internals. On iOS it does not reliably translate to a DOM focus event that the browser recognises as keeping the keyboard open. Use `terminal.textarea?.focus()` directly.
- **Deferred `focus()` calls:** `requestAnimationFrame(() => terminalRef.current?.textarea?.focus())` — this pattern (already present in `handleToggleCopyMode`) works on desktop but is ignored by iOS Safari when exiting copy mode via toolbar buttons. For toolbar `onTouchStart` handlers, the call must be synchronous.
- **Relying on `event.preventDefault()` alone:** Calling `event.preventDefault()` on `onTouchStart` prevents the click event from firing and stops default focus-stealing on some Android browsers, but does not prevent keyboard dismissal on iOS Safari. The explicit `.focus()` call is required.
- **`onClick` instead of `onTouchStart`:** Click events on mobile fire ~300ms after the tap (or immediately after touchend). By that point iOS has already dismissed the keyboard. `onTouchStart` fires before any default browser action and is the correct event for keyboard-persistence focus tricks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyboard visibility detection | Custom `visualViewport.height` monitoring | Just call `terminal.textarea?.focus()` in `onTouchStart` | State-machine complexity with no benefit; the focus call solves the root cause directly |
| Custom virtual keyboard tracking | `window.innerHeight` change listeners | Already exists in the codebase for resize handling; keyboard persistence is separate | Keyboard visibility is an iOS black box; focus retention is the correct lever |
| Alternative input element | Extra hidden `<input>` alongside terminal | `terminal.textarea` (already exists in DOM) | xterm.js already owns the input textarea; using it is the canonical approach |

**Key insight:** The xterm.js `terminal.textarea` element is the exact DOM element iOS uses to decide whether to show the keyboard. Focusing it is not a workaround — it is the correct mechanism.

## Common Pitfalls

### Pitfall 1: Using terminal.focus() instead of terminal.textarea?.focus()
**What goes wrong:** `terminal.focus()` is xterm.js's public method. It triggers internal event dispatch but may not produce a DOM focus event that iOS Safari treats as keyboard-retaining. The `terminal.textarea` property is `HTMLTextAreaElement | undefined` — calling `.focus()` on the actual DOM element is more direct.
**Why it happens:** `terminal.focus()` looks like the right API. It works fine on desktop.
**How to avoid:** Always use `terminalRef.current?.textarea?.focus()` in mobile toolbar handlers.
**Warning signs:** Keyboard still dismisses after some button taps but not others.

### Pitfall 2: Async focus call timing
**What goes wrong:** Wrapping `.focus()` in `requestAnimationFrame` or `setTimeout` — even 0ms — causes iOS to ignore the call because it is no longer within the synchronous user-interaction handler.
**Why it happens:** Deferred patterns are used in `handleToggleCopyMode` to avoid xterm.js internals conflicts. That pattern is correct for desktop exit-copy-mode but wrong for toolbar button taps.
**How to avoid:** Call `terminal.textarea?.focus()` as the first line after `event.preventDefault()` in every `onTouchStart`.
**Warning signs:** Focus call runs (no JS error) but keyboard still dismisses on iOS.

### Pitfall 3: Forgetting the Cancel button in the paste panel
**What goes wrong:** The "Cancel" button inside `showPasteInput` row also needs `onTouchStart` + `refocusTerminal()`. If only the main row buttons are fixed, tapping Cancel to dismiss the paste textarea will close the keyboard.
**Why it happens:** It's easy to miss the conditional branch.
**How to avoid:** The Cancel button's `onTouchStart` handler already exists; just add `refocusTerminal()` to it.
**Warning signs:** After attempting to paste then cancelling, keyboard dismisses.

### Pitfall 4: Wrong Enter sequence (\n instead of \r)
**What goes wrong:** Using `\n` (line feed) as the Enter sequence. Most shells on Linux handle it, but it is technically incorrect and can cause issues in some TUI applications that interpret control characters strictly.
**Why it happens:** `\n` is colloquially called "newline" and "Enter" in many contexts.
**How to avoid:** Use `\r` (carriage return, `0x0D`). This matches what xterm.js sends when the hardware Enter key is pressed.
**Warning signs:** Enter appears to work in bash but fails in editors like vim or nano.

### Pitfall 5: Enter button position in the scrollable row
**What goes wrong:** Placing Enter somewhere in the middle or end of the scrollable button row means it is off-screen on narrow phones and requires scrolling to reach.
**Why it happens:** It is appended to `MOBILE_KEYS` as a new entry.
**How to avoid:** Insert Enter as the FIRST entry in `MOBILE_KEYS` so it is always visible without horizontal scrolling.

## Code Examples

### Complete MobileKeyToolbarProps update
```typescript
// Source: Direct analysis of TerminalView.tsx + iOS Safari focus semantics
interface MobileKeyToolbarProps {
  sendInput: (data: string) => void;
  selectMode: boolean;
  onToggleCopyMode: () => void;
  terminalRef: React.MutableRefObject<Terminal | null>;
}
```

### refocusTerminal helper inside MobileKeyToolbar
```typescript
// Inline helper — does not need useCallback because it reads from stable ref
const refocusTerminal = () => {
  terminalRef.current?.textarea?.focus();
};
```

### Updated MOBILE_KEYS with Enter at position 0
```typescript
const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Enter', seq: '\r' },    // position 0 = always visible
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: '\u2191', seq: '\x1b[A' },
  { label: '\u2193', seq: '\x1b[B' },
  { label: '\u2190', seq: '\x1b[D' },
  { label: '\u2192', seq: '\x1b[C' },
  { label: 'PgUp', seq: '\x1b[5~' },
  { label: 'PgDn', seq: '\x1b[6~' },
];
```

### JSX: passing terminalRef to MobileKeyToolbar
```typescript
{IS_TOUCH_DEVICE && (
  <MobileKeyToolbar
    sendInput={sendInput}
    selectMode={selectMode}
    onToggleCopyMode={handleToggleCopyMode}
    terminalRef={terminalInstanceRef}
  />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `terminal.focus()` for mobile keyboard retention | `terminal.textarea?.focus()` directly | iOS 13+ | Reliable keyboard persistence vs intermittent failures |
| `onClick` handlers for toolbar buttons | `onTouchStart` with `event.preventDefault()` | Established mobile web practice | Eliminates 300ms delay and allows synchronous focus calls |
| Deferred `requestAnimationFrame` focus | Synchronous focus in `onTouchStart` | iOS Safari requirement | Only synchronous calls inside user-event handlers work on iOS |

**Deprecated/outdated:**
- VirtualKeyboard API: `navigator.virtualKeyboard` is Chrome 94+ only, not available on iOS Safari (explicitly called out in REQUIREMENTS.md as out of scope).

## Open Questions

1. **Android Chrome keyboard behaviour**
   - What we know: Android Chrome is generally more permissive about focus calls than iOS Safari; the `terminal.textarea?.focus()` fix should also work or at least not regress on Android.
   - What's unclear: Whether any Android-specific edge case exists that needs different handling.
   - Recommendation: Implement the iOS-focused fix; it is conservative and should be harmless on Android. If an Android regression surfaces during E2E testing, it can be addressed in a follow-up.

2. **Copy mode exit keyboard persistence**
   - What we know: `handleToggleCopyMode` uses `requestAnimationFrame(() => terminalInstanceRef.current?.focus())` when exiting copy mode — this is desktop-correct but may not retain keyboard on iOS.
   - What's unclear: Whether the Copy button `onTouchStart` handler (which calls `onToggleCopyMode`) with the new synchronous `refocusTerminal()` call will be sufficient for the "close copy mode" path.
   - Recommendation: The new `refocusTerminal()` in `onTouchStart` fires before `onToggleCopyMode()` so focus is already restored before the copy-mode close logic runs. The `requestAnimationFrame` in `handleToggleCopyMode` becomes redundant for mobile but harmless. No change needed to `handleToggleCopyMode` for Phase 28.

## Sources

### Primary (HIGH confidence)
- xterm.js TypeScript declarations (`node_modules/xterm/typings/xterm.d.ts`) — confirms `terminal.textarea: HTMLTextAreaElement | undefined` is a public readonly API
- [xtermjs.org Terminal class API](https://xtermjs.org/docs/api/terminal/classes/terminal/) — confirms `textarea`, `focus()` method signatures
- STATE.md project decisions — "iOS fix: Use `terminal.textarea?.focus()` synchronously in `onTouchStart`, never `terminal.focus()` or deferred calls" — this was established during v3.2 research
- Direct code analysis of `TerminalView.tsx` lines 78-184 — confirms current `MOBILE_KEYS` lacks Enter, and `onTouchStart` handlers lack `terminal.textarea?.focus()`

### Secondary (MEDIUM confidence)
- [xterm.js Issue #1101: Support mobile platforms](https://github.com/xtermjs/xterm.js/issues/1101) — documents `terminal.textarea` as the mechanism for mobile keyboard input
- [xterm.js Issue #2403: Accommodate predictive keyboard on mobile](https://github.com/xtermjs/xterm.js/issues/2403) — documents textarea attributes for mobile input control
- [Mobiscroll: Annoying iOS Safari input issues](https://blog.mobiscroll.com/annoying-ios-safari-input-issues-with-workarounds/) — documents `preventDefault` on `mousedown`/`touchstart` to prevent keyboard dismiss
- WebSearch: iOS Safari keyboard only responds to synchronous `focus()` calls inside user-interaction handlers — multiple sources confirm this constraint

### Tertiary (LOW confidence)
- None — the core technical facts are well-established from the primary and secondary sources above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; uses existing xterm.js public API confirmed in type definitions
- Architecture: HIGH — single-file change with clear prop threading pattern; aligned with STATE.md prior research
- Pitfalls: HIGH — iOS Safari focus constraints are well-documented; escape sequence for Enter (\r) is a terminal standard

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (stable domain — iOS Safari keyboard behaviour and xterm.js API are unlikely to change materially in 90 days)
