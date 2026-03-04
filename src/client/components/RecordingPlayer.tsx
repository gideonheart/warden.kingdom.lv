import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { RecordingEntry } from '@shared/types.js';
import 'xterm/css/xterm.css';

interface AsciicastFrame {
  time: number;   // seconds from recording start
  text: string;
}

interface RecordingPlayerProps {
  recording: RecordingEntry;
  onClose: () => void;
}

function parseAsciicast(content: string): { width: number; height: number; frames: AsciicastFrame[] } {
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { width: 220, height: 50, frames: [] };

  const header = JSON.parse(lines[0]) as { width?: number; height?: number };
  const width = header.width ?? 220;
  const height = header.height ?? 50;

  const frames: AsciicastFrame[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const [time, type, text] = JSON.parse(lines[i]) as [number, string, string];
      if (type === 'o') {
        frames.push({ time, text });
      }
    } catch {
      // Skip malformed frames
    }
  }

  return { width, height, frames };
}

const SPEED_OPTIONS = [1, 2, 4, 8] as const;
type Speed = typeof SPEED_OPTIONS[number];
const SKIP_SECONDS = 5;

export function RecordingPlayer({ recording, onClose }: RecordingPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const framesRef = useRef<AsciicastFrame[]>([]);
  const totalDurationRef = useRef<number>(0);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [currentTime, setCurrentTime] = useState(0);   // seconds into recording
  const [totalDuration, setTotalDuration] = useState(0);

  // Playback engine state
  const playbackRef = useRef<{
    frameIndex: number;
    virtualTime: number;    // virtual recording seconds elapsed
    wallStart: number;      // wall clock ms when play started
    virtualStart: number;   // virtual seconds when play started
    speed: Speed;
    rafId: number | null;
  }>({
    frameIndex: 0,
    virtualTime: 0,
    wallStart: 0,
    virtualStart: 0,
    speed: 1,
    rafId: null,
  });
  const isPlayingRef = useRef(false);
  const speedRef = useRef<Speed>(1);
  speedRef.current = speed;

  // Load recording content and initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    // Init terminal
    const terminal = new Terminal({
      theme: {
        background: '#0a0a1a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#4f46e5',
        black: '#0a0a1a', red: '#ef4444', green: '#22c55e', yellow: '#f59e0b',
        blue: '#3b82f6', magenta: '#a855f7', cyan: '#06b6d4', white: '#e2e8f0',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: false,
      scrollback: 5000,
      allowProposedApi: true,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    try { fitAddon.fit(); } catch { /* ok */ }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Fetch and parse recording
    fetch(`/api/recordings/${recording.id}/content`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load recording: ${r.status}`);
        return r.text();
      })
      .then((content) => {
        const { width, height, frames } = parseAsciicast(content);
        framesRef.current = frames;
        const duration = frames.length > 0 ? frames[frames.length - 1].time : (recording.durationSecs ?? 0);
        totalDurationRef.current = duration;
        setTotalDuration(duration);

        // Resize terminal to match recording dimensions
        try {
          terminal.resize(width, height);
          fitAddon.fit();
        } catch { /* ok */ }

        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load recording');
      });

    // Resize handler
    const handleResize = () => {
      try { fitAddon.fit(); } catch { /* ok */ }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (playbackRef.current.rafId !== null) cancelAnimationFrame(playbackRef.current.rafId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.id]);

  // RAF-based playback loop
  const tick = useCallback(() => {
    const pb = playbackRef.current;
    if (!isPlayingRef.current) return;

    const wallNow = performance.now();
    const wallElapsed = wallNow - pb.wallStart;
    const virtualElapsed = (wallElapsed / 1000) * pb.speed;
    pb.virtualTime = pb.virtualStart + virtualElapsed;

    const frames = framesRef.current;
    const terminal = terminalRef.current;

    // Write all frames up to current virtual time
    while (pb.frameIndex < frames.length && frames[pb.frameIndex].time <= pb.virtualTime) {
      terminal?.write(frames[pb.frameIndex].text);
      pb.frameIndex++;
    }

    // Update displayed time every ~100ms (not every frame for perf)
    setCurrentTime(Math.min(pb.virtualTime, totalDurationRef.current));

    // Check if playback reached the end
    if (pb.frameIndex >= frames.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentTime(totalDurationRef.current);
      return;
    }

    pb.rafId = requestAnimationFrame(tick);
  }, []);

  const startPlayback = useCallback(() => {
    const pb = playbackRef.current;
    pb.wallStart = performance.now();
    pb.virtualStart = pb.virtualTime;
    pb.speed = speedRef.current;
    isPlayingRef.current = true;
    setIsPlaying(true);
    pb.rafId = requestAnimationFrame(tick);
  }, [tick]);

  const pausePlayback = useCallback(() => {
    const pb = playbackRef.current;
    if (pb.rafId !== null) {
      cancelAnimationFrame(pb.rafId);
      pb.rafId = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Seek to a specific time (seconds)
  const seekTo = useCallback((targetTime: number) => {
    const pb = playbackRef.current;
    const frames = framesRef.current;
    const terminal = terminalRef.current;
    const wasPlaying = isPlayingRef.current;

    // Pause during seek
    if (wasPlaying) {
      if (pb.rafId !== null) cancelAnimationFrame(pb.rafId);
      pb.rafId = null;
      isPlayingRef.current = false;
    }

    const clampedTime = Math.max(0, Math.min(targetTime, totalDurationRef.current));

    // Reset terminal and replay all frames up to target time
    terminal?.reset();
    let newFrameIndex = 0;
    while (newFrameIndex < frames.length && frames[newFrameIndex].time <= clampedTime) {
      terminal?.write(frames[newFrameIndex].text);
      newFrameIndex++;
    }

    pb.frameIndex = newFrameIndex;
    pb.virtualTime = clampedTime;
    setCurrentTime(clampedTime);

    if (wasPlaying) {
      pb.wallStart = performance.now();
      pb.virtualStart = clampedTime;
      pb.speed = speedRef.current;
      isPlayingRef.current = true;
      setIsPlaying(true);
      pb.rafId = requestAnimationFrame(tick);
    }
  }, [tick]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pausePlayback();
    } else {
      // If at end, restart from beginning
      if (playbackRef.current.frameIndex >= framesRef.current.length && framesRef.current.length > 0) {
        seekTo(0);
        setTimeout(() => startPlayback(), 50);
      } else {
        startPlayback();
      }
    }
  }, [isPlaying, pausePlayback, seekTo, startPlayback]);

  const handleSpeedChange = useCallback((newSpeed: Speed) => {
    const pb = playbackRef.current;
    const wasPlaying = isPlayingRef.current;

    if (wasPlaying) {
      // Capture current virtual time before changing speed
      const wallNow = performance.now();
      const wallElapsed = wallNow - pb.wallStart;
      pb.virtualTime = pb.virtualStart + (wallElapsed / 1000) * pb.speed;
      if (pb.rafId !== null) cancelAnimationFrame(pb.rafId);
      pb.rafId = null;
      isPlayingRef.current = false;
    }

    setSpeed(newSpeed);
    speedRef.current = newSpeed;

    if (wasPlaying) {
      pb.wallStart = performance.now();
      pb.virtualStart = pb.virtualTime;
      pb.speed = newSpeed;
      isPlayingRef.current = true;
      setIsPlaying(true);
      pb.rafId = requestAnimationFrame(tick);
    }
  }, [tick]);

  // Timeline click handler
  const timelineRef = useRef<HTMLDivElement>(null);
  const handleTimelineClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const el = timelineRef.current;
    if (!el || totalDurationRef.current === 0) return;
    const rect = el.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    seekTo(fraction * totalDurationRef.current);
  }, [seekTo]);

  // Timeline drag (mousedown + mousemove on document)
  const isDraggingRef = useRef(false);
  const handleTimelineMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    handleTimelineClick(event);
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const el = timelineRef.current;
      if (!el || totalDurationRef.current === 0) return;
      const rect = el.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(fraction * totalDurationRef.current);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleTimelineClick, seekTo]);

  // Keyboard shortcuts (Space, Left/Right, 1/2/4/8)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if focus is in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (event.code === 'Space') {
        event.preventDefault();
        handlePlayPause();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        seekTo(playbackRef.current.virtualTime - SKIP_SECONDS);
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        seekTo(playbackRef.current.virtualTime + SKIP_SECONDS);
      } else if (event.key === '1') {
        handleSpeedChange(1);
      } else if (event.key === '2') {
        handleSpeedChange(2);
      } else if (event.key === '4') {
        handleSpeedChange(4);
      } else if (event.key === '8') {
        handleSpeedChange(8);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, seekTo, handleSpeedChange]);

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const progressFraction = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Player header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-2 py-0.5 text-[10px] text-warden-text-dim hover:text-warden-text bg-warden-border/30 rounded transition-colors"
          >
            &larr; Back to live
          </button>
          <span className="text-xs text-warden-text-dim font-mono truncate max-w-[200px]" title={recording.sessionName}>
            {recording.agentName || recording.agentId} / {recording.sessionName}
          </span>
        </div>
        <span className="text-[10px] text-warden-text-dim/50">Replay mode — read only</span>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />

        {!isLoaded && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/80 z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-warden-text-dim text-sm">Loading recording...</span>
            </div>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-warden-bg/90 z-10">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">Failed to load recording</p>
              <p className="text-warden-text-dim/60 text-xs">{loadError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Player controls */}
      <div className="flex flex-col gap-1 px-3 py-2 bg-warden-panel border-t border-warden-border">
        {/* Timeline */}
        <div
          ref={timelineRef}
          className="relative h-2 bg-warden-border/50 rounded-full cursor-pointer"
          onMouseDown={handleTimelineMouseDown}
        >
          <div
            className="absolute inset-y-0 left-0 bg-warden-accent rounded-full transition-none"
            style={{ width: `${progressFraction * 100}%` }}
          />
          {/* Scrub handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-warden-accent rounded-full shadow -translate-x-1/2 pointer-events-none"
            style={{ left: `${progressFraction * 100}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            disabled={!isLoaded}
            className="px-3 py-1 text-xs bg-warden-accent/20 text-warden-accent rounded hover:bg-warden-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>

          {/* Elapsed / Total */}
          <span className="text-xs text-warden-text-dim font-mono">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>

          <span className="flex-1" />

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-2 py-0.5 text-xs rounded transition-colors font-mono ${
                  speed === s
                    ? 'bg-warden-accent text-white font-bold'
                    : 'text-warden-text-dim bg-warden-border/30 hover:text-warden-text'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <span className="text-[10px] text-warden-text-dim/40 hidden sm:inline">Space=play/pause · &larr;/&rarr;=5s · 1/2/4/8=speed</span>
        </div>
      </div>
    </div>
  );
}
