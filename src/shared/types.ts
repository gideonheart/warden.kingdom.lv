export interface AgentInstance {
  id: number;
  agentId: string;
  agentName: string;
  tmuxSessionName: string;
  status: AgentInstanceStatus;
  projectPath: string;
  telegramTopicId: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export type AgentInstanceStatus = 'active' | 'idle' | 'stopped' | 'error';

export interface AgentInstanceCreateParams {
  agentId: string;
  agentName: string;
  tmuxSessionName: string;
  projectPath: string;
  telegramTopicId?: string;
}

export interface TmuxSessionInfo {
  sessionName: string;
  agentId: string;
  windowCount: number;
  createdAt: Date;
  isAttached: boolean;
}

export interface TerminalResizePayload {
  cols: number;
  rows: number;
}

export interface TerminalExitPayload {
  sessionName: string;
  exitCode: number;
}

export type ActivityEventType =
  | 'session_start'
  | 'session_stop'
  | 'prompt_sent'
  | 'operator_input'
  | 'tool_call'
  | 'file_edit'
  | 'bash_command'
  | 'error';

export interface ActivityEvent {
  id: number;
  instanceId: number | null;
  agentId: string;
  sessionName: string;
  eventType: ActivityEventType;
  timestamp: string;
  summary: string;
  detail: string | null;
  success: boolean | null;
  metadata: string | null;
}

export interface ActivityEventsResponse {
  events: ActivityEvent[];
  total: number;
}
