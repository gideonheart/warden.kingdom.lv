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

  it('produces same signature regardless of input array order (sort by id)', () => {
    const instances1 = [
      makeInstance({ id: 2, tmuxSessionName: 'session-b', status: 'active' }),
      makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'idle' }),
    ];
    const instances2 = [
      makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'idle' }),
      makeInstance({ id: 2, tmuxSessionName: 'session-b', status: 'active' }),
    ];
    expect(computeInstanceSignature(instances1)).toBe(computeInstanceSignature(instances2));
  });
});

describe('computeInstanceSignature — polling diff suppression contract', () => {
  /**
   * The signature dedup in useActiveInstances is the first line of defense against
   * polling-triggered re-renders. If the signature is unchanged across two polls,
   * setInstances is NOT called, preventing all downstream re-renders.
   *
   * This test suite documents the contract: which fields are included in the
   * signature (and thus trigger re-renders when changed) vs. excluded (never
   * trigger re-renders).
   */

  it('includes id in signature — different ids produce different signatures', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' });
    const instance2 = makeInstance({ id: 2, tmuxSessionName: 'session-a', status: 'active' });
    expect(computeInstanceSignature([instance1])).not.toBe(computeInstanceSignature([instance2]));
  });

  it('includes tmuxSessionName in signature — name change produces different signature', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-b', status: 'active' });
    expect(computeInstanceSignature([instance1])).not.toBe(computeInstanceSignature([instance2]));
  });

  it('includes status in signature — status change produces different signature', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active' });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'stopped' });
    expect(computeInstanceSignature([instance1])).not.toBe(computeInstanceSignature([instance2]));
  });

  it('excludes agentName — agentName change does NOT produce different signature', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', agentName: 'Forge' });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', agentName: 'ForgeRenamed' });
    expect(computeInstanceSignature([instance1])).toBe(computeInstanceSignature([instance2]));
  });

  it('excludes projectPath — projectPath change does NOT produce different signature', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', projectPath: '/old' });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', projectPath: '/new' });
    expect(computeInstanceSignature([instance1])).toBe(computeInstanceSignature([instance2]));
  });

  it('excludes telegramTopicId — topic change does NOT produce different signature', () => {
    const instance1 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', telegramTopicId: null });
    const instance2 = makeInstance({ id: 1, tmuxSessionName: 'session-a', status: 'active', telegramTopicId: 42 });
    expect(computeInstanceSignature([instance1])).toBe(computeInstanceSignature([instance2]));
  });
});
