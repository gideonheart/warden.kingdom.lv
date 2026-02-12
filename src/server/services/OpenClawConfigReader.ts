import { readFile } from 'fs/promises';
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

  async getAgents(): Promise<AgentDetails[]> {
    const config = await this.getConfig();
    const defaults = config.agents.defaults;

    return config.agents.list.map((agent) => {
      const modelConfig = agent.model ?? defaults?.model;
      const model = typeof modelConfig === 'string'
        ? modelConfig
        : modelConfig?.primary ?? 'unknown';

      return {
        id: agent.id,
        name: agent.name,
        workspace: agent.workspace ?? defaults?.workspace ?? '',
        model,
        isDefault: agent.default ?? false,
        soulPreview: null,
      };
    });
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
