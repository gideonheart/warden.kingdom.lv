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

export interface TokenUsageByModelRow {
  agentId: string;
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

export interface ModelComparisonRow {
  agentId: string;
  model: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export type TokenUsageExportRow = TokenUsageByModelRow;

export interface RecordingEntry {
  id: number;
  sessionName: string;
  agentId: string;
  agentName: string;
  projectPath: string;
  startedAt: string;      // ISO 8601 datetime
  stoppedAt: string | null;
  durationSecs: number | null;
  filePath: string;       // absolute path to .cast file
  fileSizeBytes: number | null;
  stopReason: 'manual' | 'session_ended' | null;
}
