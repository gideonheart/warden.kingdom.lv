import type { AgentStateHint } from '../../shared/gsdTypes.js';

const PERMISSION_COOLDOWN_MS = 2 * 60 * 1000;

interface SessionRecord {
  previousState: AgentStateHint | null;
  lastNotifiedAt: number | null;
}

export class NotificationDeduplicator {
  private records = new Map<string, SessionRecord>();

  recordAndCheck(_sessionName: string, _state: AgentStateHint): boolean {
    return false; // Stub — tests will fail
  }

  clear(): void {
    this.records.clear();
  }
}

// Suppress unused variable warning for PERMISSION_COOLDOWN_MS (used in full implementation)
void PERMISSION_COOLDOWN_MS;
