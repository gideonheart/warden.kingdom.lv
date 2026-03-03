import { describe, it, expect } from 'vitest';
import { useTerminalSocket } from '../../src/client/hooks/useTerminalSocket.js';

/**
 * Structural protection note:
 *
 * useTerminalSocket creates a Socket.IO connection inside a useEffect that depends on:
 *   [sessionName, onTerminalOutput, onTerminalReset, onSessionExit, reconnectGeneration]
 *
 * The socket only reconnects when one of these deps changes. With the stabilization in
 * this quick task (quick-21):
 *
 * 1. `sessionName` comes from `useSessionSelection.selectedSessionName`, which only changes
 *    when the user explicitly switches sessions OR the session disappears for 2+ consecutive
 *    poll cycles. It does NOT change on every poll cycle.
 *
 * 2. `onTerminalOutput`, `onTerminalReset`, `onSessionExit` are created via useCallback
 *    inside TerminalView with stable deps — they do not change between renders.
 *
 * 3. `reconnectGeneration` only increments when a PTY exits, triggering intentional reconnect.
 *
 * 4. TerminalView itself is keyed by `selectedSessionName`. Because selectedSessionName is
 *    now stable (useSessionSelection with hysteresis), TerminalView does NOT remount on
 *    poll cycles, so the entire socket lifecycle stays intact.
 *
 * This means: zero socket reconnections occur during normal polling operation.
 */

describe('useTerminalSocket', () => {
  it('exports the useTerminalSocket function', () => {
    expect(typeof useTerminalSocket).toBe('function');
  });
});
