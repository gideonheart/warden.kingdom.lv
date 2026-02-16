# Feature Landscape: Mission Control v2.0

**Domain:** Terminal multiplexer dashboard for OpenClaw agent sessions — v2.0 milestone (plugin registry, activity timeline, mobile UI)
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

This research covers three distinct feature domains for Warden Dashboard v2.0, building on top of the existing v1.x foundation (live terminal streaming, session tabs, prompt panel, agent sidebar, session history, token usage, log viewer):

1. **Plugin/Tool Registry** — Type-safe registration, metadata-driven discovery, UI rendering
2. **Agent Activity/Audit Timeline** — Structured event capture, terminal output parsing, audit trail
3. **Mobile-First UI** — Responsive terminal emulator, touch gestures, bottom-sheet actions, collapsible panels

Each domain has clear table stakes (expected behavior), differentiators (competitive advantages), and anti-features (commonly requested but problematic).

**Key insight:** These features are NOT independent. Plugin registry enables activity timeline extensions (custom event parsers as plugins). Mobile UI must work with both terminals AND activity feeds. Design for composition, not isolation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Plugin Registry — Metadata Display** | Users need to see what plugins are loaded, their version, status | LOW | Manifest schema |
| **Plugin Registry — Manual Enable/Disable** | Core registry UX — users must control which plugins are active | LOW | Metadata display |
| **Activity Timeline — Chronological Event List** | Audit logs/activity feeds are always time-ordered | LOW | SQLite events table |
| **Activity Timeline — Event Detail Panel** | Users need to see full context of an event when selected | LOW | Event list |
| **Activity Timeline — Filter by Agent** | Multi-agent system — users need to scope timeline to one agent | LOW | Existing agent filter logic |
| **Activity Timeline — Date Range Filter** | Standard audit log feature — users want to scope by time | MEDIUM | Existing history date filter |
| **Activity Timeline — Export to CSV/JSON** | Audit compliance — users can export activity logs for analysis | LOW | Event list |
| **Mobile UI — Full-Width Responsive Layout** | Mobile-first = 100% width on phone, adaptive on tablet | LOW | Tailwind responsive utilities |
| **Mobile UI — Touch Scrolling** | Mobile terminals must support native touch scroll | MEDIUM | xterm.js custom touch handler |
| **Mobile UI — Collapsible Panels (Accordion)** | Mobile screen space is scarce — panels must collapse | MEDIUM | Agent details, session logs, token usage |
| **Mobile UI — Bottom Navigation or Bottom Sheet** | Mobile convention for actions/CTAs at thumb-reachable zone | MEDIUM | Prompt panel redesign |
| **Mobile UI — Safe Zone at Top (64px)** | When bottom sheet expands, maintain 64px top safe zone for context | LOW | Bottom sheet layout |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable and potentially unique to Warden.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Plugin Registry — Type-Safe Registration (Build-Time)** | Compile-time guarantees prevent broken plugins at runtime | MEDIUM | Manifest schema, TypeScript |
| **Plugin Registry — Manifest Pattern** | Co-locate plugin metadata + code + UI config in single manifest | MEDIUM | Type-safe registration |
| **Plugin Registry — UI Panel Slots** | Plugins can inject custom UI panels (not just backend tools) | HIGH | Manifest pattern, React lazy loading |
| **Activity Timeline — Structured Event Parsing from Terminal Output** | Parse ANSI terminal output into structured events (tool calls, file edits, commands) | HIGH | Event list, regex/ANSI parser |
| **Activity Timeline — Activity Stream Protocol (Actor/Verb/Object/Target)** | Structured events follow standard: "Agent → Executed → Command → in Session X" | MEDIUM | Event schema |
| **Activity Timeline — Linked Events (Context)** | Click a terminal output event → jump to terminal session at that timestamp | MEDIUM | session_logs table, terminal scroll API |
| **Activity Timeline — Success/Failure State Indicators** | Events show whether action succeeded or failed (exit code, error messages) | LOW | Event parsing, metadata |
| **Mobile UI — Predictive Touch Input (Mosh Pattern)** | Display keystrokes instantly without waiting for server roundtrip | HIGH | Custom xterm.js addon, optimistic rendering |
| **Mobile UI — Progressive Enhancement (Desktop → Mobile)** | Start with mobile base styles, add desktop features via min-width breakpoints | LOW | Mobile-first CSS |
| **Mobile UI — Gesture Library (Swipe, Pinch)** | Native-feeling gestures for tab switching, terminal zoom | MEDIUM | Hammer.js, xterm.js integration |
| **Mobile UI — Offline-First with Service Worker** | Cache UI shell and recent sessions for offline terminal viewing | HIGH | Service worker, IndexedDB |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Document to prevent scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Plugin Registry — Auto-Install from Public Registry** | Convenience (npm-like plugin install) | Security risk (arbitrary code execution), complexity (sandboxing, versioning, updates) | Manual install from known sources only, documented install process |
| **Plugin Registry — Plugin Marketplace UI** | Discoverability | Scope creep for v2.0, requires hosting, moderation, legal (ToS, liability) | Documentation page with recommended plugins, GitHub topic tags |
| **Activity Timeline — Real-Time WebSocket Streaming of Every Event** | "Live updates feel modern" | Overwhelming for high-volume agents, performance bottleneck, UI churn | Polling every 10s (matches instance tracker), manual refresh button |
| **Activity Timeline — AI-Powered Event Summarization** | "Summarize last hour of activity" | API costs, latency, unreliable for audit purposes | Structured filters (event type, agent, date) + export for external analysis |
| **Activity Timeline — Immutable Event Log with Blockchain** | "Tamper-proof audit trail" | Massive overkill for single-user tool, complexity, storage bloat | SQLite with append-only writes, export to read-only CSV for archival |
| **Mobile UI — Gesture Overload (10+ Custom Gestures)** | "Power user shortcuts" | Discoverability problem, steep learning curve, conflicts with OS gestures | Stick to standard gestures (scroll, tap, swipe for tabs), explicit buttons for actions |
| **Mobile UI — Separate Mobile App (Native iOS/Android)** | "Better performance than web" | Development/maintenance cost 3x (iOS + Android + Web), distribution hassle (App Store) | Progressive Web App (PWA) with native-like UX, add to home screen |
| **Mobile UI — Mobile-Specific Feature Parity Reduction** | "Mobile users don't need full features" | Users resent being treated as second-class citizens | Full feature parity on mobile, just different UI patterns (bottom sheets vs sidebars) |

---

## Feature Dependencies

```
Plugin Registry — Metadata Display
    └──requires──> Plugin Registry — Manifest Schema

Plugin Registry — UI Panel Slots
    └──requires──> Plugin Registry — Manifest Schema
    └──requires──> Plugin Registry — Type-Safe Registration

Plugin Registry — Type-Safe Registration
    └──requires──> Plugin Registry — Manifest Schema

Activity Timeline — Chronological Event List
    └──requires──> SQLite events table (new)

Activity Timeline — Structured Event Parsing
    └──requires──> Activity Timeline — Event Detail Panel
    └──enhances──> Activity Timeline — Linked Events (Context)

Activity Timeline — Linked Events (Context)
    └──requires──> session_logs table (existing)
    └──requires──> Activity Timeline — Event Detail Panel

Activity Timeline — Success/Failure State Indicators
    └──requires──> Activity Timeline — Structured Event Parsing

Mobile UI — Bottom Sheet
    └──requires──> Mobile UI — Collapsible Panels (accordion)
    └──enhances──> Prompt Panel (existing)

Mobile UI — Touch Scrolling
    └──requires──> xterm.js addon or custom handler
    └──conflicts──> xterm.js default mouse handling

Mobile UI — Predictive Touch Input (Mosh Pattern)
    └──requires──> Mobile UI — Touch Scrolling
    └──conflicts──> Socket.IO buffering (requires custom buffering)

Mobile UI — Gesture Library
    └──requires──> Mobile UI — Touch Scrolling
    └──conflicts──> xterm.js default touch handling

Mobile UI — Progressive Enhancement
    └──requires──> Mobile UI — Full-Width Responsive Layout
```

### Dependency Notes

- **Plugin Registry — Type-Safe Registration requires Manifest Schema**: Manifest is the source of truth for plugin metadata; registration enforces the schema at build time (TypeScript `interface` + Zod/Ajv validation).
- **Activity Timeline — Structured Event Parsing enhances Linked Events**: Parsing terminal output into structured events enables "click event → jump to terminal at timestamp" UX. Without parsing, timeline is just a dumb log.
- **Mobile UI — Touch Scrolling conflicts with xterm.js default mouse handling**: xterm.js has limited touch support as of 2026 ([Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377)); custom touch handler may be needed. Investigate xterm.js addon ecosystem first.
- **Mobile UI — Predictive Touch Input conflicts with Socket.IO buffering**: Mosh-style instant echo requires custom buffering logic to avoid double-rendering when server echo arrives. High complexity, defer to v3+.
- **Mobile UI — Bottom Sheet enhances existing Prompt Panel**: Move PromptPanel into bottom sheet on mobile for thumb-reachable prompt injection. Desktop keeps sidebar. Same component, different layout.

---

## MVP Definition

### Launch With (v2.0)

Minimum viable feature set for v2.0 milestone. Validates core concepts.

#### Plugin Registry (P1)
- [ ] **Manifest Schema** — JSON schema for plugin metadata (name, version, description, enabled, dependencies)
- [ ] **Metadata Display** — Table of plugins with name, version, status (active/inactive), description
- [ ] **Manual Enable/Disable** — Toggle button per plugin, persists to `~/.openclaw/warden-plugins.json`

#### Activity Timeline (P1)
- [ ] **SQLite Events Table** — Schema: `{ id, agent_id, event_type, actor, verb, object, target, metadata, timestamp, success }`
- [ ] **Chronological Event List** — Time-sorted list of agent activity events (newest first)
- [ ] **Event Detail Panel** — Click event → see full metadata (actor, verb, object, target, timestamp, success/failure)
- [ ] **Filter by Agent** — Dropdown to scope timeline to single agent (reuse existing filter component)
- [ ] **Date Range Filter** — Start/end date picker for time-scoped queries (reuse existing history filter)
- [ ] **Export to CSV/JSON** — Download button for audit compliance

#### Mobile UI (P1)
- [ ] **Full-Width Responsive Layout** — App renders correctly on 375px (iPhone SE) to 1920px (desktop)
- [ ] **Collapsible Panels (Accordion)** — Agent details, session logs, token usage collapse on mobile (<768px)
- [ ] **Bottom Navigation/Bottom Sheet** — Prompt panel moves to bottom sheet on mobile, sidebar on desktop
- [ ] **Touch Scrolling** — Terminal supports native touch scroll (custom handler if xterm.js addon unavailable)
- [ ] **Safe Zone at Top (64px)** — Bottom sheet full-height maintains 64px top margin for context

### Add After Validation (v2.x)

Features to add once core is working and usage patterns emerge.

#### Plugin Registry (P2)
- [ ] **Type-Safe Registration (Build-Time)** — Enforce manifest schema at compile time with TypeScript + Zod
- [ ] **Manifest Pattern** — Co-locate plugin metadata + code + UI config in `src/plugins/{pluginName}/manifest.ts`

#### Activity Timeline (P2)
- [ ] **Structured Event Parsing** — Parse terminal output for tool calls (`Edited file X`), file edits, commands (`$ git commit`)
- [ ] **Activity Stream Protocol** — Standardize event schema (Actor/Verb/Object/Target): `"Warden → Edited → server.ts → in warden-dashboard-abc123"`
- [ ] **Success/Failure State Indicators** — Green dot for success, red for failure, amber for partial (parse exit codes, error keywords)
- [ ] **Linked Events (Context)** — Click event → jump to terminal session at timestamp (requires session_logs offset mapping)

#### Mobile UI (P2)
- [ ] **Progressive Enhancement** — Mobile-first CSS with desktop enhancements via `@media (min-width: 768px)`
- [ ] **Gesture Library** — Swipe left/right for tab switching, pinch to zoom terminal font size

### Future Consideration (v3+)

Features to defer until product-market fit is established and v2.0 is stable.

#### Plugin Registry (P3)
- [ ] **UI Panel Slots** — Plugins inject custom React components into dashboard (e.g., custom metrics panel)

#### Mobile UI (P3)
- [ ] **Predictive Touch Input (Mosh Pattern)** — Instant keystroke echo without server roundtrip
- [ ] **Offline-First with Service Worker** — Cache UI shell and sessions for offline viewing

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| **Plugin Registry — Manifest Schema** | MEDIUM | MEDIUM | P1 |
| Plugin Registry — Metadata Display | HIGH | LOW | P1 |
| Plugin Registry — Manual Enable/Disable | HIGH | LOW | P1 |
| Plugin Registry — Type-Safe Registration | MEDIUM | MEDIUM | P2 |
| Plugin Registry — Manifest Pattern | MEDIUM | MEDIUM | P2 |
| Plugin Registry — UI Panel Slots | LOW | HIGH | P3 |
| **Activity Timeline — SQLite Events Table** | HIGH | MEDIUM | P1 |
| Activity Timeline — Chronological Event List | HIGH | LOW | P1 |
| Activity Timeline — Event Detail Panel | HIGH | LOW | P1 |
| Activity Timeline — Filter by Agent | HIGH | LOW | P1 |
| Activity Timeline — Date Range Filter | MEDIUM | MEDIUM | P1 |
| Activity Timeline — Export to CSV/JSON | MEDIUM | LOW | P1 |
| Activity Timeline — Structured Event Parsing | HIGH | HIGH | P2 |
| Activity Timeline — Activity Stream Protocol | MEDIUM | MEDIUM | P2 |
| Activity Timeline — Success/Failure State Indicators | MEDIUM | LOW | P2 |
| Activity Timeline — Linked Events (Context) | MEDIUM | MEDIUM | P2 |
| **Mobile UI — Full-Width Responsive Layout** | HIGH | LOW | P1 |
| Mobile UI — Collapsible Panels | HIGH | MEDIUM | P1 |
| Mobile UI — Bottom Sheet | HIGH | MEDIUM | P1 |
| Mobile UI — Touch Scrolling | HIGH | MEDIUM | P1 |
| Mobile UI — Safe Zone at Top | LOW | LOW | P1 |
| Mobile UI — Progressive Enhancement | MEDIUM | LOW | P2 |
| Mobile UI — Gesture Library | MEDIUM | MEDIUM | P2 |
| Mobile UI — Predictive Touch Input | LOW | HIGH | P3 |
| Mobile UI — Offline-First | LOW | HIGH | P3 |

**Priority key:**
- **P1**: Must have for v2.0 launch (table stakes or high-value/low-cost differentiators)
- **P2**: Should have for v2.x after validation (medium-value differentiators, enhance P1 features)
- **P3**: Nice to have for v3+ (low-value or high-cost, defer until product-market fit)

---

## Competitor / Reference Analysis

| Feature | VS Code Extensions | GitHub Activity Feed | Mosh (Mobile Shell) | Material Design 3 | Our Approach |
|---------|-------------------|---------------------|---------------------|-------------------|--------------|
| **Plugin Discovery** | Marketplace UI with search, ratings, install counts | N/A | N/A | N/A | Manual install only (v2.0), avoid marketplace scope creep |
| **Plugin Metadata** | `package.json` manifest with `publisher`, `version`, `engines`, `activationEvents` | N/A | N/A | N/A | JSON schema manifest with name, version, description, enabled state, dependencies |
| **Plugin Registration** | Extension API with `activate()` function, contribution points | N/A | N/A | N/A | Type-safe registration via manifest + PluginManager class |
| **Activity Timeline** | N/A | Actor/Verb/Object format ("user pushed to repo") | N/A | N/A | Activity Stream Protocol (Actor/Verb/Object/Target) |
| **Event Filtering** | N/A | Filter by actor, repo, event type, date | N/A | N/A | Filter by agent, date range, event type (parsed from terminal output) |
| **Event Detail** | N/A | Click event → expand inline with metadata + diff | N/A | N/A | Right-rail panel with full event metadata + link to terminal session |
| **Mobile Terminal** | N/A | N/A | Predictive input (instant echo), adaptive to bad connections | N/A | Touch scrolling (custom handler for xterm.js), bottom sheet for actions |
| **Mobile Navigation** | N/A | N/A | N/A | Bottom nav bar, bottom sheets for modals | Bottom sheet for prompt panel, collapsible accordions for agent details |
| **Collapsible Panels** | N/A | N/A | N/A | Accordion component (Material 3) | Accordion for agent details, session logs, token usage on mobile |
| **Offline Support** | N/A | N/A | Mosh maintains connection state across network changes | N/A | Defer to v3+ (service worker + IndexedDB cache) |

---

## Domain-Specific Patterns

### Plugin Registries (VS Code, Chrome Extensions, Open VSX)

**What they do well:**
- **Manifest-driven registration**: `package.json` or `manifest.json` as source of truth for metadata
- **Versioning**: SemVer, compatibility declarations (`"engines": { "vscode": "^1.80.0" }`)
- **Activation events**: Load plugins lazily when needed (`"activationEvents": ["onCommand:myPlugin.run"]`)

**Common gaps:**
- **No build-time type safety**: Manifest schema validated at runtime, not compile time
- **Complex marketplace**: VS Code Marketplace is proprietary, requires Microsoft account, moderation

**Lesson for Warden:** Use manifest pattern, enforce with TypeScript + Zod at build time. Skip marketplace (single-user tool, manual install). Support lazy loading via React.lazy for UI plugins.

### Activity Timelines (GitHub, SugarCRM, Microsoft Purview)

**What they do well:**
- **Activity Stream Protocol**: Standardized event format (Actor/Verb/Object/Target)
- **Event detail panels**: Click event → see full context in right rail or modal
- **Filter by multiple dimensions**: Actor, date range, event type, object type
- **Immutability**: Audit logs are append-only, cannot be altered after creation
- **Export to CSV/JSON**: Compliance requirement for audit trails

**Common gaps:**
- **No linkage to source context**: GitHub shows diff, but can't jump to file at that commit in IDE
- **No structured parsing of unstructured data**: Logs are structured (API calls) OR unstructured (terminal output), not both

**Lesson for Warden:** Parse terminal ANSI output into structured events (regex for known patterns: `Edited file X`, `Running command Y`, `Error: Z`). Link events to terminal session at timestamp (requires session_logs offset mapping). Export to CSV/JSON for audit compliance.

### Mobile-First Dashboards (Material Design 3, Toptal Best Practices)

**What they do well:**
- **Bottom navigation**: Primary actions at thumb-reachable zone (bottom 64px)
- **Bottom sheets**: Modals slide up from bottom, partial (peek) or full-screen
- **Collapsible accordions**: Save vertical space, progressive disclosure
- **Card-based layouts**: Each metric/widget in a self-contained card
- **Touch target sizing**: Minimum 44x44px (iOS) or 48x48px (Android)

**Common gaps:**
- **Terminal emulators on mobile**: Limited touch support in xterm.js, predictive keyboards break input
- **Offline-first**: Most dashboards require constant network connection

**Lesson for Warden:** Bottom sheet for prompt panel (thumb-reachable). Collapsible accordions for agent details, session logs, token usage. Custom touch handler for xterm.js scrolling. Defer offline-first to v3+ (complex, low value for initial release).

---

## Research Gaps & Validation Needed

**MEDIUM confidence areas (require verification during implementation):**

1. **xterm.js touch support in 2026:** Has xterm.js added first-class touch support since Issue #5377? Check npm for xterm-addon-touch or similar.
   - **Impact:** Mobile UI — Touch Scrolling complexity (LOW if addon exists, MEDIUM if custom handler)
   - **Mitigation:** Start with xterm.js default touch handling, add custom handler only if needed

2. **Activity event volume:** How many events per hour do agents generate? Will 10s polling overwhelm the UI?
   - **Impact:** Activity Timeline — Real-time streaming vs polling decision
   - **Mitigation:** Start with manual refresh button, add 10s polling if event volume is manageable (<100/hour)

3. **Terminal output parsing accuracy:** Can we reliably parse ANSI output for tool calls, file edits, commands? Or do we need structured logging from agents?
   - **Impact:** Activity Timeline — Structured Event Parsing feasibility (HIGH if reliable, defer if unreliable)
   - **Mitigation:** Start with simple regex patterns (e.g., `Edited file (.+)`), expand as patterns emerge. Fallback: require agents to log structured JSON events to separate file.

4. **Plugin use cases:** What plugins will operators actually want? Custom metrics? Event parsers? UI panels?
   - **Impact:** Plugin Registry — UI Panel Slots priority (P3 if no demand, P2 if clear use cases)
   - **Mitigation:** Ship P1 (metadata display, enable/disable) first, gather feedback before building UI slots

---

## Feature Research Sources

### Plugin Registry Research

- [Registry Pattern - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/registry-pattern/)
- [Optimizing Software Architecture with Plugins | ArjanCodes](https://arjancodes.com/blog/best-practices-for-decoupling-software-using-plugins/)
- [How to Build Plugin Systems in Python | OneUptime](https://oneuptime.com/blog/post/2026-01-30-python-plugin-systems/view)
- [Publishing Extensions | Visual Studio Code Extension API](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Marketplace | VS Code](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [Open VSX Registry](https://open-vsx.org/)
- [Building A Type-safe Plugin System In Typescript](https://peerdh.com/blogs/programming-insights/building-a-type-safe-plugin-system-in-typescript)
- [Type-Safe User Interfaces & the Manifest Pattern | Andrew Hathaway](https://andrewhathaway.net/blog/manifest-pattern/)
- [Extension Manifest | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/extension-manifest)
- [manifest.json - Mozilla | MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)

### Activity Timeline Research

- [Activity Logs | Business Central Design Patterns](https://alguidelines.dev/docs/navpatterns/patterns/activity-log/)
- [Audit log activities | Microsoft Learn](https://learn.microsoft.com/en-us/purview/audit-log-activities)
- [Audit Logging: What It Is & How It Works | Datadog](https://www.datadoghq.com/knowledge-center/audit-logging/)
- [Historical Summary vs. Activity Stream vs. Audit Log vs. Timeline | Sugar Support](https://support.sugarcrm.com/knowledge_base/user_interface/historical_summary_vs._activity_stream_vs._change_log/)
- [Audit Logs Overview | Adobe Experience Platform](https://experienceleague.adobe.com/en/docs/experience-platform/landing/governance-privacy-security/audit-logs/overview)
- [Pattern: Audit logging | Microservices.io](https://microservices.io/patterns/observability/audit-logging.html)
- [Getting Started with Activity stream | HackerNoon](https://medium.com/hackernoon/getting-started-with-activity-stream-d7d5a528394c)
- [Logs vs Structured Events - charity.wtf](https://charity.wtf/2019/02/05/logs-vs-structured-events/)
- [Input Event Processing | Fish Shell](https://deepwiki.com/fish-shell/fish-shell/3.1-initialization-and-configuration)

### Mobile-First UI Research

- [Dashboard Design UX Patterns Best Practices](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Dashboard Design: best practices and examples | Justinmind](https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux)
- [Mobile First Design: Principles, Process, and Examples](https://digitalpresent.io/mobile-first-design/)
- [Intuitive Mobile Dashboard UI: 4 Best Practices | Toptal](https://www.toptal.com/designers/dashboard-design/mobile-dashboard-ui)
- [PatternFly Dashboard Guidelines](https://www.patternfly.org/patterns/dashboard/design-guidelines/)
- [Bottom Sheet UI Design: Best practices | Mobbin](https://mobbin.com/glossary/bottom-sheet)
- [Bottom Sheets: Definition and UX Guidelines - Nielsen Norman Group](https://www.nngroup.com/articles/bottom-sheet/)
- [Bottom sheets - Material Design 3](https://m3.material.io/components/bottom-sheets/guidelines)
- [How to design bottom sheets for optimized user experience | LogRocket](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)
- [Accordion UI Design: Best practices | Mobbin](https://mobbin.com/glossary/accordion)
- [Accordions on Mobile - Nielsen Norman Group](https://www.nngroup.com/articles/mobile-accordions/)
- [Accordion UI Examples: Best Practices | Eleken](https://www.eleken.co/blog-posts/accordion-ui)
- [Limited touch support on mobile devices | xterm.js Issue #5377](https://github.com/xtermjs/xterm.js/issues/5377)
- [Support mobile platforms | xterm.js Issue #1101](https://github.com/xtermjs/xterm.js/issues/1101)
- [Mosh: the mobile shell](https://mosh.org/)
- [Learning From Terminals to Design the Future of User Interfaces](https://brandur.org/interfaces)

---

*Feature research for: Warden Dashboard v2.0 Mission Control (plugin registry, activity timeline, mobile UI)*
*Researched: 2026-02-16*
*Confidence: HIGH (verified via official docs, GitHub issues, and multiple authoritative sources)*
