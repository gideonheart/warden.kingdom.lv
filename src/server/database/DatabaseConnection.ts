import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AgentInstance, AgentInstanceCreateParams, AgentInstanceStatus } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_PATH = path.resolve(__dirname, '../../../data/warden.db');

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

  listActiveInstances(): AgentInstance[] {
    return this.db.prepare(`
      SELECT id, agent_id as agentId, agent_name as agentName, tmux_session_name as tmuxSessionName,
             status, project_path as projectPath, telegram_topic_id as telegramTopicId,
             created_at as createdAt, last_active_at as lastActiveAt
      FROM instances WHERE status IN ('active', 'idle')
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

  upsertInstance(params: AgentInstanceCreateParams): AgentInstance {
    const existing = this.findInstanceBySessionName(params.tmuxSessionName);
    if (existing) {
      this.updateInstanceStatus(existing.id, 'active');
      return this.findInstanceById(existing.id)!;
    }
    return this.insertInstance(params);
  }

  markMissingSessionsStopped(activeSessionNames: string[]): void {
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

  getTokenUsage(filters: { agentId?: string; dateFrom?: string; dateTo?: string }): { agentId: string; date: string; inputTokens: number; outputTokens: number; costUsd: number }[] {
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
             output_tokens as outputTokens, cost_usd as costUsd
      FROM token_usage ${whereClause}
      ORDER BY date DESC, agent_id
    `).all(...params) as { agentId: string; date: string; inputTokens: number; outputTokens: number; costUsd: number }[];
  }

  getTokenUsageSummary(): { agentId: string; totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; dayCount: number }[] {
    return this.db.prepare(`
      SELECT agent_id as agentId,
             SUM(input_tokens) as totalInputTokens,
             SUM(output_tokens) as totalOutputTokens,
             SUM(cost_usd) as totalCostUsd,
             COUNT(DISTINCT date) as dayCount
      FROM token_usage
      GROUP BY agent_id
      ORDER BY totalCostUsd DESC
    `).all() as { agentId: string; totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; dayCount: number }[];
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
    `);
  }
}

export const database = new DatabaseConnection();
