# Quick Task 2047: Enhance Agent Sidebar with Working Directory and Context Fill

## What was done

### Task 1: Server-side — OpenClawSessionReader service + API enrichment

**Types extended** (`src/shared/openclawTypes.ts`):
- Added `AgentContextFill` interface with `totalTokens`, `contextTokens`, `fillPercentage`, `model`
- Extended `AgentDetails` with optional `workingDirectory` and `contextFill` fields

**New service** (`src/server/services/OpenClawSessionReader.ts`):
- Reads agent-registry.json for working directories (cached 30s, graceful on ENOENT)
- Shells out to `openclaw sessions --all-agents --json` for context fill data (cached 30s)
- Filters to `:main` sessions only, calculates fill percentage
- CLI failures logged once, returns empty Map on error

**API enrichment** (`src/server/routes/agentRoutes.ts`):
- GET `/api/agents` now calls both data sources in parallel via `Promise.all`
- Merges `workingDirectory` and `contextFill` into each agent response

### Task 2: Agent Sidebar UI — context fill bar and working directory display

**Agent list rows** (`src/client/components/AgentSidebar.tsx`):
- Added compact 40px context fill bar after topic badge
- Color-coded: green (0-50%), amber (50-75%), red (>75%)
- Hidden entirely when no context fill data available
- Hover tooltip shows percentage and token counts

**Details panel**:
- Working directory shown below Workspace (only when available)
- Context fill section with full-width bar, percentage, token counts, and model name
- All elements hidden gracefully when data is null

## Verification

- `npm run build` passes without errors
- Missing data sources (no agent-registry.json, no openclaw CLI) degrade to null values — UI hides those elements

## Commit

eb9de31 — feat: add working directory and context fill to agent sidebar
