import type { Bot } from 'grammy';
import { ApprovalStateTracker, APPROVAL_EXPIRY_MS } from './ApprovalStateTracker.js';
import type { TmuxSessionManager } from './TmuxSessionManager.js';

/**
 * Registers the callback query handler for one-tap approve.
 *
 * When the operator taps the Approve button on a permission notification,
 * Telegram sends a callback_query update with data "approve:{sessionName}".
 * This handler validates the operator, checks expiry and idempotency, injects
 * the approval input into the tmux session, and edits the original message to
 * remove the button and show an "Approved at HH:MM" timestamp.
 *
 * APRV-02: Sends '1' to the agent's tmux session via sendPromptToSession
 * APRV-03: Rejects non-operator taps with 'Not authorized'
 * APRV-04: Edits message to remove button after approval
 * APRV-05: Rejects expired approvals (>15 min) with 'Approval expired'
 */
export class ApprovalCallbackHandler {
  constructor(
    private readonly approvalTracker: ApprovalStateTracker,
    private readonly tmuxSessionManager: TmuxSessionManager,
  ) {}

  /**
   * Register the callback query handler on the provided bot instance.
   * Must be called BEFORE bot.start() to ensure the handler is active.
   */
  register(bot: Bot): void {
    bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
      const sessionName = ctx.match[1];

      // APRV-03: verify operator ID is configured
      const rawOperatorId = process.env.WARDEN_TELEGRAM_OPERATOR_ID;
      if (!rawOperatorId) {
        console.warn('[ApprovalCallback] WARDEN_TELEGRAM_OPERATOR_ID not set — all approvals blocked');
        await ctx.answerCallbackQuery({ text: 'Bot misconfigured', show_alert: true });
        return;
      }

      // APRV-03: verify caller is the configured operator
      const operatorId = parseInt(rawOperatorId, 10);
      if (ctx.callbackQuery.from.id !== operatorId) {
        await ctx.answerCallbackQuery({ text: 'Not authorized', show_alert: true });
        return;
      }

      // APRV-05: verify approval record exists and has not expired
      const approval = this.approvalTracker.get(sessionName);
      if (!approval || Date.now() - approval.sentAt > APPROVAL_EXPIRY_MS) {
        await ctx.answerCallbackQuery({ text: 'Approval expired', show_alert: true });
        return;
      }

      // Idempotency: if already consumed, acknowledge silently and return
      if (approval.consumed) {
        await ctx.answerCallbackQuery();
        return;
      }

      // APRV-02 / Pitfall 1: mark consumed SYNCHRONOUSLY before async tmux call
      // This prevents double-tap race condition — second handler will see consumed=true
      this.approvalTracker.markConsumed(sessionName);

      // APRV-02: inject approval input into the tmux session
      try {
        await this.tmuxSessionManager.sendPromptToSession(sessionName, '1');
      } catch (error) {
        console.error(`[ApprovalCallback] Failed to send prompt to session ${sessionName}:`, error);
        await ctx.answerCallbackQuery({ text: 'Session no longer available', show_alert: true });
        return;
      }

      // Acknowledge the tap with success message
      await ctx.answerCallbackQuery({ text: 'Approved!' });

      // APRV-04: edit message to remove button and show approval timestamp
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 5); // HH:MM
      try {
        await bot.api.editMessageText(
          approval.chatId,
          approval.messageId,
          `${approval.originalText}\n\n_Approved at ${timeStr}_`,
          { parse_mode: 'Markdown' }, // omitting reply_markup removes the button
        );
      } catch (error) {
        console.error(`[ApprovalCallback] Failed to edit message for session ${sessionName}:`, error);
        // Non-fatal: approval was already injected; just couldn't update the message UI
      }
    });
  }
}
