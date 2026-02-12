import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';
import { logTailService } from '../services/LogTailService.js';

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

historyRoutes.get('/api/history/logs', async (request, response) => {
  const { agentId, lines } = request.query as Record<string, string | undefined>;

  const logLines = await logTailService.tailGatewayLogs(
    agentId,
    lines ? parseInt(lines, 10) : undefined
  );

  response.json({ lines: logLines });
});
