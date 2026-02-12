import { Router } from 'express';
import { openClawConfigReader } from '../services/OpenClawConfigReader.js';
import { tmuxSessionManager } from '../services/TmuxSessionManager.js';

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

  try {
    // Convention: GSD agent sessions are named {agentId}-gsd-main
    const sessionName = `${agentId}-gsd-main`;

    // Check if the session exists
    const exists = await tmuxSessionManager.sessionExists(sessionName);
    if (!exists) {
      response.status(404).json({
        success: false,
        error: `No tmux session found for agent '${agentId}' (expected session: ${sessionName})`
      });
      return;
    }

    // Check if Claude Code is actually running in the session
    const isClaudeRunning = await tmuxSessionManager.isClaudeCodeRunning(sessionName);
    if (!isClaudeRunning) {
      response.status(400).json({
        success: false,
        error: `Claude Code is not running in session '${sessionName}'. Please start Claude Code in this session first (e.g., run 'claude --dangerously-skip-permissions' in the ${agentId} terminal).`
      });
      return;
    }

    // Send the prompt to the tmux session
    await tmuxSessionManager.sendPromptToSession(sessionName, prompt.trim());

    response.json({
      success: true,
      message: `Prompt sent to ${agentId} (Claude Code)`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[agentRoutes] Failed to send prompt to ${agentId}:`, errorMessage);
    response.status(500).json({
      success: false,
      error: `Failed to send prompt to tmux session: ${errorMessage}`
    });
  }
});
