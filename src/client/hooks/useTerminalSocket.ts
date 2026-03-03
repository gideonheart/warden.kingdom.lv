import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseTerminalSocketParams {
  sessionName: string | null;
  onTerminalOutput: (data: string) => void;
  onTerminalReset: () => void;
  onSessionExit: (exitCode: number) => void;
  /** Called at socket-creation time (inside useEffect) to get the current terminal
   *  dimensions. These are sent in the connection handshake so the server can spawn
   *  the PTY at the correct size and avoid a dimension-mismatch repaint glitch. */
  getDimensions: () => { cols: number; rows: number };
}

/**
 * Duration (ms) to wait after socket disconnects before showing the connecting overlay.
 * Brief transient disconnects (network hiccup, intentional reconnect) complete within
 * this window and the overlay never flashes. Only genuine prolonged disconnects show it.
 */
const OVERLAY_DELAY_MS = 500;

export function useTerminalSocket({
  sessionName,
  onTerminalOutput,
  onTerminalReset,
  onSessionExit,
  getDimensions,
}: UseTerminalSocketParams) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  /**
   * Overlay visibility is decoupled from isConnected with a delay. This prevents
   * the "Connecting..." overlay from flashing during brief reconnect cycles that
   * complete within OVERLAY_DELAY_MS (e.g. after PTY exit or intentional reconnect).
   */
  const [showConnectingOverlay, setShowConnectingOverlay] = useState(false);
  const overlayDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Incrementing this counter forces the effect to re-run, creating a fresh socket
  // and causing the server to spawn a new PTY. Used when the PTY exits unexpectedly.
  const [reconnectGeneration, setReconnectGeneration] = useState(0);

  // Store callbacks in refs so they are always up-to-date but never need to be
  // deps of the socket effect. This is the key fix: adding callbacks as effect deps
  // would cause a socket disconnect+reconnect whenever the parent re-renders with
  // new callback identities (even functionally identical ones). By using refs, the
  // socket effect depends ONLY on sessionName and reconnectGeneration — the only
  // values that should actually trigger a new connection.
  const onTerminalOutputRef = useRef(onTerminalOutput);
  const onTerminalResetRef = useRef(onTerminalReset);
  const onSessionExitRef = useRef(onSessionExit);

  // Keep refs current on every render without triggering socket reconnects.
  onTerminalOutputRef.current = onTerminalOutput;
  onTerminalResetRef.current = onTerminalReset;
  onSessionExitRef.current = onSessionExit;

  // Manage the overlay delay timer: start counting on disconnect, cancel on connect.
  useEffect(() => {
    if (isConnected) {
      // Connected — cancel any pending overlay timer and hide overlay immediately.
      if (overlayDelayTimerRef.current !== null) {
        clearTimeout(overlayDelayTimerRef.current);
        overlayDelayTimerRef.current = null;
      }
      setShowConnectingOverlay(false);
    } else {
      // Disconnected — wait before showing overlay so brief reconnects are invisible.
      if (overlayDelayTimerRef.current === null) {
        overlayDelayTimerRef.current = setTimeout(() => {
          overlayDelayTimerRef.current = null;
          setShowConnectingOverlay(true);
        }, OVERLAY_DELAY_MS);
      }
    }

    return () => {
      // Nothing to clean up here — timer cleanup happens on next render or unmount below.
    };
  }, [isConnected]);

  // Clean up overlay timer on unmount.
  useEffect(() => {
    return () => {
      if (overlayDelayTimerRef.current !== null) {
        clearTimeout(overlayDelayTimerRef.current);
        overlayDelayTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionName) return;

    // Read dimensions at socket-creation time so we get the actual rendered size,
    // not a stale value from the render phase.
    const { cols, rows } = getDimensions();
    const query: Record<string, string | number> = { sessionName, cols, rows };

    const socket = io('/terminal', {
      query: query as Record<string, string>,
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setIsReconnecting(false);
    });
    socket.on('disconnect', () => {
      setIsConnected(false);
    });
    socket.io.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });
    socket.io.on('reconnect_failed', () => {
      setIsReconnecting(false);
    });

    // Route events through refs so these handlers never need to be effect deps.
    // Changing onTerminalOutput/onTerminalReset/onSessionExit must NEVER cause
    // a socket disconnect+reconnect cycle.
    socket.on('terminal:output', (data: string) => {
      onTerminalOutputRef.current(data);
    });
    socket.on('terminal:reset', () => {
      onTerminalResetRef.current();
    });
    // Server fires terminal:reset when it spawns a fresh PTY (not reusing an existing one).
    // The client should clear any stale xterm.js content before the new repaint arrives.
    socket.on('terminal:exit', ({ exitCode }: { exitCode: number }) => {
      // Notify the parent component of the exit.
      onSessionExitRef.current(exitCode);
      // After a PTY exit, the server session mapping is gone. Reconnecting the
      // socket (same ID) will not help — the server won't recognise it. Force a
      // full socket reconnect so the server spawns a fresh PTY.
      socket.disconnect();
      // A short delay lets the tmux session come back up if it was temporarily
      // killed (e.g., the process finished and was restarted by a supervisor).
      setTimeout(() => {
        setReconnectGeneration((n) => n + 1);
      }, 2_000);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsReconnecting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName, reconnectGeneration]);
  // Callbacks (onTerminalOutput, onTerminalReset, onSessionExit) are intentionally
  // excluded from deps — they are accessed via refs so they are always current without
  // triggering socket reconnects. getDimensions is excluded as it is called for its
  // current value at socket-creation time only.

  const sendInput = useCallback((data: string) => {
    socketRef.current?.emit('terminal:input', data);
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    socketRef.current?.emit('terminal:resize', { cols, rows });
  }, []);

  return {
    sendInput,
    sendResize,
    isConnected,
    isReconnecting,
    showConnectingOverlay,
  };
}
