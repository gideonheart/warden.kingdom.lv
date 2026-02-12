import { readFile } from 'fs/promises';
import path from 'path';

const OPENCLAW_LOG_DIR = path.resolve(process.env.HOME ?? '/home/forge', '.openclaw/logs');
const MAX_LINES = 200;

class LogTailService {
  async tailGatewayLogs(agentId?: string, lineCount: number = 100): Promise<string[]> {
    const effectiveCount = Math.min(lineCount, MAX_LINES);

    try {
      const logPath = path.join(OPENCLAW_LOG_DIR, 'gateway.log');
      const content = await readFile(logPath, 'utf-8');
      let lines = content.split('\n').filter((line) => line.trim().length > 0);

      if (agentId) {
        lines = lines.filter((line) => line.toLowerCase().includes(agentId.toLowerCase()));
      }

      return lines.slice(-effectiveCount);
    } catch (error) {
      // Try alternative log locations
      const alternativePaths = [
        path.join(OPENCLAW_LOG_DIR, 'openclaw.log'),
        path.join(OPENCLAW_LOG_DIR, 'server.log'),
      ];

      for (const altPath of alternativePaths) {
        try {
          const content = await readFile(altPath, 'utf-8');
          let lines = content.split('\n').filter((line) => line.trim().length > 0);

          if (agentId) {
            lines = lines.filter((line) => line.toLowerCase().includes(agentId.toLowerCase()));
          }

          return lines.slice(-effectiveCount);
        } catch {
          continue;
        }
      }

      console.warn('[LogTail] No gateway logs found:', error instanceof Error ? error.message : error);
      return [`No gateway logs found in ${OPENCLAW_LOG_DIR}`];
    }
  }
}

export const logTailService = new LogTailService();
