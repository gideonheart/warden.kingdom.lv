# Project Research Summary

**Project:** Warden Dashboard v2.0 Mission Control
**Domain:** Terminal multiplexer dashboard with plugin registry, activity timeline, and mobile-first UI
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

Warden v2.0 extends the existing terminal streaming dashboard with three major feature domains: (1) Plugin/Tool Registry for UI extensibility, (2) Activity Timeline for structured event capture and audit logging, and (3) Mobile-First UI for responsive operation. Research reveals that the current stack (Express 5, Socket.IO 4, React 19, xterm.js 5, SQLite, Tailwind CSS 4, Vite 6) provides all necessary infrastructure with minimal new dependencies.

The recommended approach prioritizes simplicity and leverages existing patterns: use Vite's native dynamic imports with TypeScript registry pattern for plugins (no module federation), selective ANSI parsing with security-first event storage for activity timeline, and mobile-first CSS with progressive enhancement for responsive UI. This approach adds only ~68kb to the bundle (ansi_up, react-modal-sheet, framer-motion, @gravity-ui/timeline) and requires zero build system changes.

Key risks center on three critical areas: (1) over-engineering the plugin system when simple build-time registration suffices, (2) xterm.js mobile touch support which remains fundamentally broken in 2026 (requires read-only mobile terminal decision), and (3) terminal output parsing performance and ANSI security vulnerabilities (requires selective parsing with aggressive sanitization). All risks have documented mitigations and do not block MVP delivery.

## Key Findings

### Recommended Stack

Warden v2.0 requires minimal new dependencies. The existing infrastructure handles all core functionality. Four new libraries provide specialized capabilities without architectural changes.

**New dependencies:**
- **ansi_up (6.0.2):** ANSI escape code parsing for terminal output — zero dependencies, isomorphic, TypeScript support, actively maintained since 2011
- **react-modal-sheet (3.1.0):** Bottom sheet/drawer for mobile UI — built on Framer Motion, Tailwind-compatible, accessibility-focused
- **framer-motion (11.11+):** Animation library (peer dependency of react-modal-sheet) — industry standard, React 19 compatible
- **@gravity-ui/timeline (0.1.0):** Canvas-based virtualized timeline rendering — handles thousands of events, active development by Yandex team

**No additional dependencies needed:**
- Plugin architecture uses Vite's native `import.meta.glob()` with TypeScript registry pattern
- Mobile terminal uses existing xterm.js with custom touch handlers
- SQLite schema additions use existing better-sqlite3 with virtual columns and FTS5
- Mobile UI uses existing Tailwind CSS 4 with custom utilities

**Bundle size impact:** +68kb gzipped (15% increase from ~450kb to ~518kb), mitigated by code-splitting timeline and bottom sheet components.

**Critical version requirements:** None identified. All dependencies compatible with existing React 19 and Vite 6 infrastructure.

### Expected Features

Research identified three distinct feature domains with clear table stakes, differentiators, and anti-features.

**Plugin Registry — Must have (P1):**
- Manifest schema for plugin metadata (name, version, description, capabilities)
- Metadata display table showing plugins with status (active/inactive)
- Manual enable/disable toggle per plugin
- Build-time type-safe registration with TypeScript

**Plugin Registry — Should have (P2):**
- Manifest pattern (co-locate metadata + code + UI in single file)
- UI panel slots for injecting custom React components

**Plugin Registry — Defer (anti-features):**
- Auto-install from public registry (security risk, scope creep)
- Plugin marketplace UI (requires hosting, moderation, legal complexity)

**Activity Timeline — Must have (P1):**
- SQLite events table with Activity Stream Protocol schema (Actor/Verb/Object/Target)
- Chronological event list (time-sorted, newest first)
- Event detail panel with full metadata
- Filter by agent, date range, event type
- Export to CSV/JSON for audit compliance

**Activity Timeline — Should have (P2):**
- Structured event parsing from terminal output (tool calls, file edits, commands)
- Success/failure state indicators (parse exit codes, error keywords)
- Linked events (click event → jump to terminal session at timestamp)

**Activity Timeline — Defer (anti-features):**
- Real-time WebSocket streaming of every event (overwhelming for high-volume agents)
- AI-powered event summarization (API costs, unreliable for audit)
- Immutable log with blockchain (massive overkill for single-user tool)

**Mobile UI — Must have (P1):**
- Full-width responsive layout (375px to 1920px)
- Collapsible panels (accordions) for agent details, session logs, token usage
- Bottom sheet for prompt panel (thumb-reachable on mobile)
- Touch scrolling support for terminal
- Safe zone at top (64px) when bottom sheet expands

**Mobile UI — Should have (P2):**
- Progressive enhancement (mobile baseline, desktop enhancements via min-width breakpoints)
- Gesture library (swipe for tabs, pinch to zoom)

**Mobile UI — Defer (anti-features):**
- Separate native mobile app (3x development cost, App Store distribution)
- Predictive touch input (Mosh pattern) — high complexity, conflicts with Socket.IO
- Full mobile terminal interactivity (xterm.js touch support broken, requires weeks of debugging)

### Architecture Approach

All three features integrate cleanly into the existing architecture without major refactoring. The plugin system slots into the React component hierarchy, activity timeline extends the existing Socket.IO streaming service, and mobile UI restructures layout components using media queries.

**Major components for Plugin Registry:**
1. **PluginRegistry (client singleton)** — Map-based registry with `discover()`, `load()`, `unload()` methods; type-safe component lookup
2. **DynamicPanelRenderer (React component)** — Runtime component loader with ErrorBoundary isolation per plugin
3. **PluginManager (server service)** — CRUD operations for plugin metadata, SQLite persistence
4. **Panel slot architecture** — Declarative `<PluginSlot slotId="sidebar-top" />` containers in layout components

**Major components for Activity Timeline:**
1. **TerminalOutputParser (server service)** — ANSI escape sequence parser using ansi_up, detects commands/errors via regex patterns
2. **ActivityEnricher (server service)** — Event extraction pipeline, transforms raw terminal chunks into structured events
3. **AuditLogger (server service)** — Event persistence with sequence numbers, retention policy enforcement, batch writes
4. **ActivityTimeline (React component)** — Virtualized event list with filters, pagination, detail panel

**Major components for Mobile UI:**
1. **ResponsiveLayout (React component)** — Conditional layout based on viewport (MobileHeader + BottomNav vs TabletDesktopHeader)
2. **useMediaQuery hook** — Viewport detection with `window.matchMedia` and event listeners
3. **MobileHeader, BottomNav, SessionDrawer, AgentDrawer** — Mobile-specific UI components
4. **Touch-friendly utilities** — Tailwind CSS custom utilities for safe areas, touch targets (44x44px min), momentum scrolling

**Integration points:**
- Plugin slots added to App.tsx, AgentSidebar.tsx (sidebar-top, sidebar-bottom, bottom-panel, terminal-overlay)
- TerminalStreamService emits parsed events to new `/activity` Socket.IO namespace
- App.tsx conditional rendering based on `useIsMobile()`, `useIsDesktop()` hooks
- SQLite migrations add `plugins` and `activity_events` tables with indexes and FTS5 virtual table

**Database schema additions:**
```sql
-- Plugin registry table
CREATE TABLE plugins (id TEXT PRIMARY KEY, name TEXT, version TEXT,
  enabled INTEGER DEFAULT 1, manifest_json TEXT, installed_at DATETIME);

-- Activity events table with virtual columns for JSON indexing
CREATE TABLE activity_events (id INTEGER PRIMARY KEY, instance_id INTEGER,
  timestamp DATETIME, event_type TEXT, severity TEXT, raw_text TEXT,
  structured_data TEXT,
  agent_id TEXT GENERATED ALWAYS AS (json_extract(structured_data, '$.agentId')) VIRTUAL,
  severity TEXT GENERATED ALWAYS AS (json_extract(structured_data, '$.severity')) VIRTUAL);

-- Full-text search for activity
CREATE VIRTUAL TABLE activity_events_fts USING fts5(summary, terminal_output,
  content='activity_events', tokenize='porter unicode61');
```

### Critical Pitfalls

Research identified 8 critical pitfalls with verified sources (2025-2026). Top 5 most impactful:

1. **Over-Engineering Plugin System for Single-User Tool** — Building full plugin SDK with sandboxing, versioning, dependency management when need is "add 2-3 internal code modules." Balloons codebase from 2,644 LOC to 10,000+ LOC with zero user value. **Mitigation:** Start with simplest approach (TypeScript modules with metadata, build-time registration), set complexity budget (<200 LOC), defer sandboxing until concrete demand.

2. **xterm.js Mobile Touch Experience is Fundamentally Broken** — 5+ year old issue still active in 2025: no native touch event handling, copy/paste broken on iOS (Issue #3727), erratic typing on Android (Issue #3600), Smart Keyboard arrows don't work (Issue #1101). **Mitigation:** Decide early if mobile terminal is core requirement; if nice-to-have, make read-only with "Use desktop" message; if core, budget 2-3 weeks mobile-specific work and expect ongoing issues.

3. **Terminal Output Parsing Becomes Performance Nightmare** — Claude Code generates thousands of lines per minute; ANSI parsing is CPU-intensive; capturing everything causes exponential storage growth; queries over millions of rows timeout. **Mitigation:** Parse selectively (only known patterns like tool calls), set 7-day retention limit, index aggressively (timestamp, event_type), offload parsing to background worker, monitor database size (<100MB), run daily cleanup.

4. **ANSI Escape Sequences Create Security and Storage Vulnerabilities** — Research uncovered 10 CVEs enabling RCE, log manipulation, DoS. 2025 attacks target AI/LLM tools. ANSI codes can obfuscate malicious payloads, make logs appear empty when viewed, print billions of characters. **Mitigation:** Strip ANSI before storing (replace `\x1b` with placeholder), use battle-tested strip-ansi library, validate storage size (reject >10KB), never render ANSI in web UI.

5. **Desktop-First Mobile Implementation Breaks Desktop UX** — Giant touch-friendly buttons waste space on desktop, navigation requires extra clicks, information density drops, keyboard shortcuts removed. Regression caused by treating responsive design as "afterthought." **Mitigation:** Use mobile-first CSS with min-width media queries, design viewport-specific component variants (not just resize), test desktop AND mobile throughout, use content-based breakpoints.

**Other critical pitfalls:**
- Socket.IO Connection State Recovery fails for activity timeline on network switching (WiFi → 4G) — always implement REST backfill for `socket.recovered === false`
- Node.js memory leaks in terminal streaming from PTY event listeners not removed on disconnect — track and remove ALL listeners, use WeakMap for metadata
- SQLite WAL checkpoint starvation from long-running activity timeline queries — ensure "reader gaps," use short-lived transactions (<1s), paginate queries

## Implications for Roadmap

Based on research findings, recommended phase structure prioritizes low-risk foundation, addresses mobile strategy before implementation, and defers complex parsing until infrastructure is stable.

### Suggested Phase Structure

#### Phase 1: Plugin Registry Foundation (Week 1-2)
**Rationale:** Lowest-risk feature with clear scope. Establishes extensibility pattern for future enhancements. Must be built correctly from day one — over-engineering here dooms entire milestone.

**Delivers:**
- Simple build-time plugin registration system (<200 LOC)
- Type-safe plugin manifest schema with TypeScript validation
- Plugin metadata display UI (table with enable/disable toggles)
- 1-2 proof-of-concept built-in plugins (e.g., "System Stats" panel)

**Addresses features:**
- Plugin Registry — Manifest Schema (P1)
- Plugin Registry — Metadata Display (P1)
- Plugin Registry — Manual Enable/Disable (P1)
- Plugin Registry — Type-Safe Registration (P2)

**Avoids pitfalls:**
- Over-engineering (use Vite glob imports, not module federation)
- Missing error boundaries (wrap each plugin in ErrorBoundary)
- Type safety loss (build-time registration with TypeScript manifest)

**Research flags:** None — plugin registry has well-documented patterns, standard implementation. Skip `/gsd:research-phase`.

---

#### Phase 2: Mobile-First UI Restructure (Week 2-3)
**Rationale:** UI foundation needed before Activity view implementation. **Critical decision point:** Must resolve xterm.js mobile touch strategy before proceeding (read-only vs interactive). Desktop regression testing required after every change.

**Delivers:**
- Responsive layout hierarchy (MobileHeader, BottomNav, drawers)
- Mobile-first CSS with progressive enhancement (min-width breakpoints)
- Touch-friendly components (44px min targets, safe areas, momentum scroll)
- Playwright tests at mobile (375px), tablet (768px), desktop (1440px) viewports

**Addresses features:**
- Mobile UI — Full-Width Responsive Layout (P1)
- Mobile UI — Collapsible Panels (P1)
- Mobile UI — Bottom Sheet (P1)
- Mobile UI — Touch Scrolling (P1)
- Mobile UI — Progressive Enhancement (P2)

**Avoids pitfalls:**
- xterm.js mobile touch broken (make terminal read-only on mobile OR budget 2-3 weeks debugging)
- Desktop UX regression (mobile-first CSS, test desktop continuously)
- Mobile keyboard covering input (use visual viewport API, already in App.tsx)

**Research flags:** **Needs research** — xterm.js mobile touch support requires evaluation of alternatives or acceptance of read-only constraint. Consider `/gsd:research-phase` focused on mobile terminal interaction patterns.

**Critical pre-phase decision:** Test xterm.js touch on real iOS/Android devices. If unusable, commit to read-only mobile terminal before starting phase. Document limitation in UX.

---

#### Phase 3: Activity Timeline & Audit Log (Week 3-5)
**Rationale:** Most complex feature, depends on parser library integration, benefits from plugin system (custom event renderers as plugins). Security and performance must be designed from day one — retrofitting ANSI stripping and retention policies is difficult.

**Delivers:**
- Selective ANSI parsing with security-first sanitization
- SQLite activity_events table with virtual columns and FTS5
- Real-time event capture via Socket.IO with REST backfill
- Timeline UI with filters, pagination, virtualized rendering
- Retention policy (7-day default, daily cleanup cron)

**Addresses features:**
- Activity Timeline — SQLite Events Table (P1)
- Activity Timeline — Chronological Event List (P1)
- Activity Timeline — Event Detail Panel (P1)
- Activity Timeline — Filter by Agent (P1)
- Activity Timeline — Date Range Filter (P1)
- Activity Timeline — Export to CSV/JSON (P1)
- Activity Timeline — Structured Event Parsing (P2)
- Activity Timeline — Success/Failure Indicators (P2)

**Avoids pitfalls:**
- ANSI security vulnerabilities (strip before storage with strip-ansi library)
- Parsing performance nightmare (selective parsing, pattern allowlist, background worker)
- WAL checkpoint starvation (paginate queries, <1s transactions, daily checkpoint)
- Socket.IO event loss (implement REST backfill for `socket.recovered === false`)
- Memory leaks (remove PTY listeners on disconnect, WeakMap for metadata)

**Research flags:** **Needs research** — ANSI parsing patterns for Claude Code tool calls require investigation. Terminal output varies by agent type. Consider `/gsd:research-phase` focused on extracting structured events from real terminal logs.

**Critical pre-phase requirements:**
- Establish pattern allowlist for parsing (tool calls, file edits, errors)
- Design retention policy and storage budget (100MB target)
- Implement monitoring for database size and WAL growth

---

### Phase Ordering Rationale

**Why this sequence:**
1. **Plugin Foundation first** — Establishes pattern for extensibility, lowest risk, required for activity timeline plugins (custom event parsers/renderers)
2. **Mobile UI second** — Provides layout foundation for Activity view, forces xterm.js mobile decision before implementation, allows desktop regression testing throughout
3. **Activity Timeline last** — Most complex, highest risk, benefits from plugin system, requires mobile layout for optimal UX

**Why this grouping:**
- Plugin system is standalone, no dependencies on other features
- Mobile UI restructure affects all views (terminals, history, activity), best done before adding new view
- Activity timeline integrates with both plugins (event renderers) and mobile UI (bottom sheet filters)

**How this avoids pitfalls:**
- Plugin complexity assessed early (Phase 1), prevents over-engineering cascade
- Mobile strategy decided before implementation (Phase 2), prevents late discovery of xterm.js limitations
- Activity timeline security and performance designed from start (Phase 3), prevents retrofit of ANSI stripping and retention

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (Mobile UI):** xterm.js mobile touch support evaluation — test on real devices, investigate alternatives (read-only, custom handlers, alternative terminal libraries), document decision rationale
- **Phase 3 (Activity Timeline):** Terminal output parsing patterns for Claude Code agents — analyze real terminal logs, identify tool call signatures, design pattern allowlist, validate parsing accuracy

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Plugin Registry):** Well-documented TypeScript registry pattern, Vite glob imports proven in production, React dynamic components established pattern
- **Phase 2 (Mobile UI - layout):** Mobile-first CSS is established practice, Tailwind responsive utilities well-documented, media query hooks standard React pattern
- **Phase 3 (Activity Timeline - storage):** SQLite virtual columns and FTS5 well-documented, Activity Stream Protocol established standard, audit logging patterns mature

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All dependencies actively maintained (2024-2025 releases), TypeScript support confirmed, React 19 compatibility verified, bundle size acceptable |
| Features | HIGH | Feature landscape validated against competitors (VS Code, GitHub, Material Design 3), MVP definition clear, anti-features documented with rationale |
| Architecture | HIGH | Integration points identified, component boundaries clear, database schema validated, existing infrastructure sufficient |
| Pitfalls | HIGH | All 8 critical pitfalls verified with 2025-2026 sources, mitigations documented, phase-specific warnings mapped |

**Overall confidence:** HIGH

Research is comprehensive and current (2025-2026 sources). All major decisions have documented rationale. Risks are identified with mitigation strategies.

### Gaps to Address

**Medium-confidence areas requiring validation during implementation:**

1. **@gravity-ui/timeline stability:** Library is newer (2024), backed by Yandex Gravity UI team but less mature than react-window. Monitor stability during Phase 3. **Fallback:** Custom virtualized list with IntersectionObserver if timeline library proves unstable.

2. **Activity event volume estimation:** Unknown how many events per hour agents generate. Affects polling interval (10s vs manual refresh) and storage growth rate. **Validation:** Monitor event volume in Phase 3 development, adjust retention policy and polling if needed.

3. **Terminal output parsing accuracy:** Can we reliably parse ANSI output for tool calls, file edits, commands? Or do we need structured logging from agents? **Validation:** Analyze real terminal logs in Phase 3 research, test regex patterns, evaluate if structured logging needed.

4. **Mobile terminal UX acceptance:** Will operators accept read-only mobile terminal or demand full interactivity? **Validation:** User testing with read-only mobile terminal in Phase 2, document limitations clearly.

**Handling during planning:**
- Test @gravity-ui/timeline with sample 1000+ event dataset in Phase 3 kickoff
- Implement monitoring for event volume, database size, query performance from Phase 3 start
- Allocate time in Phase 3 for pattern refinement based on real logs
- Build read-only mobile terminal first (Phase 2), add interactivity only if user feedback demands it

## Sources

### Primary (HIGH confidence)

**Stack Research:**
- [ansi_up GitHub](https://github.com/drudru/ansi_up) — ANSI parsing library, 6.0.2 verified
- [react-modal-sheet GitHub](https://github.com/Temzasse/react-modal-sheet) — Mobile bottom sheet component
- [Gravity UI Timeline](https://gravity-ui.com/libraries/timeline) — Virtualized timeline library
- [Vite Features - Dynamic Imports](https://vite.dev/guide/features) — import.meta.glob documentation
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html) — Full-text search official docs
- [SQLite JSON Virtual Columns - DB Pro Blog](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing) — Indexing patterns

**Features Research:**
- [Visual Studio Code Extension API](https://code.visualstudio.com/api/references/extension-manifest) — Plugin manifest patterns
- [GitHub Activity Feed](https://docs.github.com/en/rest/activity) — Activity Stream Protocol
- [Material Design 3 - Bottom Sheets](https://m3.material.io/components/bottom-sheets/guidelines) — Mobile UI patterns
- [xterm.js Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377) — Touch support limitations (July 2025)

**Architecture Research:**
- [Registry Pattern - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/registry-pattern) — Plugin registry architecture
- [Microservices Audit Logging Pattern](https://microservices.io/patterns/observability/audit-logging.html) — Event logging patterns
- [React Media Query Hook](https://react.wiki/hooks/custom-use-media-query/) — Responsive design hooks
- [Framer Breakpoints Guide 2026](https://www.framer.com/blog/responsive-breakpoints/) — Mobile-first breakpoints

**Pitfalls Research:**
- [Don't Trust This Title: ANSI Escape Security](https://www.cyberark.com/resources/threat-research-blog/dont-trust-this-title-abusing-terminal-emulators-with-ansi-escape-characters) — ANSI vulnerabilities
- [ANSI Terminal Security 2023 - 10 CVEs](https://dgl.cx/2023/09/ansi-terminal-security) — RCE vulnerabilities
- [Deceiving Users with ANSI in MCP](https://blog.trailofbits.com/2025/04/29/deceiving-users-with-ansi-terminal-codes-in-mcp/) — 2025 AI tool attacks
- [Socket.IO Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery) — Official documentation
- [SQLite WAL Mode](https://sqlite.org/wal.html) — Checkpoint starvation
- [Why Responsive Design Still Fails In 2025](https://blog.imagine.bo/responsive-design-still-fails/) — Mobile-first pitfalls
- [Node.js Memory Leak Patches](https://securityonline.info/node-js-patches-memory-leak-and-permission-bypasses/) — CVE-2025-55131, CVE-2025-59464

### Secondary (MEDIUM confidence)

- [Slash Engineering: Scaling TypeScript with Registries](https://puzzles.slash.com/blog/scaling-1m-lines-of-typescript-registries) — Type-safe registry patterns
- [Comparing React Timeline Libraries - LogRocket](https://blog.logrocket.com/comparing-best-react-timeline-libraries/) — Timeline component evaluation
- [DhiWise: React Mobile Responsiveness](https://www.dhiwise.com/post/the-ultimate-guide-to-achieving-react-mobile-responsiveness/) — Responsive patterns

### Tertiary (needs validation)

- [Tambo 1.0: React Component Rendering Agents](https://aitoolly.com/ai-news/article/2026-02-11-tambo-10-open-source-toolkit-for-agents-rendering-react-components-launched) — Dynamic component rendering (new, unproven)

---

*Research completed: 2026-02-16*
*Ready for roadmap: yes*
