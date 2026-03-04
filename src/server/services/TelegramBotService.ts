import { Bot, GrammyError, HttpError, InlineKeyboard } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

export class TelegramBotService {
  private bot: Bot | null = null;
  private callbackHandlers: Array<(bot: Bot) => void> = [];

  /**
   * Register a callback handler to be applied to the bot during start().
   *
   * Must be called BEFORE start() — handlers are applied after the Bot instance
   * is created (so they can call bot.callbackQuery, etc.) but BEFORE bot.start()
   * begins long polling. This ensures all handlers are active from the first update.
   */
  registerCallbackHandler(handler: (bot: Bot) => void): void {
    this.callbackHandlers.push(handler);
  }

  /**
   * Start the Telegram bot using long polling.
   *
   * Reads WARDEN_TELEGRAM_BOT_TOKEN from the environment. If the token is not
   * set, logs a warning and returns without crashing — all other Warden
   * features continue normally.
   *
   * bot.start() returns a Promise that never resolves during normal operation.
   * It is deliberately NOT awaited here (fire-and-forget), so this method
   * returns synchronously and does not block the Express server startup.
   */
  start(): void {
    const token = process.env.WARDEN_TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn('[TelegramBot] WARDEN_TELEGRAM_BOT_TOKEN not set — bot disabled');
      return;
    }

    this.bot = new Bot(token);

    // Register the auto-retry transformer for 429 rate-limit and 5xx handling
    this.bot.api.config.use(autoRetry());

    // Install error handler BEFORE calling start() — prevents grammy's default
    // handler from stopping the bot on first error
    this.bot.catch((boundError) => {
      const err = boundError.error;
      if (err instanceof GrammyError) {
        console.error('[TelegramBot] Telegram API error:', err.description);
      } else if (err instanceof HttpError) {
        console.error('[TelegramBot] Network error contacting Telegram:', err);
      } else {
        console.error('[TelegramBot] Unexpected error:', err);
      }
    });

    // Apply all registered callback handlers BEFORE bot.start() — ensures
    // handlers (e.g., approve button callbacks) are active from the first update
    for (const handler of this.callbackHandlers) {
      handler(this.bot);
    }

    // Fire-and-forget — bot.start() returns a Promise that only resolves when
    // the bot stops. Awaiting it would block the process forever.
    this.bot
      .start({
        onStart: (botInfo) => {
          console.log(`[TelegramBot] Bot started: @${botInfo.username}`);
        },
      })
      .catch((error) => {
        console.error('[TelegramBot] Fatal error during polling:', error);
      });
  }

  /**
   * Stop the Telegram bot gracefully.
   *
   * Calling bot.stop() confirms the last update offset to Telegram before
   * returning, which prevents a 409 Conflict error on rapid process restart.
   * Safe to call even when the bot was never started (no-op).
   */
  async stop(): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.stop();
      console.log('[TelegramBot] Bot stopped cleanly');
    } catch (error) {
      console.error('[TelegramBot] Error during bot stop:', error);
    } finally {
      this.bot = null;
    }
  }

  /**
   * Returns true when the bot is currently running (active long-polling
   * session established). Returns false when the bot was never started or
   * has been stopped.
   */
  isRunning(): boolean {
    return this.bot?.isRunning() ?? false;
  }

  /**
   * Send a text message to a specific Telegram group topic.
   *
   * No-op when the bot is not running (token not configured or bot stopped).
   * Errors are caught and logged — never throws to callers.
   */
  async sendToTopic(chatId: string, topicId: string, text: string): Promise<void> {
    if (!this.bot) {
      console.warn('[TelegramBot] sendToTopic called but bot is not running — skipping');
      return;
    }
    try {
      await this.bot.api.sendMessage(chatId, text, {
        message_thread_id: parseInt(topicId, 10),
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error(`[TelegramBot] Failed to send to topic ${topicId}:`, error);
    }
  }

  /**
   * Send a text message to a Telegram group topic with an Approve inline button.
   *
   * The button callback data is "approve:{sessionName}" — matches the pattern
   * registered in ApprovalCallbackHandler.
   *
   * Returns the sent message_id on success (needed by ApprovalStateTracker to
   * allow editing the message after approval). Returns null when bot is not
   * running or if the send fails.
   */
  async sendToTopicWithApproveButton(
    chatId: string,
    topicId: string,
    text: string,
    sessionName: string,
  ): Promise<number | null> {
    if (!this.bot) {
      console.warn('[TelegramBot] sendToTopicWithApproveButton called but bot is not running — skipping');
      return null;
    }
    try {
      const keyboard = new InlineKeyboard().text('Approve', `approve:${sessionName}`);
      const sentMessage = await this.bot.api.sendMessage(chatId, text, {
        message_thread_id: parseInt(topicId, 10),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      return sentMessage.message_id;
    } catch (error) {
      console.error(`[TelegramBot] Failed to send approve-button message to topic ${topicId}:`, error);
      return null;
    }
  }
}

export const telegramBotService = new TelegramBotService();
