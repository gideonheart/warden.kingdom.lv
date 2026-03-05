// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoist mock functions so vi.mock factories can reference them ─────────────

const {
  mockGetBudgetAlertStatus,
  mockGetNotificationConfig,
  mockSendToTopic,
  mockIsRunning,
  mockGetTopicMappings,
} = vi.hoisted(() => ({
  mockGetBudgetAlertStatus: vi.fn(),
  mockGetNotificationConfig: vi.fn(),
  mockSendToTopic: vi.fn(),
  mockIsRunning: vi.fn().mockReturnValue(true),
  mockGetTopicMappings: vi.fn(),
}));

// ─── Mock dependencies before importing the module under test ────────────────

vi.mock('../../src/server/database/DatabaseConnection.js', () => ({
  database: {
    getBudgetAlertStatus: mockGetBudgetAlertStatus,
    getNotificationConfig: mockGetNotificationConfig,
  },
}));

vi.mock('../../src/server/services/TelegramBotService.js', () => ({
  telegramBotService: {
    sendToTopic: mockSendToTopic,
    isRunning: mockIsRunning,
  },
}));

vi.mock('../../src/server/services/OpenClawConfigReader.js', () => ({
  openClawConfigReader: {
    getTopicMappings: mockGetTopicMappings,
  },
}));

// ─── Import after mocks are in place ─────────────────────────────────────────

import { BudgetAlertPoller } from '../../src/server/services/BudgetAlertPoller.js';
import type { BudgetAlertStatus } from '../../src/shared/types.js';
import type { TopicMapping } from '../../src/shared/openclawTypes.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<BudgetAlertStatus> = {}): BudgetAlertStatus {
  return {
    agentId: 'gideon',
    todayCostUsd: 0,
    dailyBudgetUsd: 10,
    budgetPct: 0,
    alertLevel: 'ok',
    ...overrides,
  };
}

function makeMapping(agentId = 'gideon'): TopicMapping {
  return {
    agentId,
    agentName: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    groupId: '-1001234567890',
    topicId: '42',
    systemPrompt: '',
  };
}

function makeDefaultConfig(overrides: Partial<{ budgetAlertsEnabled: boolean; budgetCooldownMs: number }> = {}) {
  return {
    permissionAlertsEnabled: true,
    budgetAlertsEnabled: true,
    permissionCooldownMs: 120_000,
    budgetCooldownMs: 600_000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetAlertPoller', () => {
  let poller: BudgetAlertPoller;

  beforeEach(() => {
    poller = new BudgetAlertPoller();
    mockSendToTopic.mockResolvedValue(undefined);
    mockGetTopicMappings.mockResolvedValue([makeMapping()]);
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─── BUDG-01: Amber alert ──────────────────────────────────────────────────

  it('fires amber alert when agent is at 85% budget (BUDG-01)', async () => {
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 85, todayCostUsd: 8.5, dailyBudgetUsd: 10, alertLevel: 'warning' }),
    ]);

    // Access private method via any cast for isolated unit testing
    await (poller as any).pollBudgets();

    expect(mockSendToTopic).toHaveBeenCalledTimes(1);
    const [chatId, topicId, text] = mockSendToTopic.mock.calls[0];
    expect(chatId).toBe('-1001234567890');
    expect(topicId).toBe('42');
    expect(text).toContain('Budget WARNING');
    expect(text).toContain('gideon');
    expect(text).toContain('85.0%');
    // Yellow circle emoji for warning
    expect(text).toContain('\uD83D\uDFE1');
  });

  // ─── BUDG-01: Red alert ────────────────────────────────────────────────────

  it('fires red alert when agent is at 105% with distinct formatting (BUDG-01)', async () => {
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 105, todayCostUsd: 10.5, dailyBudgetUsd: 10, alertLevel: 'exceeded' }),
    ]);

    await (poller as any).pollBudgets();

    expect(mockSendToTopic).toHaveBeenCalledTimes(1);
    const [, , text] = mockSendToTopic.mock.calls[0];
    expect(text).toContain('BUDGET EXCEEDED');
    expect(text).toContain('105.0%');
    // Red circle emoji for exceeded
    expect(text).toContain('\uD83D\uDD34');
    // Must NOT contain warning label
    expect(text).not.toContain('Budget WARNING');
  });

  // ─── NSET-01: budgetAlertsEnabled = false ─────────────────────────────────

  it('does NOT fire when budgetAlertsEnabled is false (NSET-01)', async () => {
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig({ budgetAlertsEnabled: false }));
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 90, alertLevel: 'warning' }),
    ]);

    await (poller as any).pollBudgets();

    expect(mockSendToTopic).not.toHaveBeenCalled();
    // getBudgetAlertStatus should not even be called when alerts are disabled
    expect(mockGetBudgetAlertStatus).not.toHaveBeenCalled();
  });

  // ─── BUDG-02: Cooldown suppression ────────────────────────────────────────

  it('suppresses repeated alerts within cooldown window (BUDG-02)', async () => {
    vi.useFakeTimers();
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig({ budgetCooldownMs: 600_000 }));
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 90, alertLevel: 'warning' }),
    ]);

    // First poll fires
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1);

    // Advance 5 minutes (within 10-min cooldown)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Second poll should be suppressed
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1);
  });

  // ─── BUDG-02: Fires after cooldown expires ────────────────────────────────

  it('fires again after cooldown expires (BUDG-02)', async () => {
    vi.useFakeTimers();
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig({ budgetCooldownMs: 600_000 }));
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 90, alertLevel: 'warning' }),
    ]);

    // First poll fires
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1);

    // Advance 11 minutes (past 10-min cooldown)
    vi.advanceTimersByTime(11 * 60 * 1000);

    // Second poll should fire again
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(2);
  });

  // ─── BUDG-02: Escalation fires immediately within cooldown ────────────────

  it('fires immediately on warning->exceeded escalation even within cooldown (BUDG-02)', async () => {
    vi.useFakeTimers();
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig({ budgetCooldownMs: 600_000 }));

    // First: warning alert fires
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 85, alertLevel: 'warning' }),
    ]);
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1);

    // Advance 1 minute — still within 10-min cooldown
    vi.advanceTimersByTime(60 * 1000);

    // Now escalate to exceeded — should fire immediately despite cooldown
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 105, alertLevel: 'exceeded' }),
    ]);
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(2);

    // Verify escalation message is 'exceeded' style
    const [, , text] = mockSendToTopic.mock.calls[1];
    expect(text).toContain('BUDGET EXCEEDED');
  });

  // ─── BUDG-02: State reset on return to 'ok' ───────────────────────────────

  it("resets state when agent returns to 'ok' — next warning fires fresh", async () => {
    vi.useFakeTimers();
    mockGetNotificationConfig.mockReturnValue(makeDefaultConfig({ budgetCooldownMs: 600_000 }));

    // Fire warning
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 85, alertLevel: 'warning' }),
    ]);
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1);

    // Return to ok (within cooldown)
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 50, alertLevel: 'ok' }),
    ]);
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(1); // no new alert on 'ok'

    // Re-enter warning — should fire fresh even though cooldown not expired
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 85, alertLevel: 'warning' }),
    ]);
    await (poller as any).pollBudgets();
    expect(mockSendToTopic).toHaveBeenCalledTimes(2);
  });

  // ─── No topic mapping ──────────────────────────────────────────────────────

  it('does nothing when no topic mapping exists for agentId', async () => {
    mockGetTopicMappings.mockResolvedValue([]); // empty — no mappings
    mockGetBudgetAlertStatus.mockReturnValue([
      makeStatus({ agentId: 'gideon', budgetPct: 90, alertLevel: 'warning' }),
    ]);

    await (poller as any).pollBudgets();

    // checkAgent runs, sendBudgetAlert runs, but sendToTopic is never called
    expect(mockSendToTopic).not.toHaveBeenCalled();
  });
});
