// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock openClawConfigReader before importing TelegramBotService
const mockGetBotToken = vi.fn<() => Promise<string | null>>();

vi.mock('../../src/server/services/OpenClawConfigReader.js', () => ({
  openClawConfigReader: {
    getBotToken: mockGetBotToken,
  },
}));

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

describe('TelegramBotService (send-only)', () => {
  let telegramBotService: Awaited<typeof import('../../src/server/services/TelegramBotService.js')>['telegramBotService'];
  let TelegramBotService: Awaited<typeof import('../../src/server/services/TelegramBotService.js')>['TelegramBotService'];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: no token configured
    mockGetBotToken.mockResolvedValue(null);

    // Default: fetch returns a successful response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    } as unknown as Response);

    // Reset singleton state by re-importing the module
    vi.resetModules();
    const module = await import('../../src/server/services/TelegramBotService.js');
    telegramBotService = module.telegramBotService;
    TelegramBotService = module.TelegramBotService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── initialize() tests ──────────────────────────────────────────────────

  describe('initialize()', () => {
    it('reads bot token from OpenClawConfigReader.getBotToken()', async () => {
      mockGetBotToken.mockResolvedValue('test-token-abc');
      await telegramBotService.initialize();
      expect(mockGetBotToken).toHaveBeenCalledOnce();
    });

    it('logs success message when token is found', async () => {
      mockGetBotToken.mockResolvedValue('test-token-abc');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await telegramBotService.initialize();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot] Bot token loaded from openclaw.json — send-only mode')
      );
    });

    it('logs warning when no token is found', async () => {
      mockGetBotToken.mockResolvedValue(null);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.initialize();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot] No bot token in openclaw.json — notifications disabled')
      );
    });

    it('does not start any long-polling (no bot.start() or similar)', async () => {
      mockGetBotToken.mockResolvedValue('test-token-abc');
      await telegramBotService.initialize();
      // fetch should NOT be called during initialize — only during sendToTopic
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── isConfigured() tests ─────────────────────────────────────────────────

  describe('isConfigured()', () => {
    it('returns false before initialize() is called', () => {
      expect(telegramBotService.isConfigured()).toBe(false);
    });

    it('returns true after initialize() with a valid token', async () => {
      mockGetBotToken.mockResolvedValue('test-token-abc');
      await telegramBotService.initialize();
      expect(telegramBotService.isConfigured()).toBe(true);
    });

    it('returns false after initialize() when token is null', async () => {
      mockGetBotToken.mockResolvedValue(null);
      await telegramBotService.initialize();
      expect(telegramBotService.isConfigured()).toBe(false);
    });
  });

  // ─── sendToTopic() guard: no token ───────────────────────────────────────

  describe('sendToTopic() — no token configured', () => {
    it('returns early and logs warning when bot token is not configured', async () => {
      // Not initialized — botToken is null
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', '5', 'Hello');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot] sendToTopic called but bot token is not configured')
      );
    });

    it('returns early after initialize() with null token', async () => {
      mockGetBotToken.mockResolvedValue(null);
      await telegramBotService.initialize();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', '5', 'Hello');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── sendToTopic() — topicId validation (FIX-04) ─────────────────────────

  describe('sendToTopic() — topicId validation', () => {
    beforeEach(async () => {
      mockGetBotToken.mockResolvedValue('test-token-abc');
      await telegramBotService.initialize();
    });

    it('logs warning and returns early for non-numeric topicId', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', 'not-a-number', 'Hello');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot] Invalid topicId "not-a-number"')
      );
    });

    it('logs warning and returns early for empty string topicId', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', '', 'Hello');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TelegramBot] Invalid topicId ""'));
    });

    it('logs warning and returns early for NaN-producing topicId', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', 'undefined', 'Hello');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('proceeds with valid numeric string topicId', async () => {
      await telegramBotService.sendToTopic('-100123', '42', 'Hello');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ─── sendToTopic() — successful send ─────────────────────────────────────

  describe('sendToTopic() — successful API call', () => {
    beforeEach(async () => {
      mockGetBotToken.mockResolvedValue('myBotToken');
      await telegramBotService.initialize();
    });

    it('calls Telegram sendMessage API with correct URL', async () => {
      await telegramBotService.sendToTopic('-100123', '5', 'Test message');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/botmyBotToken/sendMessage',
        expect.any(Object)
      );
    });

    it('sends POST request with JSON body containing chat_id, message_thread_id, text, parse_mode', async () => {
      await telegramBotService.sendToTopic('-100123', '5', 'Test message');
      const [_url, options] = mockFetch.mock.calls[0];
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
      const body = JSON.parse(options?.body as string);
      expect(body).toEqual({
        chat_id: '-100123',
        message_thread_id: 5,
        text: 'Test message',
        parse_mode: 'Markdown',
      });
    });

    it('parses topicId as integer for message_thread_id', async () => {
      await telegramBotService.sendToTopic('-100456', '99', 'Hello');
      const [_url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.message_thread_id).toBe(99);
      expect(typeof body.message_thread_id).toBe('number');
    });
  });

  // ─── sendToTopic() — HTTP error handling ─────────────────────────────────

  describe('sendToTopic() — error handling', () => {
    beforeEach(async () => {
      mockGetBotToken.mockResolvedValue('myBotToken');
      await telegramBotService.initialize();
    });

    it('logs error when Telegram API returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('{"ok":false,"description":"Bad Request"}'),
      } as unknown as Response);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await telegramBotService.sendToTopic('-100123', '5', 'Bad message');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot] Failed to send to topic 5'),
        expect.any(String)
      );
    });

    it('logs error and does not throw when fetch rejects (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        telegramBotService.sendToTopic('-100123', '5', 'Hello')
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('never exposes the bot token in error logs', async () => {
      const tokenValue = 'super-secret-bot-token-xyz';
      vi.resetModules();
      mockGetBotToken.mockResolvedValue(tokenValue);
      const module = await import('../../src/server/services/TelegramBotService.js');
      const freshService = module.telegramBotService;
      await freshService.initialize();

      mockFetch.mockRejectedValue(new Error('Network failure'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await freshService.sendToTopic('-100123', '5', 'Hello');

      const allCalls = errorSpy.mock.calls.flat().map(String);
      for (const callArg of allCalls) {
        expect(callArg).not.toContain(tokenValue);
      }
    });
  });
});
