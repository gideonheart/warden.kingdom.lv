import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentContextFill } from '../../shared/openclawTypes.js';

const execFileAsync = promisify(execFile);

const OPENCLAW_BINARY_PATH = '/home/forge/.local/share/pnpm/openclaw';
const CACHE_TTL_MS = 30_000;

interface OpenClawSessionEntry {
  key: string;
  agentId: string;
  totalTokens: number | null;
  contextTokens: number;
  model: string | null;
  ageMs: number;
  [key: string]: unknown;
}

interface OpenClawSessionsResponse {
  sessions: OpenClawSessionEntry[];
}

class OpenClawSessionReader {
  private cachedContextFills: Map<string, AgentContextFill> | null = null;
  private contextFillsLastReadAt = 0;

  private hasLoggedCliWarning = false;

  clearCaches(): void {
    this.cachedContextFills = null;
    this.contextFillsLastReadAt = 0;
  }

  async getContextFills(): Promise<Map<string, AgentContextFill>> {
    const now = Date.now();
    if (this.cachedContextFills && now - this.contextFillsLastReadAt < CACHE_TTL_MS) {
      return this.cachedContextFills;
    }

    try {
      const { stdout } = await execFileAsync(OPENCLAW_BINARY_PATH, ['sessions', '--all-agents', '--json'], {
        timeout: 10_000,
      });

      const parsed = JSON.parse(stdout) as OpenClawSessionsResponse;
      const contextFillMap = new Map<string, AgentContextFill>();

      for (const session of parsed.sessions) {
        if (!session.key.endsWith(':main')) {
          continue;
        }

        const fillPercentage =
          session.totalTokens != null && session.contextTokens > 0
            ? Math.round((session.totalTokens / session.contextTokens) * 100)
            : null;

        contextFillMap.set(session.agentId, {
          totalTokens: session.totalTokens,
          contextTokens: session.contextTokens,
          fillPercentage,
          model: session.model,
        });
      }

      this.cachedContextFills = contextFillMap;
      this.contextFillsLastReadAt = now;
      this.hasLoggedCliWarning = false;
      return contextFillMap;
    } catch (error: any) {
      if (!this.hasLoggedCliWarning) {
        console.warn('[OpenClawSessionReader] openclaw CLI unavailable:', error.message);
        this.hasLoggedCliWarning = true;
      }
      if (this.cachedContextFills) {
        return this.cachedContextFills;
      }
      return new Map();
    }
  }
}

export const openClawSessionReader = new OpenClawSessionReader();
