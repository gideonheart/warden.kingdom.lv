import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentContextFill } from '../../shared/openclawTypes.js';

const execFileAsync = promisify(execFile);

const AGENT_REGISTRY_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/agent-registry.json';
const CACHE_TTL_MS = 30_000;

interface AgentRegistryEntry {
  agent_id: string;
  working_directory: string;
  [key: string]: unknown;
}

interface AgentRegistryFile {
  agents: AgentRegistryEntry[];
}

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
  private cachedWorkingDirectories: Map<string, string> | null = null;
  private workingDirectoriesLastReadAt = 0;

  private cachedContextFills: Map<string, AgentContextFill> | null = null;
  private contextFillsLastReadAt = 0;

  private hasLoggedCliWarning = false;

  async getWorkingDirectories(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.cachedWorkingDirectories && now - this.workingDirectoriesLastReadAt < CACHE_TTL_MS) {
      return this.cachedWorkingDirectories;
    }

    try {
      const rawContent = await readFile(AGENT_REGISTRY_PATH, 'utf-8');
      const registry = JSON.parse(rawContent) as AgentRegistryFile;
      const directoryMap = new Map<string, string>();

      for (const entry of registry.agents) {
        if (entry.agent_id && entry.working_directory) {
          directoryMap.set(entry.agent_id, entry.working_directory);
        }
      }

      this.cachedWorkingDirectories = directoryMap;
      this.workingDirectoriesLastReadAt = now;
      return directoryMap;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('[OpenClawSessionReader] Failed to read agent registry:', error.message);
      }
      if (this.cachedWorkingDirectories) {
        return this.cachedWorkingDirectories;
      }
      return new Map();
    }
  }

  async getContextFills(): Promise<Map<string, AgentContextFill>> {
    const now = Date.now();
    if (this.cachedContextFills && now - this.contextFillsLastReadAt < CACHE_TTL_MS) {
      return this.cachedContextFills;
    }

    try {
      const { stdout } = await execFileAsync('openclaw', ['sessions', '--all-agents', '--json'], {
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
