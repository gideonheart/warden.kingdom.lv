import { Bot, GrammyError, HttpError } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

export class TelegramBotService {
  private bot: Bot | null = null;

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
}

export const telegramBotService = new TelegramBotService();
