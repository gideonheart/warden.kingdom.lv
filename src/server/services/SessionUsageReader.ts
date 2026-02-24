import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';
import { database } from '../database/DatabaseConnection.js';
import type { TokenUsageRow } from '../../shared/types.js';

const CLAUDE_PROJECTS_DIR = path.resolve(process.env.HOME ?? '/home/forge', '.claude/projects');
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelPricing {
  input: number;      // USD per 1M input tokens
  output: number;     // USD per 1M output tokens
  cacheWrite: number; // USD per 1M cache creation tokens
  cacheRead: number;  // USD per 1M cache read tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.30,
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4,
    cacheWrite: 1,
    cacheRead: 0.08,
  },
};

const FALLBACK_PRICING = MODEL_PRICING['claude-sonnet-4-6'];

interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

/**
 * Scans Claude Code JSONL session files under ~/.claude/projects/, extracts
 * per-API-call token usage from assistant messages, aggregates by (project, date),
 * and upserts the results into the token_usage SQLite table.
 *
 * Runs an initial scan on startup then rescans every SCAN_INTERVAL_MS.
 */
class SessionUsageReader {
  private scanIntervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic scanning. Runs an immediate scan then rescans every 5 minutes.
   */
  startPeriodicScan(): void {
    // Run immediately
    this.scanAllProjects().catch((error) => {
      console.error('[SessionUsageReader] Initial scan failed:', error);
    });

    // Then on interval
    this.scanIntervalHandle = setInterval(() => {
      this.scanAllProjects().catch((error) => {
        console.error('[SessionUsageReader] Periodic scan failed:', error);
      });
    }, SCAN_INTERVAL_MS);
  }

  /**
   * Stop the periodic scan interval.
   */
  stopPeriodicScan(): void {
    if (this.scanIntervalHandle !== null) {
      clearInterval(this.scanIntervalHandle);
      this.scanIntervalHandle = null;
    }
  }

  /**
   * Scan all project directories under CLAUDE_PROJECTS_DIR, aggregate token usage
   * by (project_label, date), and upsert into the token_usage table.
   */
  async scanAllProjects(): Promise<void> {
    let projectDirEntries: string[];
    try {
      projectDirEntries = await readdir(CLAUDE_PROJECTS_DIR);
    } catch (error) {
      console.error('[SessionUsageReader] Cannot read projects directory:', CLAUDE_PROJECTS_DIR, error);
      return;
    }

    for (const projectDirName of projectDirEntries) {
      const projectDirPath = path.join(CLAUDE_PROJECTS_DIR, projectDirName);
      await this.scanProject(projectDirPath, projectDirName);
    }
  }

  /**
   * Scan a single project directory, finding all JSONL session files (top-level
   * and within session-UUID subdirectories' subagents/ folder).
   */
  private async scanProject(projectDirPath: string, projectDirName: string): Promise<void> {
    // Derive agent_id label from directory name:
    // Claude Code uses a leading dash then path components separated by dashes.
    // Strip the leading dash and use the rest as-is: e.g. "-home-forge-warden-kingdom-lv" → "home-forge-warden-kingdom-lv"
    const agentId = projectDirName.startsWith('-') ? projectDirName.slice(1) : projectDirName;

    let dirEntries: string[];
    try {
      dirEntries = await readdir(projectDirPath);
    } catch {
      return; // Not a directory or unreadable — skip
    }

    // Collect all JSONL files to scan
    const jsonlFilePaths: string[] = [];

    for (const entry of dirEntries) {
      const entryPath = path.join(projectDirPath, entry);

      if (entry.endsWith('.jsonl')) {
        // Top-level session file
        jsonlFilePaths.push(entryPath);
      } else {
        // May be a session-UUID subdirectory with subagents/
        const subagentsPath = path.join(entryPath, 'subagents');
        let subagentEntries: string[];
        try {
          subagentEntries = await readdir(subagentsPath);
        } catch {
          continue; // No subagents directory — skip
        }
        for (const subagentFile of subagentEntries) {
          if (subagentFile.endsWith('.jsonl')) {
            jsonlFilePaths.push(path.join(subagentsPath, subagentFile));
          }
        }
      }
    }

    if (jsonlFilePaths.length === 0) {
      return;
    }

    // Aggregate usage by date: Map<date, UsageAccumulator>
    const dailyUsage = new Map<string, UsageAccumulator>();

    for (const filePath of jsonlFilePaths) {
      await this.processJsonlFile(filePath, dailyUsage);
    }

    // Upsert each day's aggregated usage
    for (const [date, accumulator] of dailyUsage.entries()) {
      const row: TokenUsageRow = {
        agentId,
        date,
        inputTokens: accumulator.inputTokens,
        outputTokens: accumulator.outputTokens,
        cacheCreationInputTokens: accumulator.cacheCreationInputTokens,
        cacheReadInputTokens: accumulator.cacheReadInputTokens,
        costUsd: accumulator.costUsd,
      };
      try {
        database.upsertTokenUsage(row);
      } catch (error) {
        console.error(`[SessionUsageReader] Failed to upsert usage for ${agentId} on ${date}:`, error);
      }
    }
  }

  /**
   * Parse a single JSONL file and accumulate token usage from assistant messages
   * into the provided dailyUsage map. Streams line-by-line via readline to avoid
   * buffering entire file contents into memory.
   */
  private async processJsonlFile(
    filePath: string,
    dailyUsage: Map<string, UsageAccumulator>,
  ): Promise<void> {
    const readStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: readStream, crlfDelay: Infinity });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let record: Record<string, unknown>;
        try {
          record = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // Skip malformed lines (e.g. partial writes at end of file)
          continue;
        }

        // Only process assistant messages that have usage data
        if (record['type'] !== 'assistant') continue;

        const message = record['message'] as Record<string, unknown> | undefined;
        if (!message) continue;

        const usage = message['usage'] as Record<string, unknown> | undefined;
        if (!usage) continue;

        const timestamp = record['timestamp'] as string | undefined;
        if (!timestamp) continue;

        // Extract date (YYYY-MM-DD) from ISO 8601 timestamp
        const date = timestamp.slice(0, 10);

        // Extract token counts (default to 0 if missing)
        const inputTokens = Number(usage['input_tokens'] ?? 0);
        const outputTokens = Number(usage['output_tokens'] ?? 0);
        const cacheCreationInputTokens = Number(usage['cache_creation_input_tokens'] ?? 0);
        const cacheReadInputTokens = Number(usage['cache_read_input_tokens'] ?? 0);

        // Determine model pricing
        const model = String(message['model'] ?? '');
        const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;

        // Compute cost in USD
        const costUsd =
          (inputTokens * pricing.input +
            outputTokens * pricing.output +
            cacheCreationInputTokens * pricing.cacheWrite +
            cacheReadInputTokens * pricing.cacheRead) /
          1_000_000;

        // Accumulate into daily totals
        const existing = dailyUsage.get(date);
        if (existing) {
          existing.inputTokens += inputTokens;
          existing.outputTokens += outputTokens;
          existing.cacheCreationInputTokens += cacheCreationInputTokens;
          existing.cacheReadInputTokens += cacheReadInputTokens;
          existing.costUsd += costUsd;
        } else {
          dailyUsage.set(date, {
            inputTokens,
            outputTokens,
            cacheCreationInputTokens,
            cacheReadInputTokens,
            costUsd,
          });
        }
      }
    } catch {
      // File unreadable or stream error — skip without logging (common for temp/lock files)
      return;
    } finally {
      rl.close();
      readStream.destroy();
    }
  }
}

export const sessionUsageReader = new SessionUsageReader();
