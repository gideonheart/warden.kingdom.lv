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
import { notificationRoutes } from './routes/notificationRoutes.js';
import { terminalStreamService } from './services/TerminalStreamService.js';
import { tmuxSessionManager } from './services/TmuxSessionManager.js';
import { instanceTracker } from './services/InstanceTracker.js';
import { autoRestartService } from './services/AutoRestartService.js';
import { sessionUsageReader } from './services/SessionUsageReader.js';
import { recordingRotationService } from './services/RecordingRotationService.js';
import { telegramBotService } from './services/TelegramBotService.js';
import { notificationPoller } from './services/NotificationPoller.js';
import { budgetAlertPoller } from './services/BudgetAlertPoller.js';
import { idleTimeoutService } from './services/IdleTimeoutService.js';
import { openClawConfigReader } from './services/OpenClawConfigReader.js';
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
app.use(notificationRoutes);

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

// Load openclaw agent IDs and register them as known tmux session prefixes.
// This ensures that sessions started via the Warden UI for agents like 'g2-gateway',
// 'g2-frontend', 'k1-rust', etc. are discovered by InstanceTracker even though those
// IDs were not in the original static KNOWN_AGENT_PREFIXES list.
openClawConfigReader.getAgents()
  .then((agents) => {
    const agentIds = agents.map((a) => a.id);
    tmuxSessionManager.registerAgentPrefixes(agentIds);
    console.log(`[Warden] Registered ${agentIds.length} openclaw agent prefixes: ${agentIds.join(', ')}`);
  })
  .catch((error) => {
    console.warn('[Warden] Could not load openclaw agents for prefix registration:', error);
  });

instanceTracker.startPeriodicSync();

// Wire crash detection to Telegram notifications (CRSH-06)
instanceTracker.onCrashDetected = async ({ instance, uptimeSecs, projectSlug }) => {
  try {
    const mappings = await openClawConfigReader.getTopicMappings();
    const mapping = mappings.find((m) => m.agentId === instance.agentId);

    if (!mapping) {
      console.warn(`[CrashNotify] No Telegram topic mapping for agent: ${instance.agentId}`);
      return;
    }

    const uptimeDisplay = uptimeSecs < 60
      ? `${Math.round(uptimeSecs)}s`
      : uptimeSecs < 3600
        ? `${Math.floor(uptimeSecs / 60)}m ${Math.round(uptimeSecs % 60)}s`
        : `${Math.floor(uptimeSecs / 3600)}h ${Math.floor((uptimeSecs % 3600) / 60)}m`;

    const crashTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const text =
      `🔴 *${instance.agentId}* session crashed\n\n` +
      `Session: \`${instance.tmuxSessionName}\`\n` +
      `Project: \`${projectSlug}\`\n` +
      `Uptime: ${uptimeDisplay}\n` +
      `Crashed at: ${crashTime}`;

    await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    console.log(`[CrashNotify] Sent crash alert for ${instance.agentId} to topic ${mapping.topicId}`);
  } catch (error) {
    // Notification failure must never block crash detection
    console.error(`[CrashNotify] Failed to send crash notification for ${instance.agentId}:`, error);
  }

  // Auto-restart engine (CRSH-04) — fire-and-forget, must not block crash detection
  void autoRestartService.attemptRestart(instance, uptimeSecs, projectSlug);
};

// Wire session stopped detection to Telegram notifications
instanceTracker.onSessionStopped = async ({ instance, uptimeSecs, projectSlug, stopReason }) => {
  try {
    const config = database.getNotificationConfig();
    if (!config.permissionAlertsEnabled && !config.budgetAlertsEnabled) {
      // If all notification types are disabled, skip lifecycle notifications too.
      // (Session lifecycle notifications piggyback on the notification system being enabled.)
      return;
    }

    const mappings = await openClawConfigReader.getTopicMappings();
    const mapping = mappings.find((m) => m.agentId === instance.agentId);

    if (!mapping) {
      console.warn(`[StopNotify] No Telegram topic mapping for agent: ${instance.agentId}`);
      return;
    }

    const uptimeDisplay = uptimeSecs < 60
      ? `${Math.round(uptimeSecs)}s`
      : uptimeSecs < 3600
        ? `${Math.floor(uptimeSecs / 60)}m ${Math.round(uptimeSecs % 60)}s`
        : `${Math.floor(uptimeSecs / 3600)}h ${Math.floor((uptimeSecs % 3600) / 60)}m`;

    const stopTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const reasonLabels: Record<string, string> = {
      'operator-stop': 'Operator stop',
      'idle-timeout': 'Idle timeout',
      'start-failed': 'Start failed',
    };
    const reasonDisplay = reasonLabels[stopReason] ?? stopReason;

    const text =
      `\u26AA *${instance.agentId}* session stopped\n\n` +
      `Session: \`${instance.tmuxSessionName}\`\n` +
      `Project: \`${projectSlug}\`\n` +
      `Uptime: ${uptimeDisplay}\n` +
      `Reason: ${reasonDisplay}\n` +
      `Stopped at: ${stopTime}`;

    await telegramBotService.sendToTopic(mapping.groupId, mapping.topicId, text);
    console.log(`[StopNotify] Sent stop notification for ${instance.agentId} to topic ${mapping.topicId}`);
  } catch (error) {
    // Notification failure must never block session management
    console.error(`[StopNotify] Failed to send stop notification for ${instance.agentId}:`, error);
  }
};

sessionUsageReader.startPeriodicScan();
recordingRotationService.startPeriodicRotation();

// Await Telegram bot token load before starting pollers that depend on it.
// Previously this was fire-and-forget (`void`), which caused a race condition:
// the first poll cycle would run before the bot token was loaded, silently
// dropping any notification that should have fired immediately after server start.
await telegramBotService.initialize();   // Telegram bot token load (send-only mode, no polling)
notificationPoller.startPolling();   // Permission prompt detection (depends on telegramBotService)
budgetAlertPoller.startPolling();    // Budget threshold monitoring (depends on telegramBotService)
idleTimeoutService.startPolling();  // Idle session auto-stop (IDLE-01)

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
  idleTimeoutService.stopPolling();    // Stop idle timeout checking before closing HTTP server
  notificationPoller.stopPolling();    // Stop polling before closing HTTP server
  budgetAlertPoller.stopPolling();     // Stop budget monitoring before closing HTTP server
  // TelegramBotService is send-only — no shutdown needed

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
