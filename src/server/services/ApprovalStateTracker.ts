export const APPROVAL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export interface ApprovalRecord {
  chatId: string;
  messageId: number;
  topicId: string;
  originalText: string;
  sentAt: number;
  consumed: boolean;
}

/**
 * Tracks pending approval records for one-tap approve feature.
 * Maps sessionName -> ApprovalRecord with expiry and idempotency support.
 *
 * Register an approval record when a permission notification is sent.
 * Read via get() in the callback handler for expiry/consumed checks.
 * Mark consumed synchronously BEFORE the async tmux call to prevent double-tap.
 * Call pruneExpired() periodically (e.g., in NotificationPoller) to housekeep.
 */
export class ApprovalStateTracker {
  private records = new Map<string, ApprovalRecord>();

  /**
   * Register (or overwrite) an approval record for the given session.
   * Sets sentAt to current time and consumed to false.
   */
  register(sessionName: string, record: Omit<ApprovalRecord, 'consumed' | 'sentAt'>): void {
    this.records.set(sessionName, {
      ...record,
      sentAt: Date.now(),
      consumed: false,
    });
  }

  /**
   * Retrieve the approval record for the given session, or undefined if not found.
   */
  get(sessionName: string): ApprovalRecord | undefined {
    return this.records.get(sessionName);
  }

  /**
   * Mark the approval for the given session as consumed.
   * No-op if the session has no approval record.
   */
  markConsumed(sessionName: string): void {
    const record = this.records.get(sessionName);
    if (record) {
      record.consumed = true;
    }
  }

  /**
   * Remove all records older than APPROVAL_EXPIRY_MS.
   * Call periodically to prevent unbounded memory growth.
   */
  pruneExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now - record.sentAt > APPROVAL_EXPIRY_MS) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Remove all records. Used for testing and server shutdown.
   */
  clear(): void {
    this.records.clear();
  }
}

export const approvalStateTracker = new ApprovalStateTracker();
