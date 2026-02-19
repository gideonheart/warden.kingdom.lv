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
