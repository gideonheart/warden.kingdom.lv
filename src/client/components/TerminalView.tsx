import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { useTerminalSocket } from '../hooks/useTerminalSocket.js';
import { useRecordingState } from '../hooks/useRecordingState.js';
import { useRotateSession } from '../hooks/useRotateSession.js';
import type { AgentInstanceStatus } from '@shared/types.js';
import type { AgentContextFill } from '@shared/openclawTypes.js';
import { TerminalSearchOverlay } from './TerminalSearchOverlay.js';
import 'xterm/css/xterm.css';

interface TerminalViewProps {
  tmuxSessionName: string;
  onSessionExit: (sessionName: string, exitCode: number) => void;
  terminalFocusRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref for external callers (e.g. App.tsx Ctrl+F handler) to open the search overlay.
   *  TerminalView registers a callback on mount and clears it on unmount. */
  searchOpenRef?: React.MutableRefObject<(() => void) | null>;
  /** Whether browser notifications are enabled. Controlled by useBrowserNotifications. */
  notificationsEnabled?: boolean;
  /** Callback to toggle notification opt-in. Requests permission on first enable. */
  onToggleNotifications?: () => void;
  /** Current browser notification permission state, or 'unsupported' if Notification API is unavailable. */
  notificationPermission?: NotificationPermission | 'unsupported';
  /** Lifecycle status of the instance — used to show contextual overlays. */
  instanceStatus?: AgentInstanceStatus;
  /** Agent name — shown in lifecycle overlays for context. */
  agentName?: string;
  /** Callback to trigger a restart for the current stopped/error session. */
  onRestart?: () => void;
  /** Agent ID — passed to recording API on start. */
  agentId?: string;
  /** Project path — passed to recording API on start. */
  projectPath?: string;
  /** Callback when a recording completes — so RecordingLibrary can refresh. */
  onRecordingComplete?: () => void;
  /** Context fill data for the agent running this session. */
  contextFill?: AgentContextFill | null;
  /** Working directory from agent-registry.json, with home prefix stripped. */
  workingDirectory?: string | null;
  /** Callback triggered after successful session rotation — e.g. to refetch agent config. */
  onRotateComplete?: () => void;
}

// Strip mouse-tracking enable sequences so xterm.js uses native selection
// instead of forwarding mouse events to tmux (which has `set -g mouse on`).
const MOUSE_TRACKING_ENABLE_PATTERN = /\x1b\[\?(1000|1002|1003|1006)h/g;

const IS_TOUCH_DEVICE = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const FONT_SIZES: Record<string, number> = { small: 10, medium: 13, large: 16 };
const FONT_SIZE_LABELS = ['small', 'medium', 'large'] as const;
const FONT_SIZE_DISPLAY: Record<string, string> = { small: 'S', medium: 'M', large: 'L' };
const FONT_SIZE_STORAGE_KEY = 'warden:terminal-font-size';

function getStoredFontSize(): string {
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (stored && stored in FONT_SIZES) return stored;
  } catch {
    // localStorage unavailable
  }
  return 'medium';
}

function getResponsiveFontSize(): number {
  return FONT_SIZES[getStoredFontSize()] ?? 13;
}

const MOBILE_KEYS: Array<{ label: string; seq: string }> = [
  { label: 'Enter', seq: '\r' },
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
  terminalRef: React.MutableRefObject<Terminal | null>;
}

function MobileKeyToolbar({ sendInput, selectMode, onToggleCopyMode, terminalRef }: MobileKeyToolbarProps) {
  const [showPasteInput, setShowPasteInput] = useState(false);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  const refocusTerminal = () => {
    terminalRef.current?.textarea?.focus();
  };

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
    <div className="sticky bottom-0 z-40 flex-shrink-0 flex flex-col bg-warden-panel border-t border-warden-border safe-bottom">
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
            onTouchStart={(event) => { event.preventDefault(); refocusTerminal(); setShowPasteInput(false); }}
            onClick={() => setShowPasteInput(false)}
            className="px-2 py-1.5 min-h-[36px] text-xs text-warden-text-dim bg-warden-border/40 rounded"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto touch-scroll">
        <button
          onTouchStart={(event) => { event.preventDefault(); refocusTerminal(); onToggleCopyMode(); }}
          className={`px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono rounded whitespace-nowrap select-none ${
            selectMode
              ? 'bg-warden-accent/30 text-warden-accent border border-warden-accent/50'
              : 'text-warden-text-dim bg-warden-border/40 active:bg-warden-accent/30 active:text-warden-accent'
          }`}
        >
          {selectMode ? 'Close' : 'Copy'}
        </button>
        <button
          onTouchStart={(event) => { event.preventDefault(); refocusTerminal(); handlePaste(); }}
          className="px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono text-warden-text-dim bg-warden-border/40 rounded active:bg-warden-accent/30 active:text-warden-accent whitespace-nowrap select-none"
        >
          Paste
        </button>
        <button
          onTouchStart={(event) => { event.preventDefault(); refocusTerminal(); sendInput('\x1b'); }}
          title="Exit scroll/copy mode"
          className="px-2 py-1.5 min-w-[40px] min-h-[36px] text-xs font-mono text-warden-text-dim bg-warden-border/40 rounded active:bg-warden-accent/30 active:text-warden-accent whitespace-nowrap select-none"
        >
          Esc
        </button>
        {MOBILE_KEYS.map((key) => (
          <button
            key={key.label}
            onTouchStart={(event) => {
              event.preventDefault();
              refocusTerminal();
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

/** Estimate terminal dimensions from the container element and current font size.
 *  This is used to pre-configure the PTY at approximately the correct size before
 *  xterm.js is fully initialized, avoiding the garbled-repaint window. */
function estimateTerminalDimensions(
  container: HTMLElement | null,
  fontSize: number,
): { cols: number; rows: number } {
  if (!container) return { cols: 120, rows: 40 };
  const { clientWidth, clientHeight } = container;
  if (clientWidth === 0 || clientHeight === 0) return { cols: 120, rows: 40 };
  // Approximate character cell dimensions for monospace fonts at the given size.
  // These match xterm.js defaults for lineHeight 1.2.
  const charWidth = fontSize * 0.6;
  const charHeight = fontSize * 1.2;
  const cols = Math.max(40, Math.floor(clientWidth / charWidth));
  const rows = Math.max(10, Math.floor(clientHeight / charHeight));
  return { cols, rows };
}

// TerminalView is wrapped in React.memo to bail out of re-renders when all props are
// reference-equal, preventing xterm.js from being disturbed by background polling.
function TerminalViewInner({
  tmuxSessionName,
  onSessionExit,
  terminalFocusRef,
  searchOpenRef,
  notificationsEnabled = false,
  onToggleNotifications,
  notificationPermission = 'unsupported',
  instanceStatus,
  agentName,
  onRestart,
  agentId,
  projectPath,
  onRecordingComplete,
  contextFill,
  workingDirectory,
  onRotateComplete,
}: TerminalViewProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);
  const [fontSizeLabel, setFontSizeLabel] = useState<string>(() => getStoredFontSize());
  const { isRotating, result: rotateResult, confirmPending, requestRotate } = useRotateSession(agentId, onRotateComplete);

  const cycleFontSize = useCallback(() => {
    setFontSizeLabel((current) => {
      const currentIndex = FONT_SIZE_LABELS.indexOf(current as typeof FONT_SIZE_LABELS[number]);
      const nextIndex = (currentIndex + 1) % FONT_SIZE_LABELS.length;
      const nextLabel = FONT_SIZE_LABELS[nextIndex];
      const nextSize = FONT_SIZES[nextLabel];

      // Update terminal font size immediately
      const terminal = terminalInstanceRef.current;
      const fitAddon = fitAddonRef.current;
      if (terminal && fitAddon) {
        terminal.options.fontSize = nextSize;
        try {
          fitAddon.fit();
        } catch {
          // Container may have zero dimensions
        }
      }

      // Persist preference
      try {
        localStorage.setItem(FONT_SIZE_STORAGE_KEY, nextLabel);
      } catch {
        // localStorage unavailable
      }

      return nextLabel;
    });
  }, []);

  const handleTerminalOutput = useCallback((data: string) => {
    const filtered = data.replace(MOUSE_TRACKING_ENABLE_PATTERN, '');
    terminalInstanceRef.current?.write(filtered);
  }, []);

  // Called when the server signals a fresh or reused PTY connection.
  // Clear the xterm.js display and refit synchronously BEFORE the tmux screen
  // dump arrives, so content renders at the correct dimensions (not garbled).
  const handleTerminalReset = useCallback(() => {
    const terminal = terminalInstanceRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal) return;
    terminal.reset();
    // Fit synchronously — deferring to rAF creates a window where tmux output
    // arrives and renders at stale dimensions, causing garbled/wrapped text.
    if (fitAddon) {
      try {
        fitAddon.fit();
      } catch {
        // Container may have zero dimensions
      }
    }
  }, []);

  const {
    isRecording,
    formattedElapsed,
    startRecording,
    stopRecording,
    sessionExited,
  } = useRecordingState({
    sessionName: tmuxSessionName,
    agentId: agentId ?? '',
    agentName: agentName ?? '',
    projectPath: projectPath ?? '',
    onRecordingStopped: () => onRecordingComplete?.(),
  });

  const handleSessionExit = useCallback((exitCode: number) => {
    sessionExited();
    onSessionExit(tmuxSessionName, exitCode);
  }, [tmuxSessionName, onSessionExit, sessionExited]);

  // getDimensions is called inside useTerminalSocket's effect at socket-creation time,
  // so it reads the actual rendered container dimensions rather than a stale render-phase value.
  const fontSizeLabelRef = useRef(fontSizeLabel);
  fontSizeLabelRef.current = fontSizeLabel;
  const getDimensions = useCallback(() => {
    return estimateTerminalDimensions(
      terminalContainerRef.current,
      FONT_SIZES[fontSizeLabelRef.current] ?? 13,
    );
  }, []);

  const { sendInput, sendResize, isConnected, isReconnecting, showConnectingOverlay } = useTerminalSocket({
    sessionName: tmuxSessionName,
    onTerminalOutput: handleTerminalOutput,
    onTerminalReset: handleTerminalReset,
    onSessionExit: handleSessionExit,
    getDimensions,
  });

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      const terminal = terminalInstanceRef.current;
      const cols = terminal?.cols ?? 220;
      const rows = terminal?.rows ?? 50;
      await startRecording(cols, rows);
    }
  }, [isRecording, startRecording, stopRecording]);

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
      // overviewRulerWidth must be set at construction time — the overview ruler canvas
      // is never created without it, so scrollbar gutter markers are silently ignored.
      overviewRulerWidth: 15,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    terminal.open(terminalContainerRef.current);
    terminal.focus();

    // Suppress shortcut keys from being forwarded to the PTY.
    // The global useGlobalHotkeys handler (capture phase) handles these keys
    // at the document level. Without this guard, xterm.js also processes the
    // keydown event and sends escape sequences (e.g. ^1, ^[, ^]) to the PTY.
    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+F: suppress browser find AND PTY forwarding
      if (event.ctrlKey && (event.key === 'f' || event.key === 'F')) {
        return false;
      }
      // Ctrl+B: suppress PTY forwarding (Ctrl+B is tmux prefix by default in some configs)
      if (event.ctrlKey && (event.key === 'b' || event.key === 'B')) {
        return false;
      }
      // Ctrl+1..9: suppress PTY forwarding
      if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
        return false;
      }
      // Ctrl+[ and Ctrl+]: suppress PTY forwarding
      if (event.ctrlKey && (event.key === '[' || event.key === ']')) {
        return false;
      }
      return true;
    });

    // Fit synchronously so the terminal has correct dimensions before the server
    // starts sending PTY output. Deferring to rAF creates a window where tmux dumps
    // the screen at estimated dimensions, causing garbled/wrapped text.
    try {
      fitAddon.fit();
      sendResize(terminal.cols, terminal.rows);
    } catch {
      // Container may not have dimensions yet (zero-size layout) — fall back to rAF
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          sendResize(terminal.cols, terminal.rows);
        } catch {
          // Still no dimensions — accept default sizing
        }
      });
    }

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
          // Scroll down faster (3x) to help escape long scrollback buffers
          const adjustedLines = linesToScroll > 0 ? linesToScroll : linesToScroll * 3;
          // Natural scrolling: finger up = see newer content = scroll down in tmux
          sendScrollToTmux(-adjustedLines);
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

    // Resize handler — refit terminal on window resize AND visualViewport resize
    // (iOS Safari fires visualViewport.resize when keyboard opens, not window.resize).
    // Guard against zero-dimension containers: if the container has been collapsed
    // (e.g. keyboard-open layout transition in progress), skip the fit to avoid
    // sending a degenerate resize to the PTY that corrupts tmux layout.
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refitTerminal = () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          const containerEl = terminalContainerRef.current;
          if (!containerEl || containerEl.clientWidth < 20 || containerEl.clientHeight < 20) {
            // Container is in a degenerate layout state (e.g. mid-transition).
            // Skip this fit cycle — the next resize event will trigger another attempt.
            return;
          }
          try {
            fitAddon.fit();
          } catch {
            // Container may have zero dimensions during layout transitions
          }
        });
      }, 100);
    };
    window.addEventListener('resize', refitTerminal);
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', refitTerminal);
    }

    return () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      window.removeEventListener('resize', refitTerminal);
      if (visualViewport) {
        visualViewport.removeEventListener('resize', refitTerminal);
      }
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
      searchAddonRef.current = null;
    };
  }, [tmuxSessionName, sendInput, sendResize]);

  useEffect(() => {
    if (!showCopiedToast) return;
    const timer = setTimeout(() => setShowCopiedToast(false), 1500);
    return () => clearTimeout(timer);
  }, [showCopiedToast]);

  // Register a focus callback so external callers (Plan 02 keyboard shortcuts) can
  // return keyboard focus to the terminal without holding a ref to the xterm instance.
  useEffect(() => {
    if (!terminalFocusRef) return;
    terminalFocusRef.current = () => {
      terminalInstanceRef.current?.focus();
    };
    return () => {
      if (terminalFocusRef.current) {
        terminalFocusRef.current = null;
      }
    };
  }, [terminalFocusRef]);

  // Register search-open callback so external callers (App.tsx Ctrl+F handler) can
  // open the search overlay without holding internal TerminalView state.
  useEffect(() => {
    if (!searchOpenRef) return;
    searchOpenRef.current = () => setIsSearchOpen(true);
    return () => {
      searchOpenRef.current = null;
    };
  }, [searchOpenRef]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-warden-success' : isReconnecting ? 'bg-warden-warning animate-pulse' : 'bg-warden-error'}`} />
          <span className="text-xs text-warden-text-dim font-mono">{tmuxSessionName}</span>
          {contextFill?.fillPercentage != null && (
            <>
              <div
                className="w-12 h-1.5 rounded-full bg-warden-border/50 overflow-hidden flex-shrink-0"
                title={`Context: ${contextFill.fillPercentage}% (${(contextFill.totalTokens ?? 0).toLocaleString()} / ${contextFill.contextTokens.toLocaleString()} tokens)`}
              >
                <div
                  className={`h-full rounded-full ${
                    contextFill.fillPercentage > 75 ? 'bg-warden-error' :
                    contextFill.fillPercentage > 50 ? 'bg-amber-500' :
                    'bg-warden-success'
                  }`}
                  style={{ width: `${Math.min(contextFill.fillPercentage, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono flex-shrink-0 ${
                contextFill.fillPercentage > 75 ? 'text-warden-error' :
                contextFill.fillPercentage > 50 ? 'text-amber-500' :
                'text-warden-text-dim'
              }`}>{contextFill.fillPercentage}%</span>
            </>
          )}
          {workingDirectory && (
            <span className="text-[10px] text-warden-text-dim/50 font-mono truncate max-w-[200px] hidden sm:inline" title={workingDirectory}>
              {workingDirectory}
            </span>
          )}
          {agentId && (
            <button
              onClick={() => { void requestRotate(); }}
              disabled={isRotating}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                isRotating
                  ? 'text-warden-warning bg-warden-warning/10 cursor-wait'
                  : confirmPending
                    ? 'text-warden-warning bg-warden-warning/10'
                    : rotateResult
                      ? rotateResult.success
                        ? 'text-warden-success bg-warden-success/10'
                        : 'text-warden-error bg-warden-error/10'
                      : 'text-warden-text-dim hover:text-warden-text bg-warden-border/30'
              }`}
              title={
                isRotating ? 'Rotating session...'
                  : confirmPending ? 'Click again to confirm rotation'
                  : rotateResult ? rotateResult.message
                  : 'Rotate OpenClaw session (creates new session ID)'
              }
            >
              {isRotating ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 border border-warden-warning border-t-transparent rounded-full animate-spin" />
                  Rotating...
                </span>
              ) : confirmPending ? (
                <span>Confirm?</span>
              ) : rotateResult ? (
                <span>{rotateResult.success ? 'Rotated' : 'Failed'}</span>
              ) : (
                'Rotate'
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Bell icon notification toggle — hidden when Notification API is unsupported */}
          {notificationPermission !== 'unsupported' && onToggleNotifications && (
            <button
              onClick={onToggleNotifications}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                notificationsEnabled
                  ? 'text-warden-accent bg-warden-accent/10'
                  : notificationPermission === 'denied'
                    ? 'text-warden-text-dim/40 cursor-not-allowed'
                    : 'text-warden-text-dim hover:text-warden-text bg-warden-border/30'
              }`}
              title={
                notificationPermission === 'denied'
                  ? 'Notifications blocked — enable in browser settings'
                  : notificationsEnabled
                    ? 'Disable browser notifications'
                    : 'Enable browser notifications for permission prompts'
              }
              aria-label="Toggle browser notifications"
              disabled={notificationPermission === 'denied'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M8 1.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.018.018 0 0 0 .015.027h10.964a.018.018 0 0 0 .015-.027l-1.703-2.556a1.73 1.73 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5ZM6.5 13a1.5 1.5 0 0 0 3 0h-3Z" />
              </svg>
            </button>
          )}
          {/* Recording indicator and toggle button */}
          <button
            onClick={() => { void handleToggleRecording(); }}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
              isRecording
                ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                : 'text-warden-text-dim hover:text-warden-text bg-warden-border/30'
            }`}
            title={isRecording ? 'Stop recording' : 'Start recording this session'}
          >
            {isRecording ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="font-mono">REC {formattedElapsed}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500/50 flex-shrink-0" />
                <span>REC</span>
              </>
            )}
          </button>
          <button
            onClick={cycleFontSize}
            className="px-2 py-0.5 text-[10px] text-warden-text-dim hover:text-warden-text bg-warden-border/30 rounded transition-colors"
            title={`Font size: ${fontSizeLabel}`}
          >
            Aa {FONT_SIZE_DISPLAY[fontSizeLabel]}
          </button>
          <span className="text-[10px] text-warden-text-dim/40 hidden sm:inline">Alt+click to position cursor</span>
        </div>
      </div>

      {/* Terminal content area — overlays scoped here, toolbar stays outside */}
      <div className="relative flex-1 min-h-0 min-w-0">
        {/* Search overlay — floats above the terminal in top-right corner.
            Query persists across close/reopen within the same session.
            Unmounts on session switch (TerminalView is keyed by tmuxSessionName). */}
        {isSearchOpen && (
          <TerminalSearchOverlay
            searchAddonRef={searchAddonRef}
            onClose={() => setIsSearchOpen(false)}
            initialQuery={searchQuery}
            onQueryChange={setSearchQuery}
            terminalFocusRef={terminalFocusRef}
          />
        )}

        {showConnectingOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/80 z-10">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 border-2 ${isReconnecting ? 'border-warden-warning' : 'border-warden-accent'} border-t-transparent rounded-full animate-spin`} />
              <span className="text-warden-text-dim text-sm">
                {isReconnecting ? 'Reconnecting' : 'Connecting'} to {tmuxSessionName}...
              </span>
            </div>
          </div>
        )}

        {/* Lifecycle overlays — shown for transitional/terminal states */}
        {instanceStatus === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/80 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-warden-warning border-t-transparent rounded-full animate-spin" />
              <span className="text-warden-warning text-sm font-medium">
                Starting {agentName ?? tmuxSessionName}...
              </span>
              <span className="text-warden-text-dim/60 text-xs">Waiting for tmux session to appear</span>
            </div>
          </div>
        )}

        {instanceStatus === 'stopping' && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/60 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-warden-error/60 border-t-transparent rounded-full animate-spin" />
              <span className="text-warden-text-dim text-sm">Stopping session...</span>
            </div>
          </div>
        )}

        {instanceStatus === 'stopped' && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/90 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warden-idle/20 flex items-center justify-center">
                <span className="text-warden-text-dim text-lg">&#9632;</span>
              </div>
              <span className="text-warden-text-dim text-sm font-medium">Session stopped</span>
              {onRestart && (
                <button
                  onClick={onRestart}
                  className="mt-1 px-4 py-1.5 text-sm bg-warden-warning/20 text-warden-warning rounded hover:bg-warden-warning/30 transition-colors"
                >
                  Restart Session
                </button>
              )}
            </div>
          </div>
        )}

        {instanceStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/90 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warden-error/20 flex items-center justify-center">
                <span className="text-warden-error text-lg">&#33;</span>
              </div>
              <span className="text-warden-error text-sm font-medium">Session error</span>
              {onRestart && (
                <button
                  onClick={onRestart}
                  className="mt-1 px-4 py-1.5 text-sm bg-warden-warning/20 text-warden-warning rounded hover:bg-warden-warning/30 transition-colors"
                >
                  Restart Session
                </button>
              )}
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
          terminalRef={terminalInstanceRef}
        />
      )}
    </div>
  );
}

export const TerminalView = memo(TerminalViewInner);
