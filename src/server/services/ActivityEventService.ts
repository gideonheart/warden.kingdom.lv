import { database } from '../database/DatabaseConnection.js';

// ANSI strip regex — inlined from ansi-regex@5.0.1 (avoids CJS/ESM incompatibility with strip-ansi@6)
const ANSI_PATTERN = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
].join('|');
const ANSI_REGEX = new RegExp(ANSI_PATTERN, 'g');

function stripAnsi(input: string): string {
  return typeof input === 'string' ? input.replace(ANSI_REGEX, '') : input;
}

// Claude Code terminal output patterns — verified from live tmux capture 2026-02-17
// Markers: ● (U+25CF BLACK CIRCLE), ⏺ (U+23FA BLACK CIRCLE FOR RECORD), ⎿ (U+23BF BOTTOM LEFT CORNER)
const TOOL_CALL_RE = /^[●⏺]\s+([\w]+)\((.{0,200})\)/m;
const FILE_EDIT_SUCCESS_RE = /^[⎿]\s+(?:Updated|Created|Wrote)\s+(.{1,200})/m;
const RESULT_ERROR_RE = /^[⎿]\s+Error:/m;
const BASH_EXIT_RE = /exit code[:\s]+(\d+)/i;

const FLUSH_AFTER_BYTES = 4096;
const OPERATOR_INPUT_DEBOUNCE_MS = 2000;
const MAX_PROMPT_DETAIL_LENGTH = 500;

interface OperatorInputBatch {
  buffer: string;
  timer: ReturnType<typeof setTimeout>;
}

class ActivityEventService {
  // Chunk buffers for terminal output parsing (per session)
  private chunkBuffers = new Map<string, string>();

  // Operator input batching (per session)
  private inputBatches = new Map<string, OperatorInputBatch>();

  // Instance ID cache to avoid repeated DB lookups per session
  private instanceIdCache = new Map<string, number | null>();

  // Retention cleanup interval
  private retentionInterval: ReturnType<typeof setInterval> | null = null;

  // -- Public API --

  captureSessionStart(sessionName: string, agentId: string, instanceId: number | null): void {
    try {
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'session_start',
        summary: `Session started: ${sessionName}`,
      });
    } catch (error) {
      console.error('[ActivityEvent] Failed to capture session_start:', error);
    }
  }

  captureSessionStop(sessionName: string, agentId: string): void {
    try {
      const instanceId = this.resolveInstanceId(sessionName);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'session_stop',
        summary: `Session stopped: ${sessionName}`,
      });
      // Clean up cached instance ID — session is gone
      this.instanceIdCache.delete(sessionName);
    } catch (error) {
      console.error('[ActivityEvent] Failed to capture session_stop:', error);
    }
  }

  capturePromptSent(agentId: string, sessionName: string, prompt: string, success: boolean): void {
    try {
      const truncated = prompt.slice(0, MAX_PROMPT_DETAIL_LENGTH);
      database.insertActivityEvent({
        instanceId: null,
        agentId,
        sessionName,
        eventType: 'prompt_sent',
        summary: `Prompt sent to ${agentId}`,
        detail: truncated,
        success,
      });
    } catch (error) {
      console.error('[ActivityEvent] Failed to capture prompt_sent:', error);
    }
  }

  captureOperatorInput(sessionName: string, agentId: string, input: string): void {
    // Skip pure control sequences (single chars with charCode < 32, except \n and \r)
    if (input.length === 1 && input.charCodeAt(0) < 32 && input !== '\n' && input !== '\r') {
      return;
    }

    const existing = this.inputBatches.get(sessionName);

    if (existing) {
      // Clear the existing debounce timer
      clearTimeout(existing.timer);
      existing.buffer += input;

      // Flush immediately on Enter
      if (input === '\n' || input === '\r') {
        this.flushOperatorInputBatch(sessionName, agentId, existing.buffer);
        this.inputBatches.delete(sessionName);
        return;
      }

      // Reset debounce timer
      existing.timer = setTimeout(() => {
        this.flushOperatorInputBatch(sessionName, agentId, existing.buffer);
        this.inputBatches.delete(sessionName);
      }, OPERATOR_INPUT_DEBOUNCE_MS);
    } else {
      // New batch: flush immediately on Enter, otherwise start timer
      if (input === '\n' || input === '\r') {
        this.flushOperatorInputBatch(sessionName, agentId, input);
        return;
      }

      const timer = setTimeout(() => {
        const batch = this.inputBatches.get(sessionName);
        if (batch) {
          this.flushOperatorInputBatch(sessionName, agentId, batch.buffer);
          this.inputBatches.delete(sessionName);
        }
      }, OPERATOR_INPUT_DEBOUNCE_MS);

      this.inputBatches.set(sessionName, { buffer: input, timer });
    }
  }

  processTerminalChunk(sessionName: string, agentId: string, rawChunk: string): void {
    try {
      const clean = stripAnsi(rawChunk);

      // Accumulate in per-session buffer
      const existing = this.chunkBuffers.get(sessionName) ?? '';
      const combined = existing + clean;

      // Only parse complete lines; flush if buffer exceeds limit
      const lastNewline = combined.lastIndexOf('\n');
      if (lastNewline === -1 && combined.length < FLUSH_AFTER_BYTES) {
        this.chunkBuffers.set(sessionName, combined);
        return;
      }

      const toProcess = lastNewline !== -1 ? combined.slice(0, lastNewline + 1) : combined;
      this.chunkBuffers.set(sessionName, combined.slice(toProcess.length));

      this.parseAndCaptureEvents(sessionName, agentId, toProcess);
    } catch (error) {
      console.error('[ActivityEvent] Error processing terminal chunk:', error);
    }
  }

  clearSessionBuffer(sessionName: string): void {
    this.chunkBuffers.delete(sessionName);

    // Flush any pending operator input batch
    const batch = this.inputBatches.get(sessionName);
    if (batch) {
      clearTimeout(batch.timer);
      // Best-effort: we don't have agentId here, derive from sessionName
      const agentId = sessionName.split('-')[0];
      this.flushOperatorInputBatch(sessionName, agentId, batch.buffer);
      this.inputBatches.delete(sessionName);
    }
  }

  startRetentionCleanup(): void {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    this.retentionInterval = setInterval(() => {
      try {
        const deleted = database.purgeOldActivityEvents();
        if (deleted > 0) {
          console.log(`[ActivityEvent] Purged ${deleted} events older than 7 days`);
        }
      } catch (error) {
        console.error('[ActivityEvent] Retention cleanup failed:', error);
      }
    }, SIX_HOURS_MS);
  }

  stopRetentionCleanup(): void {
    if (this.retentionInterval) {
      clearInterval(this.retentionInterval);
      this.retentionInterval = null;
    }
  }

  // -- Private helpers --

  private resolveInstanceId(sessionName: string): number | null {
    if (this.instanceIdCache.has(sessionName)) {
      return this.instanceIdCache.get(sessionName) ?? null;
    }
    const instance = database.findInstanceBySessionName(sessionName);
    const id = instance?.id ?? null;
    this.instanceIdCache.set(sessionName, id);
    return id;
  }

  private flushOperatorInputBatch(sessionName: string, agentId: string, buffer: string): void {
    if (!buffer.trim()) return;
    try {
      const instanceId = this.resolveInstanceId(sessionName);
      const truncated = buffer.slice(0, MAX_PROMPT_DETAIL_LENGTH);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'operator_input',
        summary: `Operator input in ${sessionName}`,
        detail: truncated,
      });
    } catch (error) {
      console.error('[ActivityEvent] Failed to flush operator input batch:', error);
    }
  }

  private parseAndCaptureEvents(sessionName: string, agentId: string, text: string): void {
    // Tool call: ● ToolName(args) or ⏺ ToolName(args)
    const toolMatch = TOOL_CALL_RE.exec(text);
    if (toolMatch) {
      const toolName = toolMatch[1];
      const toolArgs = toolMatch[2];
      const instanceId = this.resolveInstanceId(sessionName);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'tool_call',
        summary: `${toolName}(${toolArgs})`,
      });
    }

    // File edit success: ⎿ Updated/Created/Wrote <file>
    const fileEditMatch = FILE_EDIT_SUCCESS_RE.exec(text);
    if (fileEditMatch) {
      const filePath = fileEditMatch[1].trim();
      const instanceId = this.resolveInstanceId(sessionName);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'file_edit',
        summary: `File edited: ${filePath}`,
        detail: filePath,
        success: true,
      });
    }

    // Error result: ⎿ Error:
    if (RESULT_ERROR_RE.test(text)) {
      const instanceId = this.resolveInstanceId(sessionName);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'error',
        summary: 'Tool error detected',
        success: false,
      });
    }

    // Bash exit code
    const bashExitMatch = BASH_EXIT_RE.exec(text);
    if (bashExitMatch) {
      const exitCode = parseInt(bashExitMatch[1], 10);
      const instanceId = this.resolveInstanceId(sessionName);
      database.insertActivityEvent({
        instanceId,
        agentId,
        sessionName,
        eventType: 'bash_command',
        summary: `Bash command exited with code ${exitCode}`,
        success: exitCode === 0,
      });
    }
  }
}

export const activityEventService = new ActivityEventService();
