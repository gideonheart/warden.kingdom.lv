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
  // Incrementing this counter forces the effect to re-run, creating a fresh socket
  // and causing the server to spawn a new PTY. Used when the PTY exits unexpectedly.
  const [reconnectGeneration, setReconnectGeneration] = useState(0);

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
    socket.on('terminal:output', onTerminalOutput);
    // Server fires terminal:reset when it spawns a fresh PTY (not reusing an existing one).
    // The client should clear any stale xterm.js content before the new repaint arrives.
    socket.on('terminal:reset', onTerminalReset);
    socket.on('terminal:exit', ({ exitCode }: { exitCode: number }) => {
      // Notify the parent component of the exit.
      onSessionExit(exitCode);
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
  }, [sessionName, onTerminalOutput, onTerminalReset, onSessionExit, reconnectGeneration]);
  // Note: getDimensions is intentionally excluded from deps — it is called inside
  // the effect for its current value, but changes to it should not force a reconnect.

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
  };
}
