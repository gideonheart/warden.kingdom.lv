import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentStateHint, PressureLevel } from '@shared/gsdTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Color maps
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};

export const STATE_BADGE_COLORS: Record<AgentStateHint, string> = {
  working: 'bg-warden-accent text-white',
  idle: 'bg-warden-idle text-white',
  menu: 'bg-warden-warning text-warden-bg',
  permission_prompt: 'bg-warden-warning text-warden-bg',
  error: 'bg-warden-error text-white',
};

export const STATE_LABELS: Record<AgentStateHint, string> = {
  working: 'working',
  idle: 'idle',
  menu: 'menu',
  permission_prompt: 'perm',
  error: 'error',
};

export const PRESSURE_COLORS: Record<PressureLevel, string> = {
  ok: 'text-warden-success',
  warning: 'text-warden-warning',
  critical: 'text-warden-error',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

export function StateBadge({ state }: { state: AgentStateHint | null }) {
  if (state === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  const colorClass = STATE_BADGE_COLORS[state];
  const label = STATE_LABELS[state];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${colorClass}`}>{label}</span>
  );
}

export function PressureIndicator({
  percentage,
  level,
}: {
  percentage: number | null;
  level: PressureLevel | null;
}) {
  if (percentage === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  const colorClass = level ? PRESSURE_COLORS[level] : 'text-warden-text-dim';
  return <span className={`font-mono text-sm ${colorClass}`}>{percentage}%</span>;
}

export function PhaseProgress({
  phase,
  progress,
}: {
  phase: string | null;
  progress: number | null;
}) {
  if (phase === null && progress === null) {
    return <span className="text-warden-text-dim text-sm">—</span>;
  }
  return (
    <span className="font-mono text-sm text-warden-text-dim">
      P{phase}{progress !== null ? ` ${progress}%` : ''}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-0.5 rounded bg-warden-border/50 text-warden-text-dim hover:text-warden-text transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function BashHint({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <code className="text-xs text-warden-text-dim font-mono bg-warden-bg/50 px-2 py-1 rounded flex-1 overflow-x-auto whitespace-nowrap">
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  );
}
