import * as pty from 'node-pty';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { activityEventService } from './ActivityEventService.js';

interface ActiveTerminalStream {
  ptyProcess: pty.IPty;
  socketId: string;
  sessionName: string;
  isAlive: boolean;
}

export class TerminalStreamService {
  private activeStreams: Map<string, ActiveTerminalStream> = new Map();
  private sessionStreams: Map<string, Set<string>> = new Map();

  setupSocketNamespace(socketServer: SocketIOServer): void {
    const terminalNamespace = socketServer.of('/terminal');

    terminalNamespace.on('connection', (socket: Socket) => {
      const sessionName = socket.handshake.query.sessionName as string;

      if (!sessionName) {
        socket.emit('terminal:error', { message: 'Missing sessionName query parameter' });
        socket.disconnect();
        return;
      }

      console.log(`[TerminalStream] Client ${socket.id} connecting to session: ${sessionName}`);
      this.attachSocketToSession(socket, sessionName);

      socket.on('disconnect', () => {
        console.log(`[TerminalStream] Client ${socket.id} disconnected from ${sessionName}`);
        this.detachSocket(socket.id);
      });
    });
  }

  attachSocketToSession(socket: Socket, sessionName: string): void {
    // Dedup: kill any existing PTY attachments for this tmux session
    const existingSocketIds = this.sessionStreams.get(sessionName);
    if (existingSocketIds) {
      for (const existingSocketId of existingSocketIds) {
        console.log(`[TerminalStream] Killing existing PTY for session ${sessionName} (was socket ${existingSocketId})`);
        this.detachSocket(existingSocketId);
      }
    }

    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      env: process.env as Record<string, string>,
    });

    ptyProcess.onData((terminalOutput: string) => {
      socket.emit('terminal:output', terminalOutput);
      // Non-blocking side-channel tap for activity event parsing
      const agentId = sessionName.split('-')[0];
      setImmediate(() => {
        activityEventService.processTerminalChunk(sessionName, agentId, terminalOutput);
      });
    });

    ptyProcess.onExit(({ exitCode }) => {
      const stream = this.activeStreams.get(socket.id);
      if (stream) {
        stream.isAlive = false;
      }
      socket.emit('terminal:exit', { sessionName, exitCode });
      this.activeStreams.delete(socket.id);

      // Flush and clear activity event buffers for this session
      activityEventService.clearSessionBuffer(sessionName);

      // Clean up session index on PTY exit
      const socketIds = this.sessionStreams.get(sessionName);
      if (socketIds) {
        socketIds.delete(socket.id);
        if (socketIds.size === 0) {
          this.sessionStreams.delete(sessionName);
        }
      }
    });

    socket.on('terminal:input', (userInput: string) => {
      ptyProcess.write(userInput);
      // Capture operator input as batched activity events
      const agentId = sessionName.split('-')[0];
      activityEventService.captureOperatorInput(sessionName, agentId, userInput);
    });

    socket.on('terminal:resize', ({ cols, rows }: { cols: number; rows: number }) => {
      const stream = this.activeStreams.get(socket.id);
      if (!stream || !stream.isAlive) {
        return;
      }
      try {
        stream.ptyProcess.resize(cols, rows);
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EBADF' || code === 'EINVAL' || code === 'EIO') {
          console.warn(`[TerminalStream] Ignoring resize error (${code}) for ${socket.id} — PTY likely exited`);
          stream.isAlive = false;
        } else {
          console.error(`[TerminalStream] Unexpected resize error for ${socket.id}:`, error);
        }
      }
    });

    this.activeStreams.set(socket.id, {
      ptyProcess,
      socketId: socket.id,
      sessionName,
      isAlive: true,
    });

    // Track socket in session index
    if (!this.sessionStreams.has(sessionName)) {
      this.sessionStreams.set(sessionName, new Set());
    }
    this.sessionStreams.get(sessionName)!.add(socket.id);
  }

  detachSocket(socketId: string): void {
    const stream = this.activeStreams.get(socketId);
    if (stream) {
      stream.ptyProcess.kill();
      this.activeStreams.delete(socketId);

      // Flush and clear activity event buffers for this session
      activityEventService.clearSessionBuffer(stream.sessionName);

      // Clean up session index
      const socketIds = this.sessionStreams.get(stream.sessionName);
      if (socketIds) {
        socketIds.delete(socketId);
        if (socketIds.size === 0) {
          this.sessionStreams.delete(stream.sessionName);
        }
      }
    }
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  killAllPtyProcesses(): void {
    console.log(`[TerminalStream] Killing ${this.activeStreams.size} active PTY processes`);
    for (const [socketId, stream] of this.activeStreams.entries()) {
      stream.ptyProcess.kill();
      this.activeStreams.delete(socketId);
    }
    this.sessionStreams.clear();
  }

  private socketServer: SocketIOServer | null = null;

  private findSocketById(socketId: string): Socket | undefined {
    if (!this.socketServer) return undefined;
    const namespace = this.socketServer.of('/terminal');
    return namespace.sockets.get(socketId);
  }

  setSocketServer(server: SocketIOServer): void {
    this.socketServer = server;
  }
}

export const terminalStreamService = new TerminalStreamService();
