import * as pty from 'node-pty';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { activityEventService } from './ActivityEventService.js';

interface SharedPtySession {
  ptyProcess: pty.IPty;
  sessionName: string;
  isAlive: boolean;
  subscribers: Set<string>; // socket IDs viewing this session
}

export class TerminalStreamService {
  private sessions: Map<string, SharedPtySession> = new Map(); // sessionName → shared PTY
  private socketToSession: Map<string, string> = new Map(); // socketId → sessionName
  private socketServer: SocketIOServer | null = null;

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
    const existing = this.sessions.get(sessionName);

    if (existing && existing.isAlive) {
      // Reuse existing PTY — just add this socket as a subscriber
      console.log(`[TerminalStream] Reusing existing PTY for session ${sessionName} (now ${existing.subscribers.size + 1} viewers)`);
      existing.subscribers.add(socket.id);
      this.socketToSession.set(socket.id, sessionName);

      this.setupSocketInputHandlers(socket, existing);
      return;
    }

    // Clean up dead session if it exists
    if (existing) {
      this.cleanupSession(sessionName);
    }

    // Spawn new PTY for this tmux session
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      env: process.env as Record<string, string>,
    });

    const session: SharedPtySession = {
      ptyProcess,
      sessionName,
      isAlive: true,
      subscribers: new Set([socket.id]),
    };

    this.sessions.set(sessionName, session);
    this.socketToSession.set(socket.id, sessionName);

    // Broadcast PTY output to ALL subscribers
    ptyProcess.onData((terminalOutput: string) => {
      for (const subscriberId of session.subscribers) {
        const subscriberSocket = this.findSocketById(subscriberId);
        if (subscriberSocket) {
          subscriberSocket.emit('terminal:output', terminalOutput);
        }
      }
      // Non-blocking side-channel tap for activity event parsing
      const agentId = sessionName.split('-')[0];
      setImmediate(() => {
        activityEventService.processTerminalChunk(sessionName, agentId, terminalOutput);
      });
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.isAlive = false;

      // Notify all subscribers
      for (const subscriberId of session.subscribers) {
        const subscriberSocket = this.findSocketById(subscriberId);
        if (subscriberSocket) {
          subscriberSocket.emit('terminal:exit', { sessionName, exitCode });
        }
      }

      // Flush activity event buffers
      activityEventService.clearSessionBuffer(sessionName);

      // Clean up
      for (const subscriberId of session.subscribers) {
        this.socketToSession.delete(subscriberId);
      }
      this.sessions.delete(sessionName);
    });

    this.setupSocketInputHandlers(socket, session);
  }

  private setupSocketInputHandlers(socket: Socket, session: SharedPtySession): void {
    socket.on('terminal:input', (userInput: string) => {
      if (!session.isAlive) return;
      session.ptyProcess.write(userInput);
      // Capture operator input as batched activity events
      const agentId = session.sessionName.split('-')[0];
      activityEventService.captureOperatorInput(session.sessionName, agentId, userInput);
    });

    socket.on('terminal:resize', ({ cols, rows }: { cols: number; rows: number }) => {
      if (!session.isAlive) return;
      try {
        session.ptyProcess.resize(cols, rows);
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EBADF' || code === 'EINVAL' || code === 'EIO') {
          console.warn(`[TerminalStream] Ignoring resize error (${code}) for ${socket.id} — PTY likely exited`);
          session.isAlive = false;
        } else {
          console.error(`[TerminalStream] Unexpected resize error for ${socket.id}:`, error);
        }
      }
    });
  }

  detachSocket(socketId: string): void {
    const sessionName = this.socketToSession.get(socketId);
    if (!sessionName) return;

    this.socketToSession.delete(socketId);

    const session = this.sessions.get(sessionName);
    if (!session) return;

    session.subscribers.delete(socketId);

    if (session.subscribers.size === 0) {
      // Last viewer disconnected — kill the PTY
      console.log(`[TerminalStream] Last viewer left session ${sessionName}, killing PTY`);
      this.cleanupSession(sessionName);
    } else {
      console.log(`[TerminalStream] Viewer left session ${sessionName} (${session.subscribers.size} remaining)`);
    }
  }

  private cleanupSession(sessionName: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;

    if (session.isAlive) {
      session.ptyProcess.kill();
    }

    activityEventService.clearSessionBuffer(sessionName);

    for (const subscriberId of session.subscribers) {
      this.socketToSession.delete(subscriberId);
    }
    this.sessions.delete(sessionName);
  }

  getActiveStreamCount(): number {
    return this.sessions.size;
  }

  killAllPtyProcesses(): void {
    console.log(`[TerminalStream] Killing ${this.sessions.size} active PTY sessions`);
    for (const [sessionName] of this.sessions) {
      this.cleanupSession(sessionName);
    }
  }

  setSocketServer(server: SocketIOServer): void {
    this.socketServer = server;
  }

  private findSocketById(socketId: string): Socket | undefined {
    if (!this.socketServer) return undefined;
    const namespace = this.socketServer.of('/terminal');
    return namespace.sockets.get(socketId);
  }
}

export const terminalStreamService = new TerminalStreamService();
