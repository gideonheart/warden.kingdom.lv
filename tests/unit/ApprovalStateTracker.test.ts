// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApprovalStateTracker, APPROVAL_EXPIRY_MS } from '../../src/server/services/ApprovalStateTracker.js';

describe('ApprovalStateTracker', () => {
  let tracker: ApprovalStateTracker;

  afterEach(() => {
    vi.useRealTimers();
    if (tracker) {
      tracker.clear();
    }
  });

  // ─── register / get ───────────────────────────────────────────────────────

  it('register() stores a record retrievable via get()', () => {
    tracker = new ApprovalStateTracker();
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 42,
      topicId: '5',
      originalText: 'Permission prompt from session warden-project-abc1',
    });

    const record = tracker.get('warden-project-abc1');
    expect(record).toBeDefined();
    expect(record!.chatId).toBe('-100123456789');
    expect(record!.messageId).toBe(42);
    expect(record!.topicId).toBe('5');
    expect(record!.originalText).toBe('Permission prompt from session warden-project-abc1');
    expect(record!.sentAt).toBe(now);
    expect(record!.consumed).toBe(false);
  });

  it('get() returns undefined for unknown session', () => {
    tracker = new ApprovalStateTracker();
    const record = tracker.get('non-existent-session');
    expect(record).toBeUndefined();
  });

  // ─── markConsumed ─────────────────────────────────────────────────────────

  it('markConsumed() sets consumed flag to true', () => {
    tracker = new ApprovalStateTracker();
    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 42,
      topicId: '5',
      originalText: 'Test message',
    });

    tracker.markConsumed('warden-project-abc1');

    const record = tracker.get('warden-project-abc1');
    expect(record).toBeDefined();
    expect(record!.consumed).toBe(true);
  });

  it('markConsumed() is no-op for unknown session (does not throw)', () => {
    tracker = new ApprovalStateTracker();
    expect(() => tracker.markConsumed('non-existent-session')).not.toThrow();
  });

  // ─── overwrite on re-register ─────────────────────────────────────────────

  it('register() overwrites existing record for same session', () => {
    vi.useFakeTimers();
    const t1 = 1000000;
    vi.setSystemTime(t1);
    tracker = new ApprovalStateTracker();

    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 10,
      topicId: '5',
      originalText: 'First message',
    });

    // Mark consumed to verify it gets reset
    tracker.markConsumed('warden-project-abc1');

    // Advance time and re-register with a new messageId
    const t2 = t1 + 60_000;
    vi.setSystemTime(t2);

    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 20,
      topicId: '5',
      originalText: 'Second message',
    });

    const record = tracker.get('warden-project-abc1');
    expect(record).toBeDefined();
    expect(record!.messageId).toBe(20);
    expect(record!.consumed).toBe(false);
    expect(record!.sentAt).toBe(t2);
  });

  // ─── pruneExpired ─────────────────────────────────────────────────────────

  it('pruneExpired() removes entries older than APPROVAL_EXPIRY_MS', () => {
    vi.useFakeTimers();
    const startTime = 1000000;
    vi.setSystemTime(startTime);
    tracker = new ApprovalStateTracker();

    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 42,
      topicId: '5',
      originalText: 'Test message',
    });

    // Advance time past 15 minutes
    vi.advanceTimersByTime(APPROVAL_EXPIRY_MS + 1);

    tracker.pruneExpired();

    expect(tracker.get('warden-project-abc1')).toBeUndefined();
  });

  it('pruneExpired() preserves entries within expiry window', () => {
    vi.useFakeTimers();
    const startTime = 1000000;
    vi.setSystemTime(startTime);
    tracker = new ApprovalStateTracker();

    tracker.register('warden-project-abc1', {
      chatId: '-100123456789',
      messageId: 42,
      topicId: '5',
      originalText: 'Test message',
    });

    // Advance time to just before expiry (1 second before)
    vi.advanceTimersByTime(APPROVAL_EXPIRY_MS - 1);

    tracker.pruneExpired();

    const record = tracker.get('warden-project-abc1');
    expect(record).toBeDefined();
    expect(record!.messageId).toBe(42);
  });

  // ─── clear ────────────────────────────────────────────────────────────────

  it('clear() removes all records', () => {
    tracker = new ApprovalStateTracker();

    tracker.register('session-1', {
      chatId: '-100123456789',
      messageId: 1,
      topicId: '5',
      originalText: 'Message 1',
    });
    tracker.register('session-2', {
      chatId: '-100123456789',
      messageId: 2,
      topicId: '6',
      originalText: 'Message 2',
    });
    tracker.register('session-3', {
      chatId: '-100123456789',
      messageId: 3,
      topicId: '7',
      originalText: 'Message 3',
    });

    tracker.clear();

    expect(tracker.get('session-1')).toBeUndefined();
    expect(tracker.get('session-2')).toBeUndefined();
    expect(tracker.get('session-3')).toBeUndefined();
  });
});
