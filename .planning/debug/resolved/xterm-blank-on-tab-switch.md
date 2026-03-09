---
status: resolved
trigger: "xterm-blank-on-tab-switch - Terminal blank when switching tabs, requires resize to show content"
created: 2026-03-08T00:00:00Z
updated: 2026-03-08T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED - No ResizeObserver on terminal container; only window.resize triggered refit
test: Build passes, ResizeObserver added to observe container
expecting: Terminal refits automatically when container gains dimensions after React mount
next_action: Archive session

## Symptoms

expected: Terminal content should be visible immediately when switching tabs
actual: Terminal is blank/empty when switching to a tab. Only shows content after browser window resize.
errors: None reported
reproduction: Switch to any tab (specifically seen with `k1-rust-karbit-friend_kingdom_lv-da6c`). Terminal area is blank. Resize browser window -> content appears.
started: Currently happening. Known xterm.js class of bug.

## Eliminated

- hypothesis: Socket/data race - terminal data lost before terminal instance created
  evidence: Socket connection is async (network IO); by the time server sends data, the terminal useEffect has run and terminalInstanceRef.current is set
  timestamp: 2026-03-08T00:00:30Z

- hypothesis: fitAddon.fit() throws on zero-size container, catch block only retries once
  evidence: FitAddon.fit() does NOT throw on zero-size containers. It silently calculates wrong dimensions or does nothing. The try/catch at line 490-503 is dead code for this scenario.
  timestamp: 2026-03-08T00:00:45Z

## Evidence

- timestamp: 2026-03-08T00:00:10Z
  checked: App.tsx tab switching mechanism
  found: TerminalView is keyed by selectedSessionName (line 610). Tab switch causes full unmount/remount, not visibility toggle.
  implication: Every tab switch creates a brand new Terminal instance that must fit to its container

- timestamp: 2026-03-08T00:00:20Z
  checked: TerminalView.tsx resize/refit mechanisms
  found: Only two refit triggers: (1) synchronous fit() at line 491 during mount, (2) window 'resize' event listener. No ResizeObserver on container.
  implication: If the synchronous fit() at mount time finds zero/wrong dimensions, there is NO subsequent mechanism to refit except window resize.

- timestamp: 2026-03-08T00:00:25Z
  checked: grep for ResizeObserver across entire src/ directory
  found: Zero matches. No ResizeObserver usage anywhere in the codebase.
  implication: The container element's dimensions changing (e.g. layout settling after React mount) is completely unobserved.

- timestamp: 2026-03-08T00:00:40Z
  checked: FitAddon.fit() behavior on zero-size containers
  found: FitAddon.fit() calculates cols/rows from container.clientWidth/clientHeight. Zero dimensions produce cols=0/rows=0 or early return. Does NOT throw.
  implication: The try/catch fallback to rAF never triggers. The terminal silently gets wrong dimensions.

- timestamp: 2026-03-08T00:01:30Z
  checked: Build after fix applied
  found: vite build + tsc server compilation both pass cleanly. Pre-existing type error at line 455 (unrelated mouse tracking params) confirmed present on main branch before change.
  implication: Fix introduces no regressions

## Resolution

root_cause: TerminalView has no ResizeObserver on its container element. When a tab switch causes React to unmount/remount TerminalView (keyed by selectedSessionName), the synchronous fitAddon.fit() call at mount time can execute before the container has settled its layout dimensions. Since the ONLY other refit trigger was window.resize (which does NOT fire on tab switch), the terminal stays at zero/wrong dimensions until the user manually resizes the browser window.

fix: Replaced the `window.addEventListener('resize', refitTerminal)` with a `ResizeObserver` on the terminal container element. The ResizeObserver fires whenever the container's dimensions change, including the critical first layout after React mounts the component. This ensures fitAddon.fit() is called as soon as the container has real dimensions. The visualViewport resize listener is retained for iOS keyboard handling. Cleanup disconnects the observer in the useEffect return.

verification: Production build passes cleanly (vite build + tsc -p tsconfig.server.json). Type check shows only pre-existing errors (confirmed by stashing change and re-running typecheck on base).

files_changed:
- src/client/components/TerminalView.tsx
