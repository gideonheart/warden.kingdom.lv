import { Router } from 'express';
import { instanceTracker } from '../services/InstanceTracker.js';
import { tmuxSessionManager } from '../services/TmuxSessionManager.js';

const router = Router();

router.get('/api/instances', async (_request, response) => {
  try {
    const instances = await instanceTracker.syncWithTmux();
    response.json({ instances });
  } catch (error) {
    console.error('[API] Failed to list instances:', error);
    response.status(500).json({ error: 'Failed to list instances' });
  }
});

router.get('/api/instances/:id', (request, response) => {
  const instanceId = parseInt(request.params.id, 10);
  const instance = instanceTracker.findInstanceById(instanceId);

  if (!instance) {
    response.status(404).json({ error: 'Instance not found' });
    return;
  }

  response.json({ instance });
});

router.post('/api/instances/:id/stop', async (request, response) => {
  const instanceId = parseInt(request.params.id, 10);
  const instance = instanceTracker.findInstanceById(instanceId);

  if (!instance) {
    response.status(404).json({ error: 'Instance not found' });
    return;
  }

  try {
    const sessionExists = await tmuxSessionManager.sessionExists(instance.tmuxSessionName);
    if (sessionExists) {
      await tmuxSessionManager.destroySession(instance.tmuxSessionName);
    }
    instanceTracker.updateStatus(instanceId, 'stopped');
    response.json({ success: true, instance: instanceTracker.findInstanceById(instanceId) });
  } catch (error) {
    console.error(`[API] Failed to stop instance ${instanceId}:`, error);
    response.status(500).json({ error: 'Failed to stop instance' });
  }
});

export { router as instanceRoutes };
