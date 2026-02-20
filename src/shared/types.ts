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
