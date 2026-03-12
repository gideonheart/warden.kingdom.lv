import { Router } from 'express';
import { openClawConfigReader } from '../services/OpenClawConfigReader.js';
import { openClawSessionReader } from '../services/OpenClawSessionReader.js';
import { gsdRegistryService } from '../services/GsdRegistryService.js';
import { gatewayApiClient } from '../services/GatewayApiClient.js';

export const agentRoutes = Router();

agentRoutes.get('/api/agents', async (_request, response) => {
  try {
    const [agents, workingDirectories, contextFills] = await Promise.all([
      openClawConfigReader.getAgents(),
      gsdRegistryService.getWorkingDirectories(),
      openClawSessionReader.getContextFills(),
    ]);

    const enrichedAgents = agents.map((agent) => ({
      ...agent,
      workingDirectory: workingDirectories.get(agent.id) ?? null,
      contextFill: contextFills.get(agent.id) ?? null,
    }));

    response.json({ agents: enrichedAgents });
  } catch {
    response.status(500).json({ error: 'Failed to read agent configuration' });
  }
});

agentRoutes.get('/api/agents/topics', async (_request, response) => {
  try {
    const mappings = await openClawConfigReader.getTopicMappings();
    response.json({ mappings });
  } catch {
    response.status(500).json({ error: 'Failed to read topic mappings' });
  }
});

agentRoutes.post('/api/agents/:agentId/prompt', async (request, response) => {
  const { agentId } = request.params;
  const { prompt } = request.body as { prompt?: string };

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    response.status(400).json({ error: 'prompt is required and must be a non-empty string' });
    return;
  }

  try {
    const result = await gatewayApiClient.sendPrompt(agentId, prompt.trim());

    if (result.success) {
      response.json({ success: true, message: result.message });
    } else {
      const statusCode = result.errorCategory === 'auth' ? 401
        : result.errorCategory === 'not_found' ? 404
        : result.errorCategory === 'server' ? 502
        : result.errorCategory === 'network' ? 503
        : 500;
      response.status(statusCode).json({ success: false, error: result.error });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[agentRoutes] Failed to send prompt to ${agentId}:`, errorMessage);
    response.status(500).json({
      success: false,
      error: `Failed to send prompt: ${errorMessage}`
    });
  }
});
