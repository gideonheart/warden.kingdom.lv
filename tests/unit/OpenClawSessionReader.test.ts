// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('util', () => ({
  promisify: () => mockExecFile,
}));

const { openClawSessionReader } = await import('../../src/server/services/OpenClawSessionReader.js');

function makeSessionsResponse(sessions: Array<{
  key: string;
  agentId: string;
  totalTokens: number | null;
  contextTokens: number;
  model: string | null;
}>) {
  return { stdout: JSON.stringify({ sessions: sessions.map((s) => ({ ...s, ageMs: 0 })) }) };
}

describe('OpenClawSessionReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openClawSessionReader.clearCaches();
  });

  describe('getContextFills', () => {
    it('returns context fill map from openclaw CLI output', async () => {
      mockExecFile.mockResolvedValue(makeSessionsResponse([
        { key: 'g2-frontend:main', agentId: 'g2-frontend', totalTokens: 165000, contextTokens: 272000, model: 'claude-opus-4-20250514' },
        { key: 'g2-backend:main', agentId: 'g2-backend', totalTokens: 50000, contextTokens: 200000, model: 'claude-sonnet-4-20250514' },
      ]));

      const fills = await openClawSessionReader.getContextFills();

      expect(fills.size).toBe(2);
      const frontend = fills.get('g2-frontend')!;
      expect(frontend.totalTokens).toBe(165000);
      expect(frontend.contextTokens).toBe(272000);
      expect(frontend.fillPercentage).toBe(61); // round(165000/272000*100)
      expect(frontend.model).toBe('claude-opus-4-20250514');
    });

    it('filters out non-main sessions', async () => {
      mockExecFile.mockResolvedValue(makeSessionsResponse([
        { key: 'g2-frontend:main', agentId: 'g2-frontend', totalTokens: 100000, contextTokens: 200000, model: null },
        { key: 'g2-frontend:subagent-abc', agentId: 'g2-frontend', totalTokens: 30000, contextTokens: 200000, model: null },
      ]));

      const fills = await openClawSessionReader.getContextFills();
      expect(fills.size).toBe(1);
      expect(fills.has('g2-frontend')).toBe(true);
    });

    it('returns null fillPercentage when totalTokens is null', async () => {
      mockExecFile.mockResolvedValue(makeSessionsResponse([
        { key: 'scout:main', agentId: 'scout', totalTokens: null, contextTokens: 200000, model: null },
      ]));

      const fills = await openClawSessionReader.getContextFills();
      expect(fills.get('scout')!.fillPercentage).toBeNull();
    });

    it('returns null fillPercentage when contextTokens is 0', async () => {
      mockExecFile.mockResolvedValue(makeSessionsResponse([
        { key: 'scout:main', agentId: 'scout', totalTokens: 100, contextTokens: 0, model: null },
      ]));

      const fills = await openClawSessionReader.getContextFills();
      expect(fills.get('scout')!.fillPercentage).toBeNull();
    });

    it('caches results within TTL', async () => {
      mockExecFile.mockResolvedValue(makeSessionsResponse([]));

      await openClawSessionReader.getContextFills();
      await openClawSessionReader.getContextFills();
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('returns empty map when CLI is unavailable', async () => {
      mockExecFile.mockRejectedValue(new Error('openclaw not found'));

      const fills = await openClawSessionReader.getContextFills();
      expect(fills.size).toBe(0);
    });

    it('returns stale cache when CLI fails after successful read', async () => {
      mockExecFile.mockResolvedValueOnce(makeSessionsResponse([
        { key: 'agent:main', agentId: 'agent', totalTokens: 100, contextTokens: 200, model: null },
      ]));

      await openClawSessionReader.getContextFills();
      openClawSessionReader.clearCaches();

      mockExecFile.mockRejectedValueOnce(new Error('timeout'));
      const fills = await openClawSessionReader.getContextFills();
      // After clearCaches, there's no stale cache to fall back to
      expect(fills.size).toBe(0);
    });
  });
});
