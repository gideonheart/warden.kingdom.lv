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

export type AgentInstanceStatus = 'active' | 'idle' | 'stopped' | 'error' | 'starting' | 'stopping';

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

export interface TokenUsageRow {
  agentId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

export type BurnWindow = 'today' | '2day' | '7day';

export interface BurnRateEntry {
  agentId: string;
  windowCostUsd: number;
  burnRatePerHour: number;
  projectedDailyUsd: number;
  projectedWeeklyUsd: number;
}

export interface BudgetConfig {
  agentId: string;
  dailyBudgetUsd: number;
}

export interface BudgetAlertStatus {
  agentId: string;
  todayCostUsd: number;
  dailyBudgetUsd: number;
  budgetPct: number;
  alertLevel: 'ok' | 'warning' | 'exceeded';
}
