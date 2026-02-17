import { useState } from 'react';
import type { ActivityEvent, ActivityEventType } from '../../shared/types.js';

interface ActivityEventRowProps {
  event: ActivityEvent;
  onNavigateToSession?: (sessionName: string) => void;
}

const EVENT_TYPE_STYLES: Record<ActivityEventType, string> = {
  session_start: 'bg-warden-accent/20 text-warden-accent',
  session_stop: 'bg-warden-accent/20 text-warden-accent',
  prompt_sent: 'bg-purple-500/20 text-purple-400',
  tool_call: 'bg-blue-500/20 text-blue-400',
  file_edit: 'bg-green-500/20 text-green-400',
  bash_command: 'bg-yellow-500/20 text-yellow-400',
  operator_input: 'bg-orange-500/20 text-orange-400',
  error: 'bg-warden-error/20 text-warden-error',
};

const EVENT_TYPE_LABELS: Record<ActivityEventType, string> = {
  session_start: 'session_start',
  session_stop: 'session_stop',
  prompt_sent: 'prompt_sent',
  tool_call: 'tool_call',
  file_edit: 'file_edit',
  bash_command: 'bash_cmd',
  operator_input: 'op_input',
  error: 'error',
};

function SuccessIndicator({ success }: { success: boolean | null }) {
  if (success === true) {
    return <span className="w-5 text-center text-warden-success">&#10003;</span>;
  }
  if (success === false) {
    return <span className="w-5 text-center text-warden-error">&#10007;</span>;
  }
  return <span className="w-5 text-center text-warden-text-dim">&#8722;</span>;
}

function EventTypeBadge({ eventType }: { eventType: ActivityEventType }) {
  const style = EVENT_TYPE_STYLES[eventType] ?? 'bg-warden-border/50 text-warden-text-dim';
  const label = EVENT_TYPE_LABELS[eventType] ?? eventType;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium w-24 text-center inline-block truncate ${style}`}>
      {label}
    </span>
  );
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function parseMetadata(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

export function ActivityEventRow({ event, onNavigateToSession }: ActivityEventRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const canNavigateToTerminal =
    event.sessionName !== 'gateway' && event.eventType !== 'session_stop';

  const truncatedDetail =
    event.detail && event.detail.length > 2000
      ? event.detail.slice(0, 2000) + '\n...truncated'
      : event.detail;

  const parsedMetadata = parseMetadata(event.metadata);

  return (
    <div className="bg-warden-border/20 rounded hover:bg-warden-border/30 transition-colors">
      {/* Collapsed row - toggle on click */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded(!isExpanded); }}
        className="cursor-pointer"
      >
        {/* Desktop: horizontal row */}
        <div className="hidden sm:flex items-center gap-3 px-3 py-2 text-sm">
          <span className="text-warden-text-dim/60 text-xs font-mono w-36 truncate">
            {formatTimestamp(event.timestamp)}
          </span>
          <SuccessIndicator success={event.success} />
          <EventTypeBadge eventType={event.eventType} />
          <span className="text-warden-text-dim w-20 truncate text-xs">{event.agentId}</span>
          <span className="text-warden-text flex-1 truncate text-xs">{event.summary}</span>
          <span
            className={`text-warden-text-dim text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            &#9660;
          </span>
        </div>

        {/* Mobile: stacked card */}
        <div className="flex sm:hidden flex-col gap-1 px-3 py-2 min-h-[44px]">
          <div className="flex items-center gap-2">
            <SuccessIndicator success={event.success} />
            <EventTypeBadge eventType={event.eventType} />
            <span className="text-xs text-warden-text-dim truncate">{event.agentId}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-warden-text truncate flex-1">{event.summary}</span>
            <span className="text-warden-text-dim/60 text-xs font-mono shrink-0">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="bg-warden-bg/50 border-t border-warden-border px-4 py-3 text-sm space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-warden-text-dim">Session: </span>
              <span className="font-mono text-warden-text-dim">{event.sessionName}</span>
            </div>
            <div>
              <span className="text-warden-text-dim">Event type: </span>
              <span className="text-warden-text">{event.eventType}</span>
            </div>
            <div>
              <span className="text-warden-text-dim">Timestamp: </span>
              <span className="font-mono text-warden-text-dim">{event.timestamp}</span>
            </div>
            <div>
              <span className="text-warden-text-dim">Success: </span>
              <span className="text-warden-text">
                {event.success === true ? 'Yes' : event.success === false ? 'No' : 'Unknown'}
              </span>
            </div>
          </div>

          {truncatedDetail && (
            <div>
              <span className="text-xs text-warden-text-dim block mb-1">Detail:</span>
              <pre className="text-xs font-mono bg-warden-bg rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {truncatedDetail}
              </pre>
            </div>
          )}

          {parsedMetadata && (
            <div>
              <span className="text-xs text-warden-text-dim block mb-1">Metadata:</span>
              <div className="space-y-0.5">
                {Object.entries(parsedMetadata).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-warden-text-dim font-mono shrink-0">{key}:</span>
                    <span className="text-warden-text truncate">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canNavigateToTerminal && onNavigateToSession && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToSession(event.sessionName);
              }}
              className="px-3 py-1.5 min-h-[44px] text-xs bg-warden-accent/20 text-warden-accent rounded hover:bg-warden-accent/30 transition-colors"
            >
              Go to terminal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
