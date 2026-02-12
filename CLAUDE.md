# Claude Code Instructions (Warden)

This repo is trusted and owned by Rolands.

## If Claude Code asks interactive setup questions

- **Trust folder?** → Choose **Yes, I trust this folder**.
- **Use skill `gsd:new-project`?** → Choose **Yes, and don't ask again for this repo**.
- **Work mode** → Choose **YOLO** (auto-approve execution).
- **Research before planning each phase?** → Choose **YES** (always research; large project).

## GSD standard operating procedure (SOP)

If using GSD, follow `.planning/GSD_WORKFLOW.md`.

Default GSD sequence:

- `/gsd:new-project @PRD.md`
- If supported: `/gsd:research-phase 1`

If GSD prompts become disruptive mid-run, stop using `/gsd:*` and proceed in vanilla Claude Code while continuing to maintain `.planning/RESEARCH.md` + `.planning/PLAN.md`.

## Product requirements

- UI style: match **OpenClaw Gateway UI / dashboard panel style** (sessions/jobs web panel look).
- No paid-subscription dependencies; prefer widely used & well documented stack.
- DRY + SRP.
- Use clear, explicit variable/function names (no abbreviations).
- Include **Playwright** desktop UI verification and document how to run it.
- Use Greptile / installed Claude Code tools for research where helpful.

## Working conventions

- Keep short research notes in `.planning/` when starting a new phase.
- Keep commits small and descriptive.
