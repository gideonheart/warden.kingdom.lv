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
 * This is a stub — implementation will be added in the GREEN phase (Task 2).
 */
export class ApprovalStateTracker {
  private records = new Map<string, ApprovalRecord>();

  register(_sessionName: string, _record: Omit<ApprovalRecord, 'consumed' | 'sentAt'>): void {
    // stub — not yet implemented
  }

  get(_sessionName: string): ApprovalRecord | undefined {
    return undefined;
  }

  markConsumed(_sessionName: string): void {
    // stub — not yet implemented
  }

  pruneExpired(): void {
    // stub — not yet implemented
  }

  clear(): void {
    // stub — not yet implemented
  }
}

export const approvalStateTracker = new ApprovalStateTracker();
