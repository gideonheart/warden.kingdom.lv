# GSD Workflow (Agent Playbook)

This repo uses the **Get Shit Done (GSD)** Claude Code skillset for planning/bootstrap.

Goal: make agent runs reliable (no prompt stalls) and repeatable.

## When to use GSD vs vanilla Claude Code

- Use **GSD** for:
  - new project initialization
  - deep context gathering
  - creating/maintaining `.planning/*` docs

- Use **vanilla Claude Code** for:
  - long execution runs if GSD prompts become disruptive
  - heavy refactors and implementation loops

A safe default is:
1) GSD → generate/refresh planning docs
2) Vanilla → implement and iterate

## Standard GSD bootstrap

Run these inside Claude Code:

1) Create/update project plan
   - `/gsd:new-project @PRD.md`

2) Preferences (choose these when prompted)
   - Trust folder → **Yes**
   - Skill approval → **Yes, and don’t ask again** (for this repo)
   - Work mode → **YOLO**
   - Research before planning each phase → **YES** (large project)

## If you have a research-phase toggle

If your GSD install supports it, enable it early:

- `/gsd:research-phase 1`

(If the command is not recognized, ignore it and rely on the “Research before planning each phase” prompt + manual research.)

## Manual research checklist (always do this)

Before each implementation phase, capture 5–15 lines in `.planning/RESEARCH.md`:

- scan PRD section relevant to the phase
- repo search (rg/grep) for existing patterns
- check similar OSS patterns if needed
- identify risks/gotchas + pick defaults

## Prompt-stall recovery

If Claude Code is stuck on an interactive prompt:

1) Pick the option that matches `CLAUDE.md` defaults.
2) Prefer **“don’t ask again”** when available.
3) If a skill wizard keeps re-appearing, switch to vanilla:
   - stop using `/gsd:*`
   - continue with normal bash commands + `.planning/*` notes

## Non-negotiables from Rolands

- UI style: OpenClaw Gateway UI / dashboard
- No paid-subscription dependencies; prefer widely used & documented stack
- DRY + SRP; explicit names (no abbreviations)
- Playwright desktop UI verification
