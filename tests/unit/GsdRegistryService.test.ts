// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockWriteFile, mockRename } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockRename: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rename: mockRename,
}));

// Import after mocks are set up
const { gsdRegistryService } = await import('../../src/server/services/GsdRegistryService.js');

const SAMPLE_REGISTRY = {
  global_status_openclaw_session_id: 'sess-001',
  global_status_openclaw_session_key: 'key-001',
  agents: [
    {
      agent_id: 'g2-frontend',
      enabled: true,
      working_directory: '/home/forge/project-a',
      tmux_session_name: 'g2-frontend-main',
      claude_launch_command: 'claude --dangerously-skip-permissions',
      auto_wake: false,
      topic_id: 42,
      openclaw_session_id: 'oc-001',
      claude_resume_target: '',
      claude_post_launch_mode: 'idle',
    },
    {
      agent_id: 'g2-backend',
      enabled: false,
      working_directory: '/home/forge/project-b',
      tmux_session_name: 'g2-backend-main',
      claude_launch_command: 'claude',
      auto_wake: true,
      topic_id: 43,
      openclaw_session_id: 'oc-002',
      claude_resume_target: '',
      claude_post_launch_mode: 'idle',
    },
    {
      agent_id: 'scout',
      enabled: true,
      working_directory: '',
      tmux_session_name: 'scout-main',
      claude_launch_command: 'claude',
      auto_wake: false,
      topic_id: 0,
      openclaw_session_id: '',
      claude_resume_target: '',
      claude_post_launch_mode: 'idle',
    },
  ],
};

describe('GsdRegistryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gsdRegistryService.clearCache();
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_REGISTRY));
  });

  describe('getRegistry', () => {
    it('reads and parses the registry file', async () => {
      const registry = await gsdRegistryService.getRegistry();
      expect(registry.agents).toHaveLength(3);
      expect(registry.agents[0].agent_id).toBe('g2-frontend');
    });

    it('caches subsequent calls within TTL', async () => {
      await gsdRegistryService.getRegistry();
      await gsdRegistryService.getRegistry();
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('re-reads after cache is cleared', async () => {
      await gsdRegistryService.getRegistry();
      gsdRegistryService.clearCache();
      await gsdRegistryService.getRegistry();
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAgent', () => {
    it('finds an agent by id', async () => {
      const agent = await gsdRegistryService.getAgent('g2-backend');
      expect(agent).toBeDefined();
      expect(agent!.enabled).toBe(false);
      expect(agent!.working_directory).toBe('/home/forge/project-b');
    });

    it('returns undefined for unknown agent', async () => {
      const agent = await gsdRegistryService.getAgent('nonexistent');
      expect(agent).toBeUndefined();
    });
  });

  describe('getWorkingDirectories', () => {
    it('returns a map of agent_id to working_directory', async () => {
      const dirs = await gsdRegistryService.getWorkingDirectories();
      expect(dirs.get('g2-frontend')).toBe('/home/forge/project-a');
      expect(dirs.get('g2-backend')).toBe('/home/forge/project-b');
    });

    it('skips agents with empty working_directory', async () => {
      const dirs = await gsdRegistryService.getWorkingDirectories();
      expect(dirs.has('scout')).toBe(false);
    });

    it('reuses cached registry (no extra file read)', async () => {
      await gsdRegistryService.getRegistry();
      await gsdRegistryService.getWorkingDirectories();
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('patchAgent', () => {
    it('updates the enabled flag and writes atomically', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      const updated = await gsdRegistryService.patchAgent('g2-backend', { enabled: true });
      expect(updated.enabled).toBe(true);
      expect(updated.agent_id).toBe('g2-backend');

      // Verify atomic write pattern: write to .tmp, then rename
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const writtenContent = JSON.parse(mockWriteFile.mock.calls[0][1]);
      const patchedAgent = writtenContent.agents.find(
        (a: { agent_id: string }) => a.agent_id === 'g2-backend',
      );
      expect(patchedAgent.enabled).toBe(true);

      expect(mockRename).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown agent', async () => {
      await expect(
        gsdRegistryService.patchAgent('nonexistent', { enabled: true }),
      ).rejects.toThrow('not found');
    });

    it('invalidates cache after write', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      await gsdRegistryService.getRegistry();
      await gsdRegistryService.patchAgent('g2-frontend', { enabled: false });

      // Next read should hit the file again
      await gsdRegistryService.getRegistry();
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });
});
