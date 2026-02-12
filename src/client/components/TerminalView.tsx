import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalSocket } from '../hooks/useTerminalSocket.js';
import 'xterm/css/xterm.css';

interface TerminalViewProps {
  tmuxSessionName: string;
  onSessionExit: (sessionName: string, exitCode: number) => void;
}

export function TerminalView({ tmuxSessionName, onSessionExit }: TerminalViewProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const handleTerminalOutput = useCallback((data: string) => {
    terminalInstanceRef.current?.write(data);
  }, []);

  const handleSessionExit = useCallback((exitCode: number) => {
    onSessionExit(tmuxSessionName, exitCode);
  }, [tmuxSessionName, onSessionExit]);

  const { sendInput, sendResize, isConnected, isReconnecting } = useTerminalSocket({
    sessionName: tmuxSessionName,
    onTerminalOutput: handleTerminalOutput,
    onSessionExit: handleSessionExit,
  });

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#0a0a1a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#1e1e3a',
        black: '#0a0a1a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e2e8f0',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(terminalContainerRef.current);
    terminal.focus();

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        sendResize(terminal.cols, terminal.rows);
      } catch {
        // Container may not have dimensions yet (zero-size layout)
      }
    });

    terminal.onData((userInput: string) => {
      sendInput(userInput);
    });

    terminal.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {
        // Container may have zero dimensions during layout transitions
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      terminal.dispose();
      terminalInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tmuxSessionName, sendInput, sendResize]);

  return (
    <div className="relative flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-warden-success' : isReconnecting ? 'bg-warden-warning animate-pulse' : 'bg-warden-error'}`} />
          <span className="text-xs text-warden-text-dim font-mono">{tmuxSessionName}</span>
        </div>
      </div>

      {!isConnected && (
        <div className="absolute inset-0 top-8 flex items-center justify-center bg-warden-bg/80 z-10">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 border-2 ${isReconnecting ? 'border-warden-warning' : 'border-warden-accent'} border-t-transparent rounded-full animate-spin`} />
            <span className="text-warden-text-dim text-sm">
              {isReconnecting ? 'Reconnecting' : 'Connecting'} to {tmuxSessionName}...
            </span>
          </div>
        </div>
      )}

      <div ref={terminalContainerRef} className="flex-1 min-h-0" />
    </div>
  );
}
