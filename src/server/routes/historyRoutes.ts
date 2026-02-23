import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';
import { logTailService } from '../services/LogTailService.js';
import { sessionUsageReader } from '../services/SessionUsageReader.js';

export const historyRoutes = Router();

historyRoutes.get('/api/history/sessions', (request, response) => {
  const { agentId, status, dateFrom, dateTo, limit, offset } = request.query as Record<string, string | undefined>;

  const result = database.searchInstances({
    agentId,
    status,
    dateFrom,
    dateTo,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  response.json(result);
});

historyRoutes.get('/api/history/token-usage', (request, response) => {
  const { agentId, dateFrom, dateTo } = request.query as Record<string, string | undefined>;

  const usage = database.getTokenUsage({ agentId, dateFrom, dateTo });
  const summary = database.getTokenUsageSummary();

  response.json({ usage, summary });
});

historyRoutes.post('/api/history/token-usage/scan', async (_request, response) => {
  try {
    await sessionUsageReader.scanAllProjects();
    response.json({ status: 'ok', message: 'Scan complete' });
  } catch (error) {
    console.error('[historyRoutes] Manual scan failed:', error);
    response.status(500).json({ status: 'error', message: 'Scan failed' });
  }
});

historyRoutes.get('/api/history/logs', async (request, response) => {
  const { agentId, lines } = request.query as Record<string, string | undefined>;

  const logLines = await logTailService.tailGatewayLogs(
    agentId,
    lines ? parseInt(lines, 10) : undefined
  );

  response.json({ lines: logLines });
});
