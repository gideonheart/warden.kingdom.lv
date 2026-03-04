import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { database } from '../database/DatabaseConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.resolve(process.cwd(), 'data/recordings');

interface ActiveRecording {
  recordingId: number;
  sessionName: string;
  agentId: string;
  agentName: string;
  projectPath: string;
  filePath: string;
  startedAtMs: number;
  frameBuffer: Array<[number, string]>;   // [relativeSeconds, text]
  terminalCols: number;
  terminalRows: number;
}

export class RecordingCaptureService {
  private activeRecordings: Map<string, ActiveRecording> = new Map(); // sessionName → recording

  constructor() {
    // Ensure recordings directory exists on startup
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  /** Start recording a session. Returns the new recording ID, or throws if already recording. */
  startRecording(params: {
    sessionName: string;
    agentId: string;
    agentName: string;
    projectPath: string;
    cols: number;
    rows: number;
  }): number {
    if (this.activeRecordings.has(params.sessionName)) {
      throw new Error(`Already recording session: ${params.sessionName}`);
    }

    const timestamp = Date.now();
    // File name: {agentId}-{sessionName}-{timestamp}.cast (sanitised, no spaces)
    const safeSession = params.sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${params.agentId}-${safeSession}-${timestamp}.cast`;
    const filePath = path.join(RECORDINGS_DIR, fileName);

    const dbEntry = database.insertRecording({
      sessionName: params.sessionName,
      agentId: params.agentId,
      agentName: params.agentName,
      projectPath: params.projectPath,
      filePath,
    });

    const recording: ActiveRecording = {
      recordingId: dbEntry.id,
      sessionName: params.sessionName,
      agentId: params.agentId,
      agentName: params.agentName,
      projectPath: params.projectPath,
      filePath,
      startedAtMs: timestamp,
      frameBuffer: [],
      terminalCols: params.cols,
      terminalRows: params.rows,
    };

    this.activeRecordings.set(params.sessionName, recording);
    console.log(`[RecordingCapture] Started recording session ${params.sessionName} → ${fileName}`);
    return dbEntry.id;
  }

  /** Called from TerminalStreamService PTY onData tap. No-op if session is not being recorded. */
  captureOutput(sessionName: string, data: string): void {
    const recording = this.activeRecordings.get(sessionName);
    if (!recording) return;

    const relativeSeconds = (Date.now() - recording.startedAtMs) / 1000;
    recording.frameBuffer.push([relativeSeconds, data]);
  }

  /** Stop recording and write asciicast v2 file to disk. Returns recording ID. */
  stopRecording(sessionName: string, stopReason: 'manual' | 'session_ended'): number | null {
    const recording = this.activeRecordings.get(sessionName);
    if (!recording) return null;

    this.activeRecordings.delete(sessionName);

    const durationSecs = (Date.now() - recording.startedAtMs) / 1000;

    // Write asciicast v2 file
    try {
      this.writeAsciicastFile(recording, durationSecs);
    } catch (error) {
      console.error(`[RecordingCapture] Failed to write recording file for ${sessionName}:`, error);
      return recording.recordingId;
    }

    // Get file size after writing
    let fileSizeBytes = 0;
    try {
      fileSizeBytes = fs.statSync(recording.filePath).size;
    } catch {
      // File write may have failed silently
    }

    database.finaliseRecording(recording.recordingId, { durationSecs, fileSizeBytes, stopReason });
    console.log(`[RecordingCapture] Stopped recording ${sessionName} — ${durationSecs.toFixed(1)}s, ${fileSizeBytes} bytes`);
    return recording.recordingId;
  }

  isRecording(sessionName: string): boolean {
    return this.activeRecordings.has(sessionName);
  }

  getRecordingId(sessionName: string): number | null {
    return this.activeRecordings.get(sessionName)?.recordingId ?? null;
  }

  getElapsedMs(sessionName: string): number | null {
    const recording = this.activeRecordings.get(sessionName);
    if (!recording) return null;
    return Date.now() - recording.startedAtMs;
  }

  private writeAsciicastFile(recording: ActiveRecording, durationSecs: number): void {
    const header = JSON.stringify({
      version: 2,
      width: recording.terminalCols,
      height: recording.terminalRows,
      timestamp: Math.floor(recording.startedAtMs / 1000),
      duration: durationSecs,
      title: `${recording.agentName} - ${recording.sessionName}`,
      env: { TERM: 'xterm-256color' },
    });

    const lines: string[] = [header];
    for (const [relSecs, text] of recording.frameBuffer) {
      lines.push(JSON.stringify([relSecs, 'o', text]));
    }

    fs.writeFileSync(recording.filePath, lines.join('\n') + '\n', 'utf8');
  }
}

export const recordingCaptureService = new RecordingCaptureService();
