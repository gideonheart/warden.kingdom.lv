import { Router } from 'express';
import path from 'path';
import { instanceTracker } from '../services/InstanceTracker.js';
import { tmuxSessionManager } from '../services/TmuxSessionManager.js';
import { database } from '../database/DatabaseConnection.js';
import { openClawConfigReader } from '../services/OpenClawConfigReader.js';
import type { CrashRestartMode } from '../../shared/types.js';

const GRACE_PERIOD_MS = 5_000;
const GRACE_POLL_INTERVAL_MS = 500;
const START_LOG_DIR = '/tmp';

const router = Router();

// Helper: perform graceful stop of a tmux session.
// Returns true if session exited during grace period; false if force-killed.
async function gracefulStopSession(sessionName: string): Promise<boolean> {
  try {
    await tmuxSessionManager.sendCtrlC(sessionName);
  } catch {
    // Session may already be gone — treat as already stopped
    return true;
  }

  const deadline = Date.now() + GRACE_PERIOD_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, GRACE_POLL_INTERVAL_MS));
    const stillRunning = await tmuxSessionManager.sessionExists(sessionName);
    if (!stillRunning) {
      return true;
    }
  }

  // Grace period elapsed — force kill
  try {
    await tmuxSessionManager.destroySession(sessionName);
  } catch {
    // May already be gone
  }
  return false;
}

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

// GET /api/agents/last-projects — returns the most recent non-empty project_path per agent.
// Used by the quick-launch modal to pre-fill the project path field.
router.get('/api/agents/last-projects', (_request, response) => {
  try {
    const paths = database.getLastProjectPaths();
    response.json({ paths });
  } catch (error) {
    console.error('[API] Failed to get last project paths:', error);
    response.status(500).json({ error: 'Failed to get last project paths' });
  }
});

// POST /api/instances/start — create a new tmux session with Claude Code running inside.
// Returns 202 immediately; session appears in /api/instances within 10s via InstanceTracker.
// Returns 409 if the agent already has an active/starting session.
// Accepts optional `projectPath` in body to override the workspace path from openclaw.json.
router.post('/api/instances/start', async (request, response) => {
  const { agentId, projectPath: overridePath } = request.body as { agentId?: unknown; projectPath?: unknown };

  if (typeof agentId !== 'string' || !agentId.trim()) {
    response.status(400).json({ error: 'agentId is required and must be a non-empty string' });
    return;
  }

  const trimmedAgentId = agentId.trim();

  // Guard: check for duplicate active/starting session
  const existingInstance = instanceTracker.findActiveByAgentId(trimmedAgentId);
  if (existingInstance) {
    response.status(409).json({
      error: 'Agent already has an active session',
      existingInstance,
    });
    return;
  }

  // Look up agent config to obtain agent name (always required) and workspace path (used when no override)
  let projectPath: string;
  let agentName: string;
  try {
    const agents = await openClawConfigReader.getAgents();
    const agentConfig = agents.find(agent => agent.id === trimmedAgentId);
    if (!agentConfig) {
      response.status(404).json({ error: 'Agent not found in openclaw.json' });
      return;
    }
    agentName = agentConfig.name;

    if (typeof overridePath === 'string' && overridePath.trim()) {
      // Operator-supplied project path override (from quick-launch modal)
      projectPath = overridePath.trim();
    } else {
      // Default: derive project path from agent's configured workspace
      const rawWorkspace = agentConfig.workspace;
      projectPath = path.isAbsolute(rawWorkspace)
        ? rawWorkspace
        : path.join(process.env.HOME ?? '/home/forge', '.openclaw', rawWorkspace);
    }
  } catch (error) {
    console.error(`[API] Failed to read agent config for ${trimmedAgentId}:`, error);
    response.status(500).json({ error: 'Failed to read agent configuration' });
    return;
  }

  // Derive projectSlug from last path segment
  const projectSlug = path.basename(projectPath) || trimmedAgentId;

  // Build session name ahead of time for pre-registration
  const tmuxSessionName = tmuxSessionManager.buildSessionName(trimmedAgentId, projectSlug);

  // Pre-register instance with 'starting' status for immediate UI visibility
  const newInstance = database.upsertInstance({
    agentId: trimmedAgentId,
    agentName,
    tmuxSessionName,
    projectPath,
    telegramTopicId: undefined,
  });
  database.updateInstanceStatus(newInstance.id, 'starting');
  const startingInstance = instanceTracker.findInstanceById(newInstance.id)!;

  // Fire-and-forget the actual tmux+claude creation.
  // Using promise chain (not spawn) since tmux commands are fast (< 1s).
  const spawnLogPath = path.join(START_LOG_DIR, `warden-start-${trimmedAgentId}.log`);
  tmuxSessionManager.createSessionWithClaude(trimmedAgentId, projectSlug, projectPath)
    .then(() => {
      database.updateInstanceStatus(newInstance.id, 'active');
      console.log(`[API] Session started: ${tmuxSessionName}`);
    })
    .catch((error: unknown) => {
      database.updateInstanceStatus(newInstance.id, 'error');
      console.error(`[API] Failed to start session for ${trimmedAgentId} (log: ${spawnLogPath}):`, error);
    });

  console.log(`[API] Starting agent session: agentId=${trimmedAgentId} session=${tmuxSessionName}`);
  response.status(202).json({
    message: 'Starting agent session',
    instance: startingInstance,
  });
});

// POST /api/instances/:id/stop — graceful shutdown: sends Ctrl+C, waits up to 5s, then kills.
router.post('/api/instances/:id/stop', async (request, response) => {
  const instanceId = parseInt(request.params.id, 10);
  const instance = instanceTracker.findInstanceById(instanceId);

  if (!instance) {
    response.status(404).json({ error: 'Instance not found' });
    return;
  }

  if (instance.status === 'stopped' || instance.status === 'stopping') {
    response.status(409).json({ error: 'Session is already stopped or stopping' });
    return;
  }

  // Set optimistic stopping status for UI
  instanceTracker.updateStatus(instanceId, 'stopping');

  const stopStartedAt = Date.now();
  const projectSlug = path.basename(instance.projectPath) || instance.agentId;

  try {
    const sessionExists = await tmuxSessionManager.sessionExists(instance.tmuxSessionName);
    if (!sessionExists) {
      instanceTracker.updateStatus(instanceId, 'stopped');
      const uptimeSecs = (stopStartedAt - new Date(instance.createdAt).getTime()) / 1000;
      database.insertLifecycleEvent({
        sessionId: instance.id,
        agentId: instance.agentId,
        sessionName: instance.tmuxSessionName,
        eventType: 'stopped',
        outcome: 'already-gone',
        uptimeSecs,
        projectSlug,
        lastKnownState: instance.status,
        stopReason: 'operator-stop',
      });
      response.json({ success: true, instance: instanceTracker.findInstanceById(instanceId), forcedKill: false });
      return;
    }

    const exitedGracefully = await gracefulStopSession(instance.tmuxSessionName);
    instanceTracker.updateStatus(instanceId, 'stopped');
    const uptimeSecs = (Date.now() - new Date(instance.createdAt).getTime()) / 1000;
    database.insertLifecycleEvent({
      sessionId: instance.id,
      agentId: instance.agentId,
      sessionName: instance.tmuxSessionName,
      eventType: 'stopped',
      outcome: exitedGracefully ? 'graceful' : 'force-killed',
      uptimeSecs,
      projectSlug,
      lastKnownState: instance.status,
      stopReason: 'operator-stop',
    });

    response.json({
      success: true,
      instance: instanceTracker.findInstanceById(instanceId),
      forcedKill: !exitedGracefully,
    });
  } catch (error) {
    console.error(`[API] Failed to stop instance ${instanceId}:`, error);
    response.status(500).json({ error: 'Failed to stop instance' });
  }
});

// POST /api/instances/:id/restart — stop (if running) then start with same agent identity.
router.post('/api/instances/:id/restart', async (request, response) => {
  const instanceId = parseInt(request.params.id, 10);
  const instance = instanceTracker.findInstanceById(instanceId);

  if (!instance) {
    response.status(404).json({ error: 'Instance not found' });
    return;
  }

  const { agentId, projectPath } = instance;

  // Stop if currently running
  if (instance.status === 'active' || instance.status === 'idle' || instance.status === 'starting') {
    instanceTracker.updateStatus(instanceId, 'stopping');
    try {
      const sessionExists = await tmuxSessionManager.sessionExists(instance.tmuxSessionName);
      if (sessionExists) {
        await gracefulStopSession(instance.tmuxSessionName);
      }
    } catch (error) {
      console.error(`[API] Restart: failed to stop instance ${instanceId}:`, error);
    }
    instanceTracker.updateStatus(instanceId, 'stopped');
  }

  // Derive slug for new session
  const projectSlug = path.basename(projectPath) || agentId;

  // Build new session name for fresh start
  const tmuxSessionName = tmuxSessionManager.buildSessionName(agentId, projectSlug);

  // Pre-register the restarted session
  const newInstance = database.upsertInstance({
    agentId,
    agentName: instance.agentName,
    tmuxSessionName,
    projectPath,
    telegramTopicId: instance.telegramTopicId ?? undefined,
  });
  database.updateInstanceStatus(newInstance.id, 'starting');
  const startingInstance = instanceTracker.findInstanceById(newInstance.id)!;

  // Fire-and-forget start
  tmuxSessionManager.createSessionWithClaude(agentId, projectSlug, projectPath)
    .then(() => {
      database.updateInstanceStatus(newInstance.id, 'active');
      console.log(`[API] Restarted session: ${tmuxSessionName}`);
    })
    .catch((error: unknown) => {
      database.updateInstanceStatus(newInstance.id, 'error');
      console.error(`[API] Failed to restart session for ${agentId}:`, error);
    });

  console.log(`[API] Restarting agent session: agentId=${agentId} session=${tmuxSessionName}`);
  response.status(202).json({
    message: 'Restarting agent session',
    instance: startingInstance,
  });
});

// POST /api/instances/:id/force-kill — immediately destroys the tmux session, skipping grace period.
// Intended for use when the operator wants to skip the 5s graceful stop wait.
router.post('/api/instances/:id/force-kill', async (request, response) => {
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
    console.error(`[API] Failed to force-kill instance ${instanceId}:`, error);
    response.status(500).json({ error: 'Failed to force-kill instance' });
  }
});

// GET /api/lifecycle-events — query session lifecycle events (crashes, stops, starts)
router.get('/api/lifecycle-events', (request, response) => {
  try {
    const agentId = typeof request.query.agentId === 'string' ? request.query.agentId : undefined;
    const eventType = typeof request.query.eventType === 'string' ? request.query.eventType : undefined;
    const limit = typeof request.query.limit === 'string' ? parseInt(request.query.limit, 10) : undefined;
    const offset = typeof request.query.offset === 'string' ? parseInt(request.query.offset, 10) : undefined;

    const result = database.getLifecycleEvents({ agentId, eventType, limit, offset });
    response.json(result);
  } catch (error) {
    console.error('[API] Failed to get lifecycle events:', error);
    response.status(500).json({ error: 'Failed to get lifecycle events' });
  }
});

// GET /api/restart-policies — list all configured per-agent crash restart policies
router.get('/api/restart-policies', (_request, response) => {
  try {
    const policies = database.getAllRestartPolicies();
    response.json({ policies });
  } catch (error) {
    console.error('[API] Failed to get restart policies:', error);
    response.status(500).json({ error: 'Failed to get restart policies' });
  }
});

const VALID_CRASH_RESTART_MODES: CrashRestartMode[] = ['none', 'once', 'always'];

// PUT /api/restart-policies/:agentId — set crash restart mode for an agent
router.put('/api/restart-policies/:agentId', (request, response) => {
  const { agentId } = request.params;
  const { crashRestartMode } = request.body as { crashRestartMode?: unknown };

  if (!crashRestartMode || !VALID_CRASH_RESTART_MODES.includes(crashRestartMode as CrashRestartMode)) {
    response.status(400).json({
      error: `crashRestartMode must be one of: ${VALID_CRASH_RESTART_MODES.join(', ')}`,
    });
    return;
  }

  try {
    database.setRestartPolicy(agentId, crashRestartMode as CrashRestartMode);
    const policy = database.getRestartPolicy(agentId);
    response.json({ policy });
  } catch (error) {
    console.error(`[API] Failed to set restart policy for ${agentId}:`, error);
    response.status(500).json({ error: 'Failed to set restart policy' });
  }
});

export { router as instanceRoutes };
