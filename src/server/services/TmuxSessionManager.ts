import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import type { TmuxSessionInfo } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

// Static baseline prefixes — always recognised regardless of openclaw config.
// Dynamic prefixes (openclaw agent IDs) are registered at startup via registerAgentPrefixes().
const STATIC_AGENT_PREFIXES = ['agent', 'gideon', 'warden', 'scout', 'builder', 'forge'];

export class TmuxSessionManager {
  // Mutable set of known agent ID prefixes. Starts with the static list and grows
  // when the server loads openclaw config at startup (to include ids like 'g2-gateway',
  // 'k1-rust', etc. that are not in the static list).
  private knownAgentPrefixes: string[] = [...STATIC_AGENT_PREFIXES];

  // Sorted list of known openclaw agent IDs, longest first.
  // Used by extractAgentIdFromSessionName to match against the longest known agent ID prefix
  // when parsing 'agent_' prefix session names (e.g. 'agent_g2-gateway_session_name' → 'g2-gateway').
  private knownAgentIds: string[] = [];

  /**
   * Called at server startup after loading openclaw config.
   * Registers all configured agent IDs so that sessions created for those agents
   * are discovered by listAgentSessions().
   */
  registerAgentPrefixes(agentIds: string[]): void {
    for (const agentId of agentIds) {
      if (!this.knownAgentPrefixes.includes(agentId)) {
        this.knownAgentPrefixes.push(agentId);
      }
    }
    // Store sorted (longest first) for longest-match extraction
    this.knownAgentIds = [...new Set([...this.knownAgentIds, ...agentIds])].sort(
      (a, b) => b.length - a.length,
    );
  }

  async listAgentSessions(): Promise<TmuxSessionInfo[]> {
    const rawOutput = await this.executeTmuxCommand('list-sessions', [
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
    ]);

    if (!rawOutput.trim()) return [];

    const allSessions = this.parseTmuxSessionList(rawOutput);
    return allSessions.filter(session =>
      this.isAgentManagedSession(session.sessionName)
    );
  }

  async listAllSessions(): Promise<TmuxSessionInfo[]> {
    const rawOutput = await this.executeTmuxCommand('list-sessions', [
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
    ]);

    if (!rawOutput.trim()) return [];
    return this.parseTmuxSessionList(rawOutput);
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await this.executeTmuxCommand('has-session', ['-t', sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  async createSessionForAgent(agentId: string, projectSlug: string): Promise<string> {
    const sessionName = this.buildSessionName(agentId, projectSlug);
    await this.executeTmuxCommand('new-session', ['-d', '-s', sessionName]);
    return sessionName;
  }

  async createSessionWithClaude(sessionName: string, projectPath: string): Promise<string> {
    await this.executeTmuxCommand('new-session', ['-d', '-s', sessionName, '-c', projectPath]);
    await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, 'claude --dangerously-skip-permissions', 'Enter']);
    return sessionName;
  }

  async sendCtrlC(sessionName: string): Promise<void> {
    await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, 'C-c']);
  }

  async destroySession(sessionName: string): Promise<void> {
    await this.executeTmuxCommand('kill-session', ['-t', sessionName]);
  }

  async isClaudeCodeRunning(sessionName: string): Promise<boolean> {
    try {
      const output = await this.executeTmuxCommand('list-panes', [
        '-t',
        sessionName,
        '-F',
        '#{pane_current_command}',
      ]);
      // Check if any pane is running claude (case-insensitive)
      const commands = output.trim().split('\n');
      return commands.some(cmd => cmd.toLowerCase().includes('claude'));
    } catch {
      return false;
    }
  }

  async sendPromptToSession(sessionName: string, prompt: string): Promise<void> {
    // Send the prompt text literally (using -l flag to avoid special character interpretation)
    await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, '-l', '--', prompt]);
    // Send Enter key to submit the prompt
    await this.executeTmuxCommand('send-keys', ['-t', `${sessionName}:0.0`, 'Enter']);
  }

  /**
   * Extract the openclaw agent ID from a tmux session name.
   *
   * Two naming conventions are supported:
   *
   * 1. Legacy 'agent_' prefix: 'agent_{agentId}_{rest}'
   *    Examples: 'agent_g2-gateway_session_name' → 'g2-gateway'
   *              'agent_warden-kingdom_session_name' → 'warden'
   *    Strategy: try longest-match against known openclaw agent IDs first;
   *    fall back to splitting on the first underscore after 'agent_'.
   *
   * 2. Standard format: '{agentId}-{projectSlug}-{shortId}'
   *    Examples: 'warden-dashboard-abc1' → 'warden'
   *              'g2-gateway-workspace-ab12' → 'g2-gateway' (if registered)
   *              'k1-rust-myproject-cd34' → 'k1-rust' (if registered)
   *    Strategy: try longest-match against known openclaw agent IDs first;
   *    fall back to the first dash-separated segment.
   */
  extractAgentIdFromSessionName(sessionName: string): string {
    if (sessionName.startsWith('agent_')) {
      const afterPrefix = sessionName.slice('agent_'.length);

      // Try to match the longest known agent ID against the start of afterPrefix.
      // afterPrefix format: '{agentId}_{rest}' or '{agentId}-{rest}'
      for (const knownId of this.knownAgentIds) {
        if (
          afterPrefix === knownId ||
          afterPrefix.startsWith(`${knownId}_`) ||
          afterPrefix.startsWith(`${knownId}-`)
        ) {
          return knownId;
        }
      }

      // Fall back: use first underscore as delimiter between agentId and rest.
      // e.g. 'g2-gateway_session_name' → 'g2-gateway'
      const underscoreIndex = afterPrefix.indexOf('_');
      if (underscoreIndex > 0) {
        return afterPrefix.slice(0, underscoreIndex);
      }

      // Last resort: first dash segment (original behaviour)
      return afterPrefix.split('-')[0];
    }

    // Standard format: '{agentId}-{projectSlug}-{shortId}'
    // Try longest-match against known agent IDs first so multi-segment IDs
    // like 'g2-gateway' and 'k1-rust' are extracted correctly.
    for (const knownId of this.knownAgentIds) {
      if (
        sessionName === knownId ||
        sessionName.startsWith(`${knownId}-`)
      ) {
        return knownId;
      }
    }

    // Fall back: first dash-separated segment (handles simple IDs like 'warden', 'forge')
    return sessionName.split('-')[0];
  }

  buildSessionName(agentId: string, projectSlug: string): string {
    const shortId = crypto.randomUUID().slice(0, 4);
    return `${agentId}-${projectSlug}-${shortId}`;
  }

  private isAgentManagedSession(sessionName: string): boolean {
    return this.knownAgentPrefixes.some(prefix =>
      sessionName.startsWith(`${prefix}-`) || sessionName.startsWith(`${prefix}_`)
    );
  }

  private parseTmuxSessionList(rawOutput: string): TmuxSessionInfo[] {
    return rawOutput
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [sessionName, windowCount, createdTimestamp, attachedCount] = line.split('|');
        return {
          sessionName,
          agentId: this.extractAgentIdFromSessionName(sessionName),
          windowCount: parseInt(windowCount, 10),
          createdAt: new Date(parseInt(createdTimestamp, 10) * 1000),
          isAttached: parseInt(attachedCount, 10) > 0,
        };
      });
  }

  private async executeTmuxCommand(command: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('tmux', [command, ...args]);
      return stdout;
    } catch (error: unknown) {
      const execError = error as { stderr?: string; code?: number };
      if (command === 'list-sessions' && execError.stderr?.includes('no server running')) {
        return '';
      }
      if (command === 'list-sessions' && execError.code === 1) {
        return '';
      }
      throw error;
    }
  }
}

export const tmuxSessionManager = new TmuxSessionManager();
