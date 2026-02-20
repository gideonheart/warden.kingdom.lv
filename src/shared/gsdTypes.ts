// GSD shared types — single source of truth for client and server

export interface RegistryAgent {
  agent_id: string;
  enabled: boolean;
  working_directory: string;
  tmux_session_name: string;
  claude_launch_command: string;
  auto_wake: boolean;
  topic_id: number;
  openclaw_session_id: string;
  claude_resume_target: string;
  claude_post_launch_mode: string;
}

export interface GsdRegistry {
  global_status_openclaw_session_id: string;
  global_status_openclaw_session_key: string;
  agents: RegistryAgent[];
}

export type AgentStateHint = 'working' | 'idle' | 'menu' | 'permission_prompt' | 'error';

export type PressureLevel = 'ok' | 'warning' | 'critical';

// --- GSD Event Log Types ---

export type GsdEventType =
  | 'SessionStart' | 'Stop' | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'SubagentStart' | 'SubagentStop'
  | 'Notification' | 'PermissionRequest';

// Noise events to skip in display
export const GSD_NOISE_EVENTS: Set<string> = new Set(['Notification', 'PermissionRequest']);

export interface GsdRawEvent {
  timestamp: string;
  event: GsdEventType;
  session: string;
  payload: Record<string, unknown>;
}

// Metadata for a JSONL log file available as an event source
export interface GsdEventSource {
  filename: string;     // e.g. "agent_warden-kingdom_session_name-raw-events.jsonl"
  label: string;        // human-friendly label derived from filename, e.g. "agent_warden-kingdom_session_name"
  sizeBytes: number;    // file size in bytes
}

// Grouped display event — Pre+Post merged into one entry
export interface GsdDisplayEvent {
  id: string;             // tool_use_id or timestamp-based unique key
  timestamp: string;
  session: string;        // short session name
  eventType: 'tool' | 'tool_failure' | 'prompt' | 'ask_question' | 'lifecycle';
  toolName?: string;
  summary: string;        // one-line human-readable summary
  detail?: string;        // full detail text shown in expanded view (full command, full path, etc.)
  error?: string;         // for PostToolUseFailure
  // AskUserQuestion specifics
  questions?: Array<{
    question: string;
    header?: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
    answer?: string;       // from PostToolUse response
    notes?: string;        // from PostToolUse annotations
  }>;
}
