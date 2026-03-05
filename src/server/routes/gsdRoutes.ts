import { Router } from 'express';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { openSync, closeSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { gsdRegistryService } from '../services/GsdRegistryService.js';
import { gsdEventLogService } from '../services/GsdEventLogService.js';
import { database } from '../database/DatabaseConnection.js';
import { openClawSessionReader } from '../services/OpenClawSessionReader.js';
import { SPAWN_SH_PATH, MENU_DRIVER_PATH, ROTATE_SESSION_PATH, PAUSE_SESSION_PATH, PAUSE_STATE_FILE_PATH } from '../config/externalPaths.js';

const execFileAsync = promisify(execFile);
const ALLOWED_ACTIONS = new Set(['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'submit', 'type']);
const SESSION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const AGENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const COMMAND_ARG_RE = /^[/a-zA-Z0-9 @:._-]+$/;
const WORKDIR_PREFIX = '/home/forge/';

/**
 * Read the pause-state.json file and return the parsed map.
 * Returns empty object on any error (fail-open, matches gsd-code-skill behavior).
 */
async function readPauseStateMap(): Promise<Record<string, { paused: boolean; updatedAt: string }>> {
  try {
    const rawContent = await readFile(PAUSE_STATE_FILE_PATH, 'utf-8');
    return JSON.parse(rawContent);
  } catch {
    return {};
  }
}

const router = Router();

// GET /api/gsd/registry — return full registry JSON
router.get('/api/gsd/registry', async (_request, response) => {
  try {
    const registry = await gsdRegistryService.getRegistry();
    response.json(registry);
  } catch (error) {
    console.error('[GsdRoutes] Failed to read registry:', error);
    response.status(500).json({ error: 'Failed to read registry' });
  }
});

// PATCH /api/gsd/registry/agents/:agentId — toggle enabled flag on agent
router.patch('/api/gsd/registry/agents/:agentId', async (request, response) => {
  const agentId = String(request.params.agentId);

  if (!AGENT_NAME_RE.test(agentId)) {
    response.status(400).json({ error: 'Invalid agentId: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  const { enabled } = request.body as { enabled?: unknown };

  if (typeof enabled !== 'boolean') {
    response.status(400).json({ error: 'enabled must be a boolean' });
    return;
  }

  try {
    const updatedAgent = await gsdRegistryService.patchAgent(agentId, { enabled });
    response.json(updatedAgent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      response.status(404).json({ error: message });
    } else {
      console.error(`[GsdRoutes] Failed to patch agent ${agentId}:`, error);
      response.status(500).json({ error: 'Failed to patch agent' });
    }
  }
});

// POST /api/gsd/spawn — fire-and-forget agent spawn; returns 202 immediately
router.post('/api/gsd/spawn', async (request, response) => {
  const { agentName, workdir, firstCommand } = request.body as {
    agentName?: unknown;
    workdir?: unknown;
    firstCommand?: unknown;
  };

  if (typeof agentName !== 'string' || !agentName) {
    response.status(400).json({ error: 'agentName is required and must be a non-empty string' });
    return;
  }

  if (!AGENT_NAME_RE.test(agentName)) {
    response.status(400).json({ error: 'Invalid agentName: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  if (typeof workdir !== 'string' || !workdir) {
    response.status(400).json({ error: 'workdir is required and must be a non-empty string' });
    return;
  }

  const resolvedWorkdir = path.resolve(workdir);
  if (resolvedWorkdir !== '/home/forge' && !resolvedWorkdir.startsWith(WORKDIR_PREFIX)) {
    response.status(400).json({ error: 'workdir must be within /home/forge/' });
    return;
  }

  if (firstCommand !== undefined) {
    if (typeof firstCommand !== 'string') {
      response.status(400).json({ error: 'firstCommand must be a string' });
      return;
    }
    if (!COMMAND_ARG_RE.test(firstCommand)) {
      response.status(400).json({ error: 'firstCommand contains disallowed characters; only letters, digits, spaces and /@:._- are permitted' });
      return;
    }
  }

  // Look up agent in registry to predict session name and validate it exists
  let expectedSessionName = `${agentName}-main`;
  try {
    const agent = await gsdRegistryService.getAgent(agentName);
    if (agent?.tmux_session_name) {
      expectedSessionName = agent.tmux_session_name;
    }
  } catch {
    // Registry read failed — proceed with default session name prediction
  }

  // Pre-register the session in the instances database for immediate /api/instances visibility.
  // InstanceTracker will confirm the session on its next 10s poll once tmux session exists.
  // If spawn.sh fails, the next poll will mark it as stopped — correct behavior.
  database.upsertInstance({
    agentId: agentName,
    agentName: agentName.charAt(0).toUpperCase() + agentName.slice(1),
    tmuxSessionName: expectedSessionName,
    projectPath: resolvedWorkdir,
    telegramTopicId: undefined,
  });

  // Fire-and-forget: spawn detached so the 15-25s blocking spawn.sh does not block Node.
  // Log output to /tmp for debugging instead of stdio: 'ignore'.
  const spawnLogPath = `/tmp/gsd-spawn-${agentName}.log`;
  const logFd = openSync(spawnLogPath, 'w');
  try {
    const child = spawn(
      SPAWN_SH_PATH,
      [agentName, resolvedWorkdir, ...(firstCommand ? [firstCommand as string] : [])],
      { detached: true, stdio: ['ignore', logFd, logFd] },
    );
    child.unref();
  } finally {
    closeSync(logFd);
  }

  console.log(`[GsdRoutes] Spawn initiated: agent=${agentName} session=${expectedSessionName} log=${spawnLogPath}`);
  response.status(202).json({
    message: 'Spawn initiated',
    agentName,
    workdir: resolvedWorkdir,
    expectedSessionName,
    spawnLogFile: spawnLogPath,
  });
});

// POST /api/gsd/sessions/:session/command — dispatch a menu-driver action to a tmux session
router.post('/api/gsd/sessions/:session/command', async (request, response) => {
  const session = String(request.params.session);

  if (!SESSION_NAME_RE.test(session)) {
    response.status(400).json({ error: 'Invalid session name: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  const { action, args } = request.body as { action?: unknown; args?: unknown };

  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    response.status(400).json({
      error: `action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
    });
    return;
  }

  if (args !== undefined) {
    if (typeof args !== 'string') {
      response.status(400).json({ error: 'args must be a string' });
      return;
    }
    if (!COMMAND_ARG_RE.test(args)) {
      response.status(400).json({ error: 'args contains disallowed characters; only letters, digits, spaces and /@:._- are permitted' });
      return;
    }
  }

  try {
    const { stdout } = await execFileAsync(
      MENU_DRIVER_PATH,
      [session, action, ...(args ? [args] : [])],
    );
    response.json({ dispatched: true, output: stdout.trim() });
  } catch (error) {
    console.error(`[GsdRoutes] menu-driver.sh failed for session ${session}:`, error);
    response.status(500).json({ error: 'Failed to dispatch command' });
  }
});

// GET /api/gsd/hooks-pause-state — return bulk pause state map for all sessions
router.get('/api/gsd/hooks-pause-state', async (_request, response) => {
  try {
    const pauseStateMap = await readPauseStateMap();
    response.json(pauseStateMap);
  } catch (error) {
    console.error('[GsdRoutes] Failed to read hooks pause state:', error);
    response.status(500).json({ error: 'Failed to read pause state' });
  }
});

// PATCH /api/gsd/sessions/:session/hooks-paused — toggle auto-drive hooks pause state
router.patch('/api/gsd/sessions/:session/hooks-paused', async (request, response) => {
  const session = String(request.params.session);

  if (!SESSION_NAME_RE.test(session)) {
    response.status(400).json({ error: 'Invalid session name: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  const { paused } = request.body as { paused?: unknown };

  if (typeof paused !== 'boolean') {
    response.status(400).json({ error: 'paused must be a boolean' });
    return;
  }

  try {
    const action = paused ? 'on' : 'off';
    const { stdout } = await execFileAsync('node', [PAUSE_SESSION_PATH, session, action]);
    const result = JSON.parse(stdout);
    response.json(result);
  } catch (error) {
    console.error(`[GsdRoutes] Failed to toggle hooks-paused for ${session}:`, error);
    response.status(500).json({ error: 'Failed to toggle pause state' });
  }
});

// GET /api/gsd/sessions/:session/state — read STATE.md from agent working directory
router.get('/api/gsd/sessions/:session/state', async (request, response) => {
  const session = String(request.params.session);

  if (!SESSION_NAME_RE.test(session)) {
    response.status(400).json({ error: 'Invalid session name: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  try {
    const registry = await gsdRegistryService.getRegistry();
    const agentEntry = registry.agents.find((agent) => agent.tmux_session_name === session);

    if (!agentEntry) {
      response.status(404).json({ error: `No agent found for session: ${session}` });
      return;
    }

    const statePath = path.join(agentEntry.working_directory, '.planning', 'STATE.md');

    try {
      const stateContent = await readFile(statePath, 'utf-8');
      response.json({ sessionName: session, stateContent });
    } catch (fileError) {
      const code = (fileError as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        response.json({ sessionName: session, stateContent: null });
      } else {
        console.error(`[GsdRoutes] Failed to read STATE.md for session ${session}:`, fileError);
        response.status(500).json({ error: 'Failed to read STATE.md' });
      }
    }
  } catch (error) {
    console.error(`[GsdRoutes] Failed to look up agent for session ${session}:`, error);
    response.status(500).json({ error: 'Failed to get session state' });
  }
});

// GET /api/gsd/events/sources — list available JSONL log files
router.get('/api/gsd/events/sources', async (_request, response) => {
  try {
    const sources = await gsdEventLogService.listLogFiles();
    response.setHeader('Content-Type', 'application/json');
    response.json({ sources });
  } catch (error) {
    console.error('[GsdRoutes] Failed to list event sources:', error);
    response.status(500).json({ error: 'Failed to list event sources' });
  }
});

// GET /api/gsd/events — return recent agent events from JSONL logs
// Optional query params: limit (number, max 500), source (JSONL filename to filter to single file)
router.get('/api/gsd/events', async (request, response) => {
  const rawLimit = request.query.limit;
  let limit = 100;

  if (rawLimit !== undefined) {
    const parsed = parseInt(String(rawLimit), 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 500);
    }
  }

  const rawSource = request.query.source;
  const source = typeof rawSource === 'string' && rawSource ? rawSource : undefined;

  try {
    const events = await gsdEventLogService.getRecentEvents(limit, source);
    response.setHeader('Content-Type', 'application/json');
    response.json({ events });
  } catch (error) {
    console.error('[GsdRoutes] Failed to get events:', error);
    response.status(500).json({ error: 'Failed to read event logs' });
  }
});

// POST /api/gsd/agents/:agentId/rotate-session — rotate the OpenClaw session for an agent
router.post('/api/gsd/agents/:agentId/rotate-session', async (request, response) => {
  const agentId = String(request.params.agentId);

  if (!AGENT_NAME_RE.test(agentId)) {
    response.status(400).json({ error: 'Invalid agentId: must start with a letter and contain only letters, digits, hyphens, underscores' });
    return;
  }

  const { label } = (request.body ?? {}) as { label?: unknown };

  if (label !== undefined) {
    if (typeof label !== 'string' || label.length > 200) {
      response.status(400).json({ error: 'label must be a string with max 200 characters' });
      return;
    }
  }

  console.log('[GsdRoutes] Rotating session for agent:', agentId);

  try {
    const args = [ROTATE_SESSION_PATH, agentId];
    if (typeof label === 'string' && label) {
      args.push('--label', label);
    }

    const { stdout, stderr } = await execFileAsync('node', args, { timeout: 30000 });

    // Parse old/new session IDs from log output
    let oldSessionId: string | undefined;
    let newSessionId: string | undefined;

    const oldMatch = stdout.match(/Old:\s+(\S+)/);
    const newMatch = stdout.match(/New:\s+(\S+)/);
    if (oldMatch) oldSessionId = oldMatch[1];
    if (newMatch) newSessionId = newMatch[1];

    if (stderr && !oldSessionId && !newSessionId) {
      console.warn('[GsdRoutes] rotate-session stderr:', stderr);
    }

    // Invalidate server caches so next client poll gets fresh data
    gsdRegistryService.clearCache();
    openClawSessionReader.clearCaches();

    response.json({ rotated: true, agentId, oldSessionId, newSessionId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: string }).stderr ?? '';
    console.error(`[GsdRoutes] Session rotation failed for agent ${agentId}:`, errorMessage);
    response.status(500).json({ error: 'Session rotation failed', details: stderr || errorMessage });
  }
});

export { router as gsdRoutes };
