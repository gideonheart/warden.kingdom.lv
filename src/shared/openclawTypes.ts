export interface OpenClawAgent {
  id: string;
  name: string;
  default?: boolean;
  workspace?: string;
  model?: string | { primary: string; fallbacks?: string[] };
  subagents?: { allowAgents?: string[]; maxConcurrent?: number };
}

export interface OpenClawAgentDefaults {
  maxConcurrent?: number;
  workspace?: string;
  model?: string | { primary: string; fallbacks?: string[] };
  subagents?: { maxConcurrent?: number };
}

export interface OpenClawTelegramTopic {
  topicId: string;
  systemPrompt?: string;
}

export interface OpenClawTelegramGroup {
  groupId: string;
  requireMention?: boolean;
  topics: Record<string, OpenClawTelegramTopic>;
}

export interface OpenClawConfig {
  agents: {
    defaults?: OpenClawAgentDefaults;
    list: OpenClawAgent[];
  };
  gateway: {
    mode: string;
    port: number;
    bind: string;
    auth?: {
      mode: string;
      token?: string;
    };
  };
  channels?: {
    telegram?: {
      enabled: boolean;
      groups?: Record<string, {
        requireMention?: boolean;
        topics?: Record<string, { systemPrompt?: string }>;
      }>;
    };
  };
}

export interface AgentDetails {
  id: string;
  name: string;
  workspace: string;
  model: string;
  isDefault: boolean;
  soulPreview: string | null;
}

export interface TopicMapping {
  agentId: string;
  agentName: string;
  groupId: string;
  topicId: string;
  systemPrompt: string;
}

export interface PromptRequest {
  agentId: string;
  prompt: string;
}

export interface PromptResponse {
  success: boolean;
  message?: string;
  error?: string;
}
