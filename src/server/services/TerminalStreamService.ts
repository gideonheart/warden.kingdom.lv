import * as pty from 'node-pty';
import type { Server as SocketIOServer, Socket } from 'socket.io';

// How long to keep a PTY alive after the last subscriber disconnects.
// This allows fast navigation away and back (e.g., switching views) to reuse the
// existing PTY without spawning a new process and suffering a dimension-mismatch
// repaint glitch.
const PTY_KEEPALIVE_MS = 30_000;

interface SharedPtySession {
  ptyProcess: pty.IPty;
  sessionName: string;
  isAlive: boolean;
  subscribers: Set<string>; // socket IDs viewing this session
  keepAliveTimer: ReturnType<typeof setTimeout> | null; // deferred cleanup timer
}

export class TerminalStreamService {
  private sessions: Map<string, SharedPtySession> = new Map(); // sessionName → shared PTY
  private socketToSession: Map<string, string> = new Map(); // socketId → sessionName
  private socketServer: SocketIOServer | null = null;

  setupSocketNamespace(socketServer: SocketIOServer): void {
    this.socketServer = socketServer;
    const terminalNamespace = socketServer.of('/terminal');

    terminalNamespace.on('connection', (socket: Socket) => {
      const sessionName = socket.handshake.query.sessionName as string;
      const colsParam = socket.handshake.query.cols as string | undefined;
      const rowsParam = socket.handshake.query.rows as string | undefined;
      const initialCols = colsParam ? parseInt(colsParam, 10) : 120;
      const initialRows = rowsParam ? parseInt(rowsParam, 10) : 40;

      if (!sessionName) {
        socket.emit('terminal:error', { message: 'Missing sessionName query parameter' });
        socket.disconnect();
        return;
      }

      console.log(`[TerminalStream] Client ${socket.id} connecting to session: ${sessionName} (${initialCols}x${initialRows})`);
      this.attachSocketToSession(socket, sessionName, initialCols, initialRows);

      socket.on('disconnect', () => {
        console.log(`[TerminalStream] Client ${socket.id} disconnected from ${sessionName}`);
        this.detachSocket(socket.id);
      });
    });
  }

  attachSocketToSession(socket: Socket, sessionName: string, initialCols: number, initialRows: number): void {
    const existing = this.sessions.get(sessionName);

    if (existing && existing.isAlive) {
      // Cancel any pending deferred cleanup — a new subscriber arrived in time.
      if (existing.keepAliveTimer !== null) {
        clearTimeout(existing.keepAliveTimer);
        existing.keepAliveTimer = null;
        console.log(`[TerminalStream] Keep-alive timer cancelled for ${sessionName} — new subscriber arrived`);
      }

      // Reuse existing PTY — just add this socket as a subscriber.
      console.log(`[TerminalStream] Reusing existing PTY for session ${sessionName} (now ${existing.subscribers.size + 1} viewers)`);
      existing.subscribers.add(socket.id);
      this.socketToSession.set(socket.id, sessionName);

      this.setupSocketInputHandlers(socket, existing);

      // Force tmux to repaint the full screen for the new subscriber.
      // A same-size resize is a no-op (tmux ignores SIGWINCH when dimensions haven't
      // changed), so we must actually change the dimensions to guarantee a repaint.
      // Strategy: resize to the new client's dimensions (likely different from the
      // existing PTY's), with a +1 row nudge first to guarantee a size change even
      // if the new client happens to match the existing PTY exactly.
      socket.emit('terminal:reset');
      const targetCols = Number.isFinite(initialCols) && initialCols > 0 ? initialCols : existing.ptyProcess.cols;
      const targetRows = Number.isFinite(initialRows) && initialRows > 0 ? initialRows : existing.ptyProcess.rows;
      try {
        existing.ptyProcess.resize(targetCols, targetRows + 1);
        existing.ptyProcess.resize(targetCols, targetRows);
      } catch {
        // PTY resize failed — not fatal, subscriber will see output on next activity
      }

      return;
    }

    // Clean up dead session entry if it exists.
    if (existing) {
      this.cleanupSession(sessionName);
    }

    // Spawn new PTY for this tmux session using client-supplied dimensions.
    const cols = Number.isFinite(initialCols) && initialCols > 0 ? initialCols : 120;
    const rows = Number.isFinite(initialRows) && initialRows > 0 ? initialRows : 40;

    // Signal to the connecting client that a fresh PTY is being spawned so it can
    // clear any stale xterm.js content before the new repaint arrives.
    socket.emit('terminal:reset');

    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      env: process.env as Record<string, string>,
    });

    const session: SharedPtySession = {
      ptyProcess,
      sessionName,
      isAlive: true,
      subscribers: new Set([socket.id]),
      keepAliveTimer: null,
    };

    this.sessions.set(sessionName, session);
    this.socketToSession.set(socket.id, sessionName);

    // Broadcast PTY output to ALL subscribers.
    ptyProcess.onData((terminalOutput: string) => {
      for (const subscriberId of session.subscribers) {
        const subscriberSocket = this.findSocketById(subscriberId);
        if (subscriberSocket) {
          subscriberSocket.emit('terminal:output', terminalOutput);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.isAlive = false;

      // Cancel any pending keep-alive timer before cleaning up.
      if (session.keepAliveTimer !== null) {
        clearTimeout(session.keepAliveTimer);
        session.keepAliveTimer = null;
      }

      // Notify all subscribers.
      for (const subscriberId of session.subscribers) {
        const subscriberSocket = this.findSocketById(subscriberId);
        if (subscriberSocket) {
          subscriberSocket.emit('terminal:exit', { sessionName, exitCode });
        }
      }

      // Clean up.
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
      // Last viewer disconnected. Instead of killing the PTY immediately, keep it alive
      // for PTY_KEEPALIVE_MS to handle the common case of navigating away and back quickly.
      console.log(`[TerminalStream] Last viewer left session ${sessionName}, scheduling PTY cleanup in ${PTY_KEEPALIVE_MS}ms`);
      session.keepAliveTimer = setTimeout(() => {
        session.keepAliveTimer = null;
        console.log(`[TerminalStream] Keep-alive grace period expired for ${sessionName}, cleaning up PTY`);
        this.cleanupSession(sessionName);
      }, PTY_KEEPALIVE_MS);
    } else {
      console.log(`[TerminalStream] Viewer left session ${sessionName} (${session.subscribers.size} remaining)`);
    }
  }

  private cleanupSession(sessionName: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;

    // Cancel any pending keep-alive timer.
    if (session.keepAliveTimer !== null) {
      clearTimeout(session.keepAliveTimer);
      session.keepAliveTimer = null;
    }

    if (session.isAlive) {
      session.ptyProcess.kill();
    }

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
