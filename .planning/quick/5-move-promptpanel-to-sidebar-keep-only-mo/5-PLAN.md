---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/client/App.tsx
  - src/client/components/AgentSidebar.tsx
autonomous: true
must_haves:
  truths:
    - "PromptPanel renders inside the sidebar (both desktop and mobile) below the agent list"
    - "Terminal area occupies full remaining vertical space with no PromptPanel below it"
    - "Mobile view shows only MobileKeyToolbar below terminal, PromptPanel accessible via sidebar overlay"
    - "AgentSidebar scrolls independently when content overflows, PromptPanel stays visible at bottom of sidebar"
  artifacts:
    - path: "src/client/App.tsx"
      provides: "Layout with PromptPanel in sidebar wrappers, removed from main"
    - path: "src/client/components/AgentSidebar.tsx"
      provides: "Flex-friendly height so it shares sidebar space with PromptPanel"
  key_links:
    - from: "src/client/App.tsx"
      to: "src/client/components/PromptPanel.tsx"
      via: "PromptPanel rendered inside both sidebar wrappers (desktop + mobile)"
      pattern: "AgentSidebar.*PromptPanel"
---

<objective>
Move PromptPanel from below the terminal (inside `<main>`) into the sidebar, so the terminal gets maximum vertical space. On mobile, PromptPanel is only accessible when the sidebar overlay is opened.

Purpose: Terminal real estate is precious, especially on mobile. The prompt panel is used occasionally and fits naturally in the sidebar alongside agent details.
Output: Updated App.tsx layout and AgentSidebar.tsx flex sizing.
</objective>

<execution_context>
@/home/forge/.claude/get-shit-done/workflows/execute-plan.md
@/home/forge/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/App.tsx
@src/client/components/AgentSidebar.tsx
@src/client/components/PromptPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move PromptPanel from main into sidebar wrappers</name>
  <files>src/client/App.tsx, src/client/components/AgentSidebar.tsx</files>
  <action>
In `src/client/App.tsx`:

1. Remove the PromptPanel block from `<main>` (lines 226-228, the `{agents.length > 0 && (<PromptPanel .../>)}` block). The terminal `<div className="flex-1 min-h-0">` no longer needs to be wrapped in a fragment — it can be the direct child of the ternary for `currentView === 'terminals'`.

2. Update the **desktop sidebar** wrapper (currently `<div className="hidden lg:block">`):
   - Change classes to `hidden lg:flex lg:flex-col` so it becomes a flex column container.
   - Inside, keep `<AgentSidebar>` as first child.
   - Add `<PromptPanel agents={agents} selectedAgentId={derivedAgentId} />` as second child, rendered only when `currentView === 'terminals'`. This ensures the prompt panel only appears when viewing terminals, not history.

3. Update the **mobile sidebar** inner wrapper (currently `<div className="absolute right-0 top-0 h-full w-[85vw] max-w-sm">`):
   - Add `flex flex-col` to its classes so it stacks AgentSidebar + PromptPanel vertically.
   - After `<AgentSidebar>`, add `{currentView === 'terminals' && <PromptPanel agents={agents} selectedAgentId={derivedAgentId} />}`.

In `src/client/components/AgentSidebar.tsx`:

4. On the root `<div>` (line 27), change `h-full` to `flex-1 min-h-0` so the sidebar becomes a flexible child that shares vertical space with PromptPanel. Keep `overflow-y-auto` so the agent list scrolls when it overflows. The full class should be:
   `w-full lg:w-72 flex-1 min-h-0 bg-warden-panel border-l border-warden-border flex flex-col overflow-y-auto`

Note: The PromptPanel already has `border-t border-warden-border` styling, so it will visually separate from the AgentSidebar content.
  </action>
  <verify>
Run `npm run typecheck` to confirm no TypeScript errors.
Run `npm run build` to confirm production build succeeds.
Visually inspect the layout logic: PromptPanel import still exists in App.tsx, PromptPanel is no longer rendered inside `<main>`, PromptPanel is rendered in both sidebar wrappers conditionally on `currentView === 'terminals'`.
  </verify>
  <done>
PromptPanel renders inside both desktop and mobile sidebar containers (below AgentSidebar). Terminal area in main has no PromptPanel beneath it. AgentSidebar scrolls independently. TypeScript compiles cleanly. Production build succeeds.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with no errors
- `npm run build` completes successfully
- In App.tsx: no `<PromptPanel>` inside `<main>`, two `<PromptPanel>` instances inside sidebar wrappers
- In AgentSidebar.tsx: root div uses `flex-1 min-h-0` instead of `h-full`
</verification>

<success_criteria>
- Terminal view occupies full vertical space in main (no prompt panel below)
- PromptPanel appears in sidebar on both desktop (inline) and mobile (overlay)
- PromptPanel only visible when currentView is 'terminals'
- AgentSidebar scrolls when content overflows, PromptPanel stays pinned at sidebar bottom
- No TypeScript or build errors
</success_criteria>

<output>
After completion, create `.planning/quick/5-move-promptpanel-to-sidebar-keep-only-mo/5-SUMMARY.md`
</output>
