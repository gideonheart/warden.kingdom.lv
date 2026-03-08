import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AgentInstance, AgentInstanceCreateParams, AgentInstanceStatus, TokenUsageRow, BurnRateEntry, BudgetConfig, BudgetAlertStatus, BurnWindow, TokenUsageByModelRow, ModelComparisonRow, TokenUsageExportRow, RecordingEntry, AutoRecordConfig, RotationConfig, StorageStats, NotificationConfig, LifecycleEvent, LifecycleEventType, RestartPolicy, CrashRestartMode } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve from project root so it works regardless of build output nesting (src vs dist).
const DATABASE_PATH = path.resolve(process.cwd(), 'data/warden.db');

class DatabaseConnection {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DATABASE_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  insertInstance(params: AgentInstanceCreateParams): AgentInstance {
    const statement = this.db.prepare(`
      INSERT INTO instances (agent_id, agent_name, tmux_session_name, status, project_path, telegram_topic_id)
      VALUES (@agentId, @agentName, @tmuxSessionName, 'active', @projectPath, @telegramTopicId)
    `);
    const result = statement.run({
      agentId: params.agentId,
      agentName: params.agentName,
      tmuxSessionName: params.tmuxSessionName,
      projectPath: params.projectPath,
      telegramTopicId: params.telegramTopicId ?? null,
    });
    return this.findInstanceById(result.lastInsertRowid as number)!;
  }

  findInstanceById(id: number): AgentInstance | null {
    const row = this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances WHERE id = ?
    `).get(id) as AgentInstance | null;
    return row;
  }

  findInstanceBySessionName(tmuxSessionName: string): AgentInstance | null {
    const row = this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances WHERE tmux_session_name = ?
    `).get(tmuxSessionName) as AgentInstance | null;
    return row;
  }

  findActiveInstanceByAgentId(agentId: string): AgentInstance | null {
    const row = this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances WHERE agent_id = ? AND status IN ('active', 'idle', 'starting') LIMIT 1
    `).get(agentId) as AgentInstance | null;
    return row;
  }

  listActiveInstances(): AgentInstance[] {
    return this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances
      WHERE status IN ('active', 'idle', 'starting', 'stopping')
         -- Retain recently-stopped and recently-errored sessions for 30 minutes so the
         -- operator can see the tab and click Restart before it ages out of the tab bar.
         OR (status IN ('stopped', 'error') AND last_active_at >= datetime('now', '-30 minutes'))
      ORDER BY last_active_at DESC
    `).all() as AgentInstance[];
  }

  listAllInstances(): AgentInstance[] {
    return this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances ORDER BY last_active_at DESC
    `).all() as AgentInstance[];
  }

  updateInstanceStatus(id: number, status: AgentInstanceStatus): void {
    this.db.prepare(
      'UPDATE instances SET status = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
  }

  /**
   * Permanently delete a stopped or error instance record.
   * Only allowed for 'stopped' or 'error' status — active sessions must not be deleted.
   * Returns true if a row was deleted, false if not found or wrong status.
   *
   * Runs inside a transaction to satisfy FOREIGN KEY constraints:
   * activity_events, session_lifecycle_events, and session_logs reference instances(id)
   * with NO ACTION, so child rows must be removed before the parent instance row.
   */
  deleteInstance(id: number): boolean {
    const deleteChildren = this.db.transaction(() => {
      this.db.prepare('DELETE FROM activity_events WHERE instance_id = ?').run(id);
      this.db.prepare('DELETE FROM session_lifecycle_events WHERE session_id = ?').run(id);
      this.db.prepare('DELETE FROM session_logs WHERE instance_id = ?').run(id);
      const result = this.db.prepare(
        "DELETE FROM instances WHERE id = ? AND status IN ('stopped', 'error')"
      ).run(id);
      return result.changes > 0;
    });
    return deleteChildren() as boolean;
  }

  upsertInstance(params: AgentInstanceCreateParams): AgentInstance {
    const existing = this.findInstanceBySessionName(params.tmuxSessionName);
    if (existing) {
      // Backfill project_path if the existing record has an empty one and the caller
      // provides a non-empty value. This ensures sessions discovered by tmux polling
      // eventually get their correct working directory populated (needed for auto-restart).
      const shouldBackfillPath = !existing.projectPath && params.projectPath;
      if (shouldBackfillPath) {
        this.db.prepare(
          "UPDATE instances SET status = 'active', agent_id = ?, agent_name = ?, project_path = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(params.agentId, params.agentName, params.projectPath, existing.id);
      } else {
        this.db.prepare(
          "UPDATE instances SET status = 'active', agent_id = ?, agent_name = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(params.agentId, params.agentName, existing.id);
      }
      return this.findInstanceById(existing.id)!;
    }
    return this.insertInstance(params);
  }

  markMissingSessionsStopped(activeSessionNames: string[]): void {
    // Only auto-stop 'active' and 'idle' sessions — 'starting' and 'stopping' are
    // managed by their own lifecycle handlers and must not be clobbered by the poll.
    if (activeSessionNames.length === 0) {
      this.db.prepare(
        "UPDATE instances SET status = 'stopped', last_active_at = CURRENT_TIMESTAMP WHERE status IN ('active', 'idle')"
      ).run();
      return;
    }
    const placeholders = activeSessionNames.map(() => '?').join(',');
    this.db.prepare(`
      UPDATE instances SET status = 'stopped', last_active_at = CURRENT_TIMESTAMP
      WHERE status IN ('active', 'idle') AND tmux_session_name NOT IN (${placeholders})
    `).run(...activeSessionNames);
  }

  searchInstances(filters: { agentId?: string; status?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): { instances: AgentInstance[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('created_at <= ?');
      params.push(filters.dateTo + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const total = (this.db.prepare(
      `SELECT COUNT(*) as count FROM instances ${whereClause}`
    ).get(...params) as { count: number }).count;

    const instances = this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as AgentInstance[];

    return { instances, total };
  }

  upsertTokenUsage(row: TokenUsageRow): void {
    this.db.prepare(`
      INSERT INTO token_usage (agent_id, date, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd)
      VALUES (@agentId, @date, @inputTokens, @outputTokens, @cacheCreationInputTokens, @cacheReadInputTokens, @costUsd)
      ON CONFLICT(agent_id, date) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_creation_input_tokens = excluded.cache_creation_input_tokens,
        cache_read_input_tokens = excluded.cache_read_input_tokens,
        cost_usd = excluded.cost_usd
    `).run({
      agentId: row.agentId,
      date: row.date,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheCreationInputTokens: row.cacheCreationInputTokens,
      cacheReadInputTokens: row.cacheReadInputTokens,
      costUsd: row.costUsd,
    });
  }

  getTokenUsage(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): { agentId: string; date: string; inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number; costUsd: number }[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    if (filters.dateFrom) {
      conditions.push('date >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('date <= ?');
      params.push(filters.dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT agent_id as agentId, date, input_tokens as inputTokens,
             output_tokens as outputTokens,
             COALESCE(cache_creation_input_tokens, 0) as cacheCreationInputTokens,
             COALESCE(cache_read_input_tokens, 0) as cacheReadInputTokens,
             cost_usd as costUsd
      FROM token_usage ${whereClause}
      ORDER BY date DESC, agent_id
    `).all(...params) as { agentId: string; date: string; inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number; costUsd: number }[];
  }

  getTokenUsageSummary(): { agentId: string; totalInputTokens: number; totalOutputTokens: number; totalCacheCreationInputTokens: number; totalCacheReadInputTokens: number; totalCostUsd: number; dayCount: number }[] {
    return this.db.prepare(`
      SELECT agent_id as agentId,
             SUM(input_tokens) as totalInputTokens,
             SUM(output_tokens) as totalOutputTokens,
             SUM(COALESCE(cache_creation_input_tokens, 0)) as totalCacheCreationInputTokens,
             SUM(COALESCE(cache_read_input_tokens, 0)) as totalCacheReadInputTokens,
             SUM(cost_usd) as totalCostUsd,
             COUNT(DISTINCT date) as dayCount
      FROM token_usage
      GROUP BY agent_id
      ORDER BY totalCostUsd DESC
    `).all() as { agentId: string; totalInputTokens: number; totalOutputTokens: number; totalCacheCreationInputTokens: number; totalCacheReadInputTokens: number; totalCostUsd: number; dayCount: number }[];
  }

  getBurnRate(window: BurnWindow): BurnRateEntry[] {
    const windowHoursMap: Record<BurnWindow, number> = {
      today: 24,
      '2day': 48,
      '7day': 168,
    };
    const windowDaysMap: Record<BurnWindow, number> = {
      today: 1,
      '2day': 2,
      '7day': 7,
    };
    const hours = windowHoursMap[window];
    const days = windowDaysMap[window];

    return this.db.prepare(`
      SELECT
        agent_id AS agentId,
        SUM(cost_usd) AS windowCostUsd,
        SUM(cost_usd) / ${hours}.0 AS burnRatePerHour,
        SUM(cost_usd) / ${hours}.0 * 24.0 AS projectedDailyUsd,
        SUM(cost_usd) / ${hours}.0 * 168.0 AS projectedWeeklyUsd
      FROM token_usage
      WHERE date >= date('now', '-${days} days')
      GROUP BY agent_id
      ORDER BY burnRatePerHour DESC
    `).all() as BurnRateEntry[];
  }

  getAllBudgetConfigs(): BudgetConfig[] {
    return this.db.prepare(`
      SELECT agent_id AS agentId, daily_budget_usd AS dailyBudgetUsd
      FROM budget_config
      WHERE daily_budget_usd > 0
      ORDER BY agent_id
    `).all() as BudgetConfig[];
  }

  upsertBudgetConfig(agentId: string, dailyBudgetUsd: number): void {
    if (dailyBudgetUsd === 0) {
      this.db.prepare('DELETE FROM budget_config WHERE agent_id = ?').run(agentId);
      return;
    }
    this.db.prepare(`
      INSERT INTO budget_config (agent_id, daily_budget_usd, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        daily_budget_usd = excluded.daily_budget_usd,
        updated_at = CURRENT_TIMESTAMP
    `).run(agentId, dailyBudgetUsd);
  }

  getBudgetAlertStatus(): BudgetAlertStatus[] {
    return this.db.prepare(`
      SELECT
        bc.agent_id AS agentId,
        COALESCE(tu.cost_usd, 0) AS todayCostUsd,
        bc.daily_budget_usd AS dailyBudgetUsd,
        COALESCE(tu.cost_usd, 0) / bc.daily_budget_usd * 100.0 AS budgetPct,
        CASE
          WHEN COALESCE(tu.cost_usd, 0) / bc.daily_budget_usd * 100.0 >= 100 THEN 'exceeded'
          WHEN COALESCE(tu.cost_usd, 0) / bc.daily_budget_usd * 100.0 >= 80 THEN 'warning'
          ELSE 'ok'
        END AS alertLevel
      FROM budget_config bc
      LEFT JOIN token_usage tu
        ON tu.agent_id = bc.agent_id AND tu.date = date('now')
      WHERE bc.daily_budget_usd > 0
      ORDER BY budgetPct DESC
    `).all() as BudgetAlertStatus[];
  }

  insertRecording(params: {
    sessionName: string;
    agentId: string;
    agentName: string;
    projectPath: string;
    filePath: string;
  }): RecordingEntry {
    const result = this.db.prepare(`
      INSERT INTO recordings (session_name, agent_id, agent_name, project_path, file_path)
      VALUES (@sessionName, @agentId, @agentName, @projectPath, @filePath)
    `).run(params);
    return this.findRecordingById(result.lastInsertRowid as number)!;
  }

  findRecordingById(id: number): RecordingEntry | null {
    return this.db.prepare(`
      SELECT id, session_name AS sessionName, agent_id AS agentId, agent_name AS agentName,
             project_path AS projectPath, file_path AS filePath,
             started_at AS startedAt, stopped_at AS stoppedAt,
             duration_secs AS durationSecs, file_size_bytes AS fileSizeBytes,
             stop_reason AS stopReason
      FROM recordings WHERE id = ?
    `).get(id) as RecordingEntry | null;
  }

  finaliseRecording(id: number, params: { durationSecs: number; fileSizeBytes: number; stopReason: 'manual' | 'session_ended' }): void {
    this.db.prepare(`
      UPDATE recordings
      SET stopped_at = CURRENT_TIMESTAMP, duration_secs = @durationSecs,
          file_size_bytes = @fileSizeBytes, stop_reason = @stopReason
      WHERE id = @id
    `).run({ id, ...params });
  }

  listRecordings(): RecordingEntry[] {
    return this.db.prepare(`
      SELECT id, session_name AS sessionName, agent_id AS agentId, agent_name AS agentName,
             project_path AS projectPath, file_path AS filePath,
             started_at AS startedAt, stopped_at AS stoppedAt,
             duration_secs AS durationSecs, file_size_bytes AS fileSizeBytes,
             stop_reason AS stopReason
      FROM recordings
      ORDER BY started_at DESC
    `).all() as RecordingEntry[];
  }

  deleteRecording(id: number): RecordingEntry | null {
    const entry = this.findRecordingById(id);
    if (!entry) return null;
    this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
    return entry;
  }

  getAllAutoRecordConfigs(): AutoRecordConfig[] {
    return (this.db.prepare(`
      SELECT agent_id AS agentId, auto_record AS autoRecord
      FROM auto_record_config
      WHERE auto_record = 1
    `).all() as Array<{ agentId: string; autoRecord: number }>).map(row => ({
      agentId: row.agentId,
      autoRecord: row.autoRecord === 1,
    }));
  }

  setAutoRecord(agentId: string, enabled: boolean): void {
    if (!enabled) {
      this.db.prepare('DELETE FROM auto_record_config WHERE agent_id = ?').run(agentId);
      return;
    }
    this.db.prepare(`
      INSERT INTO auto_record_config (agent_id, auto_record, updated_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET auto_record = 1, updated_at = CURRENT_TIMESTAMP
    `).run(agentId);
  }

  isAutoRecordEnabled(agentId: string): boolean {
    const row = this.db.prepare(
      'SELECT auto_record FROM auto_record_config WHERE agent_id = ?'
    ).get(agentId) as { auto_record: number } | undefined;
    return row?.auto_record === 1;
  }

  getRotationConfig(): RotationConfig {
    const row = this.db.prepare(
      'SELECT cap_bytes AS capBytes FROM rotation_config WHERE id = 1'
    ).get() as { capBytes: number } | undefined;
    return { capBytes: row?.capBytes ?? 0 };
  }

  setRotationConfig(capBytes: number): void {
    this.db.prepare(`
      INSERT INTO rotation_config (id, cap_bytes, updated_at)
      VALUES (1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET cap_bytes = excluded.cap_bytes, updated_at = CURRENT_TIMESTAMP
    `).run(capBytes);
  }

  getNotificationConfig(): NotificationConfig {
    const row = this.db.prepare(`
      SELECT
        permission_alerts_enabled AS permissionAlertsEnabled,
        budget_alerts_enabled AS budgetAlertsEnabled,
        permission_cooldown_ms AS permissionCooldownMs,
        budget_cooldown_ms AS budgetCooldownMs
      FROM notification_config WHERE id = 1
    `).get() as { permissionAlertsEnabled: number; budgetAlertsEnabled: number; permissionCooldownMs: number; budgetCooldownMs: number } | undefined;

    const defaults: NotificationConfig = {
      permissionAlertsEnabled: true,
      budgetAlertsEnabled: true,
      permissionCooldownMs: 120000,
      budgetCooldownMs: 600000,
    };

    if (!row) return defaults;

    return {
      permissionAlertsEnabled: row.permissionAlertsEnabled !== 0,
      budgetAlertsEnabled: row.budgetAlertsEnabled !== 0,
      permissionCooldownMs: row.permissionCooldownMs ?? defaults.permissionCooldownMs,
      budgetCooldownMs: row.budgetCooldownMs ?? defaults.budgetCooldownMs,
    };
  }

  setNotificationConfig(config: Partial<NotificationConfig>): void {
    const current = this.getNotificationConfig();
    const merged = { ...current, ...config };
    this.db.prepare(`
      INSERT INTO notification_config (id, permission_alerts_enabled, budget_alerts_enabled, permission_cooldown_ms, budget_cooldown_ms, updated_at)
      VALUES (1, @permissionAlertsEnabled, @budgetAlertsEnabled, @permissionCooldownMs, @budgetCooldownMs, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        permission_alerts_enabled = excluded.permission_alerts_enabled,
        budget_alerts_enabled = excluded.budget_alerts_enabled,
        permission_cooldown_ms = excluded.permission_cooldown_ms,
        budget_cooldown_ms = excluded.budget_cooldown_ms,
        updated_at = CURRENT_TIMESTAMP
    `).run({
      permissionAlertsEnabled: merged.permissionAlertsEnabled ? 1 : 0,
      budgetAlertsEnabled: merged.budgetAlertsEnabled ? 1 : 0,
      permissionCooldownMs: merged.permissionCooldownMs,
      budgetCooldownMs: merged.budgetCooldownMs,
    });
  }

  getStorageStats(): StorageStats {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(file_size_bytes), 0) AS totalBytes,
             COUNT(*) AS recordingCount
      FROM recordings
      WHERE stopped_at IS NOT NULL AND deletion_pending = 0
    `).get() as { totalBytes: number; recordingCount: number };
    return { totalBytes: row.totalBytes, recordingCount: row.recordingCount };
  }

  getRotationCandidates(): RecordingEntry[] {
    return this.db.prepare(`
      SELECT id, session_name AS sessionName, agent_id AS agentId, agent_name AS agentName,
             project_path AS projectPath, file_path AS filePath,
             started_at AS startedAt, stopped_at AS stoppedAt,
             duration_secs AS durationSecs, file_size_bytes AS fileSizeBytes,
             stop_reason AS stopReason
      FROM recordings
      WHERE stopped_at IS NOT NULL AND deletion_pending = 0 AND file_size_bytes IS NOT NULL
      ORDER BY started_at ASC
    `).all() as RecordingEntry[];
  }

  markDeletionPending(id: number): void {
    this.db.prepare('UPDATE recordings SET deletion_pending = 1 WHERE id = ?').run(id);
  }

  isRecordingPendingDeletion(id: number): boolean {
    const row = this.db.prepare(
      'SELECT deletion_pending FROM recordings WHERE id = ?'
    ).get(id) as { deletion_pending: number } | undefined;
    return row?.deletion_pending === 1;
  }

  getDeletionPendingRecordings(): Array<{ id: number; filePath: string }> {
    return this.db.prepare(
      'SELECT id, file_path AS filePath FROM recordings WHERE deletion_pending = 1'
    ).all() as Array<{ id: number; filePath: string }>;
  }

  getBudgetAlertState(agentId: string): { level: string; lastAlertedAt: number | null } | null {
    return this.db.prepare(`
      SELECT alert_level AS level, last_alerted_at AS lastAlertedAt
      FROM budget_alert_state WHERE agent_id = ?
    `).get(agentId) as { level: string; lastAlertedAt: number | null } | null;
  }

  setBudgetAlertState(agentId: string, level: string, lastAlertedAt: number | null): void {
    this.db.prepare(`
      INSERT INTO budget_alert_state (agent_id, alert_level, last_alerted_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        alert_level = excluded.alert_level,
        last_alerted_at = excluded.last_alerted_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(agentId, level, lastAlertedAt);
  }

  deleteBudgetAlertState(agentId: string): void {
    this.db.prepare(`DELETE FROM budget_alert_state WHERE agent_id = ?`).run(agentId);
  }

  getAllBudgetAlertStates(): Array<{ agentId: string; level: string; lastAlertedAt: number | null }> {
    return this.db.prepare(`
      SELECT agent_id AS agentId, alert_level AS level, last_alerted_at AS lastAlertedAt
      FROM budget_alert_state
    `).all() as Array<{ agentId: string; level: string; lastAlertedAt: number | null }>;
  }

  insertLifecycleEvent(params: {
    sessionId: number;
    agentId: string;
    sessionName: string;
    eventType: LifecycleEventType;
    outcome?: string;
    uptimeSecs?: number;
    projectSlug?: string;
    lastKnownState?: string;
    stopReason?: string;
  }): LifecycleEvent {
    const result = this.db.prepare(`
      INSERT INTO session_lifecycle_events
        (session_id, agent_id, session_name, event_type, outcome, uptime_secs, project_slug, last_known_state, stop_reason)
      VALUES
        (@sessionId, @agentId, @sessionName, @eventType, @outcome, @uptimeSecs, @projectSlug, @lastKnownState, @stopReason)
    `).run({
      sessionId: params.sessionId,
      agentId: params.agentId,
      sessionName: params.sessionName,
      eventType: params.eventType,
      outcome: params.outcome ?? null,
      uptimeSecs: params.uptimeSecs ?? null,
      projectSlug: params.projectSlug ?? null,
      lastKnownState: params.lastKnownState ?? null,
      stopReason: params.stopReason ?? null,
    });

    return this.db.prepare(`
      SELECT id, session_id AS sessionId, agent_id AS agentId, session_name AS sessionName,
             event_type AS eventType, timestamp, outcome, uptime_secs AS uptimeSecs,
             project_slug AS projectSlug, last_known_state AS lastKnownState, stop_reason AS stopReason
      FROM session_lifecycle_events WHERE id = ?
    `).get(result.lastInsertRowid) as LifecycleEvent;
  }

  getLifecycleEvents(filters: { agentId?: string; eventType?: string; limit?: number; offset?: number } = {}): { events: LifecycleEvent[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    if (filters.eventType) {
      conditions.push('event_type = ?');
      params.push(filters.eventType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const total = (this.db.prepare(
      `SELECT COUNT(*) as count FROM session_lifecycle_events ${whereClause}`
    ).get(...params) as { count: number }).count;

    const events = this.db.prepare(`
      SELECT id, session_id AS sessionId, agent_id AS agentId, session_name AS sessionName,
             event_type AS eventType, timestamp, outcome, uptime_secs AS uptimeSecs,
             project_slug AS projectSlug, last_known_state AS lastKnownState, stop_reason AS stopReason
      FROM session_lifecycle_events ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as LifecycleEvent[];

    return { events, total };
  }

  getRestartPolicy(agentId: string): RestartPolicy {
    const row = this.db.prepare(`
      SELECT agent_id AS agentId, crash_restart_mode AS crashRestartMode,
             storm_disabled_at AS stormDisabledAt,
             idle_timeout_minutes AS idleTimeoutMinutes
      FROM session_lifecycle_policy WHERE agent_id = ?
    `).get(agentId) as { agentId: string; crashRestartMode: CrashRestartMode; stormDisabledAt: string | null; idleTimeoutMinutes: number | null } | undefined;

    if (!row) {
      return { agentId, crashRestartMode: 'none', stormDisabledAt: null, idleTimeoutMinutes: null };
    }
    return row;
  }

  setRestartPolicy(agentId: string, mode: CrashRestartMode): void {
    this.db.prepare(`
      INSERT INTO session_lifecycle_policy (agent_id, crash_restart_mode, storm_disabled_at, updated_at)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        crash_restart_mode = excluded.crash_restart_mode,
        storm_disabled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(agentId, mode);
  }

  getAllRestartPolicies(): RestartPolicy[] {
    return this.db.prepare(`
      SELECT agent_id AS agentId, crash_restart_mode AS crashRestartMode,
             storm_disabled_at AS stormDisabledAt,
             idle_timeout_minutes AS idleTimeoutMinutes
      FROM session_lifecycle_policy
      ORDER BY agent_id
    `).all() as RestartPolicy[];
  }

  /**
   * Returns a map of agentId -> most recent non-empty project_path.
   * Used by the quick-launch modal to pre-fill the project path field per agent.
   */
  getLastProjectPaths(): Record<string, string> {
    const rows = this.db.prepare(`
      SELECT agent_id, project_path
      FROM instances
      WHERE project_path != ''
      ORDER BY last_active_at DESC
    `).all() as Array<{ agent_id: string; project_path: string }>;

    const result: Record<string, string> = {};
    for (const row of rows) {
      // Only keep the first occurrence (most recent due to ORDER BY last_active_at DESC)
      if (!(row.agent_id in result)) {
        result[row.agent_id] = row.project_path;
      }
    }
    return result;
  }

  /**
   * Set the idle timeout for an agent (null = disabled, minimum 60 minutes).
   * Uses upsert so a row is created even if the agent has no other policy set.
   */
  setIdleTimeout(agentId: string, minutes: number | null): void {
    if (minutes !== null && minutes < 60) {
      throw new Error(`Idle timeout must be at least 60 minutes (got ${minutes})`);
    }
    this.db.prepare(`
      INSERT INTO session_lifecycle_policy (agent_id, idle_timeout_minutes, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        idle_timeout_minutes = excluded.idle_timeout_minutes,
        updated_at = CURRENT_TIMESTAMP
    `).run(agentId, minutes);
  }

  /**
   * Get the idle timeout for an agent. Returns null if no timeout is configured.
   */
  getIdleTimeout(agentId: string): number | null {
    const row = this.db.prepare(`
      SELECT idle_timeout_minutes AS idleTimeoutMinutes
      FROM session_lifecycle_policy WHERE agent_id = ?
    `).get(agentId) as { idleTimeoutMinutes: number | null } | undefined;
    return row?.idleTimeoutMinutes ?? null;
  }

  /**
   * Flip crash_restart_mode to 'none' and record the storm_disabled_at timestamp.
   * Uses upsert so that a row is created even if the agent never had a policy set.
   * Called by AutoRestartService when the sliding window rate limit is exceeded.
   */
  markStormDisabled(agentId: string): void {
    this.db.prepare(`
      INSERT INTO session_lifecycle_policy (agent_id, crash_restart_mode, storm_disabled_at, updated_at)
      VALUES (?, 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        crash_restart_mode = 'none',
        storm_disabled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(agentId);
  }

  close(): void {
    console.log('[Database] Checkpointing WAL before close');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    console.log('[Database] Database closed');
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL DEFAULT '',
        tmux_session_name TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        project_path TEXT NOT NULL,
        telegram_topic_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER NOT NULL REFERENCES instances(id),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        date TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0.0,
        UNIQUE(agent_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_instances_agent_id ON instances(agent_id);
      CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
      CREATE INDEX IF NOT EXISTS idx_session_logs_instance ON session_logs(instance_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_agent_date ON token_usage(agent_id, date);

      CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER REFERENCES instances(id),
        agent_id TEXT NOT NULL,
        session_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        summary TEXT NOT NULL,
        detail TEXT,
        success INTEGER,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_activity_events_agent_id ON activity_events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(session_name);
    `);

    // Migration: add cache token columns to token_usage (idempotent — SQLite errors on duplicate ADD COLUMN)
    for (const columnDef of [
      'cache_creation_input_tokens INTEGER DEFAULT 0',
      'cache_read_input_tokens INTEGER DEFAULT 0',
    ]) {
      try {
        this.db.exec(`ALTER TABLE token_usage ADD COLUMN ${columnDef}`);
      } catch {
        // Column already exists — safe to ignore
      }
    }

    // Migration: budget_config table for per-agent daily budget thresholds
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budget_config (
        agent_id TEXT PRIMARY KEY,
        daily_budget_usd REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: token_usage_by_model table for per-model daily aggregates (TOKN-12, TOKN-14)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage_by_model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        date TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_creation_input_tokens INTEGER DEFAULT 0,
        cache_read_input_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0.0,
        UNIQUE(agent_id, date, model)
      );

      CREATE INDEX IF NOT EXISTS idx_token_usage_by_model_agent_date
        ON token_usage_by_model(agent_id, date);
    `);

    // Migration: recordings table (REC-01) for asciicast v2 session recordings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL DEFAULT '',
        project_path TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        stopped_at DATETIME,
        duration_secs REAL,
        file_size_bytes INTEGER,
        stop_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_recordings_agent_id ON recordings(agent_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_started_at ON recordings(started_at);
    `);

    // Migration: auto_record_config table (REC-05) for per-agent auto-record toggles
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auto_record_config (
        agent_id TEXT PRIMARY KEY,
        auto_record INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: rotation_config table (ROT-01) — single-row storage cap config
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rotation_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cap_bytes INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: deletion_pending column on recordings (ROT-02) — two-phase deletion safety
    try {
      this.db.exec('ALTER TABLE recordings ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
    } catch {
      // Column already exists — safe to ignore
    }

    // Migration: notification_config table (NSET-03) — single-row notification preferences
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        permission_alerts_enabled INTEGER NOT NULL DEFAULT 1,
        budget_alerts_enabled INTEGER NOT NULL DEFAULT 1,
        permission_cooldown_ms INTEGER NOT NULL DEFAULT 120000,
        budget_cooldown_ms INTEGER NOT NULL DEFAULT 600000,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: budget_alert_state table (FIX-05) — persists per-agent dedup state across restarts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budget_alert_state (
        agent_id TEXT PRIMARY KEY,
        alert_level TEXT NOT NULL DEFAULT 'ok',
        last_alerted_at INTEGER,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: session_lifecycle_events table (CRSH-01) — records all session lifecycle transitions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_lifecycle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES instances(id),
        agent_id TEXT NOT NULL,
        session_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        outcome TEXT,
        uptime_secs REAL,
        project_slug TEXT,
        last_known_state TEXT,
        stop_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_lifecycle_events_agent_id ON session_lifecycle_events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_events_event_type ON session_lifecycle_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_events_timestamp ON session_lifecycle_events(timestamp);
    `);

    // Migration: session_lifecycle_policy table (CRSH-03) — per-agent crash restart configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_lifecycle_policy (
        agent_id TEXT PRIMARY KEY,
        crash_restart_mode TEXT NOT NULL DEFAULT 'none',
        storm_disabled_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: idle_timeout_minutes column on session_lifecycle_policy (IDLE-01)
    try {
      this.db.exec('ALTER TABLE session_lifecycle_policy ADD COLUMN idle_timeout_minutes INTEGER DEFAULT NULL');
    } catch {
      // Column already exists — safe to ignore
    }
  }

  upsertTokenUsageByModel(row: TokenUsageByModelRow): void {
    this.db.prepare(`
      INSERT INTO token_usage_by_model (agent_id, date, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd)
      VALUES (@agentId, @date, @model, @inputTokens, @outputTokens, @cacheCreationInputTokens, @cacheReadInputTokens, @costUsd)
      ON CONFLICT(agent_id, date, model) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_creation_input_tokens = excluded.cache_creation_input_tokens,
        cache_read_input_tokens = excluded.cache_read_input_tokens,
        cost_usd = excluded.cost_usd
    `).run({
      agentId: row.agentId,
      date: row.date,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheCreationInputTokens: row.cacheCreationInputTokens,
      cacheReadInputTokens: row.cacheReadInputTokens,
      costUsd: row.costUsd,
    });
  }

  getModelComparison(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): ModelComparisonRow[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    if (filters.dateFrom) {
      conditions.push('date >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('date <= ?');
      params.push(filters.dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT
        agent_id AS agentId,
        model,
        SUM(cost_usd) AS totalCostUsd,
        SUM(input_tokens) AS totalInputTokens,
        SUM(output_tokens) AS totalOutputTokens
      FROM token_usage_by_model ${whereClause}
      GROUP BY agent_id, model
      ORDER BY agentId, totalCostUsd DESC
    `).all(...params) as ModelComparisonRow[];
  }

  getTokenUsageForExport(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): TokenUsageExportRow[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    if (filters.dateFrom) {
      conditions.push('date >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('date <= ?');
      params.push(filters.dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT
        agent_id AS agentId,
        date,
        model,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        cache_creation_input_tokens AS cacheCreationInputTokens,
        cache_read_input_tokens AS cacheReadInputTokens,
        cost_usd AS costUsd
      FROM token_usage_by_model ${whereClause}
      ORDER BY date DESC, agent_id, model
    `).all(...params) as TokenUsageExportRow[];
  }
}

export const database = new DatabaseConnection();
