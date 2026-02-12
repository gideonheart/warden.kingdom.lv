# Phase 7: Terminal Interactivity & Scrollback - Research

**Researched:** 2026-02-12
**Domain:** xterm.js terminal focus management, React component lifecycle, tmux scrollback buffer configuration
**Confidence:** HIGH

## Summary

Phase 7 addresses two distinct root causes: (1) terminal never auto-focuses after mount, requiring manual click to enable keyboard input, and (2) tmux scrollback is disabled (`mouse off`, `history-limit 2000`), preventing users from scrolling through command history.

The solution requires both client-side focus management in React/xterm.js and server-side tmux configuration changes. xterm.js 5.3.0 provides a straightforward `terminal.focus()` API that works reliably when called after `terminal.open()` and when component props change. tmux 3.x has mature mouse mode support (`set -g mouse on`) that automatically enters copy-mode on mouse wheel scroll, providing native scrollback navigation.

**Primary recommendation:** Add `terminal.focus()` immediately after `terminal.open()` in TerminalView, re-focus on `tmuxSessionName` prop change via useEffect dependency, create `/home/forge/.tmux.conf` with `mouse on` and `history-limit 50000`, then verify no workflow breakage in active agent sessions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xterm.js | 5.3.0 | Browser terminal emulator | Industry standard, used by VS Code, supports DOM rendering + focus API |
| React | 19.0.0 | UI component framework | Project baseline, provides useEffect for lifecycle + ref management |
| tmux | 3.x+ | Terminal multiplexer | Server-side session management, owns scrollback buffer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xterm/addon-fit | 0.10.0 | Auto-size terminal to container | Already in use, required for layout |
| node-pty | 1.0.0 | PTY bindings for Node.js | Already in use, tmux spawning |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| xterm.js focus() | Custom focus management | xterm.js native API is tested, handles edge cases (blur/mousedown/selection) |
| tmux copy-mode | xterm.js scrollback only | tmux alternate buffer empties xterm scrollback when apps like Claude Code run |
| history-limit 50000 | Lower value (5000-10000) | 50k is modern best practice (200 bytes/line = ~10MB per pane, acceptable for power users) |

**Installation:**
No additional packages required — all dependencies present.

## Architecture Patterns

### Recommended Project Structure
Current structure is correct:
```
src/client/
├── components/
│   └── TerminalView.tsx        # Add focus() calls here
├── hooks/
│   └── useTerminalSocket.ts    # No changes needed
└── App.tsx                      # Passes tmuxSessionName prop
```

### Pattern 1: Terminal Focus on Mount
**What:** Call `terminal.focus()` immediately after `terminal.open()` to capture keyboard input without requiring user click.
**When to use:** Every terminal component initialization.
**Example:**
```typescript
// Source: xtermjs.org/docs/api/terminal/classes/terminal/
useEffect(() => {
  const terminal = new Terminal({ /* config */ });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainerRef.current);

  // Focus after open to enable immediate keyboard input
  terminal.focus();

  requestAnimationFrame(() => {
    fitAddon.fit();
    sendResize(terminal.cols, terminal.rows);
  });

  // ... rest of setup
}, []);
```

### Pattern 2: Re-Focus on Tab Switch (Prop Change)
**What:** Re-focus terminal when `tmuxSessionName` prop changes (user switches tabs).
**When to use:** Multi-tab terminal UIs where component remounts or key changes.
**Example:**
```typescript
// Source: React official docs (useEffect dependency array)
useEffect(() => {
  if (!terminalContainerRef.current) return;

  const terminal = new Terminal({ /* config */ });
  // ... setup code ...
  terminal.open(terminalContainerRef.current);
  terminal.focus(); // Initial focus

  return () => {
    terminal.dispose();
    terminalInstanceRef.current = null;
  };
}, [tmuxSessionName]); // Re-run when session changes

// Alternative: separate focus effect for visibility changes
useEffect(() => {
  terminalInstanceRef.current?.focus();
}, [tmuxSessionName]);
```

### Pattern 3: tmux Configuration via User Home Directory
**What:** Create `/home/forge/.tmux.conf` with mouse mode and history-limit configuration.
**When to use:** System-wide tmux behavior changes affecting all sessions.
**Example:**
```bash
# /home/forge/.tmux.conf
# Source: tmux.info/docs/configuration (2026 best practices)

# Enable mouse support (scroll wheel enters copy-mode)
set -g mouse on

# Increase scrollback history from default 2000 to 50000 lines
set -g history-limit 50000

# Optional: reduce scroll speed from default 5 to 2 lines per wheel tick
bind -T copy-mode-vi WheelUpPane send-keys -N 2 -X scroll-up
bind -T copy-mode-vi WheelDownPane send-keys -N 2 -X scroll-down

# Optional: vi-style copy mode keybindings
setw -g mode-keys vi
```

### Anti-Patterns to Avoid
- **Calling focus() before open():** xterm.js requires DOM mounting first — focus() will fail silently
- **Using xterm scrollback for tmux sessions:** Alternate buffer (used by tmux/Claude Code) empties xterm's buffer, making it ineffective
- **Disabling React StrictMode to prevent double-mount:** Focus is idempotent; double execution in dev mode is intentional and safe
- **Setting history-limit > 100000:** Memory cost increases (200 bytes/line), diminishing returns beyond 50k-100k

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal scrollback buffer | Custom scroll position tracking in React state | tmux copy-mode with mouse on | tmux manages alternate buffer correctly, handles escape sequences, preserves state across reconnects |
| Focus state synchronization across terminals | Custom focus manager tracking active terminal | xterm.js focus()/blur() + React useEffect | xterm.js handles browser events (mousedown/blur/selection), prevents race conditions |
| Mouse wheel scroll detection | Custom wheel event listeners on terminal div | tmux mouse mode | tmux intercepts wheel events, enters copy-mode automatically, handles modifier keys |
| Scrollback history persistence | Save terminal output to React state/localStorage | tmux history-limit | tmux persists scrollback in server memory, survives browser refresh, accessible via tmux commands |

**Key insight:** tmux and xterm.js are battle-tested for edge cases (alternate buffers, escape sequences, focus timing, reconnection). Custom solutions introduce bugs around copy-paste, selection, mouse modifier keys, and terminal resizing. Let xterm.js handle client-side focus, tmux handle server-side history.

## Common Pitfalls

### Pitfall 1: Focus Called Too Early
**What goes wrong:** Calling `terminal.focus()` before `terminal.open()` completes has no effect. Terminal appears unresponsive to keyboard input.
**Why it happens:** xterm.js requires DOM element attachment before focus can be transferred to the hidden textarea.
**How to avoid:** Always call `focus()` *after* `open()` in the same function/effect, or inside a `requestAnimationFrame` callback to ensure DOM update completion.
**Warning signs:** Terminal renders correctly but requires manual click to type. No console errors.

### Pitfall 2: Forgetting to Re-Focus on Prop Change
**What goes wrong:** First terminal tab works, but switching tabs requires clicking into new terminal. Frustrating UX.
**Why it happens:** When `tmuxSessionName` changes in parent component, React may reuse TerminalView instance or remount with ErrorBoundary key. Focus state doesn't transfer automatically.
**How to avoid:** Include `tmuxSessionName` in useEffect dependency array, or create separate effect that calls `terminalInstanceRef.current?.focus()` on prop change.
**Warning signs:** Initial load works, tab switching requires click. Check if `key={selectedSessionName}` in ErrorBoundary is triggering full remount.

### Pitfall 3: xterm Scrollback vs tmux Scrollback Confusion
**What goes wrong:** Increasing xterm `scrollback: 5000` has no effect when tmux alternate buffer is active (which it is when Claude Code runs). Mouse wheel doesn't scroll history.
**Why it happens:** tmux alternate buffer (used by full-screen apps) is exactly viewport size — no additional lines stored in xterm buffer. Per xterm spec: "alternate screen buffer contains no additional saved lines."
**How to avoid:** Use tmux mouse mode (`set -g mouse on`) to enable tmux's own copy-mode scrolling. Don't rely on xterm scrollback for tmux sessions.
**Warning signs:** xterm scrollback config present, but scrolling only works when tmux pane is idle (not running apps). tmux sessions show empty scrollback.

### Pitfall 4: tmux Mouse Mode Breaking Existing Workflows
**What goes wrong:** Enabling `mouse on` globally changes behavior for all tmux sessions. Text selection with mouse now enters copy-mode instead of native browser selection.
**Why it happens:** tmux intercepts mouse events before they reach xterm.js. `set -g mouse on` is global, affects all panes.
**How to avoid:** Test with active agent sessions. Tmux mouse mode is standard (2026 best practice), but verify agents don't rely on specific mouse behavior. Hold Shift to bypass tmux and use native selection.
**Warning signs:** Agent workflows that paste with middle-click or expect browser-native selection may break.

### Pitfall 5: React 19 StrictMode Double Focus
**What goes wrong:** In development, React 19 StrictMode mounts components twice. Terminal may flicker or focus twice.
**Why it happens:** StrictMode intentionally mounts → unmounts → remounts to detect missing cleanup. Terminal cleanup (`dispose()`) removes DOM element, second mount recreates it.
**How to avoid:** This is expected behavior in dev mode only. Ensure `return () => terminal.dispose()` in useEffect cleanup. Production builds mount once. Focus is idempotent.
**Warning signs:** Terminal flickers on page load in dev mode. Console shows multiple "terminal connected" logs. Behavior disappears in production build.

### Pitfall 6: Wrong tmux Config Scope
**What goes wrong:** Creating `.tmux.conf` in project directory or wrong user home has no effect.
**Why it happens:** tmux reads config from `~/.tmux.conf` (user home) or `/etc/tmux.conf` (system-wide), not arbitrary directories.
**How to avoid:** Create `/home/forge/.tmux.conf` explicitly. Verify with `tmux show-options -g` after restarting tmux server. User-level config overrides system config.
**Warning signs:** Config file exists but `tmux show-options -g mouse` still returns "mouse off". Config not being loaded.

## Code Examples

Verified patterns from official sources and current codebase:

### Terminal Focus After Open (xterm.js 5.3.0)
```typescript
// Source: Current TerminalView.tsx + xtermjs.org/docs
useEffect(() => {
  if (!terminalContainerRef.current) return;

  const terminal = new Terminal({
    theme: { /* ... */ },
    scrollback: 5000, // xterm buffer for non-tmux content
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.open(terminalContainerRef.current);

  // ADD THIS: Focus immediately after open
  terminal.focus();

  requestAnimationFrame(() => {
    try {
      fitAddon.fit();
      sendResize(terminal.cols, terminal.rows);
    } catch {
      // Container may not have dimensions yet
    }
  });

  // ... rest of setup (onData, onResize, etc)

  return () => {
    terminal.dispose();
  };
}, [tmuxSessionName, sendInput, sendResize]);
```

### Re-Focus on Prop Change (React 19 useEffect)
```typescript
// Source: React docs - useEffect dependency array
// OPTION A: Include in main effect dependency array (component remounts)
useEffect(() => {
  // ... terminal setup ...
  terminal.open(terminalContainerRef.current);
  terminal.focus(); // Runs on every tmuxSessionName change

  return () => terminal.dispose();
}, [tmuxSessionName]); // Changing this prop triggers full rebuild

// OPTION B: Separate focus effect (component persists)
useEffect(() => {
  // Only re-focus if terminal instance already exists
  if (terminalInstanceRef.current) {
    terminalInstanceRef.current.focus();
  }
}, [tmuxSessionName]);
```

Note: Current implementation uses ErrorBoundary with `key={selectedSessionName}`, which triggers full remount (Option A is active). Adding `terminal.focus()` after `terminal.open()` is sufficient.

### tmux Configuration (tmux 3.x)
```bash
# /home/forge/.tmux.conf
# Source: tmux.info, freeCodeCamp tmux guide

# Enable mouse support (wheel scroll enters copy-mode)
set -g mouse on

# Increase scrollback from default 2000 to 50000 lines
# ~10MB per pane (200 bytes/line * 50000)
set -g history-limit 50000

# Optional: Reduce scroll speed for smoother navigation
# Default is 5 lines per wheel tick, reduce to 2
bind -T copy-mode-vi WheelUpPane send-keys -N 2 -X scroll-up
bind -T copy-mode-vi WheelDownPane send-keys -N 2 -X scroll-down

# Optional: Vi-style keybindings in copy mode
setw -g mode-keys vi
```

Apply config:
```bash
# Create config file
cat > /home/forge/.tmux.conf <<'EOF'
set -g mouse on
set -g history-limit 50000
EOF

# Kill tmux server to reload config (disconnects all sessions)
tmux kill-server

# Or: source config in running sessions (may not affect all settings)
tmux source-file ~/.tmux.conf
```

### Verification Test (Playwright)
```typescript
// tests/e2e/terminal-focus.spec.ts
test('terminal is immediately interactive on load', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.xterm', { state: 'visible' });

  // Type without clicking — if focus works, input appears
  await page.keyboard.type('echo test');

  // Verify command was sent (check terminal output or socket events)
  // This is indirect — direct focus check requires accessing xterm internals
  const terminalHasFocus = await page.evaluate(() => {
    const textarea = document.querySelector('.xterm-helper-textarea');
    return document.activeElement === textarea;
  });

  expect(terminalHasFocus).toBe(true);
});

test('switching tabs maintains focus', async ({ page }) => {
  await page.goto('/');

  // Assume multiple sessions exist
  const tabs = page.locator('[role="tab"]');
  if (await tabs.count() > 1) {
    await tabs.nth(1).click(); // Switch to second tab
    await page.waitForTimeout(500); // Allow focus to settle

    // Type without clicking
    await page.keyboard.type('pwd');

    const terminalHasFocus = await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea');
      return document.activeElement === textarea;
    });

    expect(terminalHasFocus).toBe(true);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| xterm.js alternate buffer scrollback | tmux copy-mode only | xterm 3.0.0 (2018) | Alternate buffer forced to zero scrollback per xterm spec; tmux users must use tmux scrolling |
| tmux `mouse-mode`, `mouse-select-pane`, etc. | Single `mouse on` option | tmux 2.1 (2015) | Simplified mouse config; old options deprecated |
| Manual copy-mode entry (Prefix + [) | Automatic on wheel scroll | tmux 2.1 (2015) | Mouse wheel enters copy-mode automatically with `mouse on` |
| React Class Components with refs | Hooks (useRef, useEffect) | React 16.8 (2019) | Cleaner lifecycle, better cleanup |
| React StrictMode single mount | Double mount in dev mode | React 18 (2022) | Catches missing cleanup functions |

**Deprecated/outdated:**
- `set -g mouse-mode on` (tmux < 2.1): Replaced by `set -g mouse on`
- xterm.js `saveLines` option: Renamed to `scrollback` in modern versions
- xterm.js alternate buffer scrollback feature requests (Issues #802, #3607): Closed as out-of-scope/fixed; alternate buffer has zero scrollback by spec

## Open Questions

1. **Does tmux mouse mode break agent workflows?**
   - What we know: `set -g mouse on` is global, affects all tmux sessions. Agents may rely on native browser selection or middle-click paste.
   - What's unclear: Whether Warden/Scout/Builder agents use mouse interactions that depend on tmux mouse mode being off.
   - Recommendation: Test with active agent sessions. Tmux mouse mode is 2026 standard; agents should be mouse-mode agnostic. Document "hold Shift for native selection" if users report issues.

2. **Should we use ErrorBoundary key or useEffect dependency for remount strategy?**
   - What we know: Current code uses `<ErrorBoundary key={selectedSessionName}>` which triggers full component unmount/remount. This is effective but heavier than needed.
   - What's unclear: Whether switching to no-key + useEffect dependency would be more efficient (component persists, only socket reconnects).
   - Recommendation: Keep current ErrorBoundary key approach for Phase 7 — it guarantees clean state. Optimize in future phase if performance becomes issue.

3. **What's the memory impact of history-limit 50000 across many sessions?**
   - What we know: ~200 bytes/line * 50000 lines = ~10MB per pane. With 10 active sessions (1 pane each), ~100MB total.
   - What's unclear: Whether server has sufficient memory for many concurrent agent sessions with large history.
   - Recommendation: Start with 50000 (modern best practice). If memory issues occur, reduce to 20000 or make configurable per agent type.

## Sources

### Primary (HIGH confidence)
- [xterm.js API Documentation - Terminal.focus()](https://xtermjs.org/docs/api/terminal/classes/terminal/) - Official docs, focus() method specification
- [React useEffect Documentation](https://react.dev/reference/react/useEffect) - Official React 19 docs, dependency arrays
- [tmux in practice: scrollback buffer (freeCodeCamp)](https://www.freecodecamp.org/news/tmux-in-practice-scrollback-buffer-47d5ffa71c93/) - tmux scrollback mechanics, copy-mode, mouse integration
- [tmux Configuration Guide](https://tmux.info/docs/configuration) - Official tmux config reference
- Current codebase: `src/client/components/TerminalView.tsx`, `package.json` (verified versions)

### Secondary (MEDIUM confidence)
- [xterm.js Issue #802 - alternate screen buffer scrollback](https://github.com/xtermjs/xterm.js/issues/802) - Closed/fixed in 3.0.0, confirms zero-scrollback spec
- [xterm.js Issue #3607 - scrollback emulation in alt buffer](https://github.com/xtermjs/xterm.js/issues/3607) - Closed as out-of-scope
- [xterm.js Issue #681 - focus/blur state improvement](https://github.com/xtermjs/xterm.js/issues/681) - Historical context on focus edge cases
- [How to increase scrollback buffer in tmux](https://tmuxai.dev/tmux-increase-scrollback/) - Community best practices
- [tmux mouse mode configuration guide](https://copyprogramming.com/howto/how-do-i-scroll-in-tmux) - 2026 best practices
- [React 19 StrictMode behavior](https://react.dev/reference/react/StrictMode) - Official docs on double-mount

### Tertiary (LOW confidence)
- Various Stack Overflow/Medium articles on React focus management - General patterns, not xterm-specific
- Community tmux.conf examples on GitHub - Useful templates but not authoritative

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - xterm.js 5.3.0 and tmux 3.x are verified versions in use, well-documented
- Architecture: HIGH - Patterns verified against official React/xterm docs and current codebase structure
- Pitfalls: MEDIUM-HIGH - Most identified from official issue trackers (xterm.js #802, #3607, #681), tmux config is standard but global scope risk needs testing

**Research date:** 2026-02-12
**Valid until:** 60 days (stack is mature and stable)
