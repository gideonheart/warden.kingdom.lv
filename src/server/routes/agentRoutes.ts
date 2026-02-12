import { Router } from 'express';
import { openClawConfigReader } from '../services/OpenClawConfigReader.js';
import { gatewayApiClient } from '../services/GatewayApiClient.js';

export const agentRoutes = Router();

agentRoutes.get('/api/agents', async (_request, response) => {
  try {
    const agents = await openClawConfigReader.getAgents();
    response.json({ agents });
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

  const result = await gatewayApiClient.sendPrompt(agentId, prompt.trim());

  if (result.success) {
    response.json(result);
  } else {
    response.status(502).json(result);
  }
});
