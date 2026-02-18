import { Router } from 'express';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';
import { gsdRegistryService } from '../services/GsdRegistryService.js';
import { gsdHookLogWatcher } from '../services/GsdHookLogWatcher.js';

const execFileAsync = promisify(execFile);

const SPAWN_SH_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh';
const MENU_DRIVER_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh';
const ALLOWED_ACTIONS = new Set(['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'submit', 'type']);
const SESSION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const AGENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const COMMAND_ARG_RE = /^[/a-zA-Z0-9 @:._-]+$/;
const WORKDIR_PREFIX = '/home/forge/';

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
router.post('/api/gsd/spawn', (request, response) => {
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
  if (!resolvedWorkdir.startsWith(WORKDIR_PREFIX)) {
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

  // Fire-and-forget: spawn detached so the 15-25s blocking spawn.sh does not block Node
  const child = spawn(
    SPAWN_SH_PATH,
    [agentName, resolvedWorkdir, ...(firstCommand ? [firstCommand as string] : [])],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  response.status(202).json({ message: 'Spawn initiated', agentName, workdir: resolvedWorkdir });
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

// GET /api/gsd/hooks/log — return last N lines from the hook log file
router.get('/api/gsd/hooks/log', (request, response) => {
  const rawLines = request.query.lines;
  let lineCount = 200;

  if (rawLines !== undefined) {
    const parsed = parseInt(String(rawLines), 10);
    if (!isNaN(parsed) && parsed > 0) {
      lineCount = Math.min(parsed, 1000);
    }
  }

  const lines = gsdHookLogWatcher.readLastLines(lineCount);
  response.json({ lines });
});

export { router as gsdRoutes };
