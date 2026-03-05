import { database } from '../database/DatabaseConnection.js';
import { telegramBotService } from './TelegramBotService.js';
import { openClawConfigReader } from './OpenClawConfigReader.js';
import type { BudgetAlertStatus } from '../../shared/types.js';

type BudgetLevel = 'ok' | 'warning' | 'exceeded';

interface BudgetRecord {
  level: BudgetLevel;
  lastAlertedAt: number | null;
}

const POLL_INTERVAL_MS = 10_000;

const LEVEL_RANK: Record<BudgetLevel, number> = {
  ok: 0,
  warning: 1,
  exceeded: 2,
};

/**
 * Polls budget alert status for all agents on a 10-second interval and fires
 * Telegram notifications on amber (warning) or red (exceeded) threshold breaches.
 *
 * Deduplication rules (BUDG-02):
 * - Fires immediately on first breach or level escalation (warning -> exceeded)
 * - Suppresses repeated alerts within budgetCooldownMs window (default 10 min)
 * - Resets state when agent returns to 'ok' — next breach fires fresh
 */
export class BudgetAlertPoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private records = new Map<string, BudgetRecord>();

  /**
   * Start polling all agent budget statuses.
   *
   * Runs one immediate poll on start, then repeats every POLL_INTERVAL_MS.
   */
  startPolling(): void {
    console.log('[BudgetAlertPoller] Starting budget threshold polling (10s interval)');
    void this.pollBudgets();
    this.pollInterval = setInterval(() => {
      void this.pollBudgets();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling. Safe to call multiple times or before startPolling().
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[BudgetAlertPoller] Stopped budget threshold polling');
    }
  }

  /**
   * Poll all agent budget statuses and fire alerts where applicable.
   */
  private async pollBudgets(): Promise<void> {
    const config = database.getNotificationConfig();
    if (!config.budgetAlertsEnabled) {
      return;
    }

    const statuses = database.getBudgetAlertStatus();
    await Promise.allSettled(
      statuses.map((status) => this.checkAgent(status, config.budgetCooldownMs))
    );
  }

  /**
   * Check a single agent's budget status and fire an alert if warranted.
   *
   * @param status     - Current budget alert status from the database
   * @param cooldownMs - Cooldown window in milliseconds between repeated alerts
   */
  private async checkAgent(status: BudgetAlertStatus, cooldownMs: number): Promise<void> {
    const currentLevel = status.alertLevel;

    // Return to 'ok' — clear record so next breach fires fresh (BUDG-02)
    if (currentLevel === 'ok') {
      this.records.delete(status.agentId);
      return;
    }

    const existing = this.records.get(status.agentId);
    const previousLevel = existing?.level ?? 'ok';
    const lastAlertedAt = existing?.lastAlertedAt ?? null;
    const now = Date.now();

    const isEscalation = this.isLevelEscalation(previousLevel, currentLevel);
    const isCooldownExpired = lastAlertedAt === null || now - lastAlertedAt >= cooldownMs;

    if (!isEscalation && !isCooldownExpired) {
      // Suppress — same level within cooldown window
      return;
    }

    // Update record BEFORE sending (prevents duplicate sends on async re-entry)
    this.records.set(status.agentId, {
      level: currentLevel,
      lastAlertedAt: now,
    });

    await this.sendBudgetAlert(
      status.agentId,
      currentLevel,
      status.budgetPct,
      status.todayCostUsd,
      status.dailyBudgetUsd,
    );
  }

  /**
   * Returns true when current level is a higher severity than previous level.
   */
  private isLevelEscalation(previous: BudgetLevel, current: BudgetLevel): boolean {
    return LEVEL_RANK[current] > LEVEL_RANK[previous];
  }

  /**
   * Look up the agent's Telegram topic mapping and send a budget alert.
   *
   * Uses yellow circle emoji for warning, red circle for exceeded.
   * Silently skips if no topic mapping is configured for the agent.
   */
  private async sendBudgetAlert(
    agentId: string,
    level: BudgetLevel,
    budgetPct: number,
    todayCostUsd: number,
    dailyBudgetUsd: number,
  ): Promise<void> {
    try {
      const mappings = await openClawConfigReader.getTopicMappings();
      const mapping = mappings.find((m) => m.agentId === agentId);

      if (!mapping) {
        console.warn(`[BudgetAlertPoller] No Telegram topic mapping found for agent: ${agentId}`);
        return;
      }

      const isExceeded = level === 'exceeded';
      const emoji = isExceeded ? '\uD83D\uDD34' : '\uD83D\uDFE1'; // red circle : yellow circle
      const title = isExceeded ? '*BUDGET EXCEEDED*' : '*Budget WARNING*';
      const pctFormatted = budgetPct.toFixed(1);
      const todayFormatted = todayCostUsd.toFixed(4);
      const dailyFormatted = dailyBudgetUsd.toFixed(2);

      const text =
        `${emoji} ${title} — *${agentId}*\n\n` +
        `Usage: ${pctFormatted}% of daily budget\n` +
        `Today: $${todayFormatted} / $${dailyFormatted}`;

      await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    } catch (error) {
      console.error(`[BudgetAlertPoller] Failed to send budget alert for ${agentId}:`, error);
    }
  }
}

export const budgetAlertPoller = new BudgetAlertPoller();
