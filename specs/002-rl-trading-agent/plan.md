# Implementation Plan: RL Trading Agent for Gold

**Branch**: `002-rl-trading-agent` | **Date**: 2026-01-12 | **Spec**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/spec.md
**Input**: Feature specification from /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/spec.md

## Summary

Deliver a continuously learning trading agent for BingX gold perpetual pairs (Gold-USDT, XAUTUSDT, PAXGUSDT) with full-history BingX market data ingestion (all intervals, chart + perpetual market feeds), evaluation, risk limits, data-quality gating, dataset lineage/versioning, and model versioning. The plan splits milestones across the market data integration layer, backend integration, and the dedicated RL service, and includes full unit, integration, and E2E coverage for features and edge cases. The operator dashboard will include ingestion analytics and controls for BingX, TradingView, and Telegram, plus paper/live trading mode controls; additional scope includes kill switches, promotion gates, drift alerts, and feature inputs from news sentiment and OCR.

Research decisions are captured in /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/research.md.

## Technical Context

**Language/Version**: TypeScript (latest stable) on Bun (latest stable); Python 3.12+ (latest stable) via uv for RL training/inference service  
**Primary Dependencies**: Bun, Hono, Supabase JS, Zod, Next.js/React, Nautilus Trader, Stable-Baselines3 (Gymnasium interface), BingX Perpetual REST API (market data + trading)  
**Dependency Policy**: Keep runtimes and libraries on the latest stable releases; update pinned versions promptly.  
**Storage**: Supabase Postgres for configs, decisions, metrics, and evaluation reports; Supabase Storage for model artifacts and checkpoints  
**Testing**: `bun test` for TS services; `pytest` for RL service training/inference and data transforms; Playwright E2E; all tests run against local Supabase Docker with seeded data  
**Target Platform**: Linux server/container for backend and RL service; web UI for operators  
**Project Type**: Web application (frontend + backend) with auxiliary RL service  
**Performance Goals**: Decision latency within 3 seconds of new market data; continuous learning updates complete within configured window  
**Constraints**: Exchange rate limits, strict risk limits, timeouts/backoff for external feeds, bounded training windows to avoid unbounded memory growth, data quality gates required before live trading  
**Scale/Scope**: Single exchange (BingX), three gold perpetual pairs, small operator cohort

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- Code quality: plan includes validation, error handling for trade execution, and clear model versioning.
- Testing: unit, integration, and E2E coverage required for RL workflows and edge cases.
- UX consistency: operator controls and reports align with existing dashboard patterns.
- Performance: budgets defined for decision latency and learning window; baseline captured via evaluation runs and live-session metrics.
- Security: secret handling and least-privilege BingX credentials required; audit logs retained.

## Project Structure

### Documentation (this feature)

```text
/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── api/
│   ├── services/
│   ├── jobs/
│   └── rl/              # TS integration layer for RL service
└── rl-service/          # Python RL training/inference service

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/

packages/

tests/
```

**Structure Decision**: Use the existing backend/frontend layout and add a dedicated Python RL service under `backend/rl-service` with a TS integration layer under `backend/src/rl`.

## Milestones

1. **Market data foundation**: BingX market data ingestion (candles across all intervals, trades, order book, funding, open interest, mark/index price, tickers) with full-history backfill + freshness monitoring.
2. **Backend foundation**: schemas, repositories, services, and API routes for runs, versions, evaluations, data-source gating, and market data access.
3. **RL service foundation**: inference API, continuous training loop, model registry, and promotion gating.
4. **Frontend operations**: operator pages for live trading, evaluations, ingestion analytics, and data-source management (BingX/TradingView/Telegram), plus kill switch and promotion gate controls.
5. **Data quality + lineage**: dataset versioning, feature set versioning, and data quality metrics stored and enforced.
6. **Monitoring + drift**: drift detection, alerts, and auto-fallback to last promoted model.
7. **Testing**: unit + integration tests for backend and RL service; E2E tests covering user stories and edge cases.
8. **Observability & docs**: runbook, monitoring metrics, and coverage matrix updates.

## Phase 0: Outline & Research

**Goal**: Validate RL stack choices, BingX market data ingestion strategy, and continuous learning strategy for BingX gold perpetual trading.

Research tasks:

- Best practices for Nautilus Trader + Stable-Baselines3 integration in live trading contexts.
- BingX perpetual REST API coverage for chart data (candles) and market microstructure (order book, funding, open interest, mark/index price, trades).
- Rate-limit and backfill strategies for BingX market data across supported pairs.
- Patterns for continuous learning that avoid live-session instability (gating, rollback, evaluation).
- Model artifact storage and versioning approaches compatible with Supabase Postgres + Storage.
- Interface patterns between Bun services and Python ML services (REST/gRPC, timeouts, retries).
- Test strategy for unit, integration, and E2E coverage of trading workflows and edge cases.

**Output**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/research.md

## Phase 1: Design & Contracts

**Goal**: Define data model, API contracts, and onboarding steps for operators.

Planned outputs:

- Data model: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/data-model.md
- Contracts: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/contracts/
- Quickstart: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/quickstart.md

Agent context update:

- Run `/Users/itsnk/Desktop/Coding/tv-goldviewfx/.specify/scripts/bash/update-agent-context.sh codex` after artifacts are generated.

## Constitution Check (Post-Design)

- Code quality: data model and contracts include validation rules and failure handling.
- Testing: contracts and data model outline unit tests, integration tests, and E2E coverage for trading flows and edge cases; validation steps documented in quickstart.
- UX consistency: quickstart and contracts align with existing operator workflows.
- Performance: decision and learning windows referenced in contracts and quickstart, with baseline metrics captured from evaluation runs.
- Security: contracts require auth and restrict write access to operator roles.
