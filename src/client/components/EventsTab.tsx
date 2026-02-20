import { useMemo } from 'react';
import type { GsdRawEvent, GsdDisplayEvent } from '@shared/gsdTypes.js';
import { GSD_NOISE_EVENTS } from '@shared/gsdTypes.js';
import { useGsdEventFeed } from '../hooks/useGsdEventFeed.js';

// ─────────────────────────────────────────────────────────────────────────────
// Summary generation helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

function getToolInput(payload: Record<string, unknown>): Record<string, unknown> {
  return (payload.tool_input as Record<string, unknown>) ?? {};
}

interface AskQuestion {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect: boolean;
}

function buildToolSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Read':
    case 'Write': {
      const filePath = String(toolInput.file_path ?? '');
      return filePath ? filePath.split('/').pop() ?? filePath : toolName;
    }
    case 'Grep': {
      const pattern = String(toolInput.pattern ?? '');
      return pattern ? truncate(pattern, 60) : 'Grep';
    }
    case 'Bash': {
      const command = String(toolInput.command ?? '');
      return command ? truncate(command, 80) : 'Bash';
    }
    case 'Glob': {
      const pattern = String(toolInput.pattern ?? '');
      return pattern ? truncate(pattern, 60) : 'Glob';
    }
    case 'AskUserQuestion':
      return 'AskUserQuestion';
    default:
      return toolName;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouping: merge Pre+Post pairs into single display events
// ─────────────────────────────────────────────────────────────────────────────

function groupRawEvents(rawEvents: GsdRawEvent[]): GsdDisplayEvent[] {
  // Work on events in ascending order for correct Pre→Post pairing
  const ascending = [...rawEvents].reverse();

  // Map from tool_use_id to partially-built display event
  const toolMap = new Map<string, GsdDisplayEvent>();
  const orderedIds: string[] = [];
  const standaloneEvents: GsdDisplayEvent[] = [];

  for (const raw of ascending) {
    // Safety: skip noise events (already filtered server-side, belt-and-suspenders)
    if (GSD_NOISE_EVENTS.has(raw.event)) continue;

    const toolUseId = raw.payload.tool_use_id as string | undefined;
    const toolName = String(raw.payload.tool_name ?? '');
    const toolInput = getToolInput(raw.payload);

    if (raw.event === 'PreToolUse' && toolUseId) {
      if (toolName === 'AskUserQuestion') {
        const rawQuestions = (toolInput.questions as AskQuestion[]) ?? [];
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'ask_question',
          toolName,
          summary: 'AskUserQuestion',
          questions: rawQuestions.map((q) => ({
            question: q.question,
            header: q.header,
            options: q.options ?? [],
            multiSelect: q.multiSelect ?? false,
            answer: undefined,
            notes: undefined,
          })),
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      } else {
        const summary = buildToolSummary(toolName, toolInput);
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'tool',
          toolName,
          summary,
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      }
    } else if (raw.event === 'PostToolUse' && toolUseId) {
      const existing = toolMap.get(toolUseId);
      if (existing && existing.eventType === 'ask_question') {
        // Merge answer data from PostToolUse into question entries
        const toolResponse = (raw.payload.tool_response as Record<string, unknown>) ?? {};
        const answers = (toolResponse.answers as Record<string, string>) ?? {};
        const annotations = (toolResponse.annotations as Record<string, { notes?: string }>) ?? {};
        const updated: GsdDisplayEvent = {
          ...existing,
          questions: existing.questions?.map((q) => ({
            ...q,
            answer: answers[q.question] ?? undefined,
            notes: annotations[q.question]?.notes ?? undefined,
          })),
        };
        toolMap.set(toolUseId, updated);
      }
      // For regular tools, the PreToolUse entry is sufficient — no update needed
    } else if (raw.event === 'PostToolUseFailure' && toolUseId) {
      const errorMessage = String(raw.payload.error ?? raw.payload.stderr ?? 'Unknown error');
      const existing = toolMap.get(toolUseId);
      if (existing) {
        toolMap.set(toolUseId, {
          ...existing,
          eventType: 'tool_failure',
          error: truncate(errorMessage, 120),
        });
      } else {
        // PostToolUseFailure without matching Pre (outside read window) — standalone entry
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'tool_failure',
          toolName: toolName || undefined,
          summary: toolName || 'Tool failure',
          error: truncate(errorMessage, 120),
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      }
    } else {
      // Standalone event (no tool_use_id): lifecycle, prompts, etc.
      const id = `${raw.timestamp}-${raw.session}-${raw.event}`;
      let eventType: GsdDisplayEvent['eventType'] = 'lifecycle';
      let summary = '';

      switch (raw.event) {
        case 'UserPromptSubmit': {
          eventType = 'prompt';
          const prompt = String(raw.payload.prompt ?? '');
          summary = truncate(prompt, 200);
          break;
        }
        case 'SessionStart': {
          const source = String(raw.payload.source ?? '');
          summary = source ? `Session started (${source})` : 'Session started';
          break;
        }
        case 'Stop':
          summary = 'Agent stopped';
          break;
        case 'SessionEnd': {
          const reason = String(raw.payload.reason ?? '');
          summary = reason ? `Session ended (${reason})` : 'Session ended';
          break;
        }
        case 'SubagentStart': {
          const agentType = String(raw.payload.agent_type ?? raw.payload.subagent_type ?? 'subagent');
          summary = `Subagent ${agentType} started`;
          break;
        }
        case 'SubagentStop': {
          const agentType = String(raw.payload.agent_type ?? raw.payload.subagent_type ?? 'subagent');
          summary = `Subagent ${agentType} stopped`;
          break;
        }
        default:
          summary = raw.event;
      }

      standaloneEvents.push({
        id,
        timestamp: raw.timestamp,
        session: raw.session,
        eventType,
        summary,
      });
    }
  }

  // Combine tool events (in ascending order) with standalone events, then reverse to newest-first
  const toolEvents: GsdDisplayEvent[] = [];
  for (const id of orderedIds) {
    const entry = toolMap.get(id);
    if (entry) toolEvents.push(entry);
  }

  const allEvents = [...toolEvents, ...standaloneEvents];
  // Sort by timestamp descending (newest first)
  allEvents.sort((a, b) => {
    if (a.timestamp > b.timestamp) return -1;
    if (a.timestamp < b.timestamp) return 1;
    return 0;
  });

  return allEvents;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge colors per event type
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_BADGE_CLASSES: Record<GsdDisplayEvent['eventType'], string> = {
  tool: 'bg-blue-900/40 text-blue-300',
  tool_failure: 'bg-red-900/40 text-red-300',
  prompt: 'bg-green-900/40 text-green-300',
  ask_question: 'bg-purple-900/40 text-purple-300',
  lifecycle: 'bg-warden-border text-warden-text-dim',
};

const EVENT_BADGE_LABELS: Record<GsdDisplayEvent['eventType'], string> = {
  tool: 'tool',
  tool_failure: 'error',
  prompt: 'prompt',
  ask_question: 'ask',
  lifecycle: 'lifecycle',
};

// ─────────────────────────────────────────────────────────────────────────────
// AskUserQuestion renderer
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionDisplayProps {
  questions: NonNullable<GsdDisplayEvent['questions']>;
}

function QuestionDisplay({ questions }: QuestionDisplayProps) {
  return (
    <div className="mt-2 space-y-3 pl-2 border-l-2 border-purple-700/40">
      {questions.map((q, index) => {
        const selectedAnswers = q.answer
          ? (q.multiSelect ? q.answer.split(', ') : [q.answer])
          : [];

        return (
          <div key={index} className="space-y-1.5">
            {q.header && (
              <div className="text-xs font-semibold text-warden-text-dim uppercase tracking-wide">
                {q.header}
              </div>
            )}
            <div className="text-sm text-warden-text">{q.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((option, optIndex) => {
                const isSelected = selectedAnswers.includes(option.label);
                return (
                  <span
                    key={optIndex}
                    className={`px-2 py-0.5 rounded text-xs border ${
                      isSelected
                        ? 'bg-warden-accent/20 text-warden-accent border-warden-accent/40'
                        : 'bg-warden-panel text-warden-text-dim border-warden-border'
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </span>
                );
              })}
            </div>
            {q.notes && (
              <div className="text-xs text-warden-text-dim italic">{q.notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventsTab — main component
// ─────────────────────────────────────────────────────────────────────────────

export function EventsTab() {
  const { events: rawEvents, isLoading, error } = useGsdEventFeed();

  const displayEvents = useMemo(() => groupRawEvents(rawEvents), [rawEvents]);

  if (isLoading && rawEvents.length === 0) {
    return <p className="text-sm text-warden-text-dim">Loading events…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">Error loading events: {error}</p>;
  }

  if (displayEvents.length === 0) {
    return (
      <p className="text-sm text-warden-text-dim">
        No agent events found. Events appear as agents perform actions.
      </p>
    );
  }

  return (
    <div className="space-y-1 divide-y divide-warden-border/30">
      {displayEvents.map((event) => {
        let displayTime = event.timestamp;
        try {
          const date = new Date(event.timestamp);
          displayTime = date.toTimeString().slice(0, 8);
        } catch {
          // Keep raw timestamp if parse fails
        }

        // Shorten session name: strip anything after the 3rd hyphen-separated segment
        // e.g. "warden-main-4" stays, "agent-name-session-abc123" → "agent-name-ses"
        const shortSession = event.session.length > 20
          ? event.session.slice(0, 20) + '…'
          : event.session;

        return (
          <div key={event.id} className="py-1.5">
            <div className="flex items-baseline gap-3">
              {/* Time column */}
              <span className="text-warden-text-dim font-mono text-xs shrink-0 w-[70px]">
                {displayTime}
              </span>

              {/* Session column */}
              <span
                className="text-warden-text-dim text-xs font-mono shrink-0 w-[120px] truncate"
                title={event.session}
              >
                {shortSession}
              </span>

              {/* Event type badge */}
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-mono ${EVENT_BADGE_CLASSES[event.eventType]}`}
              >
                {event.toolName ?? EVENT_BADGE_LABELS[event.eventType]}
              </span>

              {/* Summary text */}
              <span className="text-warden-text text-sm flex-1 min-w-0 truncate">
                {event.summary}
              </span>
            </div>

            {/* Error details for tool_failure */}
            {event.eventType === 'tool_failure' && event.error && (
              <div className="mt-1 ml-[214px] text-xs text-red-400 font-mono">
                {event.error}
              </div>
            )}

            {/* AskUserQuestion Q&A rendering */}
            {event.eventType === 'ask_question' && event.questions && event.questions.length > 0 && (
              <div className="mt-1 ml-[214px]">
                <QuestionDisplay questions={event.questions} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
