# Warden Dashboard — Product Requirements Document

**Domain:** `warden.kingdom.lv`
**Version:** 1.0
**Date:** February 12, 2026
**Status:** Draft
**Owner:** Gideon (Primary OpenClaw Agent)

---

## 1. Overview

Warden Dashboard is a web application hosted at `warden.kingdom.lv` that provides real-time visibility and control over multiple OpenClaw sub-agent Claude Code sessions. It is the observation and override layer for the multi-agent system orchestrated by Gideon.

**The problem:** Monitoring multiple Claude Code sessions requires SSH and manual tmux juggling. The OpenClaw Control UI manages the gateway but does not expose individual terminal sessions or per-topic agent routing.

**The solution:** A browser-based terminal multiplexer that streams live Claude Code output via xterm.js, shows which agent owns each session, maps sessions to Telegram topics, and lets you take over or inject prompts.

---

## 2. Technology Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Runtime** | Node.js | 22+ | OpenClaw runs on Node.js — keeps the ecosystem consistent |
| **Framework** | Express.js | 5.x | Lightweight HTTP + middleware, no magic |
| **WebSocket** | Socket.IO | 4.x | Real-time terminal streaming with auto-reconnect and room-based multiplexing |
| **Terminal** | node-pty | 1.x | Spawns pseudo-terminals to attach to tmux sessions |
| **Frontend** | React | 19.x | Component model fits the multi-panel dashboard layout |
| **Styling** | Tailwind CSS | 4.x | Utility-first, matches OpenClaw dark UI aesthetic |
| **Terminal UI** | xterm.js | 5.x | Industry standard browser terminal renderer |
| **Database** | SQLite (better-sqlite3) | 11.x | Zero-config, single-file, perfect for instance metadata on a single server |
| **Process Mgr** | tmux | 3.4+ | Named sessions persist across disconnects, multiple viewers can attach |
| **Build** | Vite | 6.x | Fast dev server, clean production builds |
| **Server OS** | Ubuntu 24 (Laravel Forge) | — | Same server as gideons.kingdom.lv |
| **Reverse Proxy** | Nginx | — | SSL termination, IP whitelist, WebSocket upgrade |
| **Language** | TypeScript | 5.x | Type safety across frontend and backend |

### Key npm Dependencies

```json
{
  "dependencies": {
    "express": "^5.0.0",
    "socket.io": "^4.8.0",
    "node-pty": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "react": "^19.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

---

## 3. Agent Architecture

### 3.1 Agent Hierarchy

```
Gideon (primary orchestrator)
├── Warden (coding agent)      → Telegram Topic 41
├── Scout  (research agent)    → Telegram Topic TBD
└── Builder (deploy agent)     → Telegram Topic TBD
```

Gideon stays free for conversation and delegation. Sub-agents do the heavy lifting in isolated workspaces. Each agent has its own SOUL.md, memory, session history, and auth profiles.

### 3.2 OpenClaw Multi-Agent Config

```json5
// ~/.openclaw/openclaw.json
{
  "agents": {
    "defaults": {
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      },
      "compaction": {
        "mode": "safeguard"
      },
      "workspace": "/home/forge/.openclaw/workspace",
      "model": {
        "primary": "openai-codex/gpt-5.2"
      }
    },
    "list": [
      {
        "id": "gideon",
        "default": true,
        "name": "Gideon",
        "workspace": "/home/forge/.openclaw/workspace",
        "subagents": {
          "allowAgents": ["warden", "scout", "builder"],
          "maxConcurrent": 5
        }
      },
      {
        "id": "warden",
        "name": "Warden",
        "workspace": "/home/forge/.openclaw/workspace-warden",
        "agentDir": "/home/forge/.openclaw/agents/warden/agent",
        "model": {
          "primary": "anthropic/claude-sonnet-4-5"
        }
      },
      {
        "id": "scout",
        "name": "Scout",
        "workspace": "/home/forge/.openclaw/workspace-scout",
        "agentDir": "/home/forge/.openclaw/agents/scout/agent"
      },
      {
        "id": "builder",
        "name": "Builder",
        "workspace": "/home/forge/.openclaw/workspace-builder",
        "agentDir": "/home/forge/.openclaw/agents/builder/agent"
      }
    ]
  },

  // Route Telegram topics directly to agents
  "bindings": [
    {
      "agentId": "warden",
      "match": {
        "channel": "telegram",
        "peer": { "kind": "group", "id": "-1003874762204" },
        "topicId": "41"
      }
    },
    {
      "agentId": "gideon",
      "match": {
        "channel": "telegram",
        "peer": { "kind": "group", "id": "-1003874762204" }
      }
    }
  ],

  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN",
      "groups": {
        "-1003874762204": {
          "requireMention": false,
          "topics": {
            "41": {
              "requireMention": false,
              "systemPrompt": "You are Warden, a coding agent. Your project directory is /home/forge/warden.kingdom.lv. All file operations should be scoped to this git directory."
            }
          }
        }
      }
    }
  }
}
```

### 3.3 Key OpenClaw Best Practices

**Use bindings, not behavioral promises.** Route topics to agents at the gateway level. Do not rely on systemPrompt alone to make Gideon "act as" Warden — that breaks on context compaction. Bindings are deterministic: most-specific match wins, evaluated before the agent sees the message.

**Isolate workspaces completely.** Each agent gets its own workspace, agentDir, and session store. Never share agentDir across agents — it causes auth and session collisions. If agents need shared credentials, explicitly copy `auth-profiles.json`.

**Set requireMention: false at the group level** for locked groups with only you and the bot. This is a config-level guarantee that survives gateway restarts, unlike in-chat `/activation` toggles which are session-scoped.

**Use sub-agents for expensive work.** Gideon spawns Warden via `sessions_spawn`. Sub-agents run in their own session (`agent:warden:subagent:<uuid>`), have their own token budget, and announce results back. Gideon's main thread stays responsive.

**Set cheaper models for sub-agents.** Configure `agents.list[].model` or `agents.defaults.subagents.model` to route sub-agent work to faster/cheaper models when full reasoning is not needed.

**Session keys are your source of truth.** Every topic gets an isolated session: `agent:warden:telegram:group:-1003874762204:topic:41`. The Warden Dashboard reads these to populate its instance view.

---

## 4. Data Flow

```
┌─────────────────────────────────────────────────────┐
│ CONTROL PLANE (how agents get work)                 │
│                                                     │
│ You ──Telegram Topic 41──▶ OpenClaw Gateway         │
│                              │                      │
│                    bindings match topicId: "41"      │
│                              │                      │
│                              ▼                      │
│                    Warden Agent Session              │
│                              │                      │
│                    sessions_spawn / Claude Code      │
│                              │                      │
│                              ▼                      │
│                    tmux session: warden-coding-001   │
└──────────────────────────────┬──────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────┐
│ OBSERVATION PLANE (how you watch)                   │
│                                                     │
│ warden.kingdom.lv                                   │
│  ┌────────────────────────────────────────────┐     │
│  │ Browser: React + xterm.js                  │     │
│  │  [Warden ●] [Scout ○] [Builder ○]         │     │
│  │  ┌──────────────────────────────────────┐  │     │
│  │  │ $ claude --dangerously-skip-perms    │  │     │
│  │  │ > Reading /home/forge/forge-warden.. │  │     │
│  │  │ > Editing src/server.ts...           │  │     │
│  │  └──────────────────────────────────────┘  │     │
│  │  [Send to Agent] [Take Over] [Stop]        │     │
│  └────────────────────────────────────────────┘     │
│           │ Socket.IO WebSocket                     │
│           ▼                                         │
│  Node.js Server (port 3001 )                         │
│    └─ node-pty ──▶ tmux attach-session -t warden-.. │
│    └─ SQLite: instance metadata, session logs       │
└─────────────────────────────────────────────────────┘
```

---

## 5. Features

### P0 — Must Have (Phase 1)

- **Terminal Streaming:** Live xterm.js view of each active tmux session. Read-only by default.
- **Instance Tabs:** Horizontal tab bar showing all active agent sessions with name, status dot, project path.
- **Session Discovery:** Auto-detect running tmux sessions named with agent prefix (`warden-*`, `scout-*`).
- **Status Tracking:** SQLite-backed instance status — active, idle, stopped, error.

### P1 — Should Have (Phase 2)

- **Prompt Input Panel:** Send messages to OpenClaw gateway API per agent, not directly to Claude Code.
- **Take Over Mode:** Explicit toggle from read-only observation to manual terminal input.
- **Telegram Topic Map:** Visual grid showing which topic maps to which agent and project.
- **Agent Details Sidebar:** SOUL.md preview, workspace path, model, memory status.

### P2 — Nice to Have (Phase 3)

- **Session History:** Searchable archive of past sessions with timestamps, agent, project, outcome.
- **Token Usage Dashboard:** Daily aggregation per agent — input/output tokens, estimated cost.
- **Log Viewer:** Tail OpenClaw gateway logs filtered by agent.

---

## 6. Code Architecture & Standards

### 6.1 Project Structure

```
warden.kingdom.lv/
├── src/
│   ├── server/
│   │   ├── index.ts                    # Express app bootstrap
│   │   ├── routes/
│   │   │   ├── instanceRoutes.ts       # /api/instances endpoints
│   │   │   ├── agentRoutes.ts          # /api/agents endpoints
│   │   │   └── sessionHistoryRoutes.ts # /api/sessions/history
│   │   ├── services/
│   │   │   ├── TmuxSessionManager.ts   # SRP: tmux lifecycle only
│   │   │   ├── TerminalStreamService.ts# SRP: pty spawn + socket streaming
│   │   │   ├── OpenClawConfigReader.ts # SRP: parse openclaw.json
│   │   │   ├── InstanceTracker.ts      # SRP: SQLite instance CRUD
│   │   │   └── GatewayApiClient.ts     # SRP: HTTP calls to OpenClaw gateway
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   └── DatabaseConnection.ts   # Single SQLite connection manager
│   │   └── types/
│   │       ├── AgentInstance.ts
│   │       ├── TmuxSession.ts
│   │       └── OpenClawConfig.ts
│   └── client/
│       ├── App.tsx
│       ├── components/
│       │   ├── TerminalView.tsx         # xterm.js wrapper
│       │   ├── InstanceTabBar.tsx       # Agent session tabs
│       │   ├── AgentDetailsSidebar.tsx  # Agent metadata panel
│       │   ├── PromptInputPanel.tsx     # Send-to-agent input
│       │   └── TelegramTopicMap.tsx     # Topic-to-agent visual grid
│       ├── hooks/
│       │   ├── useTerminalSocket.ts     # Socket.IO terminal connection
│       │   ├── useActiveInstances.ts    # Fetch + poll instance list
│       │   └── useAgentConfig.ts        # Fetch agent metadata
│       └── types/
│           └── index.ts
├── data/
│   └── warden.db                        # SQLite database
├── package.json
├── tsconfig.json
├── vite.config.ts
└── nginx.conf                           # Reference Nginx config
```

### 6.2 Coding Standards: DRY, SRP, Self-Explanatory Names

Every file, function, and variable should answer "what does this do?" without needing a comment.

#### SRP: Each Service Does One Thing

```typescript
// ── src/server/services/TmuxSessionManager.ts ──
// SRP: This service ONLY manages tmux session lifecycle.
// It does NOT stream terminal output (that's TerminalStreamService).
// It does NOT track instance metadata (that's InstanceTracker).

interface TmuxSessionInfo {
  sessionName: string;
  agentId: string;
  windowCount: number;
  createdAt: Date;
  isAttached: boolean;
}

class TmuxSessionManager {
  /**
   * List all tmux sessions that match the agent naming convention.
   * Convention: <agentId>-<projectSlug>-<shortId>
   * Example: "warden-dashboard-a1b2"
   */
  async listAgentSessions(): Promise<TmuxSessionInfo[]> {
    const tmuxListOutput = await this.executeTmuxCommand(
      'list-sessions', ['-F', '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}']
    );

    const allSessions = this.parseTmuxSessionList(tmuxListOutput);
    const agentSessions = allSessions.filter(session =>
      this.isAgentManagedSession(session.sessionName)
    );

    return agentSessions;
  }

  async createSessionForAgent(agentId: string, projectSlug: string): Promise<string> {
    const sessionName = this.buildSessionName(agentId, projectSlug);
    await this.executeTmuxCommand('new-session', ['-d', '-s', sessionName]);
    return sessionName;
  }

  async destroySession(sessionName: string): Promise<void> {
    await this.executeTmuxCommand('kill-session', ['-t', sessionName]);
  }

  // ── Private helpers ──

  private buildSessionName(agentId: string, projectSlug: string): string {
    const shortId = crypto.randomUUID().slice(0, 4);
    return `${agentId}-${projectSlug}-${shortId}`;
  }

  private isAgentManagedSession(sessionName: string): boolean {
    const KNOWN_AGENT_IDS = ['gideon', 'warden', 'scout', 'builder'];
    return KNOWN_AGENT_IDS.some(id => sessionName.startsWith(`${id}-`));
  }

  private parseTmuxSessionList(rawOutput: string): TmuxSessionInfo[] {
    return rawOutput
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [sessionName, windowCount, createdTimestamp, attachedCount] = line.split('|');
        return {
          sessionName,
          agentId: sessionName.split('-')[0],
          windowCount: parseInt(windowCount, 10),
          createdAt: new Date(parseInt(createdTimestamp, 10) * 1000),
          isAttached: parseInt(attachedCount, 10) > 0,
        };
      });
  }

  private async executeTmuxCommand(command: string, args: string[]): Promise<string> {
    const { stdout } = await execAsync(`tmux ${command} ${args.join(' ')}`);
    return stdout;
  }
}
```

#### SRP: Terminal Streaming Is Separate from Session Management

```typescript
// ── src/server/services/TerminalStreamService.ts ──
// SRP: This service ONLY handles pty spawn + socket streaming.
// It receives a tmux session name and a socket, and bridges them.

import * as pty from 'node-pty';
import type { Socket } from 'socket.io';

interface ActiveTerminalStream {
  ptyProcess: pty.IPty;
  socketId: string;
  sessionName: string;
  isReadOnly: boolean;
}

class TerminalStreamService {
  private activeStreams: Map<string, ActiveTerminalStream> = new Map();

  /**
   * Attach a browser socket to a tmux session's terminal output.
   * Spawns a pty that runs `tmux attach-session -t <name>` and
   * pipes all output to the socket.
   */
  attachSocketToSession(
    socket: Socket,
    sessionName: string,
    options: { readOnly: boolean } = { readOnly: true }
  ): void {
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
    });

    ptyProcess.onData((terminalOutput: string) => {
      socket.emit('terminal:output', terminalOutput);
    });

    ptyProcess.onExit(({ exitCode }) => {
      socket.emit('terminal:exit', { sessionName, exitCode });
      this.activeStreams.delete(socket.id);
    });

    if (!options.readOnly) {
      socket.on('terminal:input', (userInput: string) => {
        ptyProcess.write(userInput);
      });
    }

    socket.on('terminal:resize', ({ cols, rows }: { cols: number; rows: number }) => {
      ptyProcess.resize(cols, rows);
    });

    this.activeStreams.set(socket.id, {
      ptyProcess,
      socketId: socket.id,
      sessionName,
      isReadOnly: options.readOnly,
    });
  }

  /**
   * Upgrade a read-only stream to interactive (take-over mode).
   */
  enableInputForSocket(socketId: string): boolean {
    const stream = this.activeStreams.get(socketId);
    if (!stream || !stream.isReadOnly) return false;

    // Socket already connected — just start listening for input
    stream.isReadOnly = false;
    return true;
  }

  detachSocket(socketId: string): void {
    const stream = this.activeStreams.get(socketId);
    if (stream) {
      stream.ptyProcess.kill();
      this.activeStreams.delete(socketId);
    }
  }
}
```

#### DRY: Reusable OpenClaw Config Reader

```typescript
// ── src/server/services/OpenClawConfigReader.ts ──
// SRP: Reads and parses openclaw.json. Does not modify it.
// DRY: Single source of truth for agent metadata across the app.

import fs from 'fs';
import JSON5 from 'json5';

interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  agentDir: string;
  model: string;
  telegramTopicId: string | null;
}

interface TopicAgentMapping {
  topicId: string;
  agentId: string;
  systemPrompt: string;
  projectPath: string | null;
}

const OPENCLAW_CONFIG_PATH = '/home/forge/.openclaw/openclaw.json';
const GIDEON_ARMY_GROUP_ID = '-1003874762204';

class OpenClawConfigReader {
  private configCache: Record<string, unknown> | null = null;
  private lastReadTimestamp: number = 0;
  private readonly cacheLifetimeMs = 30_000; // Re-read every 30s

  /**
   * Get all configured agents with their metadata.
   */
  getAgentList(): AgentConfig[] {
    const config = this.readConfigWithCache();
    const agentDefaults = config.agents?.defaults ?? {};
    const agentEntries = config.agents?.list ?? [];

    return agentEntries.map((entry: Record<string, unknown>) =>
      this.buildAgentConfig(entry, agentDefaults)
    );
  }

  /**
   * Get topic → agent mappings for the GideonArmy group.
   */
  getTopicAgentMappings(): TopicAgentMapping[] {
    const config = this.readConfigWithCache();

    const mappingsFromBindings = this.extractMappingsFromBindings(config);
    const mappingsFromTopicConfig = this.extractMappingsFromTopicConfig(config);

    // Merge: bindings take precedence (they determine the actual agent),
    // topic config adds systemPrompt and project path.
    return this.mergeMappings(mappingsFromBindings, mappingsFromTopicConfig);
  }

  /**
   * Find which agent handles a specific Telegram topic.
   */
  findAgentForTopic(topicId: string): AgentConfig | null {
    const mappings = this.getTopicAgentMappings();
    const mapping = mappings.find(m => m.topicId === topicId);
    if (!mapping) return null;

    const agents = this.getAgentList();
    return agents.find(a => a.id === mapping.agentId) ?? null;
  }

  // ── Private helpers ──

  private readConfigWithCache(): Record<string, unknown> {
    const now = Date.now();
    if (this.configCache && (now - this.lastReadTimestamp) < this.cacheLifetimeMs) {
      return this.configCache;
    }

    const rawContent = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    this.configCache = JSON5.parse(rawContent);
    this.lastReadTimestamp = now;
    return this.configCache;
  }

  private buildAgentConfig(
    entry: Record<string, unknown>,
    defaults: Record<string, unknown>
  ): AgentConfig {
    const agentId = entry.id as string;
    return {
      id: agentId,
      name: (entry.name as string) ?? agentId,
      workspace: (entry.workspace as string)
        ?? `${defaults.workspace ?? '/home/forge/.openclaw'}/workspace-${agentId}`,
      agentDir: (entry.agentDir as string)
        ?? `/home/forge/.openclaw/agents/${agentId}/agent`,
      model: (entry.model?.primary as string)
        ?? (defaults.model?.primary as string)
        ?? 'unknown',
      telegramTopicId: null, // Populated by merging with topic mappings
    };
  }

  private extractMappingsFromBindings(
    config: Record<string, unknown>
  ): TopicAgentMapping[] {
    const bindings = (config.bindings as Array<Record<string, unknown>>) ?? [];

    return bindings
      .filter(binding => {
        const match = binding.match as Record<string, unknown>;
        return match?.channel === 'telegram' && match?.topicId;
      })
      .map(binding => {
        const match = binding.match as Record<string, unknown>;
        return {
          topicId: match.topicId as string,
          agentId: binding.agentId as string,
          systemPrompt: '',
          projectPath: null,
        };
      });
  }

  private extractMappingsFromTopicConfig(
    config: Record<string, unknown>
  ): TopicAgentMapping[] {
    const topics = config.channels?.telegram?.groups
      ?.[GIDEON_ARMY_GROUP_ID]?.topics as Record<string, unknown>;

    if (!topics) return [];

    return Object.entries(topics).map(([topicId, topicConfig]) => {
      const tc = topicConfig as Record<string, unknown>;
      const systemPrompt = (tc.systemPrompt as string) ?? '';
      const projectPathMatch = systemPrompt.match(/\/home\/forge\/[\w-]+/);

      return {
        topicId,
        agentId: 'gideon', // Default until overridden by bindings
        systemPrompt,
        projectPath: projectPathMatch?.[0] ?? null,
      };
    });
  }

  private mergeMappings(
    fromBindings: TopicAgentMapping[],
    fromTopicConfig: TopicAgentMapping[]
  ): TopicAgentMapping[] {
    const merged = new Map<string, TopicAgentMapping>();

    // Topic config first (lower priority)
    for (const mapping of fromTopicConfig) {
      merged.set(mapping.topicId, mapping);
    }

    // Bindings override (higher priority — determines actual agent)
    for (const binding of fromBindings) {
      const existing = merged.get(binding.topicId);
      merged.set(binding.topicId, {
        ...binding,
        systemPrompt: existing?.systemPrompt ?? '',
        projectPath: existing?.projectPath ?? null,
      });
    }

    return Array.from(merged.values());
  }
}
```

#### DRY: Shared Types

```typescript
// ── src/server/types/AgentInstance.ts ──
// Single definition, imported everywhere. No duplicated interfaces.

export interface AgentInstance {
  id: number;
  agentId: string;
  agentName: string;
  tmuxSessionName: string;
  status: 'active' | 'idle' | 'stopped' | 'error';
  projectPath: string;
  telegramTopicId: string | null;
  createdAt: string;    // ISO 8601
  lastActiveAt: string; // ISO 8601
}

export interface AgentInstanceCreateParams {
  agentId: string;
  tmuxSessionName: string;
  projectPath: string;
  telegramTopicId?: string;
}

export type AgentInstanceStatus = AgentInstance['status'];
```

#### DRY: Database Layer with Single Connection

```typescript
// ── src/server/database/DatabaseConnection.ts ──
// DRY: One connection, one place to define queries.
// SRP: Only handles database operations. No business logic.

import Database from 'better-sqlite3';
import type { AgentInstance, AgentInstanceCreateParams } from '../types/AgentInstance';

const DATABASE_PATH = '/home/forge/warden.kingdom.lv/data/warden.db';

class DatabaseConnection {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DATABASE_PATH);
    this.db.pragma('journal_mode = WAL'); // Better concurrent read performance
    this.runMigrations();
  }

  // ── Instance queries ──

  insertInstance(params: AgentInstanceCreateParams): AgentInstance {
    const stmt = this.db.prepare(`
      INSERT INTO instances (agent_id, tmux_session_name, status, project_path, telegram_topic_id)
      VALUES (@agentId, @tmuxSessionName, 'active', @projectPath, @telegramTopicId)
    `);
    const result = stmt.run({
      agentId: params.agentId,
      tmuxSessionName: params.tmuxSessionName,
      projectPath: params.projectPath,
      telegramTopicId: params.telegramTopicId ?? null,
    });
    return this.findInstanceById(result.lastInsertRowid as number)!;
  }

  findInstanceById(id: number): AgentInstance | null {
    return this.db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as AgentInstance | null;
  }

  listActiveInstances(): AgentInstance[] {
    return this.db.prepare(
      "SELECT * FROM instances WHERE status IN ('active', 'idle') ORDER BY created_at DESC"
    ).all() as AgentInstance[];
  }

  updateInstanceStatus(id: number, status: AgentInstance['status']): void {
    this.db.prepare(
      'UPDATE instances SET status = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
  }

  // ── Token usage queries ──

  recordTokenUsage(agentId: string, inputTokens: number, outputTokens: number, costUsd: number): void {
    this.db.prepare(`
      INSERT INTO token_usage (agent_id, date, input_tokens, output_tokens, cost_usd)
      VALUES (?, DATE('now'), ?, ?, ?)
      ON CONFLICT (agent_id, date)
      DO UPDATE SET
        input_tokens = input_tokens + excluded.input_tokens,
        output_tokens = output_tokens + excluded.output_tokens,
        cost_usd = cost_usd + excluded.cost_usd
    `).run(agentId, inputTokens, outputTokens, costUsd);
  }

  // ── Migrations ──

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
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

export const db = new DatabaseConnection();
```

#### Frontend: Self-Explanatory Component Names

```tsx
// ── src/client/components/TerminalView.tsx ──
// Name says it all: renders a terminal. No side effects beyond socket connection.

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalSocket } from '../hooks/useTerminalSocket';

interface TerminalViewProps {
  tmuxSessionName: string;
  isReadOnly: boolean;
  onSessionExit: (sessionName: string, exitCode: number) => void;
}

export function TerminalView({
  tmuxSessionName,
  isReadOnly,
  onSessionExit,
}: TerminalViewProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { sendInput, isConnected } = useTerminalSocket({
    sessionName: tmuxSessionName,
    onTerminalOutput: (data: string) => {
      terminalInstanceRef.current?.write(data);
    },
    onSessionExit: (exitCode: number) => {
      onSessionExit(tmuxSessionName, exitCode);
    },
  });

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#ff6b6b',
        selectionBackground: '#3d3d5c',
      },
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: 14,
      cursorBlink: !isReadOnly,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(terminalContainerRef.current);
    fitAddon.fit();

    if (!isReadOnly) {
      terminal.onData((userInput: string) => {
        sendInput(userInput);
      });
    }

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleWindowResize = () => fitAddon.fit();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      terminal.dispose();
    };
  }, [tmuxSessionName, isReadOnly, sendInput]);

  return (
    <div className="relative h-full">
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <span className="text-amber-400 text-sm">Connecting to {tmuxSessionName}...</span>
        </div>
      )}
      {isReadOnly && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded">
          READ ONLY
        </div>
      )}
      <div ref={terminalContainerRef} className="h-full w-full" />
    </div>
  );
}
```

```tsx
// ── src/client/hooks/useTerminalSocket.ts ──
// DRY: Every component that needs a terminal socket uses this hook.
// No duplicated Socket.IO logic across components.

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseTerminalSocketParams {
  sessionName: string;
  onTerminalOutput: (data: string) => void;
  onSessionExit: (exitCode: number) => void;
}

export function useTerminalSocket({
  sessionName,
  onTerminalOutput,
  onSessionExit,
}: UseTerminalSocketParams) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io('/terminal', {
      query: { sessionName },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('terminal:output', onTerminalOutput);
    socket.on('terminal:exit', ({ exitCode }) => onSessionExit(exitCode));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionName, onTerminalOutput, onSessionExit]);

  const sendInput = useCallback((data: string) => {
    socketRef.current?.emit('terminal:input', data);
  }, []);

  return { sendInput, isConnected };
}
```

---

## 7. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/instances` | GET | List all active tmux sessions with agent metadata |
| `/api/instances/:id/attach` | WS | WebSocket: stream terminal I/O for a session |
| `/api/instances/:id/input` | POST | Send input to a tmux session (take-over mode) |
| `/api/instances/:id/stop` | POST | Kill a tmux session and update status |
| `/api/instances/:id/take-over` | POST | Toggle read-only → interactive for a session |
| `/api/agents` | GET | List configured agents from openclaw.json |
| `/api/agents/:id/spawn` | POST | Create new tmux session + Claude Code for an agent |
| `/api/topics` | GET | Telegram topic → agent mapping |
| `/api/sessions/history` | GET | Query past sessions (filters: agent, date range) |
| `/api/tokens/usage` | GET | Token usage aggregation (filters: agent, date range) |

---

## 8. Nginx Configuration

```nginx
# /etc/nginx/sites-available/warden.kingdom.lv

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name warden.kingdom.lv;

    # IP restriction — same as gideons.kingdom.lv
    allow 94.30.169.76;
    deny all;

    # SSL (managed by Laravel Forge)
    ssl_certificate     /etc/nginx/ssl/warden.kingdom.lv/server.crt;
    ssl_certificate_key /etc/nginx/ssl/warden.kingdom.lv/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3001 ;
        proxy_http_version 1.1;

        # WebSocket upgrade for terminal streaming
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Auth token injected at proxy level
        proxy_set_header Authorization "Bearer YOUR_WARDEN_TOKEN";

        # Long timeout for terminal sessions
        proxy_read_timeout 3600s;
        proxy_connect_timeout 10s;
    }
}
```

---

## 9. Session Management Commands

For monitoring from the command line on your Forge server:

```bash
# List all active sessions across all agents
openclaw sessions list

# Show details for the Warden topic session
openclaw sessions show "agent:warden:telegram:group:-1003874762204:topic:41"

# Full gateway status with per-agent session counts
openclaw status --json

# Show agent list and which bindings route where
openclaw agents list --bindings

# In Telegram chat — slash commands for sub-agent control
/subagents list              # See all spawned sub-agents
/subagents log <id>          # View a sub-agent run log
/subagents stop <id|all>     # Stop running sub-agents
/subagents info <id>         # Metadata, timestamps, session key
/subagents send <id> <msg>   # Send a message to a running sub-agent

# Session cleanup
openclaw sessions prune --older-than 7d

# Validate config after changes
openclaw doctor
openclaw doctor --fix         # Auto-fix schema issues
```

---

## 10. Implementation Phases

### Phase 1: Core Terminal Viewer (Week 1)

1. Scaffold Node.js + TypeScript project at `/home/forge/warden.kingdom.lv`
2. Implement `TmuxSessionManager` — list, create, destroy sessions
3. Implement `TerminalStreamService` — node-pty + Socket.IO bridge
4. SQLite schema + `DatabaseConnection` with migrations
5. React shell with `TerminalView` + `InstanceTabBar`
6. Nginx config, SSL, Forge daemon setup

### Phase 2: Agent Integration (Week 2)

7. `OpenClawConfigReader` — parse agents, bindings, topic mappings
8. `GatewayApiClient` — send messages to OpenClaw gateway for prompt injection
9. `PromptInputPanel` component
10. Take-over mode toggle
11. `TelegramTopicMap` component
12. `AgentDetailsSidebar` with SOUL.md preview

### Phase 3: History & Polish (Week 3)

13. Session history table with search and date filters
14. Token usage dashboard with per-agent daily aggregation
15. Dark theme matching OpenClaw Control UI
16. Gateway log tail viewer (filtered by agent)
17. Error handling, reconnection logic, loading states

---

## 11. Security

- **IP whitelist at Nginx level** — only `94.30.169.76` can reach the domain
- **Bearer token auth** injected by reverse proxy (same pattern as gideons.kingdom.lv)
- **No direct internet exposure** — Node.js binds to `127.0.0.1:3001 `
- **SQLite not web-accessible** — stored in `/data/` outside the served directory
- **Take-over requires explicit activation** per session, per page load
- **tmux sessions run as `forge` user**, not root
- **Rotate tokens** — generate with `openclaw doctor --generate-gateway-token`

---

## 12. Success Metrics

- All active Claude Code sessions visible in dashboard within 2 seconds of page load
- Terminal streaming latency under 100ms on local network
- Session switch time under 500ms
- Zero missed autonomous agent messages while dashboard is open
- Dashboard uptime matching server uptime (Forge daemon auto-restart)
