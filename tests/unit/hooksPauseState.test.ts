// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockReadFile, mockExecFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({ readFile: mockReadFile }));
vi.mock('fs', () => ({ openSync: vi.fn(() => 3), closeSync: vi.fn() }));
vi.mock('child_process', () => ({
  execFile: mockExecFile,
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));
vi.mock('util', () => ({
  promisify: (fn: unknown) => {
    if (fn === mockExecFile) return vi.fn((...args: unknown[]) => mockExecFile(...args));
    return vi.fn();
  },
}));

// Stub services used by gsdRoutes (we don't test those here)
vi.mock('../../src/server/services/GsdRegistryService.js', () => ({
  gsdRegistryService: {
    getRegistry: vi.fn().mockResolvedValue({ agents: [] }),
    getAgent: vi.fn(),
    patchAgent: vi.fn(),
    clearCache: vi.fn(),
  },
}));
vi.mock('../../src/server/services/GsdEventLogService.js', () => ({
  gsdEventLogService: { listLogFiles: vi.fn(), getRecentEvents: vi.fn() },
}));
vi.mock('../../src/server/database/DatabaseConnection.js', () => ({
  database: { upsertInstance: vi.fn() },
}));
vi.mock('../../src/server/services/OpenClawSessionReader.js', () => ({
  openClawSessionReader: { clearCaches: vi.fn() },
}));

// ── Import router after mocks ──────────────────────────────────────────────

const { gsdRoutes } = await import('../../src/server/routes/gsdRoutes.js');

// ── Test helpers ───────────────────────────────────────────────────────────

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
}

function findRouteHandler(method: string, routePath: string) {
  const router = gsdRoutes as unknown as { stack: RouteLayer[] };
  for (const layer of router.stack) {
    if (
      layer.route &&
      layer.route.path === routePath &&
      layer.route.methods[method]
    ) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${routePath}`);
}

function mockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/gsd/hooks-pause-state', () => {
  const handler = findRouteHandler('get', '/api/gsd/hooks-pause-state');

  beforeEach(() => vi.clearAllMocks());

  it('returns the parsed pause-state.json contents', async () => {
    const pauseData = {
      'agent-main': { paused: true, updatedAt: '2026-03-05T12:00:00Z' },
      'scout-main': { paused: false, updatedAt: '2026-03-05T11:00:00Z' },
    };
    mockReadFile.mockResolvedValue(JSON.stringify(pauseData));
    const res = mockResponse();

    await handler({} as Request, res);

    expect(res.json).toHaveBeenCalledWith(pauseData);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns empty object when pause-state.json does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const res = mockResponse();

    await handler({} as Request, res);

    expect(res.json).toHaveBeenCalledWith({});
  });

  it('returns empty object when pause-state.json contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not valid json {{{');
    const res = mockResponse();

    await handler({} as Request, res);

    expect(res.json).toHaveBeenCalledWith({});
  });
});

describe('PATCH /api/gsd/sessions/:session/hooks-paused', () => {
  const handler = findRouteHandler('patch', '/api/gsd/sessions/:session/hooks-paused');

  beforeEach(() => vi.clearAllMocks());

  it('rejects invalid session names', async () => {
    const req = {
      params: { session: '123-invalid' },
      body: { paused: true },
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Invalid session name') }),
    );
  });

  it('rejects non-boolean paused value', async () => {
    const req = {
      params: { session: 'agent-main' },
      body: { paused: 'yes' },
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'paused must be a boolean' }),
    );
  });

  it('rejects missing paused field', async () => {
    const req = {
      params: { session: 'agent-main' },
      body: {},
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'paused must be a boolean' }),
    );
  });

  it('calls pause-session.mjs with "on" when paused=true', async () => {
    const cliResult = { session: 'agent-main', paused: true };
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(cliResult) });

    const req = {
      params: { session: 'agent-main' },
      body: { paused: true },
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(mockExecFile).toHaveBeenCalledWith(
      'node',
      [expect.stringContaining('pause-session.mjs'), 'agent-main', 'on'],
    );
    expect(res.json).toHaveBeenCalledWith(cliResult);
  });

  it('calls pause-session.mjs with "off" when paused=false', async () => {
    const cliResult = { session: 'agent-main', paused: false };
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(cliResult) });

    const req = {
      params: { session: 'agent-main' },
      body: { paused: false },
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(mockExecFile).toHaveBeenCalledWith(
      'node',
      [expect.stringContaining('pause-session.mjs'), 'agent-main', 'off'],
    );
    expect(res.json).toHaveBeenCalledWith(cliResult);
  });

  it('returns 500 when CLI fails', async () => {
    mockExecFile.mockRejectedValue(new Error('Command failed'));

    const req = {
      params: { session: 'agent-main' },
      body: { paused: true },
    } as unknown as Request;
    const res = mockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to toggle pause state' }),
    );
  });
});
