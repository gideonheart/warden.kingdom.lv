import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseTerminalSocketParams {
  sessionName: string | null;
  onTerminalOutput: (data: string) => void;
  onSessionExit: (exitCode: number) => void;
}

export function useTerminalSocket({
  sessionName,
  onTerminalOutput,
  onSessionExit,
}: UseTerminalSocketParams) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(true);

  useEffect(() => {
    if (!sessionName) return;

    const socket = io('/terminal', {
      query: { sessionName },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('terminal:output', onTerminalOutput);
    socket.on('terminal:exit', ({ exitCode }: { exitCode: number }) => onSessionExit(exitCode));
    socket.on('terminal:mode-changed', ({ readOnly }: { readOnly: boolean }) => setIsReadOnly(readOnly));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsReadOnly(true);
    };
  }, [sessionName, onTerminalOutput, onSessionExit]);

  const sendInput = useCallback((data: string) => {
    socketRef.current?.emit('terminal:input', data);
  }, []);

  const requestTakeOver = useCallback(() => {
    socketRef.current?.emit('terminal:take-over');
  }, []);

  const releaseTakeOver = useCallback(() => {
    socketRef.current?.emit('terminal:release');
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    socketRef.current?.emit('terminal:resize', { cols, rows });
  }, []);

  return {
    sendInput,
    sendResize,
    requestTakeOver,
    releaseTakeOver,
    isConnected,
    isReadOnly,
  };
}
