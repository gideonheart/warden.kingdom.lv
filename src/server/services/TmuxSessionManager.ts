import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import type { TmuxSessionInfo } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

const KNOWN_AGENT_PREFIXES = ['gideon', 'warden', 'scout', 'builder'];

export class TmuxSessionManager {
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

  async destroySession(sessionName: string): Promise<void> {
    await this.executeTmuxCommand('kill-session', ['-t', sessionName]);
  }

  extractAgentIdFromSessionName(sessionName: string): string {
    return sessionName.split('-')[0];
  }

  private buildSessionName(agentId: string, projectSlug: string): string {
    const shortId = crypto.randomUUID().slice(0, 4);
    return `${agentId}-${projectSlug}-${shortId}`;
  }

  private isAgentManagedSession(sessionName: string): boolean {
    return KNOWN_AGENT_PREFIXES.some(prefix =>
      sessionName.startsWith(`${prefix}-`)
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
          agentId: sessionName.split('-')[0],
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
