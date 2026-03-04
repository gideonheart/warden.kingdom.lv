import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';
import { logTailService } from '../services/LogTailService.js';
import { sessionUsageReader } from '../services/SessionUsageReader.js';
import type { BurnWindow } from '../../shared/types.js';

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

const VALID_BURN_WINDOWS = new Set<BurnWindow>(['today', '2day', '7day']);

historyRoutes.get('/api/history/burn-rate', (request, response) => {
  const rawWindow = request.query.window as string | undefined;
  const window: BurnWindow = (rawWindow && VALID_BURN_WINDOWS.has(rawWindow as BurnWindow))
    ? (rawWindow as BurnWindow)
    : 'today';

  const burnRates = database.getBurnRate(window);
  response.json({ burnRates, window });
});

historyRoutes.get('/api/history/budget-config/status', (_request, response) => {
  const statuses = database.getBudgetAlertStatus();
  let aggregateAlertLevel: 'ok' | 'warning' | 'exceeded' = 'ok';
  for (const status of statuses) {
    if (status.alertLevel === 'exceeded') {
      aggregateAlertLevel = 'exceeded';
      break;
    } else if (status.alertLevel === 'warning') {
      aggregateAlertLevel = 'warning';
    }
  }
  response.json({ alertLevel: aggregateAlertLevel, statuses });
});

historyRoutes.get('/api/history/budget-config', (_request, response) => {
  const configs = database.getAllBudgetConfigs();
  response.json({ configs });
});

historyRoutes.put('/api/history/budget-config/:agentId', (request, response) => {
  const { agentId } = request.params;
  const { dailyBudgetUsd } = request.body as { dailyBudgetUsd?: unknown };

  if (typeof dailyBudgetUsd !== 'number' || !isFinite(dailyBudgetUsd) || dailyBudgetUsd < 0) {
    response.status(400).json({ error: 'dailyBudgetUsd must be a non-negative number' });
    return;
  }

  database.upsertBudgetConfig(agentId, dailyBudgetUsd);
  response.json({ status: 'ok' });
});
