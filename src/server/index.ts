import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { instanceRoutes } from './routes/instanceRoutes.js';
import { terminalStreamService } from './services/TerminalStreamService.js';
import { instanceTracker } from './services/InstanceTracker.js';
import { database } from './database/DatabaseConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CLIENT_DIST_PATH = path.resolve(__dirname, '../client');

const app = express();
const httpServer = createServer(app);

const socketServer = new SocketIOServer(httpServer, {
  cors: {
    origin: IS_PRODUCTION ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

app.use(cors({
  origin: IS_PRODUCTION ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
}));
app.use(express.json());

app.use(instanceRoutes);

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    uptime: process.uptime(),
    activeStreams: terminalStreamService.getActiveStreamCount(),
    timestamp: new Date().toISOString(),
  });
});

if (IS_PRODUCTION) {
  app.use(express.static(CLIENT_DIST_PATH));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
  });
}

terminalStreamService.setSocketServer(socketServer);
terminalStreamService.setupSocketNamespace(socketServer);

instanceTracker.startPeriodicSync();

httpServer.listen(PORT, HOST, () => {
  console.log(`[Warden] Server running at http://${HOST}:${PORT}`);
  console.log(`[Warden] Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
});

function handleShutdown(signal: string): void {
  console.log(`\n[Warden] Received ${signal}, shutting down...`);

  const forceExitTimeout = setTimeout(() => {
    console.log('[Warden] Force exit after timeout');
    process.exit(1);
  }, 10_000);
  forceExitTimeout.unref();

  instanceTracker.stopPeriodicSync();
  httpServer.close(() => {
    console.log('[Warden] HTTP server closed');
    terminalStreamService.killAllPtyProcesses();
    database.close();
    socketServer.close(() => {
      console.log('[Warden] Socket.IO server closed');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
