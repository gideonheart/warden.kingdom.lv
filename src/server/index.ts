import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { instanceRoutes } from './routes/instanceRoutes.js';
import { agentRoutes } from './routes/agentRoutes.js';
import { historyRoutes } from './routes/historyRoutes.js';
import { gsdRoutes } from './routes/gsdRoutes.js';
import { recordingRoutes } from './routes/recordingRoutes.js';
import { terminalStreamService } from './services/TerminalStreamService.js';
import { instanceTracker } from './services/InstanceTracker.js';
import { sessionUsageReader } from './services/SessionUsageReader.js';
import { recordingRotationService } from './services/RecordingRotationService.js';
import { telegramBotService } from './services/TelegramBotService.js';
import { database } from './database/DatabaseConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function resolveClientDistPath(): string | null {
  // In production builds, __dirname points at dist/server and ../client exists.
  // In dev (tsx watch), __dirname points at src/server, so we prefer dist/client from cwd.
  const candidates = [
    path.resolve(process.cwd(), 'dist/client'),
    path.resolve(__dirname, '../client'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
    } catch {
      // ignore
    }
  }

  return null;
}

const CLIENT_DIST_PATH = resolveClientDistPath();

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
app.use(agentRoutes);
app.use(historyRoutes);
app.use(gsdRoutes);
app.use(recordingRoutes);

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    uptime: process.uptime(),
    activeStreams: terminalStreamService.getActiveStreamCount(),
    timestamp: new Date().toISOString(),
  });
});

if (CLIENT_DIST_PATH) {
  app.use(express.static(CLIENT_DIST_PATH));
  // SPA fallback (Express 5 / path-to-regexp v6: use RegExp instead of "*")
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_request, response) => {
    response.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
  });
} else if (IS_PRODUCTION) {
  console.warn('[Warden] Production mode but client dist not found; UI will not be served');
}

terminalStreamService.setSocketServer(socketServer);
terminalStreamService.setupSocketNamespace(socketServer);

instanceTracker.startPeriodicSync();
sessionUsageReader.startPeriodicScan();
recordingRotationService.startPeriodicRotation();
telegramBotService.start();   // NEW — Telegram bot (no-op if token missing)

httpServer.listen(PORT, HOST, () => {
  console.log(`[Warden] Server running at http://${HOST}:${PORT}`);
  console.log(`[Warden] Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
});

async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n[Warden] Received ${signal}, shutting down...`);

  const forceExitTimeout = setTimeout(() => {
    console.log('[Warden] Force exit after timeout');
    process.exit(1);
  }, 10_000);
  forceExitTimeout.unref();

  recordingRotationService.stopPeriodicRotation();
  sessionUsageReader.stopPeriodicScan();
  instanceTracker.stopPeriodicSync();
  await telegramBotService.stop();   // NEW — stop bot before closing HTTP server

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

process.on('SIGTERM', () => { void handleShutdown('SIGTERM'); });
process.on('SIGINT', () => { void handleShutdown('SIGINT'); });
