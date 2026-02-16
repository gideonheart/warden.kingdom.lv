# Technology Stack

**Project:** Warden Dashboard v2.0 Mission Control
**Researched:** 2026-02-16
**Focus:** Stack additions for plugin registry, agent activity/audit timeline, mobile-first UI

## Executive Summary

Warden v2.0 requires minimal new dependencies. The existing stack (Express 5, Socket.IO 4, React 19, xterm.js 5, SQLite, Tailwind CSS 4, Vite 6) provides all core infrastructure. New features require: (1) ANSI parsing for terminal output, (2) mobile UI components for bottom sheets/drawers, (3) SQLite schema additions with JSON virtual columns, (4) virtualized timeline rendering. **No build system changes or plugin framework dependencies needed** — use Vite's native dynamic imports + TypeScript registry pattern.

---

## New Dependencies (v2.0 Features)

### Terminal Output Parsing

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `ansi_up` | `^6.0.2` | ANSI escape code to HTML/text parsing | Zero dependencies, isomorphic (browser+Node), actively maintained since 2011, TypeScript types included. Converts terminal output to structured data for activity events. |

**Alternatives considered:**
- `ansicolor` — Smaller but less actively maintained, lacks recent updates
- `node-ansiparser` — Low-level, overkill for our needs (designed for full terminal emulator)
- `ansis` — More focused on colorizing output, not parsing existing ANSI

**Why ansi_up wins:** Single-file ESM module with no dependencies, TypeScript support, and proven production use in VS Code extensions and terminal viewers. Handles both client-side (browser) and server-side (Node) parsing.

**Installation:**
```bash
npm install ansi_up
```

**Confidence:** HIGH — verified via official docs, GitHub activity (last release Nov 2024), and npm registry.

---

### Mobile UI Components

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `react-modal-sheet` | `^3.1.0` | Bottom sheet/drawer for mobile | Built with Framer Motion (already compatible with React 19), no dependencies beyond peer deps, accessibility-focused, actively maintained. Works with existing Tailwind styling. |

**Alternatives considered:**
- `Konsta UI` — Purpose-built for mobile but introduces entire component library; too heavy
- `react-spring-bottom-sheet` — Strong option but adds `react-spring` dependency (unused elsewhere)
- `@gorhom/react-native-bottom-sheet` — React Native only, not web
- `MUI SwipeableDrawer` — Would require full Material UI (390kb), conflicts with existing Tailwind design system

**Why react-modal-sheet wins:** Minimal bundle size (builds on Framer Motion which React 19 projects often already have), flexible styling with Tailwind CSS, handles virtual keyboard on mobile, supports accessibility APIs.

**Installation:**
```bash
npm install react-modal-sheet framer-motion
```

**Confidence:** MEDIUM-HIGH — Library well-documented, active GitHub (last commit Dec 2024). Framer Motion is industry standard for React animations. One caveat: React StrictMode may cause animation issues (documented, fixable).

---

### Virtualized Timeline Rendering

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@gravity-ui/timeline` | `^0.1.0` | Canvas-based virtualized timeline | Handles large datasets (thousands of events), built-in virtualization, grouped markers with zoom, active development by Yandex team. |

**Alternatives considered:**
- `react-chrono` — Beautiful but not virtualized, will freeze with 1000+ events
- `react-vertical-timeline-component` — Simple but DOM-heavy, no virtualization
- `react-virtualized-timeline` (custom) — No published npm package, would need to build from scratch

**Why @gravity-ui/timeline wins:** Canvas rendering keeps DOM lightweight, automatic virtualization when content exceeds viewport, TypeScript support, actively maintained (2024 releases).

**Fallback option:** If `@gravity-ui/timeline` proves unstable, build custom virtualized list using existing React patterns + `IntersectionObserver` for lazy loading.

**Installation:**
```bash
npm install @gravity-ui/timeline
```

**Confidence:** MEDIUM — Library is newer (2024), but backed by large team (Yandex Gravity UI). Virtualization is critical for performance with agent logs. Monitor stability during Phase 1 implementation.

---

## No New Dependencies Needed

### Plugin Architecture
**Use:** Vite's native dynamic `import()` + TypeScript Registry Pattern

**Why no Module Federation / plugin framework:**
- Warden is single-server, single-user deployment — no need for remote module loading
- Plugins will be local TypeScript modules in `src/plugins/` directory
- Vite's `import.meta.glob()` provides build-time discovery
- TypeScript's discriminated unions + registry pattern provides type safety

**Pattern to implement:**
```typescript
// src/plugins/registry.ts
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  component: React.ComponentType<PluginProps>;
}

// Auto-discover plugins at build time
const pluginModules = import.meta.glob('./*/manifest.ts', { eager: true });

// Type-safe registry with discriminated union
export const registry = new Map<string, PluginManifest>();
```

**Confidence:** HIGH — Vite documentation confirms `import.meta.glob` with eager loading provides build-time type safety. Pattern validated in large TypeScript monorepos (Slash Engineering blog, 1.1M LOC).

---

### Mobile Terminal Support
**Use:** Existing `xterm.js` (v5.3.0) + custom touch handlers

**Why no additional library:**
- xterm.js has partial mobile support (works with mobile keyboards)
- Known limitations: ballistic scrolling, touch selection
- Custom touch event handling simpler than full wrapper library
- Virtual keyboard already handled in App.tsx via `window.visualViewport`

**Enhancement approach:**
- Add `TouchHandlingService` for basic tap/swipe on terminal viewport
- Use CSS `touch-action` directives for scroll behavior
- Leverage existing `FitAddon` for responsive resizing

**Confidence:** HIGH — xterm.js GitHub confirms mobile keyboard support works. Touch limitations documented but not blockers for primary use case (prompt injection, read-only viewing). Custom touch handlers proven pattern in VS Code mobile web.

---

## SQLite Schema Changes

### No Library Additions Required
**Use:** Existing `better-sqlite3` (v11.0.0)

### New Tables

#### 1. Activity Events Table
```sql
CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL REFERENCES instances(id),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL, -- 'session_start', 'prompt_sent', 'tool_call', 'error', etc.
  summary TEXT NOT NULL,     -- Human-readable summary
  details TEXT,              -- JSON blob with event-specific data
  terminal_output TEXT,      -- Captured ANSI output (if applicable)

  -- Virtual columns for indexing JSON
  agent_id TEXT GENERATED ALWAYS AS (json_extract(details, '$.agentId')) VIRTUAL,
  severity TEXT GENERATED ALWAYS AS (json_extract(details, '$.severity')) VIRTUAL
);

CREATE INDEX idx_activity_events_instance ON activity_events(instance_id, timestamp DESC);
CREATE INDEX idx_activity_events_agent ON activity_events(agent_id, timestamp DESC);
CREATE INDEX idx_activity_events_type ON activity_events(event_type, timestamp DESC);
CREATE INDEX idx_activity_events_severity ON activity_events(severity) WHERE severity IS NOT NULL;
```

**Why virtual columns:** SQLite's `GENERATED ALWAYS AS` columns with `json_extract` provide B-tree index speed on JSON fields without data duplication. Pattern confirmed in recent SQLite best practices (2025-2026).

#### 2. Plugin Registry Table
```sql
CREATE TABLE plugin_registry (
  id TEXT PRIMARY KEY,       -- Plugin ID (matches manifest)
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  config TEXT,               -- JSON configuration blob
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Why not use file system only:** Enables/disables state and user configuration persistence. Plugin code lives in `src/plugins/`, but registry table tracks runtime state.

### Full-Text Search for Activity
```sql
CREATE VIRTUAL TABLE activity_events_fts USING fts5(
  summary,
  terminal_output,
  content='activity_events',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER activity_events_ai AFTER INSERT ON activity_events BEGIN
  INSERT INTO activity_events_fts(rowid, summary, terminal_output)
  VALUES (new.id, new.summary, new.terminal_output);
END;

CREATE TRIGGER activity_events_ad AFTER DELETE ON activity_events BEGIN
  DELETE FROM activity_events_fts WHERE rowid = old.id;
END;

CREATE TRIGGER activity_events_au AFTER UPDATE ON activity_events BEGIN
  UPDATE activity_events_fts
  SET summary = new.summary, terminal_output = new.terminal_output
  WHERE rowid = new.id;
END;
```

**Why FTS5:** Searching terminal output and activity summaries with `LIKE` would be CPU-intensive. FTS5 provides ranked search with BM25 scoring. Porter tokenizer for English stemming (run/runs/running → run).

**Confidence:** HIGH — Pattern validated in SQLite FTS5 official docs and production SQLite deployments (DB Pro Blog, TheLinuxCode guides, 2025-2026).

---

## Mobile-First CSS Additions

### No Library Needed
**Use:** Existing Tailwind CSS 4

### New Utilities via `@layer utilities`
```css
@layer utilities {
  /* Mobile-safe touch targets (min 44x44px) */
  .touch-target {
    min-width: 44px;
    min-height: 44px;
  }

  /* Bottom sheet safe area handling */
  .safe-area-bottom {
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }

  /* Prevent text selection during touch interactions */
  .no-touch-select {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  /* Smooth momentum scrolling for iOS */
  .momentum-scroll {
    -webkit-overflow-scrolling: touch;
    overflow-y: auto;
  }
}
```

**Why custom utilities:** Tailwind CSS 4 doesn't include iOS-specific utilities by default. These handle common mobile UX patterns (safe areas, touch targets, momentum scrolling).

**Confidence:** HIGH — Standard CSS properties, verified in iOS Safari and Chrome mobile documentation.

---

## Development Workflow Additions

### Type Safety for Plugin Development

```bash
# No new tools needed - use existing TypeScript + Vite
npm run typecheck  # Validates plugin manifest types
npm run dev:all    # Hot-reload includes plugin changes
```

### E2E Testing for Mobile UI

```bash
# Use existing Playwright with mobile viewport emulation
npx playwright test --project=mobile
```

**Playwright config addition:**
```typescript
// playwright.config.ts
{
  name: 'mobile',
  use: {
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
}
```

**Confidence:** HIGH — Playwright mobile emulation is production-ready, used by Microsoft for Edge mobile testing.

---

## Anti-Patterns: What NOT to Add

### Don't Add
| Library | Why Not |
|---------|---------|
| `react-virtualized` | Deprecated (maintainer recommends `react-window` or `@tanstack/react-virtual`), but timeline library handles virtualization |
| `blessed` / `node-pty` wrappers | Already have node-pty; blessed is for TUI apps, not web UIs |
| `Module Federation` | Overkill for single-server deployment; Vite glob imports suffice |
| `Webpack` | Would conflict with Vite; no migration needed |
| `MUI`, `Ant Design`, `Chakra UI` | Full UI frameworks conflict with existing Tailwind design system; 100kb+ bundle overhead |
| `recharts`, `d3` for timelines | Timeline library handles rendering; don't over-engineer |
| `json5` | Already used for OpenClaw config; don't need for new features |

---

## Migration Notes

### package.json Changes
```diff
"dependencies": {
  "better-sqlite3": "^11.0.0",
  "cors": "^2.8.5",
  "express": "^5.0.0",
  "node-pty": "^1.0.0",
  "socket.io": "^4.8.0",
+ "ansi_up": "^6.0.2"
},
"devDependencies": {
  "@playwright/test": "^1.58.2",
  "@tailwindcss/vite": "^4.1.18",
  "@types/better-sqlite3": "^7.6.0",
  "@types/cors": "^2.8.17",
  "@types/express": "^5.0.0",
  "@types/node": "^22.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@vitejs/plugin-react": "^4.3.0",
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-web-links": "^0.11.0",
  "concurrently": "^9.0.0",
+ "framer-motion": "^11.11.17",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
+ "react-modal-sheet": "^3.1.0",
+ "@gravity-ui/timeline": "^0.1.0",
  "socket.io-client": "^4.8.0",
  "tailwindcss": "^4.0.0",
  "tsx": "^4.19.0",
  "typescript": "^5.7.0",
  "vite": "^6.0.0",
  "xterm": "^5.3.0"
}
```

### Bundle Size Impact
| Addition | Estimated Size (gzipped) |
|----------|-------------------------|
| `ansi_up` | ~5kb |
| `react-modal-sheet` | ~8kb |
| `framer-motion` | ~35kb (tree-shakeable) |
| `@gravity-ui/timeline` | ~20kb (canvas rendering) |
| **Total increase** | **~68kb** |

**Current bundle:** ~450kb (estimated)
**New bundle:** ~518kb (+15%)

**Mitigation:** Code-split timeline and bottom sheet components (only load when Activity view active).

---

## Integration Points

### 1. Plugin System → Vite Build
- Plugins discovered at build time via `import.meta.glob()`
- Manifest validation in `PluginRegistry` service
- React lazy loading for plugin components

### 2. Activity Events → Socket.IO
- Terminal output parsed with `ansi_up` in `TerminalStreamService`
- Activity events emitted via new Socket.IO namespace: `/activity`
- Client receives real-time events, stores in local state + backend logs to SQLite

### 3. Mobile UI → Existing Layout
- Bottom sheet replaces fixed sidebar on mobile
- Tailwind breakpoints control layout switching (`lg:` prefix for desktop)
- Visual Viewport API already integrated in `App.tsx` (iOS keyboard handling)

### 4. Timeline → Activity Events
- `@gravity-ui/timeline` consumes activity events from `/api/activity/events` endpoint
- Virtualization handles 1000+ events without DOM bloat
- Search powered by FTS5 via `/api/activity/search?q=...` endpoint

---

## Verification Checklist

Before implementing each phase:

- [ ] Verify `ansi_up` version on npm registry (latest: 6.0.2 as of Feb 2026)
- [ ] Check `react-modal-sheet` React 19 compatibility (peer deps)
- [ ] Test `@gravity-ui/timeline` with sample dataset (1000+ events)
- [ ] Validate TypeScript registry pattern compiles with `tsc --noEmit`
- [ ] Run Playwright mobile viewport tests on existing xterm.js
- [ ] Benchmark SQLite virtual column query performance (vs non-indexed JSON)
- [ ] Measure bundle size after adding dependencies (`npm run build` + `du -sh dist/`)

---

## Sources

### Plugin Architecture
- [Module Federation V2 in React](https://medium.com/@CorneflexSteve/bootstrap-a-plugin-architecture-in-react-with-webpack-module-federation-and-nx-a6f3d9727f7e)
- [Scaling TypeScript with Registries - Slash Engineering](https://puzzles.slash.com/blog/scaling-1m-lines-of-typescript-registries)
- [Manifest Pattern for Type-Safe UIs](https://andrewhathaway.net/blog/manifest-pattern/)
- [Vite Plugin API](https://vite.dev/guide/api-plugin)
- [Vite Features - Dynamic Imports](https://vite.dev/guide/features)

### Terminal Output Parsing
- [ansi_up GitHub](https://github.com/drudru/ansi_up)
- [ansis - Modern ANSI Library](https://github.com/webdiscus/ansis)
- [node-ansiparser](https://github.com/netzkolchose/node-ansiparser)

### Mobile UI Components
- [react-modal-sheet GitHub](https://github.com/Temzasse/react-modal-sheet)
- [Konsta UI - Mobile Components](https://konstaui.com/)
- [react-spring-bottom-sheet](https://react-spring.bottom-sheet.dev/)
- [Material UI Drawer](https://mui.com/material-ui/react-drawer/)
- [Preline UI - Tailwind CSS Components](https://preline.co/)
- [daisyUI - Tailwind CSS Plugin](https://daisyui.com/)

### xterm.js Mobile Support
- [xterm.js Mobile Touch Support Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377)
- [xterm.js Official Docs](https://xtermjs.org/)

### SQLite Best Practices
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html)
- [SQLite JSON Virtual Columns - DB Pro Blog](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing)
- [SQLite Full-Text Search Guide - TheLinuxCode](https://thelinuxcode.com/sqlite-full-text-search-fts5-in-practice-fast-search-ranking-and-real-world-patterns/)
- [JSON Virtual Columns in SQLite](https://antonz.org/json-virtual-columns/)

### Timeline Libraries
- [Gravity UI Timeline](https://gravity-ui.com/libraries/timeline)
- [react-chrono](https://github.com/prabhuignoto/react-chrono)
- [Comparing React Timeline Libraries - LogRocket](https://blog.logrocket.com/comparing-best-react-timeline-libraries/)

### TypeScript Patterns
- [Type Registry Pattern - Frontend Masters](https://frontendmasters.com/courses/typescript-v4/type-registry-pattern/)
- [Function Registry Pattern](https://javascript.plainenglish.io/function-registry-pattern-explained-clean-scalable-composable-code-e483bb7f2444)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| ANSI Parsing | HIGH | `ansi_up` actively maintained, zero deps, TypeScript support |
| Mobile Bottom Sheet | MEDIUM-HIGH | `react-modal-sheet` well-documented, React StrictMode caveat noted |
| Virtualized Timeline | MEDIUM | `@gravity-ui/timeline` newer library, backup plan: custom implementation |
| Plugin Architecture | HIGH | Vite glob imports + TS registry pattern validated in production |
| Mobile Terminal | HIGH | xterm.js partial mobile support confirmed, custom handlers for gaps |
| SQLite Schema | HIGH | Virtual columns + FTS5 patterns verified in official docs |
| Bundle Size | HIGH | Total increase ~68kb, acceptable for feature scope |

**Overall confidence:** MEDIUM-HIGH

**Risks:**
1. `@gravity-ui/timeline` stability unknown — mitigate with early Phase 1 testing, fallback to custom virtualized list
2. `react-modal-sheet` React StrictMode issues — mitigate by testing in dev mode early, contribute fix upstream if needed
3. Mobile xterm.js touch handling — mitigate with custom `TouchHandlingService`, document limitations in mobile UX

**All risks have documented mitigations and do not block MVP delivery.**
