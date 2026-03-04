// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock grammy before importing the service
const mockSendMessage = vi.fn();

const mockBotInstance = {
  api: {
    config: {
      use: vi.fn(),
    },
    sendMessage: mockSendMessage,
  },
  catch: vi.fn(),
  start: vi.fn(() => new Promise<void>(() => {})), // never-resolving promise
  stop: vi.fn(() => Promise.resolve()),
  isRunning: vi.fn(() => false),
  callbackQuery: vi.fn(),
};

const MockBot = vi.fn(function () { return mockBotInstance; });

// InlineKeyboard mock — captures the text() call so tests can verify button data
const mockInlineKeyboardInstance = {
  text: vi.fn().mockReturnThis(),
};
const MockInlineKeyboard = vi.fn(function () { return mockInlineKeyboardInstance; });

vi.mock('grammy', () => ({
  Bot: MockBot,
  InlineKeyboard: MockInlineKeyboard,
  GrammyError: class GrammyError extends Error {
    description: string;
    constructor(description: string) {
      super(description);
      this.description = description;
    }
  },
  HttpError: class HttpError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

const mockAutoRetry = vi.fn(() => 'autoRetryTransformer');

vi.mock('@grammyjs/auto-retry', () => ({
  autoRetry: mockAutoRetry,
}));

describe('TelegramBotService', () => {
  let telegramBotService: Awaited<typeof import('../../src/server/services/TelegramBotService.js')>['telegramBotService'];
  let TelegramBotService: Awaited<typeof import('../../src/server/services/TelegramBotService.js')>['TelegramBotService'];

  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    mockBotInstance.start.mockReturnValue(new Promise<void>(() => {}));
    mockBotInstance.stop.mockResolvedValue(undefined);
    mockBotInstance.isRunning.mockReturnValue(false);
    mockInlineKeyboardInstance.text.mockReturnThis();

    // Reset singleton state by re-importing via unstable_importModule
    vi.resetModules();
    const module = await import('../../src/server/services/TelegramBotService.js');
    telegramBotService = module.telegramBotService;
    TelegramBotService = module.TelegramBotService;

    // Clear token by default
    delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
  });

  // ─── BOT-01 tests ────────────────────────────────────────────────────────

  describe('BOT-01: long polling start', () => {
    it('start() creates Bot instance with token from env', async () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();
      expect(MockBot).toHaveBeenCalledWith('test-token-123');
    });

    it('start() calls bot.start() to begin long polling', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();
      expect(mockBotInstance.start).toHaveBeenCalled();
    });

    it('start() does NOT await bot.start() — returns void synchronously', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      // If start() is sync (void), it returns undefined, not a Promise
      const result = telegramBotService.start();
      expect(result).toBeUndefined();
    });
  });

  // ─── BOT-02 tests ────────────────────────────────────────────────────────

  describe('BOT-02: missing token graceful degradation', () => {
    it('start() logs warning and returns when token is missing', () => {
      delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      telegramBotService.start();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TelegramBot]')
      );
      expect(MockBot).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('token value never appears in any log output', () => {
      const tokenValue = 'super-secret-token-xyz-987';
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = tokenValue;

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      telegramBotService.start();

      // Check none of the log spies were called with the actual token value
      const allCalls = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map(String);

      for (const callArg of allCalls) {
        expect(callArg).not.toContain(tokenValue);
      }

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  // ─── BOT-04 tests ────────────────────────────────────────────────────────

  describe('BOT-04: auto-retry registration', () => {
    it('start() registers autoRetry on bot.api.config', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();
      expect(mockAutoRetry).toHaveBeenCalled();
      expect(mockBotInstance.api.config.use).toHaveBeenCalledWith('autoRetryTransformer');
    });

    it('start() installs bot.catch() error handler before bot.start()', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';

      // Track call order
      const callOrder: string[] = [];
      mockBotInstance.catch.mockImplementation(() => { callOrder.push('catch'); });
      mockBotInstance.start.mockImplementation(() => { callOrder.push('start'); return new Promise<void>(() => {}); });

      telegramBotService.start();

      expect(callOrder).toEqual(['catch', 'start']);
      expect(mockBotInstance.catch).toHaveBeenCalledBefore(mockBotInstance.start);
    });
  });

  // ─── Lifecycle tests ──────────────────────────────────────────────────────

  describe('Lifecycle: isRunning()', () => {
    it('isRunning() returns false when bot is null (no token set)', () => {
      delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
      expect(telegramBotService.isRunning()).toBe(false);
    });

    it('isRunning() delegates to bot.isRunning() when bot exists', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      mockBotInstance.isRunning.mockReturnValue(true);
      telegramBotService.start();
      expect(telegramBotService.isRunning()).toBe(true);
    });
  });

  describe('Lifecycle: stop()', () => {
    it('stop() is a no-op when bot is null — no error thrown', async () => {
      delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
      await expect(telegramBotService.stop()).resolves.toBeUndefined();
    });

    it('stop() calls bot.stop() when bot is running', async () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();
      await telegramBotService.stop();
      expect(mockBotInstance.stop).toHaveBeenCalled();
    });
  });

  // ─── APRV-01 tests ───────────────────────────────────────────────────────

  describe('APRV-01: sendToTopicWithApproveButton', () => {
    it('sends message with InlineKeyboard reply_markup and returns message_id', async () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();

      mockSendMessage.mockResolvedValue({ message_id: 42 });

      const result = await telegramBotService.sendToTopicWithApproveButton(
        '-100123',
        '5',
        'Test message',
        'gideon-project-abc'
      );

      expect(result).toBe(42);
      expect(MockInlineKeyboard).toHaveBeenCalled();
      expect(mockInlineKeyboardInstance.text).toHaveBeenCalledWith(
        'Approve',
        'approve:gideon-project-abc'
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        '-100123',
        'Test message',
        expect.objectContaining({
          message_thread_id: 5,
          parse_mode: 'Markdown',
          reply_markup: mockInlineKeyboardInstance,
        })
      );
    });

    it('returns null when bot is not running (no token)', async () => {
      delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;
      // bot is null — not started

      const result = await telegramBotService.sendToTopicWithApproveButton(
        '-100123',
        '5',
        'Test message',
        'gideon-project-abc'
      );

      expect(result).toBeNull();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('returns null when sendMessage throws (error caught)', async () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';
      telegramBotService.start();

      mockSendMessage.mockRejectedValue(new Error('Network error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await telegramBotService.sendToTopicWithApproveButton(
        '-100123',
        '5',
        'Test message',
        'gideon-project-abc'
      );

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // ─── registerCallbackHandler tests ───────────────────────────────────────

  describe('registerCallbackHandler applies handlers during start()', () => {
    it('registered handler receives the bot instance during start()', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';

      const handlerSpy = vi.fn();
      telegramBotService.registerCallbackHandler(handlerSpy);

      telegramBotService.start();

      expect(handlerSpy).toHaveBeenCalledOnce();
      expect(handlerSpy).toHaveBeenCalledWith(mockBotInstance);
    });

    it('handler is applied BEFORE bot.start() — called in correct order', () => {
      process.env.WARDEN_TELEGRAM_BOT_TOKEN = 'test-token-123';

      const callOrder: string[] = [];
      const handlerSpy = vi.fn(() => { callOrder.push('handler'); });
      mockBotInstance.start.mockImplementation(() => {
        callOrder.push('start');
        return new Promise<void>(() => {});
      });

      telegramBotService.registerCallbackHandler(handlerSpy);
      telegramBotService.start();

      expect(callOrder).toEqual(['handler', 'start']);
    });

    it('handler is not called when token is missing (bot never created)', () => {
      delete process.env.WARDEN_TELEGRAM_BOT_TOKEN;

      const handlerSpy = vi.fn();
      telegramBotService.registerCallbackHandler(handlerSpy);
      telegramBotService.start();

      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });
});
