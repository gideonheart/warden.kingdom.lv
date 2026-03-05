import express from 'express';
import { database } from '../database/DatabaseConnection.js';
import { telegramBotService } from '../services/TelegramBotService.js';
import type { NotificationConfig } from '../../shared/types.js';

export const notificationRoutes = express.Router();

// GET /api/notifications/config — return current notification config + bot connection status
notificationRoutes.get('/api/notifications/config', (_req, res) => {
  const config = database.getNotificationConfig();
  res.json({
    ...config,
    botConfigured: telegramBotService.isConfigured(),
  });
});

// PUT /api/notifications/config — update one or more notification config fields
notificationRoutes.put('/api/notifications/config', (req, res) => {
  const body = req.body as Partial<NotificationConfig>;

  const patch: Partial<NotificationConfig> = {};

  if ('permissionAlertsEnabled' in body) {
    if (typeof body.permissionAlertsEnabled !== 'boolean') {
      res.status(400).json({ error: 'permissionAlertsEnabled must be a boolean' });
      return;
    }
    patch.permissionAlertsEnabled = body.permissionAlertsEnabled;
  }

  if ('budgetAlertsEnabled' in body) {
    if (typeof body.budgetAlertsEnabled !== 'boolean') {
      res.status(400).json({ error: 'budgetAlertsEnabled must be a boolean' });
      return;
    }
    patch.budgetAlertsEnabled = body.budgetAlertsEnabled;
  }

  if ('permissionCooldownMs' in body) {
    if (
      typeof body.permissionCooldownMs !== 'number' ||
      !Number.isFinite(body.permissionCooldownMs) ||
      body.permissionCooldownMs < 0
    ) {
      res.status(400).json({ error: 'permissionCooldownMs must be a non-negative finite number' });
      return;
    }
    patch.permissionCooldownMs = body.permissionCooldownMs;
  }

  if ('budgetCooldownMs' in body) {
    if (
      typeof body.budgetCooldownMs !== 'number' ||
      !Number.isFinite(body.budgetCooldownMs) ||
      body.budgetCooldownMs < 0
    ) {
      res.status(400).json({ error: 'budgetCooldownMs must be a non-negative finite number' });
      return;
    }
    patch.budgetCooldownMs = body.budgetCooldownMs;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  database.setNotificationConfig(patch);
  res.json({ status: 'ok' });
});
