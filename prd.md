# tv-goldviewfx PRD

## Overview

Define and deliver the trading idea platform (001) and RL trading agent (002)
per the existing specs and architecture. This PRD drives the Ralph loop task
list and must stay current.

## Goals

- Ship the backend API, ingestion workers, and market data pipeline.
- Provide the Next.js ops dashboard for review, monitoring, and controls.
- Support RL training/inference workflows with the Python service.
- Maintain deterministic test and data workflows for local validation.

## Non-goals

- Unplanned product scope outside the specs.
- Manual changes without updating the task list and activity log.

## Tech Stack

- Bun + TypeScript for backend and frontend
- Next.js + React dashboard
- Supabase Postgres + pgvector
- Python 3.12+ (uv) RL service

## Architecture Notes

- Follow the Ralph loop workflow and log every iteration in `activity.md`.
- Keep tasks atomic, verifiable, and ordered by dependency.

## Milestone 1: Local Stack + Workflow Compliance

## Task List (JSON)

```json
[
  {
    "category": "setup",
    "description": "Add Ralph loop permissions file for this repo",
    "steps": [
      "Create `.claude/settings.json` with allowed commands (bun, supabase, uv, agent-browser, git add/commit, ./scripts/*)",
      "Deny unsafe paths and secrets access as appropriate",
      "Reference the workflow in the file comments or metadata"
    ],
    "passes": false
  },
  {
    "category": "config",
    "description": "Create environment templates for backend, frontend, and RL service",
    "steps": [
      "Add `backend/.env.example` with required Supabase, ingestion, and BingX keys",
      "Add `frontend/.env.example` with `NEXT_PUBLIC_API_URL` and any UI flags",
      "Add `backend/rl-service/.env.example` with DB and storage settings"
    ],
    "passes": false
  },
  {
    "category": "ops",
    "description": "Create a local dev bootstrap script",
    "steps": [
      "Add `scripts/dev-local.sh` to start Supabase, backend worker/API, and frontend",
      "Add `scripts/dev-local-stop.sh` to stop any processes started by the bootstrap script",
      "Document usage in the script header comments"
    ],
    "passes": false
  },
  {
    "category": "ops",
    "description": "Add a lightweight local health check script",
    "steps": [
      "Add `scripts/verify-local.sh` to check `GET /health` and `GET /ops/gaps/health`",
      "Print clear pass/fail output for each check",
      "Document expected ports and env overrides"
    ],
    "passes": false
  },
  {
    "category": "docs",
    "description": "Document local setup and workflow usage",
    "steps": [
      "Add `docs/local-setup.md` covering env templates, Supabase start, and bootstrap scripts",
      "Link the doc from `README.md`",
      "Ensure instructions mention `activity.md` logging requirements"
    ],
    "passes": false
  },
  {
    "category": "verification",
    "description": "Run a local smoke verification and record it",
    "steps": [
      "Start backend + frontend using the documented workflow",
      "Capture a dashboard screenshot in `screenshots/` using agent-browser",
      "Log the session in `activity.md` with commands and results"
    ],
    "passes": false
  }
]
```
