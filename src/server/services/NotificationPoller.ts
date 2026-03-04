import { execFile } from 'child_process';
import { promisify } from 'util';
import stripAnsi from 'strip-ansi';
import { instanceTracker } from './InstanceTracker.js';
import { telegramBotService } from './TelegramBotService.js';
import { openClawConfigReader } from './OpenClawConfigReader.js';
import { detectAgentState } from '../utils/agentStateDetection.js';
import { NotificationDeduplicator } from './NotificationDeduplicator.js';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 10_000;
const PANE_LINES = 20;
const EXCERPT_MAX_CHARS = 500;

export class NotificationPoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private deduplicator = new NotificationDeduplicator();

  /**
   * Start polling all active tmux sessions for permission prompts.
   *
   * Runs one immediate poll on start (matching InstanceTracker.startPeriodicSync()
   * pattern), then repeats every POLL_INTERVAL_MS.
   */
  startPolling(): void {
    console.log('[NotificationPoller] Starting permission prompt polling (10s interval)');
    void this.pollAllSessions();
    this.pollInterval = setInterval(() => {
      void this.pollAllSessions();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling. Safe to call multiple times or before startPolling().
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[NotificationPoller] Stopped permission prompt polling');
    }
  }

  /**
   * Poll all currently active instances in parallel.
   * Failures on individual sessions are caught inside pollSession.
   */
  private async pollAllSessions(): Promise<void> {
    const instances = instanceTracker.listActiveInstances();
    await Promise.allSettled(
      instances.map((instance) => this.pollSession(instance.tmuxSessionName, instance.agentId))
    );
  }

  /**
   * Capture tmux pane output for a single session, detect state, and
   * send a notification if a new permission prompt is detected.
   */
  private async pollSession(sessionName: string, agentId: string): Promise<void> {
    try {
      const { stdout } = await execFileAsync('tmux', [
        'capture-pane',
        '-pt',
        `${sessionName}:0.0`,
        '-S',
        `-${PANE_LINES}`,
      ]);

      // Strip ANSI codes BEFORE calling detectAgentState() — ANSI escape
      // sequences around cursor characters break the permission prompt regex
      const cleanPane = stripAnsi(stdout);

      const state = detectAgentState(cleanPane);
      const shouldNotify = this.deduplicator.recordAndCheck(sessionName, state);

      if (shouldNotify) {
        const excerpt = cleanPane.slice(-EXCERPT_MAX_CHARS).trim();
        await this.sendPermissionNotification(agentId, sessionName, excerpt);
      }
    } catch {
      // Dead sessions (tmux session not found) are silently ignored —
      // InstanceTracker will mark them stopped on its next sync cycle
    }
  }

  /**
   * Look up the agent's Telegram topic mapping and send a notification.
   */
  private async sendPermissionNotification(
    agentId: string,
    sessionName: string,
    excerpt: string
  ): Promise<void> {
    try {
      const mappings = await openClawConfigReader.getTopicMappings();
      const mapping = mappings.find((m) => m.agentId === agentId);

      if (!mapping) {
        console.warn(`[NotificationPoller] No Telegram topic mapping found for agent: ${agentId}`);
        return;
      }

      const text =
        `⚠️ *${agentId}* needs permission\n\n` +
        `Session: \`${sessionName}\`\n` +
        `\`\`\`\n${excerpt}\n\`\`\``;

      await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    } catch (error) {
      console.error(`[NotificationPoller] Failed to send notification for ${agentId}:`, error);
    }
  }
}

export const notificationPoller = new NotificationPoller();
