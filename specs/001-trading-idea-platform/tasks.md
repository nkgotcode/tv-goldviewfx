---

description: "Task list template for feature implementation"
---

# Tasks: Trading Idea Intelligence Platform

**Input**: Design documents from `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The tasks below include tests. End-to-end tests are REQUIRED for 100% feature and edge-case coverage.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`, `packages/shared/`
- **Tests**: `backend/tests/`, `frontend/tests/`, `tests/e2e/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project structure per implementation plan in `backend/src/.gitkeep`, `backend/tests/.gitkeep`, `frontend/src/.gitkeep`, `frontend/tests/.gitkeep`, `packages/shared/src/.gitkeep`, `tests/e2e/.gitkeep`
- [X] T002 Configure workspaces in `package.json`, `backend/package.json`, `frontend/package.json`, `packages/shared/package.json`
- [X] T003 Add shared TypeScript config in `tsconfig.base.json`, `backend/tsconfig.json`, `frontend/tsconfig.json`, `packages/shared/tsconfig.json`
- [X] T004 [P] Configure lint/format tooling in `eslint.config.js`, `.prettierrc`, `package.json`
- [X] T005 [P] Add Playwright config and e2e helpers in `playwright.config.ts`, `tests/e2e/fixtures.ts`
- [X] T006 [P] Add test setup files in `backend/tests/setup.ts`, `frontend/tests/setup.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Create shared domain types and schemas in `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`
- [X] T008 Create environment config loader in `backend/src/config/env.ts`
- [X] T009 Create Convex client and repository base in `backend/src/db/client.ts`, `backend/src/db/repositories/base.ts`
- [X] T010 Add database model updates in `convex/data.ts`
- [X] T011 Add logging and error middleware in `backend/src/services/logger.ts`, `backend/src/api/middleware/error.ts`
- [X] T012 [P] Add content hashing and dedup helpers in `backend/src/services/dedup.ts`
- [X] T013 Add auth and validation middleware in `backend/src/api/middleware/auth.ts`, `backend/src/api/middleware/validate.ts`
- [X] T014 Add API server bootstrap in `backend/src/api/server.ts`, `backend/src/api/routes/index.ts`
- [X] T015 Add job scheduler and registry in `backend/src/jobs/scheduler.ts`, `backend/src/jobs/registry.ts`
- [X] T016 Add exchange adapter interfaces in `backend/src/integrations/exchange/adapter.ts`, `backend/src/integrations/exchange/paper.ts`
- [X] T017 Add health endpoint in `backend/src/api/routes/health.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - TradingView Idea Sync (Priority: P1) 🎯 MVP

**Goal**: Ingest TradingView ideas with full content and track sync outcomes

**Independent Test**: Run a sync and verify ideas, revisions, and sync runs are stored and retrievable

### Tests for User Story 1 (REQUIRED) ⚠️

- [X] T018 [P] [US1] Contract tests for sync and ideas APIs in `backend/tests/integration/sync_tradingview.test.ts`, `backend/tests/integration/ideas.test.ts`
- [X] T019 [P] [US1] E2E tests for TradingView sync flow in `tests/e2e/tradingview-sync.spec.ts`
- [X] T020 [P] [US1] E2E tests for TradingView edge cases in `tests/e2e/tradingview-sync-edge.spec.ts`
- [X] T021 [P] [US1] Integration tests for idea dedup rules in `backend/tests/integration/ideas_dedup.test.ts`
- [X] T022 [P] [US1] E2E tests for TradingView dedup handling in `tests/e2e/tradingview-dedup.spec.ts`

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement TradingView client and parser in `backend/src/integrations/tradingview/client.ts`, `backend/src/integrations/tradingview/parser.ts`
- [X] T024 [P] [US1] Implement repositories for sources, ideas, revisions, sync runs in `backend/src/db/repositories/sources.ts`, `backend/src/db/repositories/ideas.ts`, `backend/src/db/repositories/idea_revisions.ts`, `backend/src/db/repositories/sync_runs.ts`
- [X] T025 [US1] Implement TradingView sync service and job in `backend/src/services/tradingview_sync.ts`, `backend/src/jobs/tradingview_sync_job.ts`
- [X] T026 [US1] Apply dedup rules and duplicate tracking in `backend/src/services/tradingview_sync.ts`, `backend/src/db/repositories/ideas.ts`
- [X] T027 [US1] Implement sync and ideas routes in `backend/src/api/routes/sync_tradingview.ts`, `backend/src/api/routes/sync_runs.ts`, `backend/src/api/routes/ideas.ts`
- [X] T028 [US1] Wire TradingView sync scheduling in `backend/src/jobs/registry.ts`

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Sentiment and Similarity Enrichment (Priority: P2)

**Goal**: Enrich ideas with sentiment and similarity data and expose signals

**Independent Test**: Run enrichment on a batch and confirm enriched data and signals are available

### Tests for User Story 2 (REQUIRED) ⚠️

- [X] T029 [P] [US2] Contract tests for enrichment and signals APIs in `backend/tests/integration/enrichment.test.ts`, `backend/tests/integration/signals.test.ts`
- [X] T030 [P] [US2] E2E tests for enrichment flow in `tests/e2e/enrichment.spec.ts`
- [X] T031 [P] [US2] E2E tests for enrichment failures in `tests/e2e/enrichment-edge.spec.ts`

### Implementation for User Story 2

- [X] T032 [P] [US2] Implement enrichment and signal repositories in `backend/src/db/repositories/enrichments.ts`, `backend/src/db/repositories/signals.ts`
- [X] T033 [US2] Implement enrichment service and job in `backend/src/services/enrichment.ts`, `backend/src/jobs/enrichment_job.ts`
- [X] T034 [US2] Implement signal builder in `backend/src/services/signal_builder.ts`
- [X] T035 [US2] Implement enrichment and signals routes in `backend/src/api/routes/enrichment.ts`, `backend/src/api/routes/signals.ts`
- [X] T036 [US2] Wire enrichment scheduling and retries in `backend/src/jobs/registry.ts`

**Checkpoint**: User Story 2 should be fully functional and testable independently

---

## Phase 5: User Story 3 - Gold Futures Trading Agent (Priority: P3)

**Goal**: Execute paper trades from signals with risk controls and audit logs

**Independent Test**: Enable paper mode, ingest signals, and verify trade proposals and executions

### Tests for User Story 3 (REQUIRED) ⚠️

- [X] T037 [P] [US3] Contract tests for agent config and trades APIs in `backend/tests/integration/agent_config.test.ts`, `backend/tests/integration/trades.test.ts`
- [X] T038 [P] [US3] E2E tests for paper trading flow in `tests/e2e/agent-paper.spec.ts`
- [X] T039 [P] [US3] E2E tests for agent risk and disabled states in `tests/e2e/agent-edge.spec.ts`

### Implementation for User Story 3

- [X] T040 [P] [US3] Implement repositories for agent config and trades in `backend/src/db/repositories/agent_config.ts`, `backend/src/db/repositories/trades.ts`, `backend/src/db/repositories/trade_executions.ts`
- [X] T041 [P] [US3] Implement risk engine and trading agent in `backend/src/services/risk_engine.ts`, `backend/src/agents/trading_agent.ts`
- [X] T042 [P] [US3] Implement exchange client adapter in `backend/src/integrations/exchange/bingx_client.ts`
- [X] T043 [US3] Implement trade execution and audit logging in `backend/src/services/trade_execution.ts`, `backend/src/services/trade_audit.ts`
- [X] T044 [US3] Implement agent and trades routes in `backend/src/api/routes/agent.ts`, `backend/src/api/routes/trades.ts`

**Checkpoint**: User Story 3 should be fully functional and testable independently

---

## Phase 6: User Story 4 - Operator Dashboard (Priority: P4)

**Goal**: Provide a dashboard for ideas, signals, and trades with filtering

**Independent Test**: Load the dashboard and confirm filtering and drill-downs work end-to-end

### Tests for User Story 4 (REQUIRED) ⚠️

- [X] T045 [P] [US4] Contract tests for dashboard summary API in `backend/tests/integration/dashboard.test.ts`
- [X] T046 [P] [US4] E2E tests for dashboard lists and filters in `tests/e2e/dashboard.spec.ts`
- [X] T047 [P] [US4] E2E tests for trade detail drill-down in `tests/e2e/dashboard-trade-detail.spec.ts`

### Implementation for User Story 4

- [X] T048 [US4] Implement dashboard summary route in `backend/src/api/routes/dashboard.ts`
- [X] T049 [P] [US4] Implement frontend API client in `frontend/src/services/api.ts`
- [X] T050 [P] [US4] Implement dashboard components in `frontend/src/app/page.tsx`, `frontend/src/components/IdeaTable.tsx`, `frontend/src/components/TradeTable.tsx`, `frontend/src/components/SignalPanel.tsx`
- [X] T051 [US4] Implement dashboard routing and layout in `frontend/src/app/layout.tsx`, `frontend/src/components/Layout.tsx`

**Checkpoint**: User Story 4 should be fully functional and testable independently

---

## Phase 7: User Story 5 - Telegram Signal Ingestion (Priority: P5)

**Goal**: Ingest Telegram posts as signals to enrich trading decisions

**Independent Test**: Ingest Telegram posts and verify they are stored and available as signals

### Tests for User Story 5 (REQUIRED) ⚠️

- [X] T052 [P] [US5] Contract tests for Telegram APIs in `backend/tests/integration/telegram_sources.test.ts`, `backend/tests/integration/telegram_ingest.test.ts`
- [X] T053 [P] [US5] E2E tests for Telegram ingestion in `tests/e2e/telegram-ingest.spec.ts`
- [X] T054 [P] [US5] E2E tests for Telegram edit/delete edge cases in `tests/e2e/telegram-edge.spec.ts`
- [X] T055 [P] [US5] Integration tests for Telegram dedup rules in `backend/tests/integration/telegram_dedup.test.ts`
- [X] T056 [P] [US5] E2E tests for Telegram dedup handling in `tests/e2e/telegram-dedup.spec.ts`

### Implementation for User Story 5

- [X] T057 [P] [US5] Implement Telegram client and parser in `backend/src/integrations/telegram/client.ts`, `backend/src/integrations/telegram/parser.ts`
- [X] T058 [P] [US5] Implement Telegram post repository in `backend/src/db/repositories/telegram_posts.ts`
- [X] T059 [US5] Implement Telegram ingestion service and job in `backend/src/services/telegram_ingest.ts`, `backend/src/jobs/telegram_ingest_job.ts`
- [X] T060 [US5] Apply dedup rules for Telegram posts in `backend/src/services/telegram_ingest.ts`, `backend/src/db/repositories/telegram_posts.ts`
- [X] T061 [US5] Implement Telegram routes in `backend/src/api/routes/telegram.ts`
- [X] T062 [US5] Wire Telegram ingestion scheduling in `backend/src/jobs/registry.ts`

**Checkpoint**: User Story 5 should be fully functional and testable independently

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T063 [P] Create e2e coverage matrix in `tests/e2e/coverage-matrix.md`
- [X] T064 [P] Add e2e fixtures and stubs in `tests/e2e/fixtures/tradingview.ts`, `tests/e2e/fixtures/telegram.ts`, `tests/e2e/fixtures/exchange.ts`
- [X] T065 Add CI test scripts in `package.json`, `backend/package.json`, `frontend/package.json`
- [X] T066 [P] Add security hardening checklist in `docs/security-checklist.md`
- [X] T067 Update quickstart validation notes in `specs/001-trading-idea-platform/quickstart.md`

---

## Phase 9: User Story 4 - Refinement (Refine + Advanced UI)

**Goal**: Deliver a production-ready refine.dev dashboard with advanced filters and full frontend tests

### Implementation for User Story 4 (Refinement)

- [X] T068 [P] [US4] Implement refine providers and data adapter in `frontend/src/app/providers.tsx`, `frontend/src/services/refine-data-provider.ts`, `frontend/src/app/layout.tsx`
- [X] T069 [US4] Overhaul dashboard layout and filters in `frontend/src/app/page.tsx`, `frontend/src/app/globals.css`, `frontend/src/components/Layout.tsx`
- [X] T070 [P] [US4] Upgrade dashboard tables in `frontend/src/components/IdeaTable.tsx`, `frontend/src/components/SignalTable.tsx`, `frontend/src/components/TradeTable.tsx`, `frontend/src/components/TelegramTable.tsx`
- [X] T071 [P] [US4] Add frontend test tooling in `frontend/vitest.config.ts`, `frontend/tests/setup.ts`, `frontend/package.json`
- [X] T072 [P] [US4] Add frontend component + page tests in `frontend/tests/IdeaTable.test.tsx`, `frontend/tests/SignalTable.test.tsx`, `frontend/tests/TradeTable.test.tsx`, `frontend/tests/TelegramTable.test.tsx`, `frontend/tests/HomePage.test.tsx`

---

## Phase 10: Production Fixes (Post-MVP)

**Goal**: Align live trading, pagination, and drill-down UX with production usage.

- [X] T073 [US4] Expand idea detail modal and remove external redirect in `frontend/src/components/IdeaTable.tsx`, `frontend/src/app/globals.css`
- [X] T074 [US4] Add pagination controls for all dashboard lists and fix totals in `frontend/src/components/TelegramTable.tsx`, `frontend/src/app/page.tsx`, `frontend/src/components/PaginationControls.tsx`
- [X] T075 [US4] Add trade execution drill-down with fills and PnL styling in `frontend/src/components/TradeTable.tsx`, `frontend/src/app/globals.css`
- [X] T076 [US1] Add TradingView HTML toggle, no-cache fetch, and HTTP timeouts in `backend/src/integrations/tradingview/client.ts`, `backend/src/services/tradingview_sync.ts`, `backend/tests/integration/sync_tradingview.test.ts`, `backend/tests/integration/ideas_dedup.test.ts`, `backend/src/config/env.ts`
- [X] T077 [US3] Replace CCXT with direct BingX adapter, client order tagging, and live execution metrics in `backend/src/integrations/exchange/bingx_client.ts`, `backend/src/services/trade_execution.ts`, `backend/src/agents/trading_agent.ts`, `backend/src/config/env.ts`, `backend/src/db/repositories/trades.ts`
- [X] T078 Update docs for BingX, pagination, and Convex CLI workflow in `README.md`, `specs/001-trading-idea-platform/quickstart.md`, `AGENTS.md`, `docs/security-checklist.md`, `docs/production-ops.md`
- [X] T079 [US4] Add dashboard dark mode toggle and theme variables in `frontend/src/components/Layout.tsx`, `frontend/src/app/globals.css`

---

## Phase 11: Ops Dashboard (Ingestion + Trading Control)

**Goal**: Provide full analytics and controls for TradingView, BingX, and Telegram ingestion plus paper/live trading modes.

- [X] T080 [US4] Add ingestion ops data model to unify TradingView, Telegram, and BingX run tracking (new `ingestion_runs`, `ingestion_configs`, and `ops_audit_events` tables with indexes) in `convex/data.ts` so the dashboard can show run history, status, and control state consistently across sources and feeds.
- [X] T081 [US4] Add ingestion ops repositories and status computation (`backend/src/db/repositories/ingestion_runs.ts`, `backend/src/db/repositories/ingestion_configs.ts`, `backend/src/db/repositories/ops_audit_events.ts`, `backend/src/services/ingestion_status.ts`) to back `/ops/ingestion/status`, `/ops/ingestion/runs`, and `/ops/audit` API responses.
- [X] T082 [US4] Wire TradingView + Telegram ingestion to record runs and status (create `ingestion_runs` on start/end, update lag + error summaries) in `backend/src/services/tradingview_sync.ts`, `backend/src/services/telegram_ingest.ts`, `backend/src/jobs/registry.ts` so `/ops/ingestion/status` reflects actual sync health.
- [X] T083 [US4] Wire BingX ingestion feeds to per-feed status + runs (candles, trades, order book, funding, open interest, mark/index price, tickers) in `backend/src/services/bingx_market_data_ingest.ts`, `backend/src/jobs/bingx_market_data.ts` to support `/ops/ingestion/status` and `/ops/ingestion/runs` with feed-level clarity.
- [X] T084 [US4] Add ingestion control logic (pause/resume/backfill/schedule settings) using `ingestion_configs` in `backend/src/jobs/scheduler.ts`, `backend/src/jobs/registry.ts`, `backend/src/services/bingx_market_data_ingest.ts`, `backend/src/services/tradingview_sync.ts`, `backend/src/services/telegram_ingest.ts` to power `/ops/ingestion/{source}/pause`, `/ops/ingestion/{source}/resume`, and `/ops/ingestion/{source}/backfill`.
- [X] T085 [US4] Add ops ingestion API routes in `backend/src/api/routes/ops_ingestion.ts` (GET `/ops/ingestion/status`, GET `/ops/ingestion/runs`, GET/PUT `/ops/ingestion/config`, POST `/ops/ingestion/{source}/run|pause|resume|backfill`) and register in `backend/src/api/routes/index.ts` for dashboard control and analytics.
- [X] T086 [US4] Add trading analytics service + routes in `backend/src/services/trade_analytics.ts`, `backend/src/api/routes/ops_trading.ts` to compute PnL, win rate, drawdown, exposure by instrument, and time-series metrics for `/ops/trading/summary` and `/ops/trading/metrics`.
- [X] T087 [US4] Add ops audit logging in `backend/src/services/ops_audit.ts` and call it from ingestion controls + trading mode changes (`backend/src/api/routes/ops_ingestion.ts`, `backend/src/api/routes/agent.ts`) so operator actions are visible in `/ops/audit`.
- [X] T088 [US4] Update ops API contract in `specs/001-trading-idea-platform/contracts/api.yaml` to include ingestion status, runs, config, backfill, trading analytics, and audit endpoints used by the dashboard.
- [X] T089 [US4] Add ops API client in `frontend/src/services/ops.ts` and wire to existing API helpers in `frontend/src/services/api.ts` for ingestion controls, analytics, trading metrics, and audit logs.
- [X] T090 [US4] Add dashboard ops UI (status tables, run history, controls, analytics cards, audit log) in `frontend/src/components/OperationsPanel.tsx`, `frontend/src/components/IngestionStatusTable.tsx`, `frontend/src/components/IngestionRunsTable.tsx`, `frontend/src/components/IngestionControls.tsx`, `frontend/src/components/TradingAnalyticsPanel.tsx`, `frontend/src/components/OpsAuditLog.tsx`, `frontend/src/app/page.tsx` so operators can act without leaving the dashboard.
- [X] T091 [US4] Add paper/live trading controls with confirmation and audit in `frontend/src/components/TradeControls.tsx`, `frontend/src/app/page.tsx` to drive `/agent/config` + `/ops/audit` and reflect active mode in the UI.
- [X] T092 [US4] Add integration + E2E tests for ops flows in `backend/tests/integration/ops_ingestion.test.ts`, `backend/tests/integration/ops_trading.test.ts`, `backend/tests/integration/ops_audit.test.ts`, `tests/e2e/dashboard-ops.spec.ts`, `frontend/tests/OperationsPanel.test.tsx` to validate status, controls, and analytics end-to-end.

---

## Phase 12: Ingestion Quality + Scheduling Controls

**Goal**: Add ingestion quality scoring, completeness re-fetch, and source-level rate-limit/backoff controls surfaced in the dashboard.

- [X] T093 [US1] Add ingestion quality scoring helper in `backend/src/services/ingestion_quality.ts` and extend TradingView parsing metadata in `backend/src/integrations/tradingview/parser.ts` to compute coverage %, missing fields, and parse confidence per idea and per run.
- [X] T094 [US1] Record ingestion quality metrics into `sync_runs` + `ingestion_runs` in `backend/src/services/tradingview_sync.ts` and `backend/src/services/telegram_ingest.ts` so `/ops/ingestion/status` reflects real completeness.
- [X] T095 [US1] Implement bounded re-fetch for incomplete ideas using configurable retry/backoff in `backend/src/services/tradingview_sync.ts`, `backend/src/jobs/registry.ts`, `backend/src/config/env.ts` to close content gaps without violating rate limits.
- [X] T096 [US4] Enforce ingestion config scheduling/backoff in `backend/src/jobs/scheduler.ts`, `backend/src/jobs/registry.ts`, `backend/src/services/bingx_market_data_ingest.ts` so per-source controls drive run cadence.
- [X] T097 [US4] Add ingestion schedule + backoff controls UI in `frontend/src/components/IngestionControls.tsx` and wire to `/ops/ingestion/config` via `frontend/src/services/ops.ts`.
- [X] T098 [US4] Add tests for quality scoring and re-fetch logic in `backend/tests/unit/ingestion_quality.test.ts`, `backend/tests/integration/tradingview_quality.test.ts`.

---

## Phase 13: Insights & Analytics

**Goal**: Deliver source efficacy, sentiment vs PnL, and topic trend analytics in the dashboard.

- [X] T099 [US4] Add analytics service for source efficacy + sentiment/PnL correlation in `backend/src/services/insights_analytics.ts` and expose via `/ops/insights/*` routes in `backend/src/api/routes/ops_insights.ts`.
- [X] T100 [US4] Add topic clustering job and storage in `backend/src/services/topic_clustering.ts`, `backend/src/jobs/topic_clustering.ts`, and `convex/data.ts` for weekly/monthly trend summaries.
- [X] T101 [US4] Add analytics API client methods in `frontend/src/services/ops.ts` for source efficacy, sentiment vs PnL, and topic trends.
- [X] T102 [US4] Add analytics UI panels in `frontend/src/components/SourceEfficacyPanel.tsx`, `frontend/src/components/SentimentPnlChart.tsx`, `frontend/src/components/TopicTrendsPanel.tsx`, `frontend/src/app/page.tsx`.
- [X] T103 [US4] Add integration + E2E tests for analytics endpoints and UI in `backend/tests/integration/ops_insights.test.ts`, `tests/e2e/dashboard-analytics.spec.ts`, `frontend/tests/AnalyticsPanels.test.tsx`.

---

## Phase 14: Workflow & Governance

**Goal**: Add review states, notes, audit history, and RBAC protections for operational actions.

- [X] T104 [US4] Add review workflow tables and enrichment audit history in `convex/data.ts` (idea review state/notes, enrichment_runs, enrichment_revisions, role_assignments).
- [X] T105 [US4] Add repositories + services for reviews/notes/audit history in `backend/src/db/repositories/idea_reviews.ts`, `backend/src/db/repositories/idea_notes.ts`, `backend/src/db/repositories/enrichment_runs.ts`, `backend/src/services/idea_review_service.ts`.
- [X] T106 [US4] Add RBAC middleware and role assignment helpers in `backend/src/api/middleware/rbac.ts`, `backend/src/services/rbac_service.ts`, and wire into `backend/src/api/routes/agent.ts`, `backend/src/api/routes/ops_ingestion.ts` to block analyst writes.
- [X] T107 [US4] Add review + notes API routes in `backend/src/api/routes/idea_reviews.ts`, `backend/src/api/routes/idea_notes.ts`, `backend/src/api/routes/enrichment_runs.ts`.
- [X] T108 [US4] Add review state + notes UI in `frontend/src/components/IdeaReviewPanel.tsx`, `frontend/src/components/IdeaNotes.tsx`, `frontend/src/components/IdeaTable.tsx` to expose governance actions.
- [X] T109 [US4] Add RBAC-focused tests in `backend/tests/integration/rbac.test.ts`, `backend/tests/integration/idea_reviews.test.ts`, `tests/e2e/idea-review-workflow.spec.ts`.

---

## Phase 15: Trading Safety & Gating

**Goal**: Add kill switch, promotion gates, and per-source gating for live trading safety.

- [X] T110 [US3] Extend agent configuration + source gating schema in `convex/data.ts` (kill switch fields, promotion gate thresholds, min confidence, allowed sources).
- [X] T111 [US3] Implement kill switch + promotion gate checks in `backend/src/services/risk_engine.ts`, `backend/src/services/trade_execution.ts`, `backend/src/agents/trading_agent.ts`, and validate in `backend/src/api/routes/agent.ts`.
- [X] T112 [US3] Add source policy repository + gating logic in `backend/src/db/repositories/source_policies.ts`, `backend/src/services/source_policy_service.ts`, `backend/src/services/signal_builder.ts`.
- [X] T113 [US4] Add trading safety controls in dashboard UI (kill switch, promotion gate status, source gating) in `frontend/src/components/TradeControls.tsx`, `frontend/src/components/SourceGatingPanel.tsx`.
- [X] T114 [US3] Add tests for kill switch, promotion gating, and source gating in `backend/tests/unit/risk_engine_kill_switch.test.ts`, `backend/tests/integration/source_gating.test.ts`, `tests/e2e/trading-safety.spec.ts`.

---

## Phase 16: Integrations (News + OCR)

**Goal**: Ingest news and enrich ideas with OCR from chart images.

- [X] T115 [US6] Add news ingestion tables + repositories in `convex/data.ts`, `backend/src/db/repositories/news_sources.ts`, `backend/src/db/repositories/news_items.ts`.
- [X] T116 [US6] Implement news ingestion client/parser/service/job in `backend/src/integrations/news/client.ts`, `backend/src/integrations/news/parser.ts`, `backend/src/services/news_ingest.ts`, `backend/src/jobs/news_ingest_job.ts`, and routes in `backend/src/api/routes/news.ts`.
- [X] T117 [US6] Wire news items into signals + analytics in `backend/src/services/signal_builder.ts`, `backend/src/services/insights_analytics.ts`.
- [X] T118 [US8] Add OCR media storage and processing in `convex/data.ts`, `backend/src/db/repositories/idea_media.ts`, `backend/src/services/ocr.ts`, `backend/src/jobs/ocr_job.ts`, and update TradingView parser in `backend/src/integrations/tradingview/parser.ts` to capture image URLs.
- [X] T119 [US8] Add OCR endpoints and UI display in `backend/src/api/routes/idea_ocr.ts`, `frontend/src/components/IdeaOcrPanel.tsx`, `frontend/src/components/IdeaTable.tsx`.
- [X] T120 [US6] Add integration + E2E tests for news + OCR in `backend/tests/integration/news_ingest.test.ts`, `backend/tests/integration/idea_ocr.test.ts`, `tests/e2e/news-ocr.spec.ts`.
- [X] T121 [US4] Update API contract for ops/insights, governance, news, OCR, and gating endpoints in `specs/001-trading-idea-platform/contracts/api.yaml`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel after Phase 2
- **Polish (Phase 8)**: Depends on desired user stories being complete
- **Ops Dashboard (Phase 11)**: Depends on ingestion + trading APIs and data models
- **Ingestion Quality (Phase 12)**: Depends on ingestion pipelines and ops run tracking
- **Insights & Analytics (Phase 13)**: Depends on ingestion + trading history and topic clustering storage
- **Workflow & Governance (Phase 14)**: Depends on ingestion data and ops audit logging
- **Trading Safety (Phase 15)**: Depends on trading agent and source policies
- **Integrations (Phase 16)**: Depends on ingestion foundation and review workflow

### User Story Dependencies

- **User Story 1 (P1)**: Required for data ingestion and blocks downstream analytics
- **User Story 2 (P2)**: Depends on User Story 1 for ideas input
- **User Story 3 (P3)**: Depends on User Story 2 for signals
- **User Story 4 (P4)**: Depends on User Stories 1-3 for data visibility
- **User Story 5 (P5)**: Depends on Foundational only; signals integrate with US2/US3
- **User Story 6 (P5)**: Depends on Foundational; news feeds integrate with US2/US3
- **User Story 7 (P4)**: Depends on User Story 1 for idea data
- **User Story 8 (P6)**: Depends on User Story 1 for TradingView media

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Repositories before services
- Services before routes/UI
- E2E tests must cover all listed edge cases and dedup rules

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel
- Repository tasks within a story marked [P] can run in parallel
- Contract tests and e2e tests for a story marked [P] can run in parallel

---

## Parallel Example: User Story 1

```text
Task: "Contract tests for sync and ideas APIs in backend/tests/integration/sync_tradingview.test.ts, backend/tests/integration/ideas.test.ts"
Task: "E2E tests for TradingView sync flow in tests/e2e/tradingview-sync.spec.ts"
Task: "Implement TradingView client and parser in backend/src/integrations/tradingview/client.ts, backend/src/integrations/tradingview/parser.ts"
```

## Parallel Example: User Story 2

```text
Task: "Contract tests for enrichment and signals APIs in backend/tests/integration/enrichment.test.ts, backend/tests/integration/signals.test.ts"
Task: "E2E tests for enrichment flow in tests/e2e/enrichment.spec.ts"
Task: "Implement enrichment and signal repositories in backend/src/db/repositories/enrichments.ts, backend/src/db/repositories/signals.ts"
```

## Parallel Example: User Story 3

```text
Task: "Contract tests for agent config and trades APIs in backend/tests/integration/agent_config.test.ts, backend/tests/integration/trades.test.ts"
Task: "E2E tests for paper trading flow in tests/e2e/agent-paper.spec.ts"
Task: "Implement risk engine and trading agent in backend/src/services/risk_engine.ts, backend/src/agents/trading_agent.ts"
```

## Parallel Example: User Story 4

```text
Task: "Contract tests for dashboard summary API in backend/tests/integration/dashboard.test.ts"
Task: "E2E tests for dashboard lists and filters in tests/e2e/dashboard.spec.ts"
Task: "Implement dashboard components in frontend/src/pages/Dashboard.tsx, frontend/src/components/IdeaTable.tsx"
```

## Parallel Example: User Story 5

```text
Task: "Contract tests for Telegram APIs in backend/tests/integration/telegram_sources.test.ts, backend/tests/integration/telegram_ingest.test.ts"
Task: "E2E tests for Telegram ingestion in tests/e2e/telegram-ingest.spec.ts"
Task: "Implement Telegram client and parser in backend/src/integrations/telegram/client.ts, backend/src/integrations/telegram/parser.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run contract tests and e2e tests for US1
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Run full e2e edge-case coverage
3. Add User Story 2 → Run full e2e edge-case coverage
4. Add User Story 3 → Run full e2e edge-case coverage
5. Add User Story 4 → Run full e2e edge-case coverage
6. Add User Story 5 → Run full e2e edge-case coverage

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
   - Developer D: User Story 4
   - Developer E: User Story 5
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- End-to-end tests must cover all features, edge cases, and dedup rules
- Commit after each task or logical group
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
