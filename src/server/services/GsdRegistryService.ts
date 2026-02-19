import { readFile, writeFile, rename } from 'fs/promises';
import type { RegistryAgent, GsdRegistry } from '@shared/gsdTypes.js';

export type { RegistryAgent, GsdRegistry } from '@shared/gsdTypes.js';

const REGISTRY_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/config/recovery-registry.json';
const CACHE_TTL_MS = 30_000;

class GsdRegistryService {
  private cachedRegistry: GsdRegistry | null = null;
  private lastReadAt = 0;

  async getRegistry(): Promise<GsdRegistry> {
    const now = Date.now();
    if (this.cachedRegistry && now - this.lastReadAt < CACHE_TTL_MS) {
      return this.cachedRegistry;
    }

    try {
      const raw = await readFile(REGISTRY_PATH, 'utf-8');
      this.cachedRegistry = JSON.parse(raw) as GsdRegistry;
      this.lastReadAt = now;
      console.log(`[GsdRegistry] Loaded registry with ${this.cachedRegistry.agents.length} agents`);
      return this.cachedRegistry;
    } catch (error) {
      console.error('[GsdRegistry] Failed to read registry:', error);
      if (this.cachedRegistry) {
        return this.cachedRegistry;
      }
      throw error;
    }
  }

  async getAgent(agentId: string): Promise<RegistryAgent | undefined> {
    const registry = await this.getRegistry();
    return registry.agents.find((agent) => agent.agent_id === agentId);
  }

  async patchAgent(
    agentId: string,
    patch: Partial<Pick<RegistryAgent, 'enabled'>>,
  ): Promise<RegistryAgent> {
    const registry = await this.getRegistry();
    const agentIndex = registry.agents.findIndex((agent) => agent.agent_id === agentId);

    if (agentIndex === -1) {
      throw new Error(`Agent not found in registry: ${agentId}`);
    }

    const updatedAgent: RegistryAgent = { ...registry.agents[agentIndex], ...patch };
    const updatedRegistry: GsdRegistry = {
      ...registry,
      agents: registry.agents.map((agent, index) =>
        index === agentIndex ? updatedAgent : agent,
      ),
    };

    // Atomic write: write to .tmp sibling, then rename (POSIX-atomic on same filesystem)
    const tmpPath = `${REGISTRY_PATH}.tmp`;
    await writeFile(tmpPath, JSON.stringify(updatedRegistry, null, 2), 'utf-8');
    await rename(tmpPath, REGISTRY_PATH);

    // Invalidate cache immediately after write
    this.cachedRegistry = null;
    this.lastReadAt = 0;

    console.log(`[GsdRegistry] Patched agent ${agentId}:`, patch);
    return updatedAgent;
  }
}

export const gsdRegistryService = new GsdRegistryService();
