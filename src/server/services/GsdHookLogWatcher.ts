import * as fs from 'fs';
import type { Server as SocketIOServer } from 'socket.io';

const HOOK_LOG_PATH = '/tmp/gsd-hooks.log';
const BACKFILL_LINE_COUNT = 200; // read last 200 lines; events avg ~5.7 lines each → covers 20+ events

class GsdHookLogWatcher {
  private currentOffset: number = 0;
  private socketServer: SocketIOServer | null = null;
  private isWatching: boolean = false;

  setupSocketNamespace(socketServer: SocketIOServer): void {
    this.socketServer = socketServer;
    const namespace = socketServer.of('/gsd-hooks');

    namespace.on('connection', (socket) => {
      console.log(`[GsdHookLogWatcher] Client connected: ${socket.id}`);

      // Backfill last 200 lines (covers ~20 events) to the newly connected socket
      const backfillLines = this.readLastLines(BACKFILL_LINE_COUNT);
      socket.emit('gsd-hooks:backfill', { lines: backfillLines });

      socket.on('disconnect', () => {
        console.log(`[GsdHookLogWatcher] Client disconnected: ${socket.id}`);
      });
    });
  }

  startWatching(): void {
    // Set initial offset from current file size so we only stream new appends
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);
      this.currentOffset = stat.size;
    } catch {
      // File does not exist yet (e.g. fresh server start before any hooks fire)
      this.currentOffset = 0;
    }

    // Use fs.watchFile (polling) instead of fs.watch — watchFile works when the file
    // does not yet exist and handles file creation after watching starts (Pitfall 2)
    fs.watchFile(HOOK_LOG_PATH, { interval: 1000, persistent: false }, () => {
      this.readNewLines();
    });

    this.isWatching = true;
    console.log(`[GsdHookLogWatcher] Watching ${HOOK_LOG_PATH} from offset ${this.currentOffset}`);
  }

  stopWatching(): void {
    fs.unwatchFile(HOOK_LOG_PATH);
    this.isWatching = false;
    console.log('[GsdHookLogWatcher] Stopped watching');
  }

  private readNewLines(): void {
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);

      // Guard: skip if no new data or file was truncated (handles dedup per Pitfall 1)
      if (stat.size <= this.currentOffset) {
        return;
      }

      const readSize = stat.size - this.currentOffset;
      const buffer = Buffer.alloc(readSize);
      const fileDescriptor = fs.openSync(HOOK_LOG_PATH, 'r');
      try {
        fs.readSync(fileDescriptor, buffer, 0, readSize, this.currentOffset);
      } finally {
        fs.closeSync(fileDescriptor);
      }

      this.currentOffset = stat.size;

      const newContent = buffer.toString('utf-8');
      const newLines = newContent.split('\n').filter((line) => line.trim().length > 0);

      if (newLines.length > 0 && this.socketServer) {
        const namespace = this.socketServer.of('/gsd-hooks');
        namespace.emit('gsd-hooks:lines', { lines: newLines });
      }
    } catch (error) {
      console.error('[GsdHookLogWatcher] Failed to read new lines:', error);
    }
  }

  readLastLines(lineCount: number): string[] {
    try {
      const stat = fs.statSync(HOOK_LOG_PATH);

      // Read last N bytes (estimate 120 chars/line) to avoid loading entire file
      const readBytes = Math.min(stat.size, lineCount * 120);
      const buffer = Buffer.alloc(readBytes);
      const fileDescriptor = fs.openSync(HOOK_LOG_PATH, 'r');
      try {
        fs.readSync(fileDescriptor, buffer, 0, readBytes, stat.size - readBytes);
      } finally {
        fs.closeSync(fileDescriptor);
      }

      const content = buffer.toString('utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(-lineCount);
    } catch {
      // File missing or unreadable — return empty array (handle gracefully)
      return [];
    }
  }
}

export const gsdHookLogWatcher = new GsdHookLogWatcher();
