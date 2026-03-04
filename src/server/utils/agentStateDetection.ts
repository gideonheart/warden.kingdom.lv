import type { AgentStateHint } from '../../shared/gsdTypes.js';

/**
 * Detect the current state of an agent based on captured tmux pane output.
 * Returns an AgentStateHint indicating the most specific detected state.
 */
export function detectAgentState(pane: string): AgentStateHint {
  if (/enter to select|numbered.*option/i.test(pane)) return 'menu';
  if (/Do you want to proceed\?|❯\s*1\.\s*Yes/i.test(pane)) return 'permission_prompt';
  if (/what can i help|waiting for/i.test(pane)) return 'idle';
  const lines = pane.split('\n');
  for (const line of lines) {
    if (/error|failed|exception/i.test(line) && !/error handling/i.test(line)) {
      return 'error';
    }
  }
  return 'working';
}
