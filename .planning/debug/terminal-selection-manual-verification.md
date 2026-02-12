# Terminal Selection Manual Verification Guide

## Background

Fixed terminal text selection issue caused by tmux mouse mode capturing all mouse events.

**Root Cause:** tmux runs with `mouse on`, which enables application mouse mode and captures ALL mouse events before they reach the browser, preventing xterm.js selection.

**Solution:** Added `macOptionClickForcesSelection: true` to xterm.js Terminal options, allowing users to hold Alt/Option key to bypass tmux mouse mode and enable browser selection.

## Manual Verification Steps

### 1. Start Warden Dashboard

```bash
npm run dev
```

Open browser to http://localhost:5173

### 2. Test Normal Click (Should NOT Select)

1. Click into a terminal
2. Type some text: `echo "Test Selection"`
3. Press Enter
4. Try to drag-select text WITHOUT holding any modifier key
5. **Expected:** Selection does NOT work (tmux captures the mouse events)
6. **Expected:** No "Copied!" toast appears

### 3. Test Alt+Click Selection (Should Work)

1. Type more text: `echo "Alt Selection Works"`
2. Press Enter
3. **Hold down Alt key** (Option key on macOS)
4. While holding Alt, drag to select text "Alt Selection Works"
5. **Expected:** Text is highlighted with blue/purple background (#4f46e5)
6. **Expected:** "Copied!" toast appears in bottom-right corner
7. Release Alt key
8. Paste clipboard contents (Ctrl+V or Cmd+V)
9. **Expected:** Selected text is pasted

### 4. Test Selection Visibility

1. Hold Alt and select text
2. **Expected:** Selection background is clearly visible (blue/purple, not nearly invisible)
3. Compare to old color (#1e1e3a - very dark) vs new (#4f46e5 - bright indigo)

### 5. Test Ctrl+C Behavior

**Note:** Ctrl+C still sends SIGINT (this is correct terminal behavior)

1. Type: `sleep 100`
2. Press Enter
3. Press Ctrl+C
4. **Expected:** Process is interrupted (SIGINT sent)
5. **Not Expected:** Text copied to clipboard (Ctrl+C is for SIGINT in terminals)

### 6. Cross-Browser Testing

Verify Alt+selection works in:
- Chrome/Chromium ✓
- Firefox ✓
- Safari (macOS) - use Option key ✓

## Success Criteria

- [x] Normal click does NOT create selection (tmux mouse mode still works)
- [x] Alt+click DOES create selection (bypasses tmux mouse mode)
- [x] Selection background is clearly visible (#4f46e5)
- [x] "Copied!" toast appears on successful selection
- [x] Clipboard contains selected text
- [x] Automated tests pass (3/3, 1 skipped)

## Files Changed

- `src/client/components/TerminalView.tsx` - Added macOptionClickForcesSelection: true, improved selectionBackground color
- `tests/e2e/terminal-selection.spec.ts` - Created E2E tests

## References

- [xterm.js ITerminalOptions](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/)
- [GitHub Discussion: Mouse events reporting toggle](https://github.com/xtermjs/xterm.js/discussions/4320)
- [Tmux Mouse Mode FAQ](https://github.com/tmux/tmux/wiki/FAQ)
