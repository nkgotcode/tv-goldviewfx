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
- Convex database + file storage
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
      "Create `.claude/settings.json` with allowed commands (bun, convex, uv, agent-browser, git add/commit, ./scripts/*)",
      "Deny unsafe paths and secrets access as appropriate",
      "Reference the workflow in the file comments or metadata"
    ],
    "passes": false
  },
  {
    "category": "config",
    "description": "Create environment templates for backend, frontend, and RL service",
    "steps": [
      "Add `backend/.env.example` with required Convex, ingestion, and BingX keys",
      "Add `frontend/.env.example` with `NEXT_PUBLIC_API_URL` and any UI flags",
      "Add `backend/rl-service/.env.example` with DB and storage settings"
    ],
    "passes": false
  },
  {
    "category": "ops",
    "description": "Create a local dev bootstrap script",
    "steps": [
      "Add `scripts/dev-local.sh` to start Convex dev, backend worker/API, and frontend",
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
      "Add `docs/local-setup.md` covering env templates, Convex dev setup, and bootstrap scripts",
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

## Production Hardening Checklist

- Execution integrity: order state machine, idempotency keys, exchange reconciliation, partial fill handling, duplicate suppression.
- Risk controls: margin checks, exposure caps per instrument, circuit breakers, automated kill switch + cooldowns.
- Data integrity: timestamp alignment, gap verification, cross-source consistency checks, decision-level data provenance logs.
- Observability: decision latency SLOs, ingestion lag metrics, slippage + drift monitoring, alerting/paging.
- Security/compliance: secrets rotation, least-privilege exchange keys, immutable audit logging, RBAC on all writes.
- Resilience: rate-limit aware schedulers, durable retry queues, replay protection, disaster recovery backups.
- Deployment: staging + canary rollouts, automated rollback, runbooks and incident drills.

## Production Hardening Tasks (JSON)

```json
[
  {
    "category": "execution",
    "description": "Order execution integrity and reconciliation",
    "steps": [
      "Add order state machine + idempotency keys in backend execution pipeline",
      "Implement exchange reconciliation job (orders, fills, positions)",
      "Add duplicate suppression and replay protection for executions"
    ],
    "passes": true
  },
  {
    "category": "risk",
    "description": "Account-level risk guardrails",
    "steps": [
      "Enforce margin checks and leverage caps prior to execution",
      "Implement exposure caps per instrument and global circuit breakers",
      "Wire automated kill switch with cooldowns and audit trail"
    ],
    "passes": true
  },
  {
    "category": "data",
    "description": "Data integrity gates for decision inputs",
    "steps": [
      "Validate timestamp alignment and candle continuity before decisions",
      "Enforce gap verification and cross-source consistency checks",
      "Record data provenance for every decision"
    ],
    "passes": true
  },
  {
    "category": "observability",
    "description": "SLOs, monitoring, and alerting",
    "steps": [
      "Instrument decision latency, ingestion lag, slippage, and drift metrics",
      "Define SLOs and alert thresholds with paging",
      "Add tracing across ingestion -> decision -> execution"
    ],
    "passes": true
  },
  {
    "category": "security",
    "description": "Secrets, access control, and audit",
    "steps": [
      "Move exchange/API secrets to managed store with rotation",
      "Enforce least-privilege RBAC on all write endpoints",
      "Add immutable audit logs for config, model, and execution changes"
    ],
    "passes": true
  },
  {
    "category": "resilience",
    "description": "Resilience and recovery",
    "steps": [
      "Add durable retry queues and rate-limit aware schedulers",
      "Implement replay protection for long-running jobs",
      "Add backup/restore drills and disaster recovery runbook"
    ],
    "passes": true
  },
  {
    "category": "deployment",
    "description": "Release safety controls",
    "steps": [
      "Set up staging + canary pipelines with automated rollback",
      "Add load/perf tests for decision and ingestion paths",
      "Create release checklist and on-call runbooks"
    ],
    "passes": true
  }
]
```

## Model Stack Completion Tasks (JSON)

```json
[
  {
    "category": "model",
    "description": "SB3 + Nautilus integration (real training/backtest loop)",
    "steps": [
      "Implement a Gymnasium-compatible environment backed by Nautilus Trader market data",
      "Wire BingX candle/trade feeds into the environment for train/eval",
      "Add integration tests for environment step/reset determinism"
    ],
    "passes": true
  },
  {
    "category": "model",
    "description": "Durable model registry + artifact lifecycle",
    "steps": [
      "Store model checkpoints in Convex file storage and persist artifact metadata",
      "Update the model registry to load from artifact URIs (not in-memory only)",
      "Add rollback support tied to stored checkpoints and evaluation reports"
    ],
    "passes": true
  },
  {
    "category": "data",
    "description": "Deterministic dataset replay + lineage enforcement",
    "steps": [
      "Create dataset snapshot hashes for decision inputs and persist lineage",
      "Enforce that decisions reference dataset hash + feature set version",
      "Add tests for deterministic replay against stored snapshots"
    ],
    "passes": true
  },
  {
    "category": "evaluation",
    "description": "Replace synthetic evaluation with Nautilus backtests",
    "steps": [
      "Run Nautilus backtest runs for evaluation windows",
      "Compute win rate/PnL/drawdown from backtest trades (not synthetic)",
      "Persist evaluation reports with links to model artifact + dataset snapshot"
    ],
    "passes": true
  }
]
```

## Phase 12 Milestones (Model Stack Completion)

**M12.1 Deterministic datasets + lineage enforcement**
- Scope: dataset snapshot hashes, provenance enforcement at decision time, deterministic replay.
- Contracts: dataset endpoints return `dataset_hash`, `feature_set_version_id`, and lineage details; decision snapshots include `dataset_version_id` + `dataset_hash`.
- Tests: unit (hashing/serialization), integration (dataset version + lineage APIs), E2E (dataset detail + lineage visible).

**M12.2 Model artifacts + registry**
- Scope: store checkpoints in Convex file storage, artifact metadata persisted, registry loads by `artifact_uri`.
- Contracts: agent version payloads include artifact metadata (`artifact_uri`, checksum, size); evaluation reports include `artifact_uri` + `dataset_hash`.
- Tests: unit (registry load/validate), integration (artifact metadata persists), E2E (promotion from stored artifact).

**M12.3 SB3 + Nautilus training pipeline**
- Scope: Gymnasium-compatible env backed by Nautilus Trader, training loop with checkpoints, inference adapter.
- Contracts: training/evaluation records link to dataset + feature set + artifact; decision provenance references artifact + dataset hash.
- Tests: unit (env step/reset determinism), integration (training produces checkpoint), E2E (train → evaluate → promote).

**M12.4 Backtest evaluation**
- Scope: replace synthetic evaluation with Nautilus backtests; compute win rate/PnL/drawdown from real trades.
- Contracts: evaluation reports include `backtest_run_id`, `artifact_uri`, `dataset_hash`.
- Tests: unit (metric calculations), integration (evaluation endpoint), E2E (evaluation report renders + promotion gate).
