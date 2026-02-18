---
phase: 13-client-plugin
plan: 01
subsystem: ui
tags: [react, socket.io-client, tailwind, plugin, optimistic-ui, clipboard-api]

# Dependency graph
requires:
  - phase: 12-backend-foundation
    provides: "6 GSD REST endpoints + /gsd-hooks Socket.IO namespace"
  - phase: 9-plugin-registry
    provides: "PluginModule contract, import.meta.glob auto-discovery, PluginSlotRenderer"
provides:
  - useGsdRegistry hook with 10s polling and optimistic toggle support
  - useGsdHookFeed hook connecting to /gsd-hooks Socket.IO namespace
  - gsd-manager-plugin in bottom-panel slot with 4-tab GSD control center
affects:
  - 14 (pressure alerting plugin will use same bottom-panel slot pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional hook mounting via collapsed panel (isExpanded gate — hooks only mount when expanded)
    - Optimistic toggle overlay: Record<agentId, boolean> applied on top of poll data, removed on PATCH success
    - parseHookEvents: line-by-line FIRED marker grouping, regex field extraction, newest-first slice
    - CopyButton + BashHint helper components: DX pattern for showing bash equivalents with clipboard copy

key-files:
  created:
    - src/client/hooks/useGsdRegistry.ts
    - src/client/hooks/useGsdHookFeed.ts
    - src/client/plugins/gsd-manager-plugin.tsx
  modified: []

key-decisions:
  - "Hooks extracted to src/client/hooks/ (not co-located in plugin) because plugin grew to 481 LOC; separation keeps plugin file focused on rendering"
  - "Panel starts collapsed (isExpanded=false) — GsdManagerPanelExpanded is conditionally rendered so Socket.IO and polling hooks never activate until operator explicitly expands"
  - "useActiveInstances() called directly inside plugin because PanelComponent takes zero props by contract; no need to extend PluginSlotRenderer"

patterns-established:
  - "Collapsed panel gate: wrap entire hook-consuming component in conditional render to prevent connection leaks on hidden panels"
  - "Optimistic enabled overlay: Record<agentId, boolean> state separate from server data; delete key on success so poll data takes over"

requirements-completed:
  - GRID-01
  - GRID-02
  - CTRL-01
  - CTRL-02
  - REG-01
  - REG-02
  - HOOK-01
  - DX-01

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 13 Plan 01: GSD Manager Client Plugin Summary

**Collapsible 4-tab GSD Control Center plugin (Agents grid, spawn/dispatch Controls, Registry toggle table, live Hooks feed) auto-registered in the bottom-panel slot via import.meta.glob with zero files modified**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T10:14:46Z
- **Completed:** 2026-02-18T10:17:37Z
- **Tasks:** 2
- **Files modified:** 3 created, 0 modified

## Accomplishments

- `src/client/hooks/useGsdRegistry.ts`: Polls `/api/gsd/registry` every 10s; exposes `toggleEnabled` (PATCH with optimistic overlay) and `getEffectiveEnabled` (overlay ?? server value); RegistryAgent + GsdRegistry interfaces inline.
- `src/client/hooks/useGsdHookFeed.ts`: Connects to `/gsd-hooks` Socket.IO namespace; handles `gsd-hooks:backfill` and `gsd-hooks:lines`; `parseHookEvents` groups raw lines by FIRED marker into `HookEvent[]` newest-first.
- `src/client/plugins/gsd-manager-plugin.tsx`: 481 LOC plugin registering as `gsd-manager` in `bottom-panel` slot. Panel starts collapsed (thin 32px header bar). On expand: 4-tab panel (`Agents`, `Controls`, `Registry`, `Hooks`). CopyButton + BashHint components provide copy-to-clipboard bash equivalents on every action. TypeScript compiles with zero errors. No existing files modified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useGsdRegistry and useGsdHookFeed data hooks** - `1cd130d` (feat)
2. **Task 2: Create gsd-manager-plugin.tsx with 4-tab panel UI** - `648a5dd` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `src/client/hooks/useGsdRegistry.ts` — Registry polling hook, RegistryAgent/GsdRegistry interfaces, optimistic toggle support
- `src/client/hooks/useGsdHookFeed.ts` — /gsd-hooks Socket.IO consumer, parseHookEvents line parser, HookEvent interface
- `src/client/plugins/gsd-manager-plugin.tsx` — Full GSD Manager plugin: manifest, CopyButton, BashHint, GsdManagerPanelExpanded (4 tabs), GsdManagerPanel (collapsed gate)

## Decisions Made

- Hooks extracted to `src/client/hooks/` rather than co-located in the plugin file because the plugin grew to 481 LOC; the separation keeps rendering logic clean
- `GsdManagerPanelExpanded` is a separate inner component conditionally rendered — this ensures Socket.IO in `useGsdHookFeed` and polling in `useGsdRegistry` are never mounted when the panel is collapsed, preventing connection and interval leaks
- `useActiveInstances()` called directly inside the plugin per the established no-props contract; no changes to `PluginSlotRenderer` or `pluginTypes.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled clean on first attempt for all three files.

## User Setup Required

None — all endpoints and Socket.IO namespaces were delivered in Phase 12. No configuration required.

## Next Phase Readiness

- GSD Manager plugin is live and auto-registered in the bottom-panel slot
- All 8 requirements (GRID-01, GRID-02, CTRL-01, CTRL-02, REG-01, REG-02, HOOK-01, DX-01) implemented
- Phase 13 is complete (single plan phase)
- Phase 14 (pressure alerting) can follow the same bottom-panel plugin pattern

---
*Phase: 13-client-plugin*
*Completed: 2026-02-18*
