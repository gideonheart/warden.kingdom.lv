import { Router } from 'express';
import { database } from '../database/DatabaseConnection.js';

export const activityRoutes = Router();

activityRoutes.get('/api/activity/events', (request, response) => {
  const { agentId, eventType, dateFrom, dateTo, limit, offset } =
    request.query as Record<string, string | undefined>;

  const result = database.queryActivityEvents({
    agentId,
    eventType,
    dateFrom,
    dateTo,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  response.json(result);
});

activityRoutes.get('/api/activity/event-types', (_request, response) => {
  const eventTypes = database.getDistinctEventTypes();
  response.json({ eventTypes });
});
