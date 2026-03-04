import express from 'express';
import fs from 'fs';
import path from 'path';
import { database } from '../database/DatabaseConnection.js';
import { recordingCaptureService } from '../services/RecordingCaptureService.js';
import { recordingRotationService } from '../services/RecordingRotationService.js';

export const recordingRoutes = express.Router();

// GET /api/recordings — list all recordings ordered by started_at DESC
recordingRoutes.get('/api/recordings', (_req, res) => {
  const recordings = database.listRecordings();
  res.json(recordings);
});

// GET /api/recordings/active — list sessionNames currently being recorded
recordingRoutes.get('/api/recordings/active', (_req, res) => {
  // We expose active state per session via a query to the service
  // Client queries this to show recording indicator on correct sessions
  const recordings = database.listRecordings();
  const active = recordings
    .filter((r) => r.stoppedAt === null)
    .map((r) => ({
      sessionName: r.sessionName,
      recordingId: r.id,
      startedAt: r.startedAt,
    }));
  res.json(active);
});

// GET /api/recordings/auto-record-config — list agents with auto-record enabled
// NOTE: must be placed before any /:id routes to prevent Express `:id` matching "auto-record-config"
recordingRoutes.get('/api/recordings/auto-record-config', (_req, res) => {
  const configs = database.getAllAutoRecordConfigs();
  res.json({ configs });
});

// PUT /api/recordings/auto-record-config/:agentId — toggle auto-record for an agent
recordingRoutes.put('/api/recordings/auto-record-config/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) is required' });
    return;
  }
  database.setAutoRecord(agentId, enabled);
  res.json({ agentId, autoRecord: enabled });
});

// GET /api/recordings/storage-stats — current storage usage + cap
// NOTE: must be placed before /:id routes to prevent Express param capture
recordingRoutes.get('/api/recordings/storage-stats', (_req, res) => {
  const stats = database.getStorageStats();
  const config = database.getRotationConfig();
  res.json({ ...stats, capBytes: config.capBytes });
});

// GET /api/recordings/rotation-config — current cap setting
recordingRoutes.get('/api/recordings/rotation-config', (_req, res) => {
  const config = database.getRotationConfig();
  res.json(config);
});

// PUT /api/recordings/rotation-config — set storage cap in bytes (0 = disabled)
recordingRoutes.put('/api/recordings/rotation-config', (req, res) => {
  const { capBytes } = req.body as { capBytes?: number };
  if (typeof capBytes !== 'number' || capBytes < 0) {
    res.status(400).json({ error: 'capBytes (non-negative number) is required' });
    return;
  }
  database.setRotationConfig(capBytes);
  res.json({ capBytes });
});

// POST /api/recordings/rotation/prune — trigger immediate rotation manually
recordingRoutes.post('/api/recordings/rotation/prune', (_req, res) => {
  const result = recordingRotationService.runRotation();
  res.json(result);
});

// POST /api/recordings/session/:sessionName/start — start recording
recordingRoutes.post('/api/recordings/session/:sessionName/start', (req, res) => {
  const { sessionName } = req.params;
  const { agentId = '', agentName = '', projectPath = '', cols = 220, rows = 50 } = req.body as {
    agentId?: string;
    agentName?: string;
    projectPath?: string;
    cols?: number;
    rows?: number;
  };

  if (recordingCaptureService.isRecording(sessionName)) {
    res.status(409).json({ error: 'Already recording this session' });
    return;
  }

  try {
    const recordingId = recordingCaptureService.startRecording({
      sessionName,
      agentId,
      agentName,
      projectPath,
      cols,
      rows,
    });
    res.status(201).json({ recordingId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start recording';
    res.status(500).json({ error: message });
  }
});

// POST /api/recordings/session/:sessionName/stop — stop recording
recordingRoutes.post('/api/recordings/session/:sessionName/stop', (req, res) => {
  const { sessionName } = req.params;

  if (!recordingCaptureService.isRecording(sessionName)) {
    res.status(404).json({ error: 'No active recording for this session' });
    return;
  }

  const recordingId = recordingCaptureService.stopRecording(sessionName, 'manual');
  if (!recordingId) {
    res.status(404).json({ error: 'No active recording for this session' });
    return;
  }

  const entry = database.findRecordingById(recordingId);
  res.json(entry);
});

// GET /api/recordings/:id/elapsed — elapsed ms for active recording
recordingRoutes.get('/api/recordings/:id/elapsed', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = database.findRecordingById(id);
  if (!entry) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }
  const elapsedMs = recordingCaptureService.getElapsedMs(entry.sessionName);
  res.json({ elapsedMs, isRecording: elapsedMs !== null });
});

// DELETE /api/recordings/:id — delete recording and .cast file
recordingRoutes.delete('/api/recordings/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = database.deleteRecording(id);
  if (!entry) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }

  // Delete the .cast file from disk (best-effort)
  try {
    if (fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }
  } catch (error) {
    console.warn(`[RecordingRoutes] Failed to delete file ${entry.filePath}:`, error);
  }

  res.json({ deleted: true, id });
});

// GET /api/recordings/:id/download — download the .cast file
recordingRoutes.get('/api/recordings/:id/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = database.findRecordingById(id);
  if (!entry) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }

  if (!fs.existsSync(entry.filePath)) {
    res.status(404).json({ error: 'Recording file not found on disk' });
    return;
  }

  const fileName = path.basename(entry.filePath);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.sendFile(entry.filePath);
});

// GET /api/recordings/:id/content — serve raw .cast file content for in-browser replay
recordingRoutes.get('/api/recordings/:id/content', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = database.findRecordingById(id);
  if (!entry) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }

  // Guard: do not serve content for recordings pending deletion
  if (database.isRecordingPendingDeletion(id)) {
    res.status(404).json({ error: 'Recording is pending deletion' });
    return;
  }

  if (!fs.existsSync(entry.filePath)) {
    res.status(404).json({ error: 'Recording file not found on disk' });
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(entry.filePath);
});
