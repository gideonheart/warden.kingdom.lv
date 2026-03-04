import fs from 'fs';
import { database } from '../database/DatabaseConnection.js';
import { recordingCaptureService } from './RecordingCaptureService.js';

export class RecordingRotationService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Start the periodic rotation scheduler. Also runs an immediate rotation on
   * startup to clean up any orphan deletion_pending rows left from crashes.
   */
  startPeriodicRotation(): void {
    console.log('[RecordingRotation] Starting periodic rotation scheduler');
    this.runRotation();
    this.intervalHandle = setInterval(() => {
      this.runRotation();
    }, this.CHECK_INTERVAL_MS);
  }

  /** Stop the periodic rotation scheduler. */
  stopPeriodicRotation(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('[RecordingRotation] Stopped periodic rotation scheduler');
  }

  /**
   * Run one rotation cycle synchronously.
   * Phase 1: Clean up any existing deletion_pending rows from previous runs/crashes.
   * Phase 2: If capBytes is set and storage exceeds cap, prune oldest recordings.
   * Returns { deletedCount, freedBytes }.
   */
  runRotation(): { deletedCount: number; freedBytes: number } {
    // Phase 1: cleanup orphan deletion_pending rows from previous runs or crashes
    const pendingRows = database.getDeletionPendingRecordings();
    for (const row of pendingRows) {
      try {
        if (fs.existsSync(row.filePath)) {
          fs.unlinkSync(row.filePath);
        }
      } catch (error) {
        console.warn(`[RecordingRotation] Failed to delete orphan file ${row.filePath}:`, error);
      }
      database.deleteRecording(row.id);
      console.log(`[RecordingRotation] Cleaned up orphan pending-deletion recording #${row.id}`);
    }

    const config = database.getRotationConfig();

    // Phase 2: if no cap set, nothing else to do
    if (config.capBytes === 0) {
      return { deletedCount: 0, freedBytes: 0 };
    }

    const stats = database.getStorageStats();
    if (stats.totalBytes <= config.capBytes) {
      return { deletedCount: 0, freedBytes: 0 };
    }

    const overage = stats.totalBytes - config.capBytes;
    const candidates = database.getRotationCandidates();

    let deletedCount = 0;
    let freedBytes = 0;

    for (const candidate of candidates) {
      if (freedBytes >= overage) break;

      // Skip recordings that are currently being captured
      if (recordingCaptureService.isRecording(candidate.sessionName)) {
        console.log(`[RecordingRotation] Skipping active recording session: ${candidate.sessionName}`);
        continue;
      }

      database.markDeletionPending(candidate.id);

      // Attempt immediate file deletion
      try {
        if (fs.existsSync(candidate.filePath)) {
          fs.unlinkSync(candidate.filePath);
        }
      } catch (error) {
        console.warn(`[RecordingRotation] Failed to delete file ${candidate.filePath}:`, error);
      }

      database.deleteRecording(candidate.id);

      const sizeFreed = candidate.fileSizeBytes ?? 0;
      freedBytes += sizeFreed;
      deletedCount++;

      console.log(`[RecordingRotation] Deleted recording #${candidate.id} (${sizeFreed} bytes)`);
    }

    if (deletedCount > 0) {
      console.log(`[RecordingRotation] Rotation complete: deleted ${deletedCount} recordings, freed ${freedBytes} bytes`);
    }

    return { deletedCount, freedBytes };
  }
}

export const recordingRotationService = new RecordingRotationService();
