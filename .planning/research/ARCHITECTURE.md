# Architecture Research: v2.0 Mission Control Extensions

**Domain:** Plugin Registry, Activity Timeline & Mobile-First UI for Terminal Dashboard
**Researched:** 2026-02-16
**Confidence:** HIGH (verified with official docs, multiple sources, WebSearch)

## Executive Summary

This research focuses ONLY on the NEW architectural components needed for v2.0 Mission Control features:

1. **Plugin/Tool Registry** — Dynamic module system for extending UI with panels and capabilities
2. **Activity Timeline** — Structured event capture from terminal streams + audit logging
3. **Mobile-First UI** — Responsive component hierarchy restructure for <480px primary experience

The existing Warden architecture (Express + Socket.IO + React + SQLite + xterm.js) is well-suited for these extensions. All three features integrate cleanly without major refactoring.

## Feature 1: Plugin/Tool Registry Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (React SPA)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │         PluginRegistry (singleton)                   │   │
│  │  - Map<pluginId, PluginMetadata>                     │   │
│  │  - discover(), load(), unload()                      │   │
│  └─────────────────────┬────────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼──────────────────────────────┐     │
│  │    DynamicPanelRenderer (Component)                │     │
│  │  - Lookup component by pluginId                    │     │
│  │  - React.createElement() at runtime                │     │
│  │  - Fallback for missing/errored plugins            │     │
│  └─────────────────────┬──────────────────────────────┘     │
│                        │                                     │
│  ┌────────┬────────────▼────────┬────────────────────┐      │
│  │ Panel  │ Panel │ Panel │ Panel │ ...built-in +    │      │
│  │ Slot 1 │ Slot 2│ Slot 3│ Slot 4│  plugin panels   │      │
│  └────────┴───────────────┴─────────────────────────┘      │
├─────────────────────────────────────────────────────────────┤
│                    SERVER (Express)                          │
├─────────────────────────────────────────────────────────────┤
│  GET /api/plugins          → List available plugins          │
│  POST /api/plugins/:id/enable  → Update plugin state        │
│  POST /api/plugins/:id/disable → Update plugin state        │
├─────────────────────────────────────────────────────────────┤
│                    DATABASE (SQLite)                         │
├─────────────────────────────────────────────────────────────┤
│  plugins table:                                              │
│    id, name, version, enabled, manifest_json, installed_at   │
└─────────────────────────────────────────────────────────────┘
```

### Plugin Metadata Schema

Based on [registry pattern research](https://www.geeksforgeeks.org/system-design/registry-pattern/) and [plugin architecture patterns](https://medium.com/omarelgabrys-blog/plug-in-architecture-dec207291800), the metadata schema should include:

```typescript
interface PluginMetadata {
  id: string;                    // Unique identifier (e.g., 'terminal-stats')
  name: string;                  // Display name (e.g., 'Terminal Statistics')
  version: string;               // Semver (e.g., '1.0.0')
  author: string;
  description: string;

  // Capability declarations
  capabilities: {
    panels?: PanelCapability[];  // UI panel slots this plugin provides
    hooks?: HookCapability[];    // Lifecycle hooks it listens to
    routes?: RouteCapability[];  // API routes it exposes
  };

  // Runtime requirements
  requires: {
    wardenVersion: string;       // Minimum Warden version
    dependencies?: string[];     // Other plugin IDs
  };

  // Entry points
  entry: {
    client?: string;             // Path to client component bundle
    server?: string;             // Path to server-side module
  };

  // State
  enabled: boolean;
  installedAt: string;
}

interface PanelCapability {
  slotId: string;                // Where to render: 'sidebar', 'bottom', 'modal'
  component: string;             // Component export name
  label: string;                 // Tab/button label
  icon?: string;                 // Icon identifier
  defaultVisible?: boolean;
}

interface HookCapability {
  event: string;                 // E.g., 'terminal:output', 'session:start'
  handler: string;               // Function export name
}

interface RouteCapability {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;                  // E.g., '/api/plugins/my-plugin/action'
  handler: string;               // Function export name
}
```

### Component Registry Pattern

Following [React dynamic component rendering patterns](https://www.storyblok.com/tp/react-dynamic-component-from-json), use an object map registry:

```typescript
// PluginRegistry.ts (client)
class PluginRegistry {
  private components: Map<string, React.ComponentType<any>> = new Map();
  private metadata: Map<string, PluginMetadata> = new Map();

  register(plugin: PluginMetadata, component: React.ComponentType<any>): void {
    this.metadata.set(plugin.id, plugin);
    if (component) {
      this.components.set(plugin.id, component);
    }
  }

  unregister(pluginId: string): void {
    this.metadata.delete(pluginId);
    this.components.delete(pluginId);
  }

  getComponent(pluginId: string): React.ComponentType<any> | null {
    return this.components.get(pluginId) ?? null;
  }

  listPlugins(filters?: { slotId?: string; enabled?: boolean }): PluginMetadata[] {
    let plugins = Array.from(this.metadata.values());
    if (filters?.enabled !== undefined) {
      plugins = plugins.filter(p => p.enabled === filters.enabled);
    }
    if (filters?.slotId) {
      plugins = plugins.filter(p =>
        p.capabilities.panels?.some(panel => panel.slotId === filters.slotId)
      );
    }
    return plugins;
  }
}

export const pluginRegistry = new PluginRegistry();
```

### Dynamic Panel Renderer

```typescript
// DynamicPanelRenderer.tsx
interface Props {
  slotId: string;
  pluginId: string;
  context?: Record<string, any>;
}

export function DynamicPanelRenderer({ slotId, pluginId, context }: Props) {
  const Component = pluginRegistry.getComponent(pluginId);

  if (!Component) {
    return (
      <div className="text-warden-error p-4">
        Plugin "{pluginId}" not found or failed to load.
      </div>
    );
  }

  return (
    <ErrorBoundary fallback={<PluginErrorFallback pluginId={pluginId} />}>
      <Component slotId={slotId} {...context} />
    </ErrorBoundary>
  );
}
```

### Server-Side Plugin Manager

```typescript
// src/server/services/PluginManager.ts
class PluginManager {
  private database: DatabaseConnection;

  async listPlugins(): Promise<PluginMetadata[]> {
    return this.database.prepare(`
      SELECT id, name, version, enabled, manifest_json as manifestJson,
             installed_at as installedAt
      FROM plugins
      ORDER BY name
    `).all().map(row => ({
      ...JSON.parse(row.manifestJson),
      enabled: Boolean(row.enabled),
      installedAt: row.installedAt,
    }));
  }

  async enablePlugin(pluginId: string): Promise<void> {
    this.database.prepare('UPDATE plugins SET enabled = 1 WHERE id = ?').run(pluginId);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    this.database.prepare('UPDATE plugins SET enabled = 0 WHERE id = ?').run(pluginId);
  }

  async installPlugin(manifest: PluginMetadata): Promise<void> {
    this.database.prepare(`
      INSERT INTO plugins (id, name, version, enabled, manifest_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      manifest.id,
      manifest.name,
      manifest.version,
      1,
      JSON.stringify(manifest)
    );
  }
}
```

### Panel Slot Architecture

Recommended slot IDs for Warden Dashboard:

| Slot ID | Location | Use Case | Example Plugins |
|---------|----------|----------|-----------------|
| `sidebar-top` | AgentSidebar top section | Agent-scoped actions | "Quick Deploy", "Agent Stats" |
| `sidebar-bottom` | AgentSidebar bottom section | Global tools | "System Monitor", "Logs" |
| `terminal-overlay` | Floating over TerminalView | Real-time annotations | "Error Highlighter", "AI Assist" |
| `bottom-panel` | Below terminal tabs | Secondary info | "Git Status", "File Watcher" |
| `modal` | Full-screen modal | Complex interactions | "Plugin Settings", "Debugger" |

### Integration Points

**New components:**
- `src/client/services/PluginRegistry.ts` — Client-side registry singleton
- `src/client/components/DynamicPanelRenderer.tsx` — Runtime component loader
- `src/client/components/PluginSlot.tsx` — Declarative slot container
- `src/server/services/PluginManager.ts` — Server-side CRUD
- `src/server/routes/pluginRoutes.ts` — REST API (`GET /api/plugins`, `POST /api/plugins/:id/enable`)

**Modified components:**
- `src/client/App.tsx` — Add `<PluginSlot slotId="bottom-panel" />` to layout
- `src/client/components/AgentSidebar.tsx` — Add `<PluginSlot slotId="sidebar-top" />` and `<PluginSlot slotId="sidebar-bottom" />`
- `src/server/database/DatabaseConnection.ts` — Add `plugins` table migration

**Database schema addition:**
```sql
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  manifest_json TEXT NOT NULL,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);
```

### Anti-Patterns

**Anti-Pattern 1: Global Registry Without Isolation**
- **What people do:** Share single global registry with no sandboxing
- **Why it's wrong:** Plugin errors crash the entire app; plugin A can corrupt plugin B's state
- **Do this instead:** Use React ErrorBoundary around each plugin render, isolate plugin contexts

**Anti-Pattern 2: Runtime Eval/Dynamic Imports Without Validation**
- **What people do:** `eval(pluginCode)` or `import(untrustedUrl)`
- **Why it's wrong:** XSS vulnerability, arbitrary code execution
- **Do this instead:** For v2.0, bundle plugins at build time only; for v3.0+, implement CSP + allowlist validation

**Anti-Pattern 3: Monolithic Plugin Contract**
- **What people do:** Force every plugin to implement 50 methods
- **Why it's wrong:** Complexity bloat, most plugins only need 1-2 capabilities
- **Do this instead:** Capability-based declaration (plugins only declare what they provide)

---

## Feature 2: Activity Timeline & Audit Log Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  TERMINAL OUTPUT STREAM                      │
├─────────────────────────────────────────────────────────────┤
│  xterm.js Terminal                                           │
│       ↓                                                      │
│  Raw ANSI bytes → TerminalView component                    │
│       ↓                                                      │
│  [NEW] EventExtractor (client-side)                         │
│       ↓                                                      │
│  Socket.IO emit → 'activity:event' + 'terminal:output'     │
├─────────────────────────────────────────────────────────────┤
│                  SERVER PROCESSING                           │
├─────────────────────────────────────────────────────────────┤
│  [NEW] ActivityEventHandler (Socket.IO listener)            │
│       ↓                                                      │
│  [NEW] EventEnricher                                        │
│    - Add timestamp, sessionId, agentId                      │
│    - Parse ANSI escape sequences                            │
│    - Extract structured data (errors, commands)             │
│       ↓                                                      │
│  [NEW] AuditLogger                                          │
│    - Write to activity_events table (SQLite)                │
│    - Enforce retention policy                               │
├─────────────────────────────────────────────────────────────┤
│                  STORAGE (SQLite)                            │
├─────────────────────────────────────────────────────────────┤
│  activity_events:                                            │
│    id, instance_id, timestamp, event_type, severity,        │
│    raw_text, structured_data, sequence_num                  │
│  activity_snapshots (optional):                             │
│    id, instance_id, timestamp, terminal_state               │
├─────────────────────────────────────────────────────────────┤
│                  QUERY API                                   │
├─────────────────────────────────────────────────────────────┤
│  GET /api/activity/timeline?instanceId=X&from=Y&to=Z        │
│  GET /api/activity/events?type=error&severity=high          │
│  GET /api/activity/search?query=git+commit                  │
└─────────────────────────────────────────────────────────────┘
```

### Event Types & Schema

Based on [audit logging patterns](https://microservices.io/patterns/observability/audit-logging.html) and [activity log design](https://alguidelines.dev/docs/navpatterns/patterns/activity-log/):

```typescript
interface ActivityEvent {
  id: number;
  instanceId: number;           // FK to instances table
  timestamp: string;             // ISO 8601
  sequenceNum: number;           // Monotonic counter per instance

  eventType: ActivityEventType;
  severity: 'info' | 'warning' | 'error' | 'critical';

  rawText: string;               // Original terminal output chunk
  structuredData: Record<string, any> | null;  // Parsed metadata

  // Audit trail fields
  userId?: string;               // If operator injected prompt
  sourceIp?: string;             // If remote session
}

type ActivityEventType =
  | 'terminal_output'            // Raw terminal data
  | 'command_executed'           // Detected shell command
  | 'error_occurred'             // Detected error pattern
  | 'session_started'            // Session lifecycle
  | 'session_stopped'
  | 'prompt_injected'            // Operator action
  | 'file_modified'              // Detected git/file changes
  | 'api_called'                 // Detected HTTP request
  | 'tool_invoked';              // Detected tool usage
```

### ANSI Escape Sequence Parser Integration

Based on [ANSI parser research](https://github.com/netzkolchose/node-ansiparser), integrate structured parsing:

```typescript
// src/server/services/AnsiParser.ts
import { AnsiParser } from 'node-ansiparser';

interface ParsedChunk {
  plainText: string;
  containsError: boolean;
  containsSuccess: boolean;
  detectedCommand: string | null;
}

export class TerminalOutputParser {
  private parser: AnsiParser;

  constructor() {
    this.parser = new AnsiParser();
  }

  parse(rawAnsi: string): ParsedChunk {
    let plainText = '';
    let containsError = false;
    let containsSuccess = false;

    this.parser.parse(rawAnsi, {
      onText: (text: string) => { plainText += text; },
      onSGR: (params: number[]) => {
        // SGR = Select Graphic Rendition (colors)
        // Red text (31) often indicates errors
        if (params.includes(31)) containsError = true;
        // Green text (32) often indicates success
        if (params.includes(32)) containsSuccess = true;
      },
    });

    const detectedCommand = this.detectCommand(plainText);

    return { plainText, containsError, containsSuccess, detectedCommand };
  }

  private detectCommand(text: string): string | null {
    // Heuristic: look for common shell prompt patterns
    const promptMatch = text.match(/[\$#>]\s+(.+?)[\r\n]/);
    return promptMatch ? promptMatch[1].trim() : null;
  }
}
```

### Event Enrichment Pipeline

Following [event-driven architecture patterns](https://newsletter.simpleaws.dev/p/event-driven-architecture-patterns):

```typescript
// src/server/services/ActivityEnricher.ts
export class ActivityEnricher {
  private parser: TerminalOutputParser;

  async enrich(
    rawChunk: string,
    context: { instanceId: number; agentId: string }
  ): Promise<ActivityEvent[]> {
    const parsed = this.parser.parse(rawChunk);
    const events: ActivityEvent[] = [];

    // Always create a terminal_output event
    events.push({
      instanceId: context.instanceId,
      timestamp: new Date().toISOString(),
      eventType: 'terminal_output',
      severity: 'info',
      rawText: rawChunk,
      structuredData: {
        plainText: parsed.plainText,
        length: rawChunk.length,
      },
    });

    // Create derived events
    if (parsed.containsError) {
      events.push({
        instanceId: context.instanceId,
        timestamp: new Date().toISOString(),
        eventType: 'error_occurred',
        severity: 'error',
        rawText: parsed.plainText,
        structuredData: {
          errorPattern: 'ansi-red-detected',
        },
      });
    }

    if (parsed.detectedCommand) {
      events.push({
        instanceId: context.instanceId,
        timestamp: new Date().toISOString(),
        eventType: 'command_executed',
        severity: 'info',
        rawText: parsed.detectedCommand,
        structuredData: {
          command: parsed.detectedCommand,
          detectionMethod: 'prompt-pattern',
        },
      });
    }

    return events;
  }
}
```

### Audit Logger Service

Following [transactional outbox pattern](https://microservices.io/patterns/observability/audit-logging.html):

```typescript
// src/server/services/AuditLogger.ts
export class AuditLogger {
  private database: DatabaseConnection;
  private sequenceCounters: Map<number, number> = new Map();

  async logEvents(events: ActivityEvent[]): Promise<void> {
    const statement = this.database.prepare(`
      INSERT INTO activity_events
        (instance_id, timestamp, sequence_num, event_type, severity, raw_text, structured_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of events) {
      const seqNum = this.getNextSequence(event.instanceId);
      statement.run(
        event.instanceId,
        event.timestamp,
        seqNum,
        event.eventType,
        event.severity,
        event.rawText,
        event.structuredData ? JSON.stringify(event.structuredData) : null
      );
    }
  }

  private getNextSequence(instanceId: number): number {
    const current = this.sequenceCounters.get(instanceId) ?? 0;
    const next = current + 1;
    this.sequenceCounters.set(instanceId, next);
    return next;
  }

  async pruneOldEvents(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = this.database.prepare(`
      DELETE FROM activity_events
      WHERE timestamp < ?
    `).run(cutoff.toISOString());

    return result.changes;
  }
}
```

### Timeline Query API

```typescript
// src/server/routes/activityRoutes.ts
router.get('/api/activity/timeline', (req, res) => {
  const { instanceId, from, to, eventType, severity, limit = 100 } = req.query;

  const filters: string[] = [];
  const params: any[] = [];

  if (instanceId) {
    filters.push('instance_id = ?');
    params.push(parseInt(instanceId as string, 10));
  }
  if (from) {
    filters.push('timestamp >= ?');
    params.push(from);
  }
  if (to) {
    filters.push('timestamp <= ?');
    params.push(to);
  }
  if (eventType) {
    filters.push('event_type = ?');
    params.push(eventType);
  }
  if (severity) {
    filters.push('severity = ?');
    params.push(severity);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const events = database.prepare(`
    SELECT
      id, instance_id as instanceId, timestamp, sequence_num as sequenceNum,
      event_type as eventType, severity, raw_text as rawText,
      structured_data as structuredData
    FROM activity_events
    ${whereClause}
    ORDER BY timestamp DESC, sequence_num DESC
    LIMIT ?
  `).all(...params, parseInt(limit as string, 10));

  res.json({ events });
});
```

### Client-Side Timeline Component

```typescript
// src/client/components/ActivityTimeline.tsx
export function ActivityTimeline({ instanceId }: { instanceId: number }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filters, setFilters] = useState({ eventType: 'all', severity: 'all' });

  useEffect(() => {
    const params = new URLSearchParams({
      instanceId: instanceId.toString(),
      limit: '500',
    });
    if (filters.eventType !== 'all') params.set('eventType', filters.eventType);
    if (filters.severity !== 'all') params.set('severity', filters.severity);

    fetch(`/api/activity/timeline?${params}`)
      .then(r => r.json())
      .then(data => setEvents(data.events));
  }, [instanceId, filters]);

  return (
    <div className="activity-timeline">
      <TimelineFilters filters={filters} onChange={setFilters} />
      <VirtualizedEventList events={events} />
    </div>
  );
}
```

### Integration Points

**New components:**
- `src/server/services/TerminalOutputParser.ts` — ANSI escape sequence parser
- `src/server/services/ActivityEnricher.ts` — Event extraction pipeline
- `src/server/services/AuditLogger.ts` — Event persistence
- `src/server/routes/activityRoutes.ts` — Timeline query API
- `src/client/components/ActivityTimeline.tsx` — Timeline UI
- `src/client/components/ActivityEventCard.tsx` — Single event display

**Modified components:**
- `src/server/services/TerminalStreamService.ts` — Emit parsed events alongside raw output
- `src/client/components/TerminalView.tsx` — Optional: capture client-side events (operator actions)
- `src/client/App.tsx` — Add Activity view route

**Database schema addition:**
```sql
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL REFERENCES instances(id),
  timestamp DATETIME NOT NULL,
  sequence_num INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  structured_data TEXT,
  user_id TEXT,
  source_ip TEXT,
  UNIQUE(instance_id, sequence_num)
);

CREATE INDEX IF NOT EXISTS idx_activity_instance ON activity_events(instance_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_severity ON activity_events(severity);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_events(timestamp);
```

### Storage Considerations

Following [audit log retention patterns](https://www.sonarsource.com/resources/library/audit-logging/):

- **Retention:** 90 days for `activity_events`, 7 days for `terminal_output` type (high volume)
- **Partitioning:** SQLite doesn't support table partitioning; for >1M events, consider rotating to monthly tables
- **Write-Once:** Use `UNIQUE(instance_id, sequence_num)` to prevent duplicate/tampered events
- **Backup:** SQLite WAL already enabled; periodic `PRAGMA wal_checkpoint(TRUNCATE)` sufficient

### Anti-Patterns

**Anti-Pattern 1: Logging Every Keystroke**
- **What people do:** Log every single byte of terminal output as separate event
- **Why it's wrong:** 1000s of events/second, database bloat, query performance death
- **Do this instead:** Batch terminal output into 1-second chunks; only extract structured events (errors, commands)

**Anti-Pattern 2: Synchronous Logging Blocking Terminal**
- **What people do:** `await auditLogger.log()` in Socket.IO output handler
- **Why it's wrong:** Slow disk I/O causes terminal lag
- **Do this instead:** Queue events in memory, flush batch every 1s or 100 events

**Anti-Pattern 3: No Retention Policy**
- **What people do:** Keep all events forever
- **Why it's wrong:** Database grows to gigabytes, query slows to crawl
- **Do this instead:** Cron job runs `pruneOldEvents(90)` daily

---

## Feature 3: Mobile-First UI Architecture

### Responsive Breakpoint Strategy

Following [2026 React responsive patterns](https://www.dhiwise.com/post/the-ultimate-guide-to-achieving-react-mobile-responsiveness) and [breakpoint best practices](https://www.framer.com/blog/responsive-breakpoints/):

**Standard breakpoints:**
```typescript
// src/client/styles/breakpoints.ts
export const breakpoints = {
  mobile: 0,        // 0-480px (mobile-first baseline)
  tablet: 481,      // 481-768px
  desktop: 769,     // 769-1200px
  largeDesktop: 1201, // 1201px+
} as const;

export const mediaQueries = {
  mobile: `(max-width: ${breakpoints.tablet - 1}px)`,
  tablet: `(min-width: ${breakpoints.tablet}px) and (max-width: ${breakpoints.desktop - 1}px)`,
  desktop: `(min-width: ${breakpoints.desktop}px)`,
  largeDesktop: `(min-width: ${breakpoints.largeDesktop}px)`,
} as const;
```

### useMediaQuery Hook Pattern

Following [React media query hook pattern](https://react.wiki/hooks/custom-use-media-query/):

```typescript
// src/client/hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Convenience hooks
export const useIsMobile = () => useMediaQuery(mediaQueries.mobile);
export const useIsTablet = () => useMediaQuery(mediaQueries.tablet);
export const useIsDesktop = () => useMediaQuery(mediaQueries.desktop);
```

### Container Query Pattern (2026 Best Practice)

Following [container query patterns](https://copyprogramming.com/howto/react-testing-library-rtl-test-a-responsive-design):

```typescript
// Instead of viewport-based queries, use container-based sizing
// Tailwind CSS 4 supports @container by default

// Example: AgentSidebar adapts to its container, not viewport
<div className="@container">
  <div className="@sm:flex-row @lg:flex-col flex-col">
    {/* Layout changes based on container width, not screen width */}
  </div>
</div>
```

### Component Hierarchy Restructure

Current desktop-first hierarchy:
```
App
├── Header (fixed)
├── InstanceTabBar (always visible)
├── Main (flex-1)
│   ├── TerminalView (flex-1)
│   └── AgentSidebar (fixed 320px, desktop only)
└── PromptPanel (fixed height)
```

Recommended mobile-first hierarchy:
```
App
├── MobileHeader (sticky, <768px only)
│   ├── Menu toggle → opens drawer
│   └── Active session badge
├── TabletDesktopHeader (>=768px only)
│   ├── Logo + session count
│   └── View toggle + Agents button
├── ViewStack (mobile: full-screen stack; desktop: flex row)
│   ├── TerminalView
│   │   ├── SessionDrawer (mobile: slide-over; desktop: tabs)
│   │   └── Terminal (always full viewport)
│   ├── HistoryView (mobile: full-screen; desktop: replaces terminal)
│   └── ActivityView (mobile: full-screen; desktop: replaces terminal)
├── AgentDrawer (mobile: slide-over; desktop: sidebar)
│   ├── AgentList
│   └── PromptPanel (mobile: modal; desktop: inline)
└── BottomNav (mobile <768px only)
    ├── Terminals button
    ├── History button
    ├── Activity button
    └── Agents button
```

### Responsive Layout Components

```typescript
// src/client/components/ResponsiveLayout.tsx
export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

  return (
    <div className="flex flex-col h-screen">
      {isMobile ? <MobileHeader /> : <TabletDesktopHeader />}

      <main className="flex-1 min-h-0">
        {children}
      </main>

      {isMobile && <BottomNav />}
    </div>
  );
}

// Mobile-specific components
function MobileHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-warden-panel border-b border-warden-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="min-w-[44px] min-h-[44px]"  // Touch-friendly 44px tap target
          >
            ☰ Menu
          </button>
          <div className="text-sm text-warden-text-dim">
            {/* Active session indicator */}
          </div>
        </div>
      </header>

      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

function BottomNav() {
  const [currentView, setCurrentView] = useRouterView();

  return (
    <nav className="sticky bottom-0 z-40 bg-warden-panel border-t border-warden-border">
      <div className="flex justify-around py-2">
        {['terminals', 'history', 'activity', 'agents'].map(view => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`flex flex-col items-center min-w-[64px] min-h-[44px] ${
              currentView === view ? 'text-warden-accent' : 'text-warden-text-dim'
            }`}
          >
            {/* Icon + label */}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

### Touch-Friendly Interaction Patterns

Following [mobile-first design principles](https://blog.pixelfreestudio.com/how-to-implement-mobile-first-design-in-react/):

```typescript
// Minimum tap target size: 44x44px (iOS) / 48x48px (Android)
// Tailwind config adjustment:

// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      minWidth: {
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
      },
    },
  },
};

// Usage:
<button className="min-w-touch min-h-touch flex items-center justify-center">
  {/* Icon or text */}
</button>
```

### Visual Viewport Height (iOS Keyboard Fix)

Already implemented in App.tsx (lines 40-58), continue using:

```typescript
// App.tsx already has this:
useEffect(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const updateHeight = () => {
    document.documentElement.style.setProperty(
      '--visual-viewport-height',
      `${viewport.height}px`
    );
  };

  updateHeight();
  viewport.addEventListener('resize', updateHeight);
  viewport.addEventListener('scroll', updateHeight);
  return () => {
    viewport.removeEventListener('resize', updateHeight);
    viewport.removeEventListener('scroll', updateHeight);
  };
}, []);

// CSS usage:
.app-height {
  height: var(--visual-viewport-height, 100vh);
}
```

### Progressive Enhancement Strategy

Following [progressive enhancement principle](https://www.keitaro.com/insights/2024/01/30/building-responsive-and-user-friendly-web-applications-with-react/):

1. **Mobile baseline (0-480px):**
   - Single-column layout
   - Full-screen views (no split panes)
   - Bottom navigation
   - Slide-over drawers
   - Touch-optimized controls (44px min)

2. **Tablet enhancement (481-768px):**
   - Two-column layout possible
   - Side-by-side terminal + sidebar (landscape)
   - Tabs instead of bottom nav
   - Slide-over drawers (portrait) or inline panels (landscape)

3. **Desktop enhancement (769px+):**
   - Multi-column layout
   - Fixed sidebar (no drawer)
   - Inline panels
   - Hover states
   - Keyboard shortcuts

### Component Conditional Rendering

```typescript
// Mobile: full-screen drawer
{isMobile && (
  <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
    <SessionList sessions={sessions} onSelect={handleSelect} />
  </SessionDrawer>
)}

// Desktop: inline tabs
{isDesktop && (
  <InstanceTabBar
    instances={instances}
    selectedSessionName={selectedSessionName}
    onSelectSession={handleSelectSession}
  />
)}
```

### Integration Points

**New components:**
- `src/client/styles/breakpoints.ts` — Breakpoint constants
- `src/client/hooks/useMediaQuery.ts` — Media query hook
- `src/client/hooks/useIsMobile.ts`, `useIsDesktop.ts` — Convenience hooks
- `src/client/components/MobileHeader.tsx` — Mobile-specific header
- `src/client/components/BottomNav.tsx` — Mobile bottom navigation
- `src/client/components/SessionDrawer.tsx` — Mobile session switcher
- `src/client/components/AgentDrawer.tsx` — Mobile agent panel

**Modified components:**
- `src/client/App.tsx` — Conditional layout based on viewport
- `src/client/components/InstanceTabBar.tsx` — Hide on mobile, show on desktop
- `src/client/components/AgentSidebar.tsx` — Convert to drawer on mobile
- `src/client/components/PromptPanel.tsx` — Convert to modal on mobile

**Tailwind config:**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      minWidth: { touch: '44px' },
      minHeight: { touch: '44px' },
      screens: {
        'mobile': '0px',
        'tablet': '481px',
        'desktop': '769px',
        'large-desktop': '1201px',
      },
    },
  },
};
```

### Anti-Patterns

**Anti-Pattern 1: Desktop Layout with `display: none` on Mobile**
- **What people do:** Build desktop version, then hide elements with CSS on mobile
- **Why it's wrong:** Ships unused code, degrades performance, accessibility issues
- **Do this instead:** Component-level conditional rendering with `useMediaQuery`

**Anti-Pattern 2: Fixed Pixel Widths**
- **What people do:** `width: 320px` everywhere
- **Why it's wrong:** Breaks on 375px iPhones, 393px Android, 412px large phones
- **Do this instead:** Relative units (`rem`, `%`, `vw`) or Tailwind's responsive classes

**Anti-Pattern 3: Viewport-Only Breakpoints**
- **What people do:** All responsive logic based on `window.innerWidth`
- **Why it's wrong:** Doesn't account for sidebar/panel size, container context
- **Do this instead:** Mix viewport breakpoints with container queries (Tailwind `@container`)

---

## Build Order Recommendations

Based on feature dependencies and integration complexity:

### Phase A: Plugin Registry Foundation (Week 1-2)
1. Database migration: `plugins` table
2. Server: `PluginManager` service + `pluginRoutes` API
3. Client: `PluginRegistry` singleton
4. Client: `DynamicPanelRenderer` component
5. Client: `PluginSlot` component
6. Integration: Add 1-2 built-in "plugins" as proof-of-concept (e.g., "System Stats")

**Why first:** Lowest risk, foundational for other features

### Phase B: Mobile-First UI Restructure (Week 2-3)
1. Styles: Breakpoint constants + Tailwind config
2. Hooks: `useMediaQuery`, `useIsMobile`, `useIsDesktop`
3. Components: `MobileHeader`, `BottomNav`, `SessionDrawer`, `AgentDrawer`
4. Refactor: `App.tsx` conditional layout
5. Testing: Playwright tests at 375px, 768px, 1440px viewports

**Why second:** UI foundation needed before Activity view (which benefits from mobile layout)

### Phase C: Activity Timeline & Audit Log (Week 3-5)
1. Database migration: `activity_events` table
2. Server: `TerminalOutputParser` (integrate `node-ansiparser`)
3. Server: `ActivityEnricher` service
4. Server: `AuditLogger` service
5. Server: `activityRoutes` API
6. Server: Modify `TerminalStreamService` to emit events
7. Client: `ActivityTimeline` component
8. Client: Add "Activity" view to main navigation
9. Testing: E2E flow for event capture + timeline display

**Why last:** Most complex, depends on parser library integration, benefits from plugin system (for custom event renderers)

---

## Scaling Considerations

| Scale | Adjustments |
|-------|-------------|
| **0-10 sessions** | Current architecture sufficient; SQLite handles well |
| **10-100 sessions** | Plugin registry: implement lazy loading; Activity: batch event writes (100 events or 1s) |
| **100+ sessions** | Activity: consider PostgreSQL for full-text search; Plugin: implement allowlist/signature validation |

**First bottleneck:** Activity event writes (high volume terminal output)
- **Fix:** Batch writes, reduce `terminal_output` retention to 7 days

**Second bottleneck:** Plugin component re-renders
- **Fix:** React.memo() on `DynamicPanelRenderer`, plugin context isolation

---

## Sources

**Plugin Architecture:**
- [Plugin Architecture Pattern (Medium)](https://medium.com/omarelgabrys-blog/plug-in-architecture-dec207291800)
- [Registry Pattern (GeeksforGeeks)](https://www.geeksforgeeks.org/system-design/registry-pattern/)
- [dotCMS Plugin Architecture](https://www.dotcms.com/blog/plugin-achitecture)
- [ArjanCodes Plugin Best Practices](https://arjancodes.com/blog/best-practices-for-decoupling-software-using-plugins/)

**React Dynamic Components:**
- [Storyblok Dynamic Component Rendering](https://www.storyblok.com/tp/react-dynamic-component-from-json)
- [Kyle Shevlin: Dynamic React Components](https://kyleshevlin.com/how-to-dynamically-render-react-components/)
- [Tambo 1.0: React Component Rendering Agents](https://aitoolly.com/ai-news/article/2026-02-11-tambo-10-open-source-toolkit-for-agents-rendering-react-components-launched)

**Audit Logging & Activity Timeline:**
- [Microservices Audit Logging Pattern](https://microservices.io/patterns/observability/audit-logging.html)
- [Martin Fowler: Audit Log](https://martinfowler.com/eaaDev/AuditLog.html)
- [Confluent: Real-Time Audit Logging with Kafka](https://www.confluent.io/blog/build-real-time-compliance-audit-logging-kafka/)
- [Activity Logs Pattern (Business Central)](https://alguidelines.dev/docs/navpatterns/patterns/activity-log/)
- [Sonar: Audit Logging Best Practices](https://www.sonarsource.com/resources/library/audit-logging/)

**ANSI Parsing:**
- [VT100.net ANSI Parser](https://vt100.net/emu/dec_ansi_parser)
- [node-ansiparser (GitHub)](https://github.com/netzkolchose/node-ansiparser)
- [ANSI Escape Code (Wikipedia)](https://en.wikipedia.org/wiki/ANSI_escape_code)

**Mobile-First & Responsive Design:**
- [Keitaro: Responsive React Apps](https://www.keitaro.com/insights/2024/01/30/building-responsive-and-user-friendly-web-applications-with-react/)
- [DhiWise: React Mobile Responsiveness](https://www.dhiwise.com/post/the-ultimate-guide-to-achieving-react-mobile-responsiveness/)
- [PixelFreeStudio: Mobile-First Design in React](https://blog.pixelfreestudio.com/how-to-implement-mobile-first-design-in-react/)
- [React Testing Library: Responsive Design Testing](https://copyprogramming.com/howto/react-testing-library-rtl-test-a-responsive-design)
- [Framer: Breakpoints Guide 2026](https://www.framer.com/blog/responsive-breakpoints/)
- [React Wiki: useMediaQuery Hook](https://react.wiki/hooks/custom-use-media-query/)

**Event-Driven Architecture:**
- [Event-Driven Patterns (SimpleAWS)](https://newsletter.simpleaws.dev/p/event-driven-architecture-patterns)
- [Event-Driven Cloud Security Architecture](https://www.cy5.io/blog/event-driven-cloud-security-architecture/)

---

*Architecture research for: Warden Dashboard v2.0 Mission Control Extensions*
*Researched: 2026-02-16*
