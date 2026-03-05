import { openClawConfigReader } from './OpenClawConfigReader.js';

export class TelegramBotService {
  private botToken: string | null = null;
  private initialized = false;

  /**
   * Initialize the send-only Telegram service by reading the bot token from
   * openclaw.json via OpenClawConfigReader. No long-polling is started —
   * this service only sends messages via the raw Telegram Bot API.
   *
   * Safe to call multiple times (re-reads token on each call to pick up changes).
   */
  async initialize(): Promise<void> {
    this.botToken = await openClawConfigReader.getBotToken();
    this.initialized = true;

    if (this.botToken) {
      console.log('[TelegramBot] Bot token loaded from openclaw.json — send-only mode');
    } else {
      console.warn('[TelegramBot] No bot token in openclaw.json — notifications disabled');
    }
  }

  /**
   * Returns true when a bot token is configured (loaded from openclaw.json).
   * Returns false when no token was found or initialize() has not been called.
   *
   * Replaces isRunning() for use in the notification settings panel status.
   */
  isConfigured(): boolean {
    return this.botToken !== null;
  }

  /**
   * Send a text message to a specific Telegram group topic using the raw
   * Telegram Bot API (fetch-based, no grammy dependency).
   *
   * Guards:
   * - Returns early if bot token is not configured (with warning log).
   * - Returns early if topicId is not a finite integer (with warning log).
   * - Errors from the Telegram API are caught and logged — never throws.
   */
  async sendToTopic(chatId: string, topicId: string, text: string): Promise<void> {
    if (!this.botToken) {
      console.warn('[TelegramBot] sendToTopic called but bot token is not configured — skipping');
      return;
    }

    const parsedTopicId = parseInt(topicId, 10);
    if (!Number.isFinite(parsedTopicId)) {
      console.warn(`[TelegramBot] Invalid topicId "${topicId}" — must be a finite integer. Skipping send.`);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: parsedTopicId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[TelegramBot] Failed to send to topic ${topicId}: HTTP ${response.status} — ${errorBody}`);
      }
    } catch (error) {
      console.error(`[TelegramBot] Failed to send to topic ${topicId}:`, error);
    }
  }
}

export const telegramBotService = new TelegramBotService();
