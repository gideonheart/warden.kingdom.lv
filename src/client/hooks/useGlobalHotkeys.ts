import { useEffect } from 'react';
import type { AgentInstance } from '@shared/types.js';

interface UseGlobalHotkeysParams {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  onToggleSidebar: () => void;
  terminalFocusRef: React.MutableRefObject<(() => void) | null>;
  currentView: string;
  /** Callback invoked when Ctrl+F is pressed in the terminals view.
   *  Opens the TerminalSearchOverlay for the active session. */
  onOpenSearch?: () => void;
}

/** Returns true when the event target is a text input, textarea, or contentEditable element.
 *  Keyboard shortcuts must not fire when the operator is typing in these elements. */
function isInTextInput(target: EventTarget | null): boolean {
  if (!target) return false;
  const element = target as HTMLElement;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

/** Global keyboard shortcut hook.
 *
 * Registered on `document` with `{ capture: true }` so the handler fires in
 * the capture phase — before xterm.js bubble-phase listeners can forward the
 * key as an escape sequence to the PTY.
 *
 * Shortcuts:
 * - Ctrl+1-9: switch to the Nth session tab (terminals view)
 * - Ctrl+[: cycle to previous tab with wrap-around (terminals view)
 * - Ctrl+]: cycle to next tab with wrap-around (terminals view)
 * - Ctrl+B: toggle the AgentSidebar collapsed/expanded (any view)
 * - Escape: focus terminal canvas when it does not already have focus (terminals view)
 * - Ctrl+F: open terminal search overlay (terminals view)
 */
export function useGlobalHotkeys({
  instances,
  selectedSessionName,
  onSelectSession,
  onToggleSidebar,
  terminalFocusRef,
  currentView,
  onOpenSearch,
}: UseGlobalHotkeysParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // KB-05: do not fire when operator is typing in a text field.
      // This guard also ensures Escape while the search input is focused is handled
      // by the overlay's own onKeyDown (not by this handler).
      if (isInTextInput(event.target)) return;

      // Escape: refocus terminal if it does not already have focus.
      // Do NOT call preventDefault or stopPropagation — Escape must reach the PTY
      // for TUI applications (vim, etc.) when the terminal already has focus.
      if (event.key === 'Escape' && !event.ctrlKey && currentView === 'terminals') {
        const terminalHasFocus = !!document.activeElement?.closest('.xterm');
        if (!terminalHasFocus) {
          terminalFocusRef.current?.();
        }
        return;
      }

      if (!event.ctrlKey) return;

      // Ctrl+F: open terminal search overlay (terminals view only).
      // preventDefault suppresses the browser native find bar.
      // stopPropagation prevents the key from reaching the PTY.
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        event.stopPropagation();
        if (currentView === 'terminals') {
          onOpenSearch?.();
        }
        return;
      }

      // Ctrl+B: toggle AgentSidebar
      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        event.stopPropagation();
        onToggleSidebar();
        return;
      }

      if (currentView !== 'terminals') return;

      // Ctrl+1 through Ctrl+9: switch to Nth session tab (1-based)
      const digit = parseInt(event.key, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        event.preventDefault();
        event.stopPropagation();
        const target = instances[digit - 1];
        if (target) {
          onSelectSession(target.tmuxSessionName);
        }
        return;
      }

      // Ctrl+[ — cycle to previous tab with wrap-around
      if (event.key === '[' || event.code === 'BracketLeft') {
        event.preventDefault();
        event.stopPropagation();
        if (instances.length === 0) return;
        const currentIndex = instances.findIndex((i) => i.tmuxSessionName === selectedSessionName);
        const prevIndex = currentIndex <= 0 ? instances.length - 1 : currentIndex - 1;
        onSelectSession(instances[prevIndex].tmuxSessionName);
        return;
      }

      // Ctrl+] — cycle to next tab with wrap-around
      if (event.key === ']' || event.code === 'BracketRight') {
        event.preventDefault();
        event.stopPropagation();
        if (instances.length === 0) return;
        const currentIndex = instances.findIndex((i) => i.tmuxSessionName === selectedSessionName);
        const nextIndex = currentIndex === -1 || currentIndex >= instances.length - 1 ? 0 : currentIndex + 1;
        onSelectSession(instances[nextIndex].tmuxSessionName);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [instances, selectedSessionName, onSelectSession, onToggleSidebar, terminalFocusRef, currentView, onOpenSearch]);
}
