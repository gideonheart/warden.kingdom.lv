import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalSocket } from '../hooks/useTerminalSocket.js';
import 'xterm/css/xterm.css';

interface TerminalViewProps {
  tmuxSessionName: string;
  onSessionExit: (sessionName: string, exitCode: number) => void;
}

// Strip mouse-tracking enable sequences so xterm.js uses native selection
// instead of forwarding mouse events to tmux (which has `set -g mouse on`).
const MOUSE_TRACKING_ENABLE_PATTERN = /\x1b\[\?(1000|1002|1003|1006)h/g;

const IS_TOUCH_DEVICE = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function getResponsiveFontSize(): number {
  return window.innerWidth < 640 ? 11 : 14;
}

const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: '\u2191', seq: '\x1b[A' },          // Up arrow
  { label: '\u2193', seq: '\x1b[B' },          // Down arrow
  { label: '\u2190', seq: '\x1b[D' },          // Left arrow
  { label: '\u2192', seq: '\x1b[C' },          // Right arrow
  { label: 'PgUp', seq: '\x1b[5~' },
  { label: 'PgDn', seq: '\x1b[6~' },
];

interface MobileKeyToolbarProps {
  sendInput: (data: string) => void;
  selectMode: boolean;
  onToggleCopyMode: () => void;
}

function MobileKeyToolbar({ sendInput, selectMode, onToggleCopyMode }: MobileKeyToolbarProps) {
  const [showPasteInput, setShowPasteInput] = useState(false);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sendInput(text);
        return;
      }
    } catch {
      // Clipboard API unavailable or denied — show manual paste input
    }
    setShowPasteInput(true);
  };

  useEffect(() => {
    if (showPasteInput) {
      pasteInputRef.current?.focus();
    }
  }, [showPasteInput]);

  return (
    <div className="relative z-40 flex flex-col bg-warden-panel border-t border-warden-border">
      {showPasteInput && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-warden-border">
          <textarea
            ref={pasteInputRef}
            onPaste={(event) => {
              event.preventDefault();
              const text = event.clipboardData.getData('text');
              if (text) {
                sendInput(text);
              }
              setShowPasteInput(false);
            }}
            placeholder="Tap and paste here"
            rows={1}
            className="flex-1 px-2 py-1 text-xs font-mono bg-warden-bg text-warden-text rounded border border-warden-border resize-none"
          />
          <button
            onTouchStart={(event) => { event.preventDefault(); setShowPasteInput(false); }}
            onClick={() => setShowPasteInput(false)}
            className="px-2 py-1.5 min-h-[36px] text-xs text-warden-text-dim bg-warden-border/40 rounded"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto touch-scroll">
        <button
          onTouchStart={(event) => { event.preventDefault(); onToggleCopyMode(); }}
          className={`px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono rounded whitespace-nowrap select-none ${
            selectMode
              ? 'bg-warden-accent/30 text-warden-accent border border-warden-accent/50'
              : 'text-warden-text-dim bg-warden-border/40 active:bg-warden-accent/30 active:text-warden-accent'
          }`}
        >
          {selectMode ? 'Close' : 'Copy'}
        </button>
        <button
          onTouchStart={(event) => { event.preventDefault(); handlePaste(); }}
          className="px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono text-warden-text-dim bg-warden-border/40 rounded active:bg-warden-accent/30 active:text-warden-accent whitespace-nowrap select-none"
        >
          Paste
        </button>
        <button
          onTouchStart={(event) => { event.preventDefault(); sendInput('\x1b'); }}
          className="px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono text-warden-text-dim bg-warden-border/40 rounded active:bg-warden-accent/30 active:text-warden-accent whitespace-nowrap select-none"
        >
          Esc
        </button>
        {MOBILE_KEYS.map((key) => (
          <button
            key={key.label}
            onTouchStart={(event) => {
              event.preventDefault();
              sendInput(key.seq);
            }}
            className="px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono text-warden-text-dim bg-warden-border/40 rounded active:bg-warden-accent/30 active:text-warden-accent whitespace-nowrap select-none"
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TerminalView({ tmuxSessionName, onSessionExit }: TerminalViewProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);

  const handleTerminalOutput = useCallback((data: string) => {
    const filtered = data.replace(MOUSE_TRACKING_ENABLE_PATTERN, '');
    terminalInstanceRef.current?.write(filtered);
  }, []);

  const handleSessionExit = useCallback((exitCode: number) => {
    onSessionExit(tmuxSessionName, exitCode);
  }, [tmuxSessionName, onSessionExit]);

  const { sendInput, sendResize, isConnected, isReconnecting } = useTerminalSocket({
    sessionName: tmuxSessionName,
    onTerminalOutput: handleTerminalOutput,
    onSessionExit: handleSessionExit,
  });

  const handleToggleCopyMode = useCallback(() => {
    if (selectMode) {
      setSelectMode(false);
      window.getSelection()?.removeAllRanges();
      requestAnimationFrame(() => {
        terminalInstanceRef.current?.focus();
      });
    } else {
      const terminal = terminalInstanceRef.current;
      if (terminal) {
        const buffer = terminal.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            lines.push(line.translateToString());
          }
        }
        setTerminalText(lines.join('\n'));
      }
      setSelectMode(true);
    }
  }, [selectMode]);

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#0a0a1a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#4f46e5',
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
      fontSize: getResponsiveFontSize(),
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

    terminal.onSelectionChange(() => {
      const selectedText = terminal.getSelection();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).then(() => {
          setShowCopiedToast(true);
        }).catch(() => {
          // Clipboard write failed (e.g. permissions not granted)
        });
      }
    });

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Alt+click cursor positioning
    const container = terminalContainerRef.current;
    const handleAltClick = (event: MouseEvent) => {
      if (!event.altKey) return;
      event.preventDefault();

      const xtermRows = container.querySelector('.xterm-rows');
      if (!xtermRows) return;

      const cellWidth = xtermRows.clientWidth / terminal.cols;
      const cellHeight = xtermRows.clientHeight / terminal.rows;

      const rect = xtermRows.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const relativeY = event.clientY - rect.top;

      const col = Math.max(0, Math.min(terminal.cols - 1, Math.floor(relativeX / cellWidth)));
      const row = Math.max(0, Math.min(terminal.rows - 1, Math.floor(relativeY / cellHeight)));

      // Send SGR mouse press and release sequences
      sendInput(`\x1b[<0;${col + 1};${row + 1}M`);
      sendInput(`\x1b[<0;${col + 1};${row + 1}m`);

      // Show click indicator
      setClickIndicator({ x: event.clientX - rect.left + container.getBoundingClientRect().left - rect.left, y: event.clientY - rect.top });
      setTimeout(() => setClickIndicator(null), 300);
    };
    container.addEventListener('click', handleAltClick);

    // Scroll forwarding: send mouse wheel escape sequences to tmux.
    // We stripped mouse-tracking enable sequences so xterm.js doesn't
    // intercept mouse events, but tmux still expects them. SGR format:
    //   scroll up:   \x1b[<64;col;rowM
    //   scroll down: \x1b[<65;col;rowM
    const sendScrollToTmux = (linesUp: number) => {
      const button = linesUp > 0 ? 64 : 65;
      const count = Math.abs(linesUp);
      const seq = `\x1b[<${button};1;1M`;
      for (let i = 0; i < count; i++) {
        sendInput(seq);
      }
    };

    // Desktop: forward mouse wheel to tmux
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const lines = Math.sign(event.deltaY) * Math.max(1, Math.ceil(Math.abs(event.deltaY) / 40));
      // deltaY positive = scroll down = tmux scroll down (button 65)
      // deltaY negative = scroll up = tmux scroll up (button 64)
      sendScrollToTmux(lines > 0 ? -Math.abs(lines) : Math.abs(lines));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });

    // Mobile: touch scroll (copy mode is toggled via toolbar button, not long-press)
    let touchStartY = 0;
    let touchAccumulator = 0;
    let isScrolling = false;

    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0].clientY;
      touchAccumulator = 0;
      isScrolling = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0].clientY;
      const deltaY = touchStartY - currentY;
      touchStartY = currentY;

      if (Math.abs(deltaY) > 2 && !isScrolling) {
        isScrolling = true;
      }

      if (isScrolling) {
        // Prevent pull-to-refresh / page scroll
        event.preventDefault();

        // Accumulate pixels and convert to line-sized scroll events
        const xtermRows = terminal.element?.querySelector('.xterm-rows');
        const cellHeight = xtermRows ? xtermRows.clientHeight / terminal.rows : 16;
        touchAccumulator += deltaY;
        const linesToScroll = Math.trunc(touchAccumulator / cellHeight);
        if (linesToScroll !== 0) {
          // Natural scrolling: finger up = see newer content = scroll down in tmux
          sendScrollToTmux(-linesToScroll);
          touchAccumulator -= linesToScroll * cellHeight;
        }
      }
    };

    const handleTouchEnd = () => {
      isScrolling = false;
      touchAccumulator = 0;
    };

    if (IS_TOUCH_DEVICE) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    // Responsive font size on window resize / orientation change
    let previousFontSize = getResponsiveFontSize();
    const handleWindowResize = () => {
      try {
        const newFontSize = getResponsiveFontSize();
        if (newFontSize !== previousFontSize) {
          terminal.options.fontSize = newFontSize;
          previousFontSize = newFontSize;
        }
        fitAddon.fit();
      } catch {
        // Container may have zero dimensions during layout transitions
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      container.removeEventListener('click', handleAltClick);
      container.removeEventListener('wheel', handleWheel);
      if (IS_TOUCH_DEVICE) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      }
      terminal.dispose();
      terminalInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tmuxSessionName, sendInput, sendResize]);

  useEffect(() => {
    if (!showCopiedToast) return;
    const timer = setTimeout(() => setShowCopiedToast(false), 1500);
    return () => clearTimeout(timer);
  }, [showCopiedToast]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-warden-success' : isReconnecting ? 'bg-warden-warning animate-pulse' : 'bg-warden-error'}`} />
          <span className="text-xs text-warden-text-dim font-mono">{tmuxSessionName}</span>
        </div>
        <span className="text-[10px] text-warden-text-dim/40 hidden sm:inline">Alt+click to position cursor</span>
      </div>

      {/* Terminal content area — overlays scoped here, toolbar stays outside */}
      <div className="relative flex-1 min-h-0 min-w-0">
        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/80 z-10">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 border-2 ${isReconnecting ? 'border-warden-warning' : 'border-warden-accent'} border-t-transparent rounded-full animate-spin`} />
              <span className="text-warden-text-dim text-sm">
                {isReconnecting ? 'Reconnecting' : 'Connecting'} to {tmuxSessionName}...
              </span>
            </div>
          </div>
        )}

        <div ref={terminalContainerRef} className="h-full w-full overflow-hidden" />

        {/* Alt+click visual indicator */}
        {clickIndicator && (
          <div
            className="absolute w-3 h-3 rounded-full bg-warden-accent/60 pointer-events-none z-20 animate-ping"
            style={{ left: clickIndicator.x - 6, top: clickIndicator.y }}
          />
        )}

        {/* Mobile copy mode text selection overlay — scoped to terminal area */}
        {selectMode && (
          <div className="absolute inset-0 z-30 bg-warden-bg/95 overflow-auto p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-warden-text-dim">Long-press text to select and copy</span>
              <button
                onClick={handleToggleCopyMode}
                className="px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text bg-warden-border/50 rounded transition-colors min-h-[44px] min-w-[44px]"
              >
                Close
              </button>
            </div>
            <pre
              className="flex-1 select-text text-warden-text font-mono text-xs leading-relaxed whitespace-pre overflow-auto"
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '12px' }}
            >
              {terminalText}
            </pre>
          </div>
        )}

        {showCopiedToast && (
          <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-warden-accent text-white text-xs rounded shadow-lg z-20">
            Copied!
          </div>
        )}
      </div>

      {/* Mobile key toolbar — always visible, outside overlay scope */}
      {IS_TOUCH_DEVICE && (
        <MobileKeyToolbar
          sendInput={sendInput}
          selectMode={selectMode}
          onToggleCopyMode={handleToggleCopyMode}
        />
      )}
    </div>
  );
}
