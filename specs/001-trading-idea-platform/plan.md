# Implementation Plan: Trading Idea Intelligence Platform

**Branch**: `001-trading-idea-platform` | **Date**: 2026-01-11 | **Spec**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/spec.md
**Input**: Feature specification from /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/spec.md

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build an ingestion, enrichment, and trading platform that syncs TradingView
ideas, enriches them with sentiment and similarity data, stores everything in
Convex, and powers a gold futures trading agent (BingX perpetuals) with a
monitoring dashboard, including light/dark theme switching for operators.
The implementation will split backend services (ingestion, enrichment, trading,
API) from a Next.js (latest stable) operator dashboard, with explicit risk controls,
auditable trade history, and deterministic deduplication in the ingestion
pipeline. The dashboard includes ingestion analytics and controls for
TradingView, BingX, and Telegram, plus paper/live trading mode controls.
Real-time BingX market data is captured via WebSocket (trades, candles, order
book, tickers, mark price) with REST backfills and non-streaming feeds handled
by scheduled polling.
Additional scope includes ingestion quality scoring and re-fetch, source
efficacy analytics, sentiment vs PnL insights, topic clustering, review
workflow with RBAC, kill switch safety controls, per-source gating, and
integrations for news ingestion and optional OCR on chart images.

## Technical Context

**Language/Version**: TypeScript (latest stable) on Bun (latest stable)  
**Primary Dependencies**: Bun runtime, Cheerio, Convex JS client, Zod, Hono, BingX API (direct), Next.js (latest stable), React, refine.dev, shadcn/ui  
**Dependency Policy**: Keep runtimes and libraries on the latest stable releases; update pinned versions promptly.  
**Storage**: Convex database (store similarity embeddings as document fields)  
**Testing**: bun:test for backend; Vitest + Testing Library for UI; Playwright
for end-to-end coverage of all features and edge cases  
**Target Platform**: Linux server for backend jobs/API; modern browsers for
operator dashboard  
**Project Type**: Web application (backend + frontend)  
**Performance Goals**: Sync up to 500 ideas/run within 15 minutes; dashboard
lists 1,000 ideas in under 2 seconds; enrichment completes for new ideas within
60 minutes; ingestion quality scoring computed within 5 minutes of completion  
**Constraints**: Respect rate limits; avoid unbounded concurrency; memory usage
under 512 MB per worker; paper-trading default with explicit opt-in for live
trading; end-to-end tests required for all user stories and edge cases;
ingestion must be idempotent with deterministic deduplication; OCR and news
pipelines must be optional and fail-safe without blocking core ingestion  
**Scale/Scope**: Single-operator system; 10k ideas, 100k signals, 10k trades;
Gold futures only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Code quality: plan includes clear module boundaries, error handling, and
  documented public behavior for sync/enrichment/trading endpoints, including
  deduplication rules.
- Testing: automated tests required for new behavior; regression tests for
  fixes; end-to-end coverage for critical trading and sync paths.
- UX consistency: dashboard fields and terminology align with idea/signal/trade
  entities and maintain compatibility across releases.
- Performance: budgets defined in Technical Context and validated in Phase 2.
- Security: secrets remain out of logs; inputs validated; least-privilege access
  for database and exchange credentials.

**Gate Status (Pre-Research)**: PASS

## Project Structure

### Documentation (this feature)

```text
/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
/Users/itsnk/Desktop/Coding/tv-goldviewfx/
backend/
├── src/
│   ├── api/             # HTTP routes for sync, ideas, trades, dashboard data
│   ├── agents/          # Trading agent orchestration
│   ├── config/          # Runtime configuration loaders
│   ├── db/              # Convex access and queries
│   ├── integrations/    # TradingView, Telegram, exchange adapters
│   ├── jobs/            # Sync and enrichment workers
│   ├── services/        # Core business logic modules
│   └── types/           # Shared domain types
└── tests/
    ├── integration/
    └── unit/

frontend/
├── src/
│   ├── app/             # Next.js App Router entrypoints
│   ├── components/
│   ├── services/
│   ├── styles/
│   └── types/
└── tests/
    ├── integration/
    └── unit/

packages/
└── shared/              # Shared types and schemas used by backend/frontend

tests/
└── e2e/                 # Cross-system end-to-end coverage
```

**Structure Decision**: Use a backend/frontend split to separate ingestion,
trading, and API services from the operator UI, with shared domain types in a
packages workspace for consistency.

## Complexity Tracking

No constitution violations identified.

## Phase 0: Outline & Research

Research tasks derived from technical context and integrations:

- Research API framework choice for Bun services and routing conventions.
- Research background scheduling pattern for sync/enrichment jobs.
- Research exchange integration best practices for futures trading and risk
  controls.
- Research vector storage approach in Convex for similarity data.
- Research dashboard architecture patterns for operator monitoring workflows.

## Phase 1: Design & Contracts

- Define data model entities, fields, relationships, and state transitions.
- Produce API contracts for sync, enrichment, trading, and dashboard data.
- Draft quickstart for local development and deployment readiness.
- Update agent context to reflect chosen stack and structure.

## Post-Design Constitution Check

- Code quality: modules mapped to structure and error handling requirements.
- Testing: unit, integration, and critical flow coverage mapped to stories.
- UX consistency: dashboard and API fields aligned with entity definitions.
- Performance: validation plan documented in contracts and quickstart.
- Security: credentials, data validation, and access scope documented.

**Gate Status (Post-Design)**: PASS
