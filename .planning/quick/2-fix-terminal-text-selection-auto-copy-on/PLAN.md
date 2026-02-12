# Quick Task 2: Fix terminal text selection auto-copy

## Goal
Auto-copy selected terminal text to clipboard on mouseup with a brief "Copied!" toast overlay inside the terminal container.

## Tasks
- [ ] QT2-01: Add `useState` for toast visibility + `onSelectionChange` handler that reads `terminal.getSelection()`, writes to clipboard via `navigator.clipboard.writeText()`, and shows the toast — `src/client/components/TerminalView.tsx`
- [ ] QT2-02: Add absolute-positioned "Copied!" toast div inside the terminal container wrapper (below the disconnected overlay), styled with Tailwind (bg-warden-accent, rounded, text-xs, fade-out via transition/opacity), auto-dismiss after 1.5s via `setTimeout` — `src/client/components/TerminalView.tsx`

## Implementation Details

**QT2-01 — Selection handler (inside the `useEffect` that creates the terminal, after line 79):**
```ts
terminal.onSelectionChange(() => {
  const selectedText = terminal.getSelection();
  if (selectedText) {
    navigator.clipboard.writeText(selectedText).then(() => {
      setShowCopiedToast(true);
    }).catch(() => {
      // Clipboard write failed silently (e.g. permissions)
    });
  }
});
```
- Add `useState` import (already has `useEffect, useRef, useCallback`)
- Add `const [showCopiedToast, setShowCopiedToast] = useState(false);` in the component body

**QT2-02 — Toast element + auto-dismiss:**
- Add a `useEffect` that watches `showCopiedToast` and sets a 1.5s timeout to clear it
- Render the toast as an absolute-positioned div inside the terminal container area:
```tsx
{showCopiedToast && (
  <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-warden-accent text-white text-xs rounded shadow-lg z-20 animate-fade-in">
    Copied!
  </div>
)}
```
- Place this inside the outermost `<div className="relative flex flex-col h-full">` so `absolute` positioning works relative to the terminal panel

## Files
- `src/client/components/TerminalView.tsx`
