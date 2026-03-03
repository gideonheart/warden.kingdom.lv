import { describe, it, expect } from 'vitest';
import { computeInstanceSignature } from '../../src/client/hooks/useActiveInstances.js';
import type { AgentInstance } from '../../src/shared/types.js';

function makeInstance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 1,
    agentId: 'forge',
    agentName: 'Forge',
    tmuxSessionName: 'forge-project-abc123',
    status: 'active',
    projectPath: '/home/forge/project',
    telegramTopicId: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastActiveAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeInstanceSignature', () => {
  it('produces the same signature for the same instances in the same order', () => {
    const instances = [
      makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' }),
      makeInstance({ id: 2, tmuxSessionName: 'session-b', status: 'idle' }),
    ];
    const sig1 = computeInstanceSignature(instances);
    const sig2 = computeInstanceSignature([...instances]);
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures when status changes', () => {
    const instances1 = [makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' })];
    const instances2 = [makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'idle' })];
    expect(computeInstanceSignature(instances1)).not.toBe(computeInstanceSignature(instances2));
  });

  it('produces different signatures when an instance is added', () => {
    const base = [makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' })];
    const withExtra = [
      ...base,
      makeInstance({ id: 2, tmuxSessionName: 'session-b', status: 'active' }),
    ];
    expect(computeInstanceSignature(base)).not.toBe(computeInstanceSignature(withExtra));
  });

  it('produces different signatures when an instance is removed', () => {
    const full = [
      makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' }),
      makeInstance({ id: 2, tmuxSessionName: 'session-b', status: 'idle' }),
    ];
    const reduced = [full[0]];
    expect(computeInstanceSignature(full)).not.toBe(computeInstanceSignature(reduced));
  });

  it('produces the same signature when non-signature fields change (e.g. lastActiveAt)', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', lastActiveAt: '2026-01-01T00:00:00Z' });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', lastActiveAt: '2026-01-02T12:00:00Z' });
    expect(computeInstanceSignature([instance1])).toBe(computeInstanceSignature([instance2]));
  });
});
