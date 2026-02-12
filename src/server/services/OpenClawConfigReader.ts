import { readFile, stat } from 'fs/promises';
import path from 'path';
import type { OpenClawConfig, AgentDetails, TopicMapping } from '../../shared/openclawTypes.js';

const CONFIG_PATH = path.resolve(process.env.HOME ?? '/home/forge', '.openclaw/openclaw.json');
const CACHE_TTL_MS = 30_000;

class OpenClawConfigReader {
  private cachedConfig: OpenClawConfig | null = null;
  private lastReadAt = 0;

  async getConfig(): Promise<OpenClawConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.lastReadAt < CACHE_TTL_MS) {
      return this.cachedConfig;
    }

    try {
      const rawContent = await readFile(CONFIG_PATH, 'utf-8');
      // Strip JSON5 comments (// and /* */ style)
      const jsonContent = rawContent
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1');
      this.cachedConfig = JSON.parse(jsonContent) as OpenClawConfig;
      this.lastReadAt = now;
      console.log(`[OpenClawConfig] Loaded config with ${this.cachedConfig.agents.list.length} agents`);
      return this.cachedConfig;
    } catch (error) {
      console.error('[OpenClawConfig] Failed to read config:', error);
      if (this.cachedConfig) {
        return this.cachedConfig;
      }
      throw error;
    }
  }

  private async readSoulPreview(workspacePath: string): Promise<string | null> {
    if (!workspacePath) {
      return null;
    }

    try {
      // Resolve workspace path
      const resolvedPath = path.isAbsolute(workspacePath)
        ? workspacePath
        : path.join(process.env.HOME ?? '/home/forge', '.openclaw', workspacePath);

      const soulPath = path.join(resolvedPath, 'SOUL.md');
      const content = await readFile(soulPath, 'utf-8');

      // Extract first 200 characters, then find last newline after char 100
      const truncated = content.slice(0, 200);
      const lastNewlineIndex = truncated.lastIndexOf('\n', 200);

      if (lastNewlineIndex > 100) {
        return truncated.slice(0, lastNewlineIndex).trim();
      }
      return truncated.trim();
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('[OpenClawConfig] Error reading SOUL.md:', error);
      }
      return null;
    }
  }

  private async getMemoryStatus(workspacePath: string): Promise<{ exists: boolean; sizeBytes: number | null }> {
    if (!workspacePath) {
      return { exists: false, sizeBytes: null };
    }

    try {
      // Resolve workspace path
      const resolvedPath = path.isAbsolute(workspacePath)
        ? workspacePath
        : path.join(process.env.HOME ?? '/home/forge', '.openclaw', workspacePath);

      const memoryPath = path.join(resolvedPath, 'MEMORY.md');
      const stats = await stat(memoryPath);

      return {
        exists: stats.isFile(),
        sizeBytes: stats.size,
      };
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('[OpenClawConfig] Error checking MEMORY.md:', error);
      }
      return { exists: false, sizeBytes: null };
    }
  }

  async getAgents(): Promise<AgentDetails[]> {
    const config = await this.getConfig();
    const defaults = config.agents.defaults;

    return await Promise.all(
      config.agents.list.map(async (agent) => {
        const modelConfig = agent.model ?? defaults?.model;
        const model = typeof modelConfig === 'string'
          ? modelConfig
          : modelConfig?.primary ?? 'unknown';

        const workspace = agent.workspace ?? defaults?.workspace ?? '';
        const soulPreview = await this.readSoulPreview(workspace);
        const memoryStatus = await this.getMemoryStatus(workspace);

        return {
          id: agent.id,
          name: agent.name,
          workspace,
          model,
          isDefault: agent.default ?? false,
          soulPreview,
          memoryExists: memoryStatus.exists,
          memorySizeBytes: memoryStatus.sizeBytes,
        };
      })
    );
  }

  async getTopicMappings(): Promise<TopicMapping[]> {
    const config = await this.getConfig();
    const mappings: TopicMapping[] = [];

    const telegram = config.channels?.telegram;
    if (!telegram?.enabled || !telegram.groups) {
      return mappings;
    }

    const agentMap = new Map(config.agents.list.map((a) => [a.id, a.name]));

    for (const [groupId, group] of Object.entries(telegram.groups)) {
      if (!group.topics) continue;
      for (const [topicId, topic] of Object.entries(group.topics)) {
        // Extract agent ID from system prompt if present
        const promptMatch = topic.systemPrompt?.match(/Agent responsible.*?is\s+(\w+)/i);
        const agentId = promptMatch?.[1]?.toLowerCase() ?? 'unknown';
        const agentName = agentMap.get(agentId) ?? agentId;

        mappings.push({
          agentId,
          agentName,
          groupId,
          topicId,
          systemPrompt: topic.systemPrompt ?? '',
        });
      }
    }

    return mappings;
  }

  async getGatewayUrl(): Promise<string> {
    const config = await this.getConfig();
    const port = config.gateway.port ?? 3434;
    return `http://127.0.0.1:${port}`;
  }

  async getGatewayToken(): Promise<string | null> {
    const config = await this.getConfig();
    return config.gateway.auth?.token ?? null;
  }
}

export const openClawConfigReader = new OpenClawConfigReader();
