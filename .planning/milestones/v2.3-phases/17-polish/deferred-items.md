# Phase 17 Deferred Items

## Pre-existing TypeScript Errors in GsdView.tsx

**Discovered during:** 17-02 Task 1 verification
**Scope:** Pre-existing, not caused by current changes
**Impact:** `npm run typecheck` reports 4 errors in GsdView.tsx — tabs rendered with zero props but component interfaces expect props
**Root cause:** Uncommitted WIP refactoring in GsdView.tsx that removed prop-passing to AgentsTab, ControlsTab, RegistryTab, HooksTab without updating their interfaces
**Files:** src/client/components/GsdView.tsx, AgentsTab.tsx, ControlsTab.tsx, RegistryTab.tsx, HooksTab.tsx
**Note:** `npm run build` (Vite + server tsc) succeeds — only `tsc --noEmit` full-project check fails. The tabs likely need to own their own data fetching hooks (matching the zero-props pattern in the diff).
