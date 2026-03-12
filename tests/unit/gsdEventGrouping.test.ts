// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { groupRawEvents } from '../../src/client/utils/gsdEventGrouping.js';
import type { GsdRawEvent, GsdDisplayEvent } from '../../src/shared/gsdTypes.js';

function makeRawEvent(overrides: Partial<GsdRawEvent> & { event: GsdRawEvent['event'] }): GsdRawEvent {
  return {
    timestamp: '2026-03-05T12:00:00.000Z',
    session: 'test-session',
    payload: {},
    ...overrides,
  };
}

describe('groupRawEvents', () => {
  describe('tool event pairing', () => {
    it('merges PreToolUse + PostToolUse into a single tool event', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          timestamp: '2026-03-05T12:00:01.000Z',
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-1', tool_name: 'Read', tool_input: { file_path: '/home/forge/src/app.ts' } },
        }),
        makeRawEvent({
          timestamp: '2026-03-05T12:00:02.000Z',
          event: 'PostToolUse',
          payload: { tool_use_id: 'tu-1', tool_name: 'Read' },
        }),
      ];

      // Events come from server newest-first
      const result = groupRawEvents(events.reverse());
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('tool');
      expect(result[0].toolName).toBe('Read');
      expect(result[0].summary).toBe('src/app.ts');
    });

    it('marks tool as failure on PostToolUseFailure', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          timestamp: '2026-03-05T12:00:01.000Z',
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-2', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run tests' } },
        }),
        makeRawEvent({
          timestamp: '2026-03-05T12:00:02.000Z',
          event: 'PostToolUseFailure',
          payload: { tool_use_id: 'tu-2', tool_name: 'Bash', error: 'exit code 1' },
        }),
      ];

      const result = groupRawEvents(events.reverse());
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('tool_failure');
      expect(result[0].error).toBe('exit code 1');
    });

    it('creates standalone entry for PostToolUseFailure without matching Pre', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          timestamp: '2026-03-05T12:00:01.000Z',
          event: 'PostToolUseFailure',
          payload: { tool_use_id: 'tu-orphan', tool_name: 'Grep', error: 'No matches' },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('tool_failure');
      expect(result[0].toolName).toBe('Grep');
    });
  });

  describe('AskUserQuestion handling', () => {
    it('merges question from Pre with answer from Post', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          timestamp: '2026-03-05T12:00:01.000Z',
          event: 'PreToolUse',
          payload: {
            tool_use_id: 'tu-ask',
            tool_name: 'AskUserQuestion',
            tool_input: {
              questions: [{ question: 'Trust this folder?', options: [{ label: 'Yes' }, { label: 'No' }], multiSelect: false }],
            },
          },
        }),
        makeRawEvent({
          timestamp: '2026-03-05T12:00:05.000Z',
          event: 'PostToolUse',
          payload: {
            tool_use_id: 'tu-ask',
            tool_name: 'AskUserQuestion',
            tool_response: {
              answers: { 'Trust this folder?': 'Yes' },
              annotations: { 'Trust this folder?': { notes: 'auto-approved' } },
            },
          },
        }),
      ];

      const result = groupRawEvents(events.reverse());
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('ask_question');
      expect(result[0].questions).toHaveLength(1);
      expect(result[0].questions![0].answer).toBe('Yes');
      expect(result[0].questions![0].notes).toBe('auto-approved');
    });
  });

  describe('standalone events', () => {
    it('maps lifecycle events correctly', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({ timestamp: '2026-03-05T12:00:00.000Z', event: 'SessionStart', payload: { source: 'operator' } }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:01.000Z', event: 'Stop', payload: {} }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:02.000Z', event: 'SessionEnd', payload: { reason: 'context_full' } }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:03.000Z', event: 'SubagentStart', payload: { subagent_type: 'gsd-executor' } }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:04.000Z', event: 'SubagentStop', payload: { subagent_type: 'gsd-executor' } }),
      ];

      const result = groupRawEvents(events.reverse());
      expect(result).toHaveLength(5);

      const summaries = result.map((e) => e.summary);
      expect(summaries).toContain('Session started (operator)');
      expect(summaries).toContain('Agent stopped');
      expect(summaries).toContain('Session ended (context_full)');
      expect(summaries).toContain('Subagent gsd-executor started');
      expect(summaries).toContain('Subagent gsd-executor stopped');

      result.forEach((e) => expect(e.eventType).toBe('lifecycle'));
    });

    it('maps UserPromptSubmit as prompt event', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          timestamp: '2026-03-05T12:00:00.000Z',
          event: 'UserPromptSubmit',
          payload: { prompt: '/gsd:progress' },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('prompt');
      expect(result[0].summary).toBe('/gsd:progress');
      expect(result[0].detail).toBe('/gsd:progress');
    });
  });

  describe('noise filtering', () => {
    it('filters out Notification and PermissionRequest events', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({ event: 'Notification', payload: { message: 'something' } }),
        makeRawEvent({ event: 'PermissionRequest', payload: {} }),
        makeRawEvent({ event: 'Stop', payload: {} }),
      ];

      const result = groupRawEvents(events);
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Agent stopped');
    });
  });

  describe('ordering', () => {
    it('returns events newest-first', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({ timestamp: '2026-03-05T12:00:01.000Z', event: 'SessionStart', payload: {} }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:03.000Z', event: 'Stop', payload: {} }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:02.000Z', event: 'UserPromptSubmit', payload: { prompt: 'hello' } }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].timestamp).toBe('2026-03-05T12:00:03.000Z');
      expect(result[1].timestamp).toBe('2026-03-05T12:00:02.000Z');
      expect(result[2].timestamp).toBe('2026-03-05T12:00:01.000Z');
    });
  });

  describe('tool summary building', () => {
    it('strips /home/forge/ prefix from file paths', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-r', tool_name: 'Read', tool_input: { file_path: '/home/forge/warden/src/index.ts' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toBe('warden/src/index.ts');
    });

    it('shows Bash description when available', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-b', tool_name: 'Bash', tool_input: { command: 'npm run build 2>&1', description: 'Build project' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toBe('Build project');
    });

    it('falls back to command for Bash without description', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-b2', tool_name: 'Bash', tool_input: { command: 'ls -la' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toBe('ls -la');
    });

    it('builds Grep summary with pattern and path', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-g', tool_name: 'Grep', tool_input: { pattern: 'TODO', path: 'src/' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toBe('TODO in src/');
    });

    it('builds Task summary with subagent and description', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-t', tool_name: 'Task', tool_input: { subagent_type: 'gsd-executor', description: 'Run phase 3' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toContain('gsd-executor');
      expect(result[0].summary).toContain('Run phase 3');
    });

    it('builds Edit summary with relative path', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-e', tool_name: 'Edit', tool_input: { file_path: '/home/forge/project/src/main.ts' } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary).toBe('project/src/main.ts');
    });

    it('truncates long summaries', () => {
      const longCommand = 'a'.repeat(200);
      const events: GsdRawEvent[] = [
        makeRawEvent({
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-long', tool_name: 'Bash', tool_input: { command: longCommand } },
        }),
      ];

      const result = groupRawEvents(events);
      expect(result[0].summary.length).toBeLessThanOrEqual(82); // 80 + '…' + margin
    });
  });

  describe('mixed event stream', () => {
    it('handles interleaved tool and lifecycle events', () => {
      const events: GsdRawEvent[] = [
        makeRawEvent({ timestamp: '2026-03-05T12:00:00.000Z', event: 'SessionStart', payload: {} }),
        makeRawEvent({
          timestamp: '2026-03-05T12:00:01.000Z',
          event: 'PreToolUse',
          payload: { tool_use_id: 'tu-1', tool_name: 'Read', tool_input: { file_path: '/home/forge/a.ts' } },
        }),
        makeRawEvent({
          timestamp: '2026-03-05T12:00:02.000Z',
          event: 'PostToolUse',
          payload: { tool_use_id: 'tu-1', tool_name: 'Read' },
        }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:03.000Z', event: 'UserPromptSubmit', payload: { prompt: 'fix bug' } }),
        makeRawEvent({ timestamp: '2026-03-05T12:00:04.000Z', event: 'Stop', payload: {} }),
      ];

      const result = groupRawEvents(events.reverse());

      expect(result).toHaveLength(4); // SessionStart + Read(merged) + Prompt + Stop
      expect(result[0].timestamp).toBe('2026-03-05T12:00:04.000Z'); // newest first
      expect(result.map((e) => e.eventType)).toEqual(['lifecycle', 'prompt', 'tool', 'lifecycle']);
    });
  });
});
