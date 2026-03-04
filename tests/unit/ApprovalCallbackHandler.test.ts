// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalCallbackHandler } from '../../src/server/services/ApprovalCallbackHandler.js';
import { ApprovalStateTracker, APPROVAL_EXPIRY_MS } from '../../src/server/services/ApprovalStateTracker.js';
import type { TmuxSessionManager } from '../../src/server/services/TmuxSessionManager.js';

// ─── Mock helpers ──────────────────────────────────────────────────────────

type CallbackQueryHandler = (ctx: MockCtx) => Promise<void>;

interface MockCtx {
  match: [string, string];
  callbackQuery: { from: { id: number } };
  answerCallbackQuery: ReturnType<typeof vi.fn>;
}

interface MockBot {
  callbackQuery: ReturnType<typeof vi.fn>;
  api: {
    editMessageText: ReturnType<typeof vi.fn>;
  };
  // Stored handler captured during bot.callbackQuery() registration
  _registeredHandler?: CallbackQueryHandler;
}

/**
 * Create a mock bot that captures the registered callback handler.
 * This allows tests to invoke the handler directly.
 */
function createMockBot(): MockBot {
  const bot: MockBot = {
    callbackQuery: vi.fn((pattern: unknown, handler: CallbackQueryHandler) => {
      bot._registeredHandler = handler;
    }),
    api: {
      editMessageText: vi.fn(() => Promise.resolve()),
    },
  };
  return bot;
}

/**
 * Build a mock callback context for invoking the registered handler.
 */
function createMockCtx(fromId: number, sessionName: string): MockCtx {
  return {
    match: [`approve:${sessionName}`, sessionName],
    callbackQuery: { from: { id: fromId } },
    answerCallbackQuery: vi.fn(() => Promise.resolve()),
  };
}

const SESSION_NAME = 'warden-project-abc1';
const OPERATOR_ID = 123456;
const CHAT_ID = '-100987654321';
const MESSAGE_ID = 99;
const ORIGINAL_TEXT = 'Permission prompt from session warden-project-abc1';

describe('ApprovalCallbackHandler', () => {
  let handler: ApprovalCallbackHandler;
  let tracker: ApprovalStateTracker;
  let mockTmux: { sendPromptToSession: ReturnType<typeof vi.fn> };
  let bot: MockBot;

  beforeEach(() => {
    vi.useRealTimers();
    tracker = new ApprovalStateTracker();
    mockTmux = { sendPromptToSession: vi.fn(() => Promise.resolve()) };
    handler = new ApprovalCallbackHandler(tracker, mockTmux as unknown as TmuxSessionManager);
    bot = createMockBot();
    handler.register(bot as unknown as Parameters<typeof handler.register>[0]);
    process.env.WARDEN_TELEGRAM_OPERATOR_ID = String(OPERATOR_ID);
  });

  afterEach(() => {
    vi.useRealTimers();
    tracker.clear();
    delete process.env.WARDEN_TELEGRAM_OPERATOR_ID;
  });

  // ─── APRV-03: operator authorization ─────────────────────────────────────

  it('APRV-03: rejects non-operator tap with "Not authorized"', async () => {
    const ctx = createMockCtx(999999 /* wrong user ID */, SESSION_NAME);

    await bot._registeredHandler!(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: 'Not authorized',
      show_alert: true,
    });
    expect(mockTmux.sendPromptToSession).not.toHaveBeenCalled();
  });

  it('APRV-03: rejects when WARDEN_TELEGRAM_OPERATOR_ID is not set', async () => {
    delete process.env.WARDEN_TELEGRAM_OPERATOR_ID;
    const ctx = createMockCtx(OPERATOR_ID, SESSION_NAME);

    await bot._registeredHandler!(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: 'Bot misconfigured',
      show_alert: true,
    });
    expect(mockTmux.sendPromptToSession).not.toHaveBeenCalled();
  });

  // ─── APRV-05: expiry rejection ────────────────────────────────────────────

  it('APRV-05: rejects expired approval with "Approval expired"', async () => {
    vi.useFakeTimers();
    const startTime = 1000000;
    vi.setSystemTime(startTime);

    tracker.register(SESSION_NAME, {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      topicId: '5',
      originalText: ORIGINAL_TEXT,
    });

    // Advance 16 minutes — past the 15 min expiry
    vi.advanceTimersByTime(16 * 60 * 1000);

    const ctx = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: 'Approval expired',
      show_alert: true,
    });
    expect(mockTmux.sendPromptToSession).not.toHaveBeenCalled();
  });

  it('APRV-05: rejects when no approval record found', async () => {
    // No tracker.register() called — no record exists
    const ctx = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: 'Approval expired',
      show_alert: true,
    });
    expect(mockTmux.sendPromptToSession).not.toHaveBeenCalled();
  });

  // ─── APRV-02: successful approval ─────────────────────────────────────────

  it('APRV-02: successful approve calls sendPromptToSession with session name and "1"', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);

    tracker.register(SESSION_NAME, {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      topicId: '5',
      originalText: ORIGINAL_TEXT,
    });

    // Stay within the 15-min window
    vi.advanceTimersByTime(5 * 60 * 1000);

    const ctx = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx);

    expect(mockTmux.sendPromptToSession).toHaveBeenCalledWith(SESSION_NAME, '1');
  });

  // ─── APRV-04: message edit to remove button ───────────────────────────────

  it('APRV-04: successful approve edits message to remove button', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);

    tracker.register(SESSION_NAME, {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      topicId: '5',
      originalText: ORIGINAL_TEXT,
    });

    vi.advanceTimersByTime(5 * 60 * 1000);

    const ctx = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx);

    expect(bot.api.editMessageText).toHaveBeenCalledWith(
      CHAT_ID,
      MESSAGE_ID,
      expect.stringContaining('Approved at'),
      expect.objectContaining({ parse_mode: 'Markdown' }),
    );

    // Verify no reply_markup key in options (removes button)
    const callArgs = bot.api.editMessageText.mock.calls[0];
    expect(callArgs[3]).not.toHaveProperty('reply_markup');
  });

  // ─── Double-tap idempotency ───────────────────────────────────────────────

  it('double-tap: second call sees consumed=true, no additional tmux input', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);

    tracker.register(SESSION_NAME, {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      topicId: '5',
      originalText: ORIGINAL_TEXT,
    });

    vi.advanceTimersByTime(5 * 60 * 1000);

    const ctx1 = createMockCtx(OPERATOR_ID, SESSION_NAME);
    const ctx2 = createMockCtx(OPERATOR_ID, SESSION_NAME);

    // First tap — succeeds
    await bot._registeredHandler!(ctx1);
    // Second tap — sees consumed=true
    await bot._registeredHandler!(ctx2);

    // sendPromptToSession called exactly once — no double injection
    expect(mockTmux.sendPromptToSession).toHaveBeenCalledTimes(1);

    // Second tap should get a silent answer (no text, no show_alert)
    expect(ctx2.answerCallbackQuery).toHaveBeenCalledWith();
  });

  // ─── answerCallbackQuery called on every code path ────────────────────────

  it('answerCallbackQuery is called on every code path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);

    // Code path 1: non-operator
    const ctx1 = createMockCtx(999999, SESSION_NAME);
    await bot._registeredHandler!(ctx1);
    expect(ctx1.answerCallbackQuery).toHaveBeenCalledTimes(1);

    // Code path 2: missing env var
    delete process.env.WARDEN_TELEGRAM_OPERATOR_ID;
    const ctx2 = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx2);
    expect(ctx2.answerCallbackQuery).toHaveBeenCalledTimes(1);
    process.env.WARDEN_TELEGRAM_OPERATOR_ID = String(OPERATOR_ID);

    // Code path 3: expired (no record)
    const ctx3 = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx3);
    expect(ctx3.answerCallbackQuery).toHaveBeenCalledTimes(1);

    // Code path 4: success
    tracker.register(SESSION_NAME, {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      topicId: '5',
      originalText: ORIGINAL_TEXT,
    });
    vi.advanceTimersByTime(5 * 60 * 1000);
    const ctx4 = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx4);
    expect(ctx4.answerCallbackQuery).toHaveBeenCalledTimes(1);

    // Code path 5: consumed
    const ctx5 = createMockCtx(OPERATOR_ID, SESSION_NAME);
    await bot._registeredHandler!(ctx5);
    expect(ctx5.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });
});
