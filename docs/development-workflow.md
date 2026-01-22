# Development Workflow (Ralph Loop)

This project follows the Ralph Wiggum loop architecture:
https://github.com/coleam00/ralph-loop-quickstart
Inspired by: https://github.com/JeredBlu/guides/blob/main/Ralph_Wiggum_Guide.md

## Core Requirements

- Create/verify `activity.md` at the repo root before any work session.
- Append a new entry for every session or autonomous iteration.
- Keep entries brief, factual, and append-only (do not rewrite history).

## Loop Files

- `prd.md`: task list and requirements for the current milestone.
- `PROMPT.md`: per-iteration instructions referencing the PRD and activity log.
- `ralph.sh`: loop runner that launches Claude in fresh contexts.

## Activity Log Template

Use this format for each entry in `activity.md`:

```
## YYYY-MM-DD HH:MM TZ
- Task:
- Changes:
- Commands:
- Verification:
- Notes:
```

## Usage Notes

- If using a PRD-driven loop, ensure `prd.md` and `PROMPT.md` are current
  before starting a run.
- If you run UI verification, record screenshot paths in the entry.
- If tests were skipped, state why.
