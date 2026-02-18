import { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';

const MAX_RAW_LINES = 200;

export interface HookEvent {
  timestamp: string;
  hookScript: string;
  hookEventName: string;
  agentId: string | null;
  tmuxSession: string | null;
  state: string | null;
}

export function parseHookEvents(lines: string[], maxEvents: number): HookEvent[] {
  const events: HookEvent[] = [];
  let current: Partial<HookEvent> | null = null;

  for (const line of lines) {
    // Detect FIRED line — starts a new event group
    // Format: [2026-02-18T05:23:22Z] [stop-hook.sh] FIRED — PID=...
    const firedMatch = line.match(/^\[(.+?)\] \[(.+?)\] FIRED/);
    if (firedMatch) {
      if (current?.timestamp) events.push(current as HookEvent);
      current = {
        timestamp: firedMatch[1],
        hookScript: firedMatch[2],
        hookEventName: '',
        agentId: null,
        tmuxSession: null,
        state: null,
      };
      continue;
    }

    if (!current) continue;

    // Extract fields from continuation lines
    const eventNameMatch = line.match(/hook_event_name=(\S+)/);
    if (eventNameMatch) current.hookEventName = eventNameMatch[1];

    const agentMatch = line.match(/agent_id=(\S+)/);
    if (agentMatch) current.agentId = agentMatch[1];

    const sessionMatch = line.match(/tmux_session=(\S+)/);
    if (sessionMatch) current.tmuxSession = sessionMatch[1];

    const stateMatch = line.match(/state=(\S+)/);
    if (stateMatch) current.state = stateMatch[1];
  }

  // Push last in-progress event
  if (current?.timestamp) events.push(current as HookEvent);

  // Return last N events, newest first
  return events.slice(-maxEvents).reverse();
}

export function useGsdHookFeed() {
  const [hookLines, setHookLines] = useState<string[]>([]);

  useEffect(() => {
    const socket = io('/gsd-hooks', {
      reconnection: true,
      reconnectionDelay: 2_000,
      reconnectionAttempts: 10,
    });

    socket.on('gsd-hooks:backfill', ({ lines }: { lines: string[] }) => {
      setHookLines(lines.slice(-MAX_RAW_LINES));
    });

    socket.on('gsd-hooks:lines', ({ lines }: { lines: string[] }) => {
      setHookLines((prev) => [...prev, ...lines].slice(-MAX_RAW_LINES));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const hookEvents = useMemo(() => parseHookEvents(hookLines, 20), [hookLines]);

  return { hookEvents, hookLines };
}
