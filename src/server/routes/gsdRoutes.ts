import { Router } from 'express';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { openSync, closeSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { gsdRegistryService } from '../services/GsdRegistryService.js';
import { gsdHookLogWatcher } from '../services/GsdHookLogWatcher.js';
import { database } from '../database/DatabaseConnection.js';
import type { AgentStateHint, PressureLevel } from '@shared/gsdTypes.js';

const execFileAsync = promisify(execFile);

const SPAWN_SH_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/spawn.sh';
const MENU_DRIVER_PATH = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/scripts/menu-driver.sh';
const ALLOWED_ACTIONS = new Set(['snapshot', 'enter', 'esc', 'clear_then', 'choose', 'submit', 'type']);
const SESSION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const AGENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const COMMAND_ARG_RE = /^[/a-zA-Z0-9 @:._-]+$/;
const WORKDIR_PREFIX = '/home/forge/';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Live-status helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectAgentState(pane: string): AgentStateHint {
  if (/enter to select|numbered.*option/i.test(pane)) return 'menu';
  if (/permission|allow|dangerous/i.test(pane)) return 'permission_prompt';
  if (/what can i help|waiting for/i.test(pane)) return 'idle';
  const lines = pane.split('\n');
  for (const line of lines) {
    if (/error|failed|exception/i.test(line) && !/error handling/i.test(line)) {
      return 'error';
    }
  }
  return 'working';
}

function extractContextPressure(pane: string): { contextPressure: number | null; contextPressureLevel: PressureLevel | null } {
  const nonEmptyLines = pane.split('\n').filter((line) => line.trim().length > 0);
  // Filter to short lines (< 80 chars) typical of status bars, then look for
  // Unicode block/box-drawing characters or the word "context" preceding a percentage.
  // This avoids false positives from arbitrary terminal output like "npm install 45%".
  const statusCandidates = nonEmptyLines.slice(-5).filter((line) => line.trim().length < 80);
  const candidateText = statusCandidates.join('\n');
  const match = /(?:[\u2580-\u259F]|context).*?(\d{1,3})%/i.exec(candidateText);
  if (!match) {
    return { contextPressure: null, contextPressureLevel: null };
  }
  const percentage = parseInt(match[1], 10);
  const level: PressureLevel = percentage >= 80 ? 'critical' : percentage >= 50 ? 'warning' : 'ok';
  return { contextPressure: percentage, contextPressureLevel: level };
}

// GET /api/gsd/agents/live-status — capture tmux pane and return agent state + context pressure
router.get('/api/gsd/agents/live-status', async (_request, response) => {
  try {
    const registry = await gsdRegistryService.getRegistry();

    const results = await Promise.allSettled(
      registry.agents.map(async (agent) => {
        if (!agent.tmux_session_name) {
          return {
            agentId: agent.agent_id,
            sessionName: agent.tmux_session_name,
            state: null as AgentStateHint | null,
            contextPressure: null as number | null,
            contextPressureLevel: null as PressureLevel | null,
          };
        }

        try {
          const { stdout } = await execFileAsync('tmux', [
            'capture-pane', '-pt', `${agent.tmux_session_name}:0.0`, '-S', '-5',
          ]);
          const state = detectAgentState(stdout);
          const { contextPressure, contextPressureLevel } = extractContextPressure(stdout);
          return {
            agentId: agent.agent_id,
            sessionName: agent.tmux_session_name,
            state,
            contextPressure,
            contextPressureLevel,
          };
        } catch {
          // Dead session — return nulls
          return {
            agentId: agent.agent_id,
            sessionName: agent.tmux_session_name,
            state: null as AgentStateHint | null,
            contextPressure: null as number | null,
            contextPressureLevel: null as PressureLevel | null,
          };
        }
      }),
    );

    const agents = results.map((result) =>
      result.status === 'fulfilled'
        ? result.value
        : { agentId: '', sessionName: null, state: null, contextPressure: null, contextPressureLevel: null },
    );

    response.json({ agents });
  } catch (error) {
    console.error('[GsdRoutes] Failed to get live status:', error);
    response.status(500).json({ error: 'Failed to get live status' });
  }
});

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
