# Phase 9: Plugin Registry Foundation - Research

**Researched:** 2026-02-17
**Domain:** Vite glob imports, TypeScript build-time validation, React plugin slot rendering
**Confidence:** HIGH

## Summary

Phase 9 implements a plugin registry system where operator-facing plugin modules are auto-discovered at build time via Vite's `import.meta.glob`, type-validated at compile time using TypeScript's `satisfies` operator, and rendered into designated UI layout slots (sidebar-top, sidebar-bottom, bottom-panel, terminal-overlay). The system must remain lightweight — the explicit constraint is under 200 LOC with no module federation.

The technical foundation is already fully established in the project. Vite 6 (already in use) natively supports `import.meta.glob` with TypeScript generic typing. React 19 (already in use) provides all state management primitives needed for enable/disable toggles. `localStorage` persistence requires only a custom hook using existing `useState` + `useEffect`. No new npm packages are needed.

The pattern is: each plugin is a single `.tsx` file in `src/client/plugins/` that exports a `default` conforming to the `PluginModule` interface (`manifest` metadata + `PanelComponent` React component). The registry auto-discovers all plugin files at build time, validates manifest shape via `satisfies PluginManifest`, and the `PluginRegistryView` table plus `PluginSlotRenderer` handle UI rendering.

**Primary recommendation:** Use `import.meta.glob<{ default: PluginModule }>('./plugins/*.tsx', { eager: true, import: 'default' })` for auto-discovery, `as const satisfies PluginManifest` in each plugin file for build-time validation, `Record<string, boolean>` in localStorage for enabled state persistence, and named-prop slot pattern for rendering plugins into designated layout slots in `App.tsx`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLUG-01 | Operator can register tool modules with typed metadata (name, version, description, capabilities) | `PluginManifest` interface + `as const satisfies PluginManifest` in each plugin file; auto-discovered by glob |
| PLUG-02 | Operator can view a metadata table showing all registered plugins with status | `PluginRegistryView` component reads `Record<string, PluginModule>` from registry; renders table with toggle column |
| PLUG-03 | Operator can enable/disable plugins via toggle | `useState<Record<string, boolean>>` initialized from `localStorage` + `useEffect` persistence; toggle flips key |
| PLUG-04 | Plugin modules use build-time type-safe TypeScript registration | `as const satisfies PluginManifest` on each plugin's exported manifest catches shape violations at compile time |
| PLUG-05 | Plugins render as UI panels in designated layout slots (sidebar-top, sidebar-bottom, bottom-panel, terminal-overlay) | Named-prop slot pattern in `App.tsx`: `type PluginSlot = 'sidebar-top' | 'sidebar-bottom' | 'bottom-panel' | 'terminal-overlay'`; `PluginSlotRenderer` filters and renders per slot |
| PLUG-06 | Plugin code, metadata, and UI are co-located in a single module file | One `.tsx` per plugin with `export default { manifest, PanelComponent }` pattern — no separate files needed |
</phase_requirements>

## Standard Stack

### Core (All already in project — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 6.0.0 | `import.meta.glob` for auto-discovery | Native feature, eager mode = build-time static imports |
| TypeScript | 5.7.0 | `satisfies` operator for manifest validation | Available since TS 4.9; strict mode already enabled |
| React | 19.0.0 | `useState` + `useEffect` for toggle state | All hooks needed are already imported across the codebase |
| Tailwind CSS v4 | 4.x | Plugin registry table and panel styling | Already configured with `warden-*` tokens |

### Supporting (Already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | 1.58.2 | E2E tests for plugin registry UI | Test toggle behavior, table rendering, panel appearance |
| `ErrorBoundary` | existing | Wrap plugin panels to prevent crash propagation | Already used for TerminalView; reuse for plugin panels |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `import.meta.glob` eager | Dynamic `import()` + manual registration | Dynamic import requires explicit calls; glob is zero-touch auto-discovery |
| `localStorage` custom hook | `use-local-storage-state` npm package | npm package adds dependency; custom hook is ~15 LOC, stays in budget |
| Named-prop slot pattern | React Context slot provider | Context adds complexity; named props in `App.tsx` is explicit and simple |
| `satisfies PluginManifest` | Runtime Zod validation | Zod adds dependency and runtime overhead; build-time TypeScript is sufficient |
| Module Federation | Vite glob + eager | Module Federation is extreme over-engineering for a build-time-only registry |

**Installation:**

```bash
# No new packages required. All dependencies already installed.
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── client/
│   ├── plugins/                      # Plugin directory — new
│   │   ├── example-plugin.tsx        # First demo plugin (co-located manifest + UI)
│   │   └── index.ts                  # Registry auto-discovery entry
│   ├── hooks/
│   │   └── usePluginRegistry.ts      # Plugin state management hook — new
│   ├── components/
│   │   ├── PluginRegistryView.tsx    # Metadata table with toggles — new
│   │   └── PluginSlotRenderer.tsx    # Renders plugin panels into layout slots — new
│   └── App.tsx                       # Extended with plugin slot rendering points
└── shared/
    └── pluginTypes.ts                # PluginManifest, PluginModule, PluginSlot types — new
```

### Pattern 1: Plugin Module File (PLUG-01, PLUG-04, PLUG-06)

**What:** Each plugin is a single `.tsx` file with co-located manifest + React component. The `as const satisfies PluginManifest` pattern validates the manifest shape at compile time.

**When to use:** Every new plugin file follows this exact template.

**Example:**
```typescript
// src/client/plugins/example-plugin.tsx
// Source: TypeScript 4.9 satisfies operator docs + Vite glob import docs

import type { PluginModule } from '../../shared/pluginTypes.js';

const manifest = {
  id: 'example-plugin',
  name: 'Example Plugin',
  version: '1.0.0',
  description: 'Demonstrates the plugin registry system',
  slot: 'sidebar-bottom',
  capabilities: ['read-sessions'],
} as const satisfies import('../../shared/pluginTypes.js').PluginManifest;

function ExamplePluginPanel() {
  return (
    <div className="p-3 text-xs text-warden-text-dim">
      Example plugin panel rendered in sidebar-bottom slot.
    </div>
  );
}

export default {
  manifest,
  PanelComponent: ExamplePluginPanel,
} satisfies PluginModule;
```

### Pattern 2: Auto-Discovery Registry (PLUG-04)

**What:** `import.meta.glob` with `{ eager: true, import: 'default' }` gives a fully typed `Record<string, PluginModule>` at build time — zero manual imports.

**When to use:** In `src/client/plugins/index.ts` as the single source of truth.

**Example:**
```typescript
// src/client/plugins/index.ts
// Source: https://vite.dev/guide/features (Glob Import section)

import type { PluginModule } from '../../shared/pluginTypes.js';

// import.meta.glob arguments MUST be string literals (no variables)
const pluginModules = import.meta.glob<PluginModule>(
  './*.tsx',
  { eager: true, import: 'default' }
);

// Convert file-path keys to plugin IDs using manifest.id
export const registeredPlugins: Record<string, PluginModule> =
  Object.fromEntries(
    Object.values(pluginModules).map((plugin) => [plugin.manifest.id, plugin])
  );
```

**TypeScript note:** For `import.meta.glob` to be recognized, `tsconfig.json` needs `"types": ["vite/client"]` OR `moduleResolution: "bundler"` (already set). Vite's bundler resolution mode auto-provides `import.meta` types.

### Pattern 3: Enable/Disable State with Persistence (PLUG-03)

**What:** Custom hook initializes enabled state from `localStorage`, persists changes via `useEffect`.

**When to use:** In `usePluginRegistry.ts` — single hook for all plugin state.

**Example:**
```typescript
// src/client/hooks/usePluginRegistry.ts

import { useState, useEffect, useCallback } from 'react';
import { registeredPlugins } from '../plugins/index.js';
import type { PluginModule } from '../../shared/pluginTypes.js';

const STORAGE_KEY = 'warden:plugin-enabled';

function loadPersistedState(pluginIds: string[]): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed: Record<string, boolean> = saved ? JSON.parse(saved) : {};
    // Default to enabled for any new plugin not yet in storage
    return Object.fromEntries(
      pluginIds.map((id) => [id, parsed[id] ?? true])
    );
  } catch {
    return Object.fromEntries(pluginIds.map((id) => [id, true]));
  }
}

export function usePluginRegistry() {
  const plugins = registeredPlugins; // Record<string, PluginModule>
  const pluginIds = Object.keys(plugins);

  const [enabledState, setEnabledState] = useState<Record<string, boolean>>(
    () => loadPersistedState(pluginIds)
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledState));
    } catch {
      // localStorage may be unavailable (private browsing, quota)
    }
  }, [enabledState]);

  const togglePlugin = useCallback((pluginId: string) => {
    setEnabledState((prev) => ({ ...prev, [pluginId]: !prev[pluginId] }));
  }, []);

  const enabledPlugins: PluginModule[] = pluginIds
    .filter((id) => enabledState[id])
    .map((id) => plugins[id]);

  return { plugins, enabledState, enabledPlugins, togglePlugin };
}
```

### Pattern 4: Plugin Metadata Table (PLUG-02)

**What:** `PluginRegistryView` renders a table of all registered plugins with enable/disable toggles. Accessed via a new "Plugins" nav button in the App header.

**Example:**
```typescript
// src/client/components/PluginRegistryView.tsx

interface PluginRegistryViewProps {
  plugins: Record<string, PluginModule>;
  enabledState: Record<string, boolean>;
  onToggle: (pluginId: string) => void;
}

export function PluginRegistryView({ plugins, enabledState, onToggle }: PluginRegistryViewProps) {
  const entries = Object.values(plugins);

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="text-sm font-semibold text-warden-text mb-3">Plugin Registry</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-warden-text-dim border-b border-warden-border">
            <th className="text-left py-1.5 pr-4">Name</th>
            <th className="text-left py-1.5 pr-4">Version</th>
            <th className="text-left py-1.5 pr-4">Description</th>
            <th className="text-left py-1.5 pr-4">Slot</th>
            <th className="text-left py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ manifest }) => (
            <tr key={manifest.id} className="border-b border-warden-border/30">
              <td className="py-1.5 pr-4 text-warden-text font-medium">{manifest.name}</td>
              <td className="py-1.5 pr-4 text-warden-text-dim font-mono">{manifest.version}</td>
              <td className="py-1.5 pr-4 text-warden-text-dim">{manifest.description}</td>
              <td className="py-1.5 pr-4 text-warden-text-dim font-mono">{manifest.slot}</td>
              <td className="py-1.5">
                <button
                  onClick={() => onToggle(manifest.id)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    enabledState[manifest.id]
                      ? 'bg-warden-success/20 text-warden-success'
                      : 'bg-warden-border/50 text-warden-text-dim'
                  }`}
                >
                  {enabledState[manifest.id] ? 'Enabled' : 'Disabled'}
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-warden-text-dim">
                No plugins registered
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

### Pattern 5: Layout Slot Rendering (PLUG-05)

**What:** `PluginSlotRenderer` filters enabled plugins for a given slot and renders them wrapped in `ErrorBoundary`. Placed at slot injection points in `App.tsx`.

**When to use:** At each slot location in the layout — 4 fixed positions.

**Example:**
```typescript
// src/client/components/PluginSlotRenderer.tsx

import { ErrorBoundary } from './ErrorBoundary.js';
import type { PluginModule, PluginSlot } from '../../shared/pluginTypes.js';

interface PluginSlotRendererProps {
  slot: PluginSlot;
  enabledPlugins: PluginModule[];
}

export function PluginSlotRenderer({ slot, enabledPlugins }: PluginSlotRendererProps) {
  const slotPlugins = enabledPlugins.filter((p) => p.manifest.slot === slot);
  if (slotPlugins.length === 0) return null;

  return (
    <>
      {slotPlugins.map(({ manifest, PanelComponent }) => (
        <ErrorBoundary
          key={manifest.id}
          fallback={
            <div className="px-3 py-2 text-xs text-warden-error border-t border-warden-border">
              Plugin "{manifest.name}" failed to render.
            </div>
          }
        >
          <PanelComponent />
        </ErrorBoundary>
      ))}
    </>
  );
}
```

**Slot injection in App.tsx** — add `PluginSlotRenderer` at 4 positions:
```typescript
// In App.tsx sidebar section:
<PluginSlotRenderer slot="sidebar-top" enabledPlugins={enabledPlugins} />
<AgentSidebar ... />
<PluginSlotRenderer slot="sidebar-bottom" enabledPlugins={enabledPlugins} />

// In App.tsx main area:
<PluginSlotRenderer slot="bottom-panel" enabledPlugins={enabledPlugins} />

// Overlay (positioned absolutely):
<PluginSlotRenderer slot="terminal-overlay" enabledPlugins={enabledPlugins} />
```

### Pattern 6: Shared Type Definitions (PLUG-01, PLUG-04, PLUG-05)

**What:** `PluginManifest`, `PluginModule`, and `PluginSlot` in `src/shared/pluginTypes.ts` — shared between plugins and registry.

**Example:**
```typescript
// src/shared/pluginTypes.ts

import type { ComponentType } from 'react';

export type PluginSlot =
  | 'sidebar-top'
  | 'sidebar-bottom'
  | 'bottom-panel'
  | 'terminal-overlay';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  slot: PluginSlot;
  capabilities: readonly string[];
}

export interface PluginModule {
  manifest: PluginManifest;
  PanelComponent: ComponentType;
}
```

### Anti-Patterns to Avoid

- **Dynamic `import.meta.glob` argument:** `import.meta.glob(someVariable)` throws at build time. The pattern string must be a literal.
- **Module Federation for build-time registry:** Far over-engineered for this use case. The constraint says "Vite glob imports, not module federation."
- **Server-side plugin state:** Plugin enabled/disabled state is UI-only; no server route or DB table needed.
- **Rendering plugin panels outside ErrorBoundary:** Plugin code is third-party by design — it must be error-isolated so a bad plugin doesn't crash the main dashboard.
- **Storing React component in localStorage:** Only serializable manifest IDs and boolean enabled states go into localStorage, never components or functions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob file discovery | Manual import list | `import.meta.glob` | Vite handles it natively, zero-maintenance as new plugins are added |
| Build-time type safety | Runtime plugin validator | `satisfies PluginManifest` | TypeScript compiler catches errors at build time, zero runtime overhead |
| localStorage JSON | Custom serializer | `JSON.parse/stringify` with try-catch | Sufficient for boolean maps; no library needed |
| Plugin crash isolation | Custom try/catch in render | Existing `ErrorBoundary` component | Already exists in project, reuse it |

**Key insight:** The entire plugin system is a wiring job, not a build job. Vite and TypeScript provide all the infrastructure; the work is creating the right types and plumbing the 4–5 small components together.

## Common Pitfalls

### Pitfall 1: import.meta.glob TypeScript Type Errors
**What goes wrong:** `import.meta` has type `ImportMeta` which doesn't include `.glob` without proper Vite type setup.
**Why it happens:** `tsconfig.json` uses `moduleResolution: "bundler"` but doesn't always include `"vite/client"` types.
**How to avoid:** Verify `"types": ["vite/client"]` is in `tsconfig.json` `compilerOptions`. In this project, `moduleResolution: "bundler"` already handles it in Vite's context, but adding explicit `types` ensures IDE support.
**Warning signs:** TypeScript error `Property 'glob' does not exist on type 'ImportMeta'`.

### Pitfall 2: Non-Literal Glob Pattern Arguments
**What goes wrong:** Placing the glob pattern in a variable — `const pattern = './plugins/*.tsx'; import.meta.glob(pattern)` — fails at Vite build time.
**Why it happens:** Vite statically analyzes `import.meta.glob` calls; patterns must be compile-time string literals.
**How to avoid:** Always inline the glob pattern string as a literal.
**Warning signs:** Vite build error: `"import.meta.glob" argument must be a string literal`.

### Pitfall 3: Plugin Crashes Breaking Main Dashboard
**What goes wrong:** A plugin's `PanelComponent` throws during render, crashing the parent layout.
**Why it happens:** React propagates render errors up the tree unless caught by an `ErrorBoundary`.
**How to avoid:** Always wrap each `PanelComponent` in `<ErrorBoundary>` inside `PluginSlotRenderer`. The project already has a working `ErrorBoundary` class component.
**Warning signs:** Whole dashboard goes blank when a plugin is enabled.

### Pitfall 4: Storing Complex Types in localStorage
**What goes wrong:** Attempting to serialize React components or functions in localStorage throws or silently fails.
**Why it happens:** `JSON.stringify` converts functions to `undefined` and drops them.
**How to avoid:** Only persist `Record<string, boolean>` (plugin ID → enabled flag). Never serialize the `PanelComponent`.
**Warning signs:** `localStorage.getItem` returns `{}` or null unexpectedly.

### Pitfall 5: LOC Budget Exceeded by Over-Engineering
**What goes wrong:** Adding abstraction layers (plugin loader service, plugin event bus, etc.) that push past 200 LOC.
**Why it happens:** Plugin system design naturally invites premature generalization.
**How to avoid:** Enforce the complexity budget. The full implementation should be ~5 files, each under 50 LOC: `pluginTypes.ts`, `plugins/index.ts`, `usePluginRegistry.ts`, `PluginRegistryView.tsx`, `PluginSlotRenderer.tsx`. One example plugin.
**Warning signs:** Adding a new concept (plugin API, event bus, lifecycle hooks) — defer to a future phase.

### Pitfall 6: `satisfies` Operator Not on Final Export
**What goes wrong:** Using only a type annotation on the manifest (`: PluginManifest`) instead of `satisfies` loses literal type narrowing; `slot` becomes `string` instead of `'sidebar-bottom'`.
**Why it happens:** Type annotation widens to the annotated type; `satisfies` validates while preserving literals.
**How to avoid:** Use `as const satisfies PluginManifest` on the manifest constant; use `satisfies PluginModule` on the default export.

## Code Examples

Verified patterns from official sources:

### import.meta.glob Eager Named Export (Source: https://vite.dev/guide/features)
```typescript
// Import only the 'default' export from each matched file, eagerly (static imports at build time)
const modules = import.meta.glob<PluginModule>(
  './plugins/*.tsx',
  { eager: true, import: 'default' }
);
// Type: Record<string, PluginModule>
// At build time, Vite transforms this to:
// import __glob_0 from './plugins/example-plugin.tsx'
// const modules = { './plugins/example-plugin.tsx': __glob_0 }
```

### satisfies Operator for Manifest Validation (Source: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html)
```typescript
// 'as const' preserves literal types and makes readonly
// 'satisfies PluginManifest' validates shape at compile time
const manifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Does something useful',
  slot: 'sidebar-bottom',
  capabilities: ['read-sessions'],
} as const satisfies PluginManifest;

// TypeScript error examples (caught at build time):
// slot: 'invalid-slot'    → Error: Type '"invalid-slot"' is not assignable to type 'PluginSlot'
// misspeld: 'foo'         → Error: Object literal may only specify known properties
// version missing         → Error: Property 'version' is missing
```

### localStorage Persist Pattern (Source: https://felixgerschau.com/react-localstorage/)
```typescript
// Initialize from localStorage on mount (lazy initializer avoids re-reads on re-render)
const [enabledState, setEnabledState] = useState<Record<string, boolean>>(
  () => {
    try {
      const saved = localStorage.getItem('warden:plugin-enabled');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }
);

// Persist on every change
useEffect(() => {
  try {
    localStorage.setItem('warden:plugin-enabled', JSON.stringify(enabledState));
  } catch {
    // quota exceeded or private browsing — fail silently
  }
}, [enabledState]);
```

### App View Type Extension
```typescript
// Extend existing AppView type in App.tsx
type AppView = 'terminals' | 'history' | 'plugins';

// Add nav button in header
<button
  onClick={() => handleViewChange('plugins')}
  className={`px-2 py-1 text-xs transition-colors ${
    currentView === 'plugins' ? 'text-warden-accent' : 'text-warden-text-dim hover:text-warden-text'
  }`}
>
  Plugins
</button>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import.meta.globEager()` | `import.meta.glob('*', { eager: true })` | Vite 3.x | Old API is deprecated; use options object |
| Manual plugin registration array | `import.meta.glob` auto-discovery | Vite 2+ | Zero-touch registration — add file, done |
| Type annotation (`: PluginManifest`) | `as const satisfies PluginManifest` | TypeScript 4.9 (Nov 2022) | Literal type preservation + compile-time validation |
| `import.meta.glob` untyped | Generic type parameter `import.meta.glob<T>()` | Vite 3+ | Full TypeScript inference on glob results |

**Deprecated/outdated:**
- `import.meta.globEager`: Removed, replaced by `{ eager: true }` option.
- Module Federation for build-time plugin registries: Extreme over-engineering; glob imports are the current standard for same-build plugin systems.

## Open Questions

1. **tsconfig.json `types: ["vite/client"]` — Required or not?**
   - What we know: `moduleResolution: "bundler"` in tsconfig.json currently handles `import.meta.url`. The existing `import.meta.url` usage in server files works without `"vite/client"` in types.
   - What's unclear: Whether `import.meta.glob` (a Vite-specific client extension) requires explicit `"vite/client"` in types array, or if bundler resolution already covers it.
   - Recommendation: Add `"vite/client"` to `compilerOptions.types` in tsconfig.json as the first task — run `npx tsc --noEmit` to verify; if it passes without it, it's covered.

2. **`terminal-overlay` slot implementation detail**
   - What we know: `sidebar-top`, `sidebar-bottom`, `bottom-panel` slots map naturally to `flex-col` div order. `terminal-overlay` needs absolute/fixed positioning over the terminal area.
   - What's unclear: Whether to use `position: absolute` within the terminal container or `position: fixed`. The terminal uses `flex-1 min-h-0` so absolute positioning within the parent works.
   - Recommendation: Use `relative` on the terminal container div + `absolute inset-0 z-10 pointer-events-none` on the overlay slot renderer. Keep it simple; plugins can set `pointer-events-auto` on their own content.

3. **Plugin ID stability and storage key migration**
   - What we know: Plugin IDs come from `manifest.id` (a string in the plugin file). localStorage key is `'warden:plugin-enabled'`.
   - What's unclear: If a plugin's `id` changes between versions, the stored toggle state for the old ID will be orphaned.
   - Recommendation: Document that `manifest.id` must be stable across versions. No migration needed for phase 9 — there are no production users with stored plugin state yet.

## Sources

### Primary (HIGH confidence)
- https://vite.dev/guide/features — `import.meta.glob` full API, eager mode, named imports, TypeScript generics, glob patterns
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html — `satisfies` operator specification and compile-time validation behavior
- `src/client/components/ErrorBoundary.tsx` (project codebase) — Existing class component, verified reusable with `fallback` prop

### Secondary (MEDIUM confidence)
- https://futurestud.io/tutorials/vite-resolve-import-meta-glob-in-typescript — TypeScript `vite/client` types setup for glob imports
- https://felixgerschau.com/react-localstorage/ — localStorage + useState + useEffect persist pattern
- https://betterstack.com/community/guides/scaling-nodejs/typescript-as-satisfies-type/ — `as const satisfies` combined pattern for configuration objects
- https://claritydev.net/blog/typescript-as-const-satisfies-type-safe-config — `as const satisfies` for immutable config validation

### Tertiary (LOW confidence — design decisions, not verified by docs)
- Named-prop slot pattern for layout injection points — derived from React composition documentation; the specific `sidebar-top/sidebar-bottom/bottom-panel/terminal-overlay` slot naming is project-specific design

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies, APIs verified against official Vite/TypeScript docs
- Architecture: HIGH — patterns are direct applications of verified Vite glob import API and TypeScript satisfies; structure follows existing project conventions
- Pitfalls: HIGH — each pitfall is documented with a specific error message or failure mode that comes directly from official constraints
- localStorage persistence: HIGH — basic useState+useEffect pattern verified in multiple sources

**Research date:** 2026-02-17
**Valid until:** 2026-08-17 (stable APIs — Vite glob import and TypeScript satisfies are both stable, long-lived features)
