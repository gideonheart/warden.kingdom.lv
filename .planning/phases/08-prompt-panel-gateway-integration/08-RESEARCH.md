# Phase 8: Prompt Panel & Gateway Integration - Research

**Researched:** 2026-02-12
**Domain:** React state synchronization, OpenAI-compatible Gateway API, Express 5 async error handling
**Confidence:** HIGH

## Summary

Phase 8 implements prompt panel state synchronization and fixes the broken Send button. The core technical challenge is syncing the prompt dropdown with the selected terminal session tab while maintaining manual override capability. The existing infrastructure is mostly complete: GatewayApiClient exists, the API route works, and the UI components are in place. The primary work involves React state synchronization patterns and debugging the Send button failure.

**Primary recommendation:** Use controlled component pattern with useEffect to sync selectedAgentId from tab selection, add session-to-agent mapping logic, and verify the existing API endpoint responds correctly. Focus on React 19 patterns (avoid useEffect for pure state derivation where possible) and leverage Express 5's automatic async error handling.

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.0.0 | UI state management | Latest stable, built-in features reduce need for custom hooks |
| Express | 5.0.0 | Backend API server | Auto-handles async/await errors, no wrapper needed |
| Socket.IO | 4.8.0 | Real-time terminal streaming | Connection state recovery built-in (v4.6.0+) |
| xterm.js | 5.3.0 | Terminal rendering | Industry standard for web terminals |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test | 1.58.2 | E2E testing | Testing button clicks, dropdown state sync |
| TypeScript | 5.7.0 | Type safety | Catch prop/state mismatches at compile time |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React 19 useState | React 19 use() hook | use() for async data fetching only; useState still correct for UI state |
| Express 5 native | express-async-errors package | Unnecessary in Express 5 (auto-wraps async routes) |
| Controlled component | Uncontrolled component | Uncontrolled loses ability to sync dropdown with tab selection |

**Installation:**

No new packages required. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

Existing structure is correct:

```
src/
├── client/
│   ├── components/
│   │   ├── PromptPanel.tsx       # Controlled component for prompt UI
│   │   └── InstanceTabBar.tsx    # Tab selection triggers agent sync
│   └── App.tsx                    # State coordination hub
├── server/
│   ├── routes/
│   │   └── agentRoutes.ts         # POST /api/agents/:agentId/prompt
│   └── services/
│       ├── GatewayApiClient.ts    # Fetch wrapper for OpenClaw Gateway
│       └── OpenClawConfigReader.ts # Reads ~/.openclaw/openclaw.json
└── shared/
    ├── types.ts                   # AgentInstance (has agentId, tmuxSessionName)
    └── openclawTypes.ts           # AgentDetails, PromptRequest/Response
```

### Pattern 1: Session-to-Agent Mapping

**What:** Extract agent ID from tmux session name prefix (e.g., `warden-gsd-main` → `warden`)

**When to use:** When user selects a terminal tab and prompt dropdown needs to auto-sync

**Example:**

```typescript
// Source: Existing codebase (TmuxSessionManager.ts line 54-56)
extractAgentIdFromSessionName(sessionName: string): string {
  return sessionName.split('-')[0];
}

// In App.tsx, derive agent from selected session
const selectedInstance = instances.find(i => i.tmuxSessionName === selectedSessionName);
const derivedAgentId = selectedInstance?.agentId ?? null;
```

**Key insight:** Session names follow convention `{agentId}-{project}-{uuid}`. First segment is always agent ID. This is enforced by `TmuxSessionManager.buildSessionName()` and validated by `isAgentManagedSession()` checking `KNOWN_AGENT_PREFIXES`.

### Pattern 2: Controlled Component with Derived State

**What:** React 19 pattern where component state derives from props but allows user override

**When to use:** Dropdown should reflect tab selection but user can manually change it

**Example:**

```typescript
// Source: React docs (https://react.dev/reference/react-dom/components/select)
// Adapting for PromptPanel requirements

interface PromptPanelProps {
  agents: AgentDetails[];
  selectedAgentId: string | null; // From parent (App.tsx)
  onAgentChange?: (agentId: string) => void; // Optional callback
}

export function PromptPanel({ agents, selectedAgentId, onAgentChange }: PromptPanelProps) {
  // Local state for manual override
  const [manualAgentId, setManualAgentId] = useState<string | null>(null);

  // Sync with prop changes (tab switches) unless user manually overrode
  useEffect(() => {
    if (selectedAgentId && !manualAgentId) {
      setManualAgentId(selectedAgentId);
    }
  }, [selectedAgentId]); // Don't include manualAgentId (intentional stale closure)

  const effectiveAgentId = manualAgentId || selectedAgentId || agents[0]?.id || '';

  const handleDropdownChange = (newAgentId: string) => {
    setManualAgentId(newAgentId);
    onAgentChange?.(newAgentId);
  };

  return (
    <select value={effectiveAgentId} onChange={(e) => handleDropdownChange(e.target.value)}>
      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
```

**Alternative pattern (React 19.2 useEffectEvent):**

If using React 19.2+, can use `useEffectEvent` to avoid stale closure issues:

```typescript
// Source: React 19.2 docs (https://react.dev/reference/react/useEffectEvent)
import { useEffectEvent } from 'react';

const onTabSwitch = useEffectEvent(() => {
  if (selectedAgentId && !manualAgentId) {
    setManualAgentId(selectedAgentId);
  }
});

useEffect(() => {
  onTabSwitch();
}, [selectedAgentId]);
```

**Note:** React 19.0.0 (current project version) does not have `useEffectEvent`. Upgrade to React 19.2 or use standard useEffect pattern.

### Pattern 3: Express 5 Async Route Error Handling

**What:** Express 5 automatically catches rejected promises and forwards to error handler

**When to use:** All async routes (no try/catch wrapper needed)

**Example:**

```typescript
// Source: Express 5 docs (https://expressjs.com/en/guide/error-handling.html)
// Existing agentRoutes.ts implementation is correct

agentRoutes.post('/api/agents/:agentId/prompt', async (request, response) => {
  const { agentId } = request.params;
  const { prompt } = request.body as { prompt?: string };

  if (!prompt?.trim()) {
    response.status(400).json({ error: 'prompt required' });
    return; // Early return, no next() needed
  }

  // No try/catch needed - Express 5 auto-forwards thrown errors
  const result = await gatewayApiClient.sendPrompt(agentId, prompt.trim());

  if (result.success) {
    response.json(result);
  } else {
    response.status(502).json(result);
  }
});
```

**Key difference from Express 4:** No need for `express-async-errors` package or manual `.catch(next)` chains.

### Anti-Patterns to Avoid

- **Putting state setters in useEffect dependency arrays:** React guarantees setter identity stability; including `setManualAgentId` in deps is redundant and confuses intent
- **Syncing state when user manually overrode:** Check for manual override before syncing (see Pattern 2 example)
- **Using useEffect for pure derivation:** If `effectiveAgentId` can be computed from props/state without side effects, derive it directly (no useEffect needed)
- **Manual try/catch in Express 5 async routes:** Unnecessary boilerplate; Express 5 handles it

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown state sync | Custom sync logic with flags | Controlled component pattern + useEffect | React's controlled component pattern is battle-tested; handles edge cases (concurrent updates, fast tab switches) |
| API error handling | Custom Express wrapper | Express 5 native async handling | Express 5 auto-catches; custom wrappers add complexity for zero benefit |
| Session-to-agent mapping | New mapping service | Extract from session name (existing util) | Naming convention already enforced; `TmuxSessionManager.extractAgentIdFromSessionName()` exists |
| OpenClaw Gateway client | Custom fetch wrapper | Existing `GatewayApiClient` | Already implements auth, error handling, OpenAI-compatible format |

**Key insight:** Phase 3 (Agent Integration) already built the foundation. This phase is about wiring UI state, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Infinite useEffect Loop

**What goes wrong:** Setting state inside useEffect that depends on that state causes infinite re-renders

**Why it happens:**

```typescript
// BAD - infinite loop
const [agentId, setAgentId] = useState('');
useEffect(() => {
  setAgentId(selectedAgentId ?? ''); // Triggers re-render → triggers useEffect → ...
}, [selectedAgentId, agentId]); // agentId in deps causes loop
```

**How to avoid:** Only include values you're *reading* in the effect, not values you're *setting*

**Warning signs:** React dev tools shows "Maximum update depth exceeded" error; browser freezes; rapid console logs

### Pitfall 2: Stale Closure in Event Handlers

**What goes wrong:** Event handler captures old prop/state values from when component mounted

**Why it happens:** React closures capture values at render time; if handler isn't recreated when deps change, it sees stale data

**How to avoid:** Use `useCallback` with correct deps array, or use `useEffectEvent` (React 19.2+)

```typescript
// BAD - stale closure
const handleSend = async () => {
  await sendPrompt(agentId); // agentId captured at mount time
};

// GOOD - fresh closure
const handleSend = useCallback(async () => {
  await sendPrompt(agentId);
}, [agentId]); // Recreates when agentId changes
```

**Warning signs:** Button sends to wrong agent; dropdown shows one agent but prompt goes to another

### Pitfall 3: Not Handling Missing selectedAgentId

**What goes wrong:** Dropdown shows blank/undefined when no session is selected

**Why it happens:** `selectedAgentId` is nullable; component doesn't provide fallback

**How to avoid:** Use fallback chain: `manualAgentId || selectedAgentId || agents[0]?.id || ''`

**Warning signs:** Empty dropdown option; console error "value must be string"; API call with empty agentId (400 error)

### Pitfall 4: Gateway Endpoint Not Enabled

**What goes wrong:** Gateway returns 404 on `/v1/chat/completions`

**Why it happens:** OpenClaw Gateway requires explicit endpoint enablement in `openclaw.json`

**How to avoid:** Verify config has:

```json
"gateway": {
  "http": {
    "endpoints": {
      "chatCompletions": { "enabled": true }
    }
  }
}
```

**Warning signs:** 404 errors in browser console; `GatewayApiClient.sendPrompt()` returns `Gateway returned 404`

**Current project status:** Gateway config verified at `~/.openclaw/openclaw.json` line 131 - `chatCompletions: { enabled: true }` ✓

### Pitfall 5: Forgetting Ctrl+Enter Keyboard Handler

**What goes wrong:** User types prompt, presses Ctrl+Enter, nothing happens

**Why it happens:** `onKeyDown` handler checks for wrong key combo or isn't wired to textarea

**How to avoid:** Check `event.key === 'Enter'` AND `(event.ctrlKey || event.metaKey)` (metaKey for Mac Cmd+Enter)

```typescript
const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault(); // Prevent newline insertion
    handleSend();
  }
}, [handleSend]);
```

**Warning signs:** Ctrl+Enter inserts newline instead of sending; Mac users report Cmd+Enter doesn't work

**Current project status:** PromptPanel.tsx line 48-51 already implements this correctly ✓

## Code Examples

Verified patterns from project codebase and official sources:

### Extracting Agent ID from Session Name

```typescript
// Source: src/server/services/TmuxSessionManager.ts:54-56
extractAgentIdFromSessionName(sessionName: string): string {
  return sessionName.split('-')[0];
}

// Usage in App.tsx (to be implemented)
const selectedInstance = instances.find(i => i.tmuxSessionName === selectedSessionName);
const derivedAgentId = selectedInstance?.agentId ?? null;

// Pass to PromptPanel
<PromptPanel agents={agents} selectedAgentId={derivedAgentId} />
```

### Sending Prompt to Gateway API

```typescript
// Source: src/server/services/GatewayApiClient.ts:4-42 (already exists)
async sendPrompt(agentId: string, prompt: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const gatewayUrl = await openClawConfigReader.getGatewayUrl();
  const token = await openClawConfigReader.getGatewayToken();

  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-openclaw-agent-id': agentId,
    },
    body: JSON.stringify({
      model: `openclaw:${agentId}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `Gateway returned ${response.status}: ${errorText}` };
  }

  return { success: true, message: `Prompt sent to ${agentId}` };
}
```

### Playwright Test for Button Click with Async State

```typescript
// Source: Existing tests/e2e/terminal-focus.spec.ts pattern + Playwright best practices
test('prompt panel send button works', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.xterm', { state: 'visible' });

  // Fill prompt textarea
  const promptTextarea = page.locator('textarea[placeholder*="prompt"]');
  await promptTextarea.fill('Test prompt for agent');

  // Click Send button
  const sendButton = page.locator('button:has-text("Send")');
  await sendButton.click();

  // Playwright auto-waits for React re-render (async state update)
  // Verify success message appears
  await expect(page.locator('text=/Prompt sent/i')).toBeVisible({ timeout: 5000 });
});

test('prompt panel dropdown syncs with tab selection', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.xterm', { state: 'visible' });

  // Get initial dropdown value
  const dropdown = page.locator('select').filter({ has: page.locator('option:has-text("Warden")') });
  const initialAgent = await dropdown.inputValue();

  // Find tabs and click second one (if exists)
  const tabs = page.locator('button:has(.font-mono)');
  const tabCount = await tabs.count();

  if (tabCount > 1) {
    const secondTabText = await tabs.nth(1).textContent();
    const expectedAgentId = secondTabText?.split('-')[0]; // Extract agent prefix

    await tabs.nth(1).click();
    await page.waitForTimeout(500); // Allow state sync

    const updatedAgent = await dropdown.inputValue();
    expect(updatedAgent).toBe(expectedAgentId);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useEffect for all state sync | Derive state where possible, useEffect only for side effects | React 19 (Dec 2024) | Simpler code, fewer re-render bugs |
| express-async-errors package | Express 5 native async handling | Express 5 (2024) | No wrapper needed, one less dependency |
| Custom controlled component patterns | useEffectEvent for event-like callbacks | React 19.2 (Oct 2025) | Avoids stale closure issues without complex deps |
| Chat Completions API | Responses API | OpenAI 2026 | New API preferred, but Chat Completions still supported (backward compatible) |

**Deprecated/outdated:**

- **express-async-errors:** No longer needed in Express 5 (auto-wraps async routes)
- **Manual Socket.IO reconnection logic:** Connection state recovery built into Socket.IO 4.6.0+ (2023)
- **Class components for local state:** React 19 hooks are preferred (functional components with useState)

**Current project alignment:**

- ✓ Using Express 5 with native async handling (no wrappers)
- ✓ Using React 19 functional components with hooks
- ✓ Using Socket.IO 4.8 with connection state recovery
- ⚠️ Using OpenAI Chat Completions API format (correct for now; Responses API is optional upgrade)

## Open Questions

### 1. Should prompt dropdown sync on every tab switch or only when user hasn't manually overridden?

**What we know:**
- Requirement PROMPT-02 says "auto-syncs to that session's agent"
- Requirement PROMPT-03 says "allow manual override"
- Existing `PromptPanel.tsx` has `targetAgentId` state (suggests manual override capability)

**What's unclear:**
- If user manually selects "Forge" then switches to "Warden" tab, should dropdown switch to Warden or stay on Forge?

**Recommendation:**
- Auto-sync on tab switch UNLESS user manually changed dropdown after last tab switch
- Track "user manually changed" flag that resets on tab switch
- Behavior: Tab switch always syncs; manual dropdown change persists until next tab switch

**Implementation:**

```typescript
const [lastSyncedTabSession, setLastSyncedTabSession] = useState<string | null>(null);

useEffect(() => {
  if (selectedSessionName !== lastSyncedTabSession) {
    // Tab switched - sync dropdown and reset override flag
    setTargetAgentId(selectedAgentId);
    setLastSyncedTabSession(selectedSessionName);
  }
}, [selectedSessionName, selectedAgentId]);

const handleDropdownChange = (newAgentId: string) => {
  setTargetAgentId(newAgentId);
  // Don't update lastSyncedTabSession - keeps override active
};
```

### 2. What should happen when no sessions exist but agents are configured?

**What we know:**
- Requirement PROMPT-03 says "allow manual override to any configured agent (including when no session exists)"
- `App.tsx` shows empty state: "No active agent sessions"

**What's unclear:**
- Should prompt panel appear when no sessions exist?
- If yes, should dropdown default to first agent or be empty?

**Recommendation:**
- Show prompt panel even when no sessions exist (operator may want to send standalone prompt)
- Dropdown defaults to first agent in alphabetical order
- Change PROMPT-01 requirement interpretation: "reflect currently selected session" means null when no session (fallback to first agent)

### 3. Why is Send button currently failing?

**What we know:**
- Requirement PROMPT-05 says "Send button MUST work (currently fails — needs debugging)"
- Existing `PromptPanel.tsx:90-96` has Send button with onClick handler
- Route exists at `POST /api/agents/:agentId/prompt` (agentRoutes.ts:25-41)
- GatewayApiClient.sendPrompt() is implemented and looks correct

**What's unclear:**
- Does button click trigger at all? (JS error?)
- Does fetch fail? (network error, 404, auth error?)
- Does Gateway respond with error? (502 Bad Gateway?)

**Recommendation:**
- Add browser DevTools Network tab inspection during manual test
- Check for:
  1. Console errors (JS exception in handleSend?)
  2. Network request (does `/api/agents/xxx/prompt` appear?)
  3. Response status (200 vs 400/404/502)
  4. Gateway logs (does OpenClaw receive request?)
- Likely causes (in order of probability):
  1. `effectiveAgentId` is empty string (validation fails silently)
  2. Gateway not running on port 3434 (fetch times out)
  3. Auth token mismatch (Gateway rejects)
  4. CORS issue (unlikely - same origin 127.0.0.1:3001)

## Sources

### Primary (HIGH confidence)

- React 19 useEffect docs: https://react.dev/reference/react/useEffect
- React 19 select component docs: https://react.dev/reference/react-dom/components/select
- Express 5 error handling guide: https://expressjs.com/en/guide/error-handling.html
- Socket.IO 4.8 connection state recovery: https://socket.io/docs/v4/connection-state-recovery
- Playwright testing guide: https://playwright.dev/docs/test-components
- Existing codebase files:
  - `src/client/components/PromptPanel.tsx`
  - `src/server/services/GatewayApiClient.ts`
  - `src/server/routes/agentRoutes.ts`
  - `src/shared/openclawTypes.ts`
  - `~/.openclaw/openclaw.json`

### Secondary (MEDIUM confidence)

- React 19.2 useEffectEvent RFC: https://react.dev/reference/react/useEffectEvent
- React controlled component patterns: https://www.epicreact.dev/control-props-give-your-react-components-superpowers-xitiw
- Express 5 async/await best practices: https://betterstack.com/community/guides/scaling-nodejs/express-5-new-features/
- Playwright React testing guide: https://www.browserstack.com/guide/component-testing-react-playwright

### Tertiary (LOW confidence)

- OpenAI Chat Completions vs Responses API: https://platform.openai.com/docs/guides/migrate-to-responses (marked for validation - current project uses Chat Completions which is still supported)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already in package.json, versions verified
- Architecture patterns: HIGH - Patterns verified in existing codebase and official docs
- Pitfalls: MEDIUM-HIGH - Based on React/Express docs + common patterns; project-specific pitfalls need validation
- OpenClaw Gateway integration: HIGH - Config file verified, endpoint enabled, token present
- Send button failure root cause: LOW - Needs browser debugging to confirm

**Research date:** 2026-02-12
**Valid until:** 2026-03-14 (30 days - React/Express APIs stable, stack unlikely to change)
