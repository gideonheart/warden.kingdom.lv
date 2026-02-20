import { open } from 'fs/promises';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import type { GsdRawEvent } from '@shared/gsdTypes.js';
import { GSD_NOISE_EVENTS } from '@shared/gsdTypes.js';

const LOGS_DIR = '/home/forge/.openclaw/workspace/skills/gsd-code-skill/logs';
const READ_TAIL_BYTES = 64 * 1024; // 64KB per file — covers hundreds of recent events

class GsdEventLogService {
  /**
   * Read the last 64KB of a JSONL file, parse valid JSON lines, and return events.
   * Uses open+read+close to read from a specific byte offset for performance.
   */
  private async readRecentEventsFromFile(filePath: string): Promise<GsdRawEvent[]> {
    let fileHandle;
    try {
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;
      if (fileSize === 0) return [];

      const readSize = Math.min(fileSize, READ_TAIL_BYTES);
      const startOffset = fileSize - readSize;

      const buffer = Buffer.alloc(readSize);
      fileHandle = await open(filePath, 'r');
      const { bytesRead } = await fileHandle.read(buffer, 0, readSize, startOffset);
      await fileHandle.close();
      fileHandle = undefined;

      const content = buffer.slice(0, bytesRead).toString('utf-8');
      const lines = content.split('\n');

      const events: GsdRawEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as GsdRawEvent;
          // Basic shape validation
          if (parsed.timestamp && parsed.event && parsed.session) {
            events.push(parsed);
          }
        } catch {
          // Skip malformed lines (e.g. partial line at start of read window)
        }
      }
      return events;
    } catch {
      // Skip unreadable files gracefully
      return [];
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => undefined);
      }
    }
  }

  async getRecentEvents(limit: number = 100): Promise<GsdRawEvent[]> {
    let files: string[];
    try {
      const dirEntries = await readdir(LOGS_DIR);
      files = dirEntries
        .filter((name) => name.endsWith('-raw-events.jsonl'))
        .map((name) => path.join(LOGS_DIR, name));
    } catch {
      console.error('[GsdEventLogService] Failed to read logs directory:', LOGS_DIR);
      return [];
    }

    // Read all files in parallel
    const perFileResults = await Promise.all(
      files.map((filePath) => this.readRecentEventsFromFile(filePath)),
    );

    // Merge all events from all files
    const allEvents: GsdRawEvent[] = [];
    for (const events of perFileResults) {
      allEvents.push(...events);
    }

    // Filter out noise events server-side
    const filtered = allEvents.filter((event) => !GSD_NOISE_EVENTS.has(event.event));

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => {
      if (a.timestamp > b.timestamp) return -1;
      if (a.timestamp < b.timestamp) return 1;
      return 0;
    });

    return filtered.slice(0, limit);
  }
}

export const gsdEventLogService = new GsdEventLogService();
