import * as pty from 'node-pty';
import type { Server as SocketIOServer, Socket } from 'socket.io';

interface ActiveTerminalStream {
  ptyProcess: pty.IPty;
  socketId: string;
  sessionName: string;
  isReadOnly: boolean;
  isAlive: boolean;
}

export class TerminalStreamService {
  private activeStreams: Map<string, ActiveTerminalStream> = new Map();

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
      this.attachSocketToSession(socket, sessionName, { readOnly: true });

      socket.on('terminal:take-over', () => {
        this.enableInputForSocket(socket.id);
        socket.emit('terminal:mode-changed', { readOnly: false });
        console.log(`[TerminalStream] Take-over enabled for ${socket.id} on ${sessionName}`);
      });

      socket.on('terminal:release', () => {
        this.disableInputForSocket(socket.id);
        socket.emit('terminal:mode-changed', { readOnly: true });
        console.log(`[TerminalStream] Released control for ${socket.id} on ${sessionName}`);
      });

      socket.on('disconnect', () => {
        console.log(`[TerminalStream] Client ${socket.id} disconnected from ${sessionName}`);
        this.detachSocket(socket.id);
      });
    });
  }

  attachSocketToSession(
    socket: Socket,
    sessionName: string,
    options: { readOnly: boolean } = { readOnly: true }
  ): void {
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      env: process.env as Record<string, string>,
    });

    ptyProcess.onData((terminalOutput: string) => {
      socket.emit('terminal:output', terminalOutput);
    });

    ptyProcess.onExit(({ exitCode }) => {
      const stream = this.activeStreams.get(socket.id);
      if (stream) {
        stream.isAlive = false;
      }
      socket.emit('terminal:exit', { sessionName, exitCode });
      this.activeStreams.delete(socket.id);
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
      isReadOnly: options.readOnly,
      isAlive: true,
    });
  }

  enableInputForSocket(socketId: string): boolean {
    const stream = this.activeStreams.get(socketId);
    if (!stream || !stream.isReadOnly) return false;

    const socket = this.findSocketById(socketId);
    if (socket) {
      socket.on('terminal:input', (userInput: string) => {
        stream.ptyProcess.write(userInput);
      });
    }

    stream.isReadOnly = false;
    return true;
  }

  disableInputForSocket(socketId: string): boolean {
    const stream = this.activeStreams.get(socketId);
    if (!stream || stream.isReadOnly) return false;

    const socket = this.findSocketById(socketId);
    if (socket) {
      socket.removeAllListeners('terminal:input');
    }

    stream.isReadOnly = true;
    return true;
  }

  detachSocket(socketId: string): void {
    const stream = this.activeStreams.get(socketId);
    if (stream) {
      stream.ptyProcess.kill();
      this.activeStreams.delete(socketId);
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
