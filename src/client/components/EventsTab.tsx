import { useMemo, useState, useEffect } from 'react';
import type { GsdDisplayEvent } from '@shared/gsdTypes.js';
import { useGsdEventFeed, useGsdEventSources } from '../hooks/useGsdEventFeed.js';
import { groupRawEvents } from '../utils/gsdEventGrouping.js';

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
    <ol className="mt-2 space-y-4 list-none pl-0">
      {questions.map((q, index) => {
        const selectedAnswers = q.answer
          ? (q.multiSelect ? q.answer.split(', ') : [q.answer])
          : [];

        return (
          <li key={index} className="border-l-2 border-purple-700/40 pl-3">
            {/* Question number + header */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-bold text-purple-400 shrink-0">
                Q{index + 1}.
              </span>
              {q.header && (
                <span className="text-xs font-semibold text-warden-text-dim uppercase tracking-wide">
                  {q.header}
                </span>
              )}
            </div>

            {/* Question text */}
            <div className="text-sm text-warden-text mb-2">{q.question}</div>

            {/* Options as numbered list */}
            <ol className="space-y-1 list-none pl-0">
              {q.options.map((option, optIndex) => {
                const isSelected = selectedAnswers.includes(option.label);
                return (
                  <li key={optIndex} className="flex items-start gap-2">
                    <span className={`shrink-0 text-xs font-mono mt-0.5 ${isSelected ? 'text-warden-accent' : 'text-warden-text-dim'}`}>
                      {isSelected ? '>' : ' '}{optIndex + 1}.
                    </span>
                    <div className="min-w-0">
                      <span className={`text-sm ${isSelected ? 'text-warden-accent font-semibold' : 'text-warden-text-dim'}`}>
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-xs text-warden-text-dim ml-2">
                          — {option.description}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Selected answer callout */}
            {q.answer && (
              <div className="mt-2 flex items-baseline gap-2 bg-warden-accent/10 border border-warden-accent/20 rounded px-2 py-1">
                <span className="text-xs text-warden-accent font-semibold shrink-0">Selected:</span>
                <span className="text-sm text-warden-accent">{q.answer}</span>
              </div>
            )}

            {/* User notes */}
            {q.notes && (
              <div className="mt-1 text-xs text-warden-text-dim italic bg-warden-panel/50 rounded px-2 py-1">
                {q.notes}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File size formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EventsTab — main component
// ─────────────────────────────────────────────────────────────────────────────

export function EventsTab() {
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { sources } = useGsdEventSources();
  const { events: rawEvents, isLoading, error } = useGsdEventFeed(selectedSource || undefined);

  const displayEvents = useMemo(() => groupRawEvents(rawEvents), [rawEvents]);

  // Derive unique session values from all loaded events
  const uniqueSessions = useMemo(() => {
    const sessions = new Set(displayEvents.map((e) => e.session));
    return Array.from(sessions).sort();
  }, [displayEvents]);

  // Apply session filter on top of source-filtered events
  const filteredEvents = useMemo(() => {
    if (!selectedSession) return displayEvents;
    return displayEvents.filter((e) => e.session === selectedSession);
  }, [displayEvents, selectedSession]);

  // Reset session filter when source changes
  useEffect(() => {
    setSelectedSession('');
  }, [selectedSource]);

  const sourceSelector = sources.length > 0 ? (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <label className="text-sm text-warden-text-dim shrink-0">Source:</label>
      <select
        value={selectedSource}
        onChange={(e) => setSelectedSource(e.target.value)}
        className="bg-warden-panel border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
      >
        <option value="">All agents</option>
        {sources.map((s) => (
          <option key={s.filename} value={s.filename}>
            {s.label} ({formatBytes(s.sizeBytes)})
          </option>
        ))}
      </select>
      <label className="text-sm text-warden-text-dim shrink-0">Session:</label>
      <select
        value={selectedSession}
        onChange={(e) => setSelectedSession(e.target.value)}
        className="bg-warden-panel border border-warden-border rounded px-2 py-1 text-sm text-warden-text"
      >
        <option value="">All sessions</option>
        {uniqueSessions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  ) : null;

  if (isLoading && rawEvents.length === 0) {
    return (
      <div>
        {sourceSelector}
        <p className="text-sm text-warden-text-dim">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {sourceSelector}
        <p className="text-sm text-red-400">Error loading events: {error}</p>
      </div>
    );
  }

  if (displayEvents.length === 0) {
    return (
      <div>
        {sourceSelector}
        <p className="text-sm text-warden-text-dim">
          No agent events found. Events appear as agents perform actions.
        </p>
      </div>
    );
  }

  return (
    <div>
      {sourceSelector}

      {filteredEvents.length === 0 && selectedSession && (
        <p className="text-sm text-warden-text-dim mb-2">
          No events for session &quot;{selectedSession}&quot;.
        </p>
      )}

      {/* Event list */}
      <div className="space-y-0 divide-y divide-warden-border/30">
        {filteredEvents.map((event) => {
          let displayTime = event.timestamp;
          try {
            const date = new Date(event.timestamp);
            displayTime = date.toTimeString().slice(0, 8);
          } catch {
            // Keep raw timestamp if parse fails
          }

          // Shorten session name: cap to 20 chars
          const shortSession = event.session.length > 20
            ? event.session.slice(0, 20) + '...'
            : event.session;

          const isExpanded = event.id === expandedId;

          function toggleExpand() {
            setExpandedId(isExpanded ? null : event.id);
          }

          return (
            <div key={event.id} className="hover:bg-warden-border/10 transition-colors">
              {/* Summary row — clickable to expand */}
              <div
                role="button"
                tabIndex={0}
                onClick={toggleExpand}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(); }}
                className="cursor-pointer flex items-baseline gap-3 py-1.5 px-1"
              >
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

                {/* Expand chevron */}
                <span
                  className={`text-warden-text-dim text-xs shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                >
                  &#9660;
                </span>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="bg-warden-bg/50 border-t border-warden-border/30 px-4 py-2 text-xs space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <span className="text-warden-text-dim">Session: </span>
                      <span className="font-mono text-warden-text">{event.session}</span>
                    </div>
                    <div>
                      <span className="text-warden-text-dim">Time: </span>
                      <span className="font-mono text-warden-text">{event.timestamp}</span>
                    </div>
                    {event.toolName && (
                      <div>
                        <span className="text-warden-text-dim">Tool: </span>
                        <span className="text-warden-text">{event.toolName}</span>
                      </div>
                    )}
                  </div>

                  {event.detail && (
                    <div>
                      <span className="text-warden-text-dim block mb-1">Detail:</span>
                      <pre className="font-mono bg-warden-bg rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-warden-text">
                        {event.detail}
                      </pre>
                    </div>
                  )}

                  {event.error && (
                    <div>
                      <span className="text-red-400 block mb-1">Error:</span>
                      <pre className="font-mono bg-red-900/20 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-red-300">
                        {event.error}
                      </pre>
                    </div>
                  )}

                  {/* AskUserQuestion Q&A — only shown in expanded view */}
                  {event.eventType === 'ask_question' && event.questions && event.questions.length > 0 && (
                    <QuestionDisplay questions={event.questions} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
