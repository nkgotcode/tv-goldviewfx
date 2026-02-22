---

description: "Task list for RL Trading Agent for Gold"
---

# Tasks: RL Trading Agent for Gold

**Input**: Design documents from `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required (unit, integration, and E2E suites for all features and edge cases) and MUST run against a Convex dev deployment with seeded test data.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create RL service package manifest with runtime + test deps in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/pyproject.toml`
- [X] T002 [P] Create RL service directory layout and entrypoint stub in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/server.py`
- [X] T003 [P] Add RL service configuration loader in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/config.py`
- [X] T004 [P] Add RL service request/response schemas in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/schemas.py`
- [X] T005 [P] Add RL service logging/telemetry helper in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/logging.py`
- [X] T006 [P] Add RL service test scaffolding in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/conftest.py`
- [X] T007 [P] Add RL service fixture README in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/fixtures/README.md`
- [X] T008 [P] Add Convex dev setup notes and env requirements in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`
- [X] T009 [P] Add Convex seed/import guidance in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`
- [X] T010 [P] Document local Convex test data workflow in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`
- [X] T011 [P] Add local test helper script in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/scripts/e2e-local.sh`
- [X] T012 [P] Create RL integration module index in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/index.ts`
- [X] T013 [P] Add RL service config module in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/rl_service.ts`
- [X] T014 [P] Create RL service HTTP client skeleton in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/client.ts`
- [X] T015 [P] Add RL domain types in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/types/rl.ts`
- [X] T016 [P] Add RL environment template values in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/.env.example`
- [X] T017 [P] Add backend test environment template in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/.env.test`
- [X] T018 [P] Add E2E test environment template in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T019 Create core RL tables (agent_versions, agent_runs, risk_limit_sets) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T020 Extend data model with decision + execution linkage tables in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T021 Extend data model with evaluation_reports + learning_updates in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T022 Extend data model with data_source_status + market_input_snapshots in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T023 Add query patterns and indexes for RL tables in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T024 [P] Implement AgentVersion repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/agent_versions.ts`
- [X] T025 [P] Implement AgentRun repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/agent_runs.ts`
- [X] T026 [P] Implement RiskLimitSet repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/risk_limit_sets.ts`
- [X] T027 [P] Implement TradeDecision repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/trade_decisions.ts`
- [X] T028 [P] Implement EvaluationReport repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/evaluation_reports.ts`
- [X] T029 [P] Implement LearningUpdate repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/learning_updates.ts`
- [X] T030 [P] Implement DataSourceStatus repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/data_source_status.ts`
- [X] T031 [P] Implement MarketInputSnapshot repository in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/market_input_snapshots.ts`
- [X] T032 [P] Extend trade executions repository for decision linkage in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/trade_executions.ts`
- [X] T033 [P] Add RL API input validators in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/schemas.ts`
- [X] T034 [P] Add RL service error mapping helper in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/errors.ts`
- [X] T035 Add RL audit logging helper in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_audit.ts`
- [X] T036 [P] Add backend test fixtures for runs, versions, and risk limits in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/fixtures/rl_agent.ts`
- [X] T037 [P] Add backend test fixtures for data sources in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/fixtures/data_sources.ts`
- [X] T038 [P] Add backend integration test helpers for RL routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/fixtures/rl_api.ts`
- [X] T039 [P] Add RL service synthetic market data fixture in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/fixtures/market_data.py`
- [X] T040 [P] Add RL service synthetic ideas/signals/news fixtures in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/fixtures/aux_data.py`
- [X] T041 [P] Add Convex import guidance for core RL data in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`
- [X] T042 [P] Add Convex import guidance for edge cases in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`
- [X] T043 [P] Add test bootstrap checks in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/setup.ts`
- [X] T044 [P] Enforce Convex dev deployment in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/setup.ts`
- [X] T045 [P] Add E2E Convex env helper in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/fixtures/convex.ts`
- [X] T046 [P] Wire Playwright global setup to validate Convex env in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/playwright.config.ts`

### BingX Market Data Foundation (Blocking)

- [X] T200 [P] Add BingX market data tables (candles, order book, trades, funding rates, open interest, mark/index prices, tickers) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/convex/data.ts`
- [X] T201 [P] Add BingX market data repositories in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/bingx_market_data/`
- [X] T202 [P] Implement BingX market data ingestion service with backfill + refresh scheduling in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/bingx_market_data_ingest.ts`
- [X] T203 [P] Add BingX market data polling job and rate-limit handling in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/bingx_market_data.ts`
- [X] T204 [P] Extend data source status tracking for BingX feeds in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_source_status_service.ts`
- [X] T205 [P] Add RL service data loader for BingX market data in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/data/bingx_loader.py`
- [X] T206 [P] Add RL service fixtures for BingX market data in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/fixtures/bingx_market_data.py`
- [X] T207 [P] Add backend integration tests for BingX ingestion pipelines in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/bingx_market_data.test.ts`

**Checkpoint**: Foundation ready (including BingX market data ingestion) - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Run RL trading on gold perpetuals (Priority: P1) 🎯 MVP

**Goal**: Operators can start/stop live RL trading on BingX gold perpetual pairs with risk limits and continuous learning.

**Independent Test**: Configure a pair and risk limits, start a live run, and verify trades are only placed for supported pairs and within limits while learning updates occur.

### Tests for User Story 1 (Unit + Integration + E2E)

- [X] T047 [P] [US1] Add RL service unit tests for feature extraction in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_feature_extraction.py`
- [X] T048 [P] [US1] Add RL service unit tests for dataset windowing in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_dataset_window.py`
- [X] T049 [P] [US1] Add RL service unit tests for inference validation in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_inference_validation.py`
- [X] T050 [P] [US1] Add RL service unit tests for promotion gating rules in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_promotion_gating.py`
- [X] T051 [P] [US1] Add RL service unit tests for conflicting signal resolution in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_conflict_resolution.py`
- [X] T052 [P] [US1] Add backend unit tests for risk limits evaluation in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/unit/risk_limits_service.test.ts`
- [X] T053 [P] [US1] Add backend unit tests for decision pipeline mapping in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/unit/rl_decision_pipeline.test.ts`
- [X] T054 [P] [US1] Add backend integration tests for agent run lifecycle in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rl_agent_runs.test.ts`
- [X] T055 [P] [US1] Add backend integration tests for decision + execution linkage in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rl_decisions.test.ts`
- [X] T056 [P] [US1] Add backend integration tests for version promotion/rollback in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rl_versions.test.ts`
- [X] T057 [P] [US1] Add E2E test for live trading flow in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-live.spec.ts`
- [X] T058 [P] [US1] Add E2E edge case test for risk limit breach pause in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-risk-limit.spec.ts`
- [X] T059 [P] [US1] Add E2E edge case test for partial fill handling in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-partial-fill.spec.ts`
- [X] T060 [P] [US1] Add E2E edge case test for exchange maintenance halt in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-maintenance.spec.ts`
- [X] T061 [P] [US1] Add E2E edge case test for volatility spike safety in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-volatility.spec.ts`
- [X] T062 [P] [US1] Add E2E edge case test for learning updates without interruption in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-learning-window.spec.ts`
- [X] T063 [P] [US1] Add E2E edge case test for conflicting signals handling in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-conflicting-signals.spec.ts`
- [X] T064 [P] [US1] Add E2E edge case test for learning rollback on degraded performance in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-agent-learning-rollback.spec.ts`
- [X] T065 [P] [US1] Add E2E fixtures for RL agent scenarios in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/fixtures/rl-agent.ts`

### RL Service Milestone (User Story 1)

- [X] T066 [P] [US1] Implement feature extraction pipeline in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/features/extractors.py`
- [X] T067 [P] [US1] Implement dataset builder with rolling window in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/data/dataset_builder.py`
- [X] T068 [P] [US1] Implement inference API handler in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/api/inference.py`
- [X] T069 [P] [US1] Implement action mapper for trade intents in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/models/action_mapper.py`
- [X] T070 [P] [US1] Implement continuous training loop in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/continuous.py`
- [X] T071 [P] [US1] Implement model registry and artifact loader in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/models/registry.py`
- [X] T072 [P] [US1] Implement promotion gating rules in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/promotion.py`
- [X] T073 [P] [US1] Implement RL service health endpoint in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/api/health.py`
- [X] T074 [P] [US1] Implement training metrics emitter in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/metrics.py`

### Backend Milestone (User Story 1)

- [X] T075 [US1] Implement run lifecycle service with state transitions in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_agent_service.ts`
- [X] T076 [P] [US1] Implement risk limits service with validation helpers in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/risk_limits_service.ts`
- [X] T077 [P] [US1] Implement agent version service with promotion/rollback in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/agent_version_service.ts`
- [X] T078 [US1] Implement decision pipeline integration and policy snapshotting in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts`
- [X] T079 [US1] Implement learning update scheduler job in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/learning_updates.ts`
- [X] T080 [US1] Implement trade execution linkage to decisions in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_execution.ts`
- [X] T081 [P] [US1] Implement agent run routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/agent.ts`
- [X] T082 [P] [US1] Implement risk limit routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/risk_limits.ts`
- [X] T083 [P] [US1] Implement agent version routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/agent_versions.ts`
- [X] T084 [US1] Register RL routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/index.ts`
- [X] T085 [US1] Wire RL audit logging into decision pipeline in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts`

### Frontend Milestone (User Story 1)

- [X] T086 [P] [US1] Add RL agent API client methods in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/rl_agent.ts`
- [X] T087 [P] [US1] Add live trading operator page with run controls in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-agent/page.tsx`
- [X] T088 [P] [US1] Add agent run detail panel component in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/rl-agent/RunDetailPanel.tsx`
- [X] T089 [P] [US1] Add risk limits editor component in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/rl-agent/RiskLimitsForm.tsx`

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Evaluate performance before live trading (Priority: P2)

**Goal**: Operators can run evaluations and review performance reports before live trading.

**Independent Test**: Run a paper evaluation for a supported pair and verify the report includes win rate, net PnL after fees, drawdown, trade count, and exposure.

### Tests for User Story 2 (Unit + Integration + E2E)

- [X] T090 [P] [US2] Add RL service unit tests for evaluation metrics in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_evaluation_metrics.py`
- [X] T091 [P] [US2] Add RL service integration tests for evaluation endpoint in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/integration/test_evaluations_api.py`
- [X] T092 [P] [US2] Add backend unit tests for evaluation service in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/unit/evaluation_service.test.ts`
- [X] T093 [P] [US2] Add backend integration tests for evaluation endpoints in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rl_evaluations.test.ts`
- [X] T094 [P] [US2] Add E2E test for evaluation workflow in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-evaluations.spec.ts`
- [X] T095 [P] [US2] Add E2E edge case test for evaluation failing thresholds in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-evaluations-fail.spec.ts`
- [X] T096 [P] [US2] Add E2E edge case test for evaluation with missing data in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-evaluations-missing-data.spec.ts`
- [X] T097 [P] [US2] Add E2E fixtures for evaluation scenarios in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/fixtures/rl-evaluations.ts`

### RL Service Milestone (User Story 2)

- [X] T098 [P] [US2] Implement evaluation API handler in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/api/evaluations.py`
- [X] T099 [P] [US2] Implement evaluation pipeline logic in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/evaluation.py`
- [X] T100 [P] [US2] Implement evaluation report formatter in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/reports/evaluation_report.py`

### Backend Milestone (User Story 2)

- [X] T101 [US2] Implement evaluation service and persistence in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/evaluation_service.ts`
- [X] T102 [US2] Add evaluation routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/agent_evaluations.ts`
- [X] T103 [US2] Register evaluation routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/index.ts`

### Frontend Milestone (User Story 2)

- [X] T104 [P] [US2] Add evaluation API client in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/rl_evaluations.ts`
- [X] T105 [P] [US2] Add evaluation reports page in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-evaluations/page.tsx`
- [X] T106 [P] [US2] Add evaluation report detail component in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/rl-agent/EvaluationReportPanel.tsx`

**Checkpoint**: User Story 2 should be fully functional and testable independently

---

## Phase 5: User Story 3 - Manage data sources and quality (Priority: P3)

**Goal**: Operators can enable or disable data sources and monitor freshness to protect trading quality.

**Independent Test**: Disable a data source and confirm the agent excludes it and flags the change; mark a source stale and verify trading pauses.

### Tests for User Story 3 (Unit + Integration + E2E)

- [X] T107 [P] [US3] Add backend unit tests for data source staleness detection in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/unit/data_source_status_service.test.ts`
- [X] T108 [P] [US3] Add backend integration tests for data source pause behavior in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/data_sources_pause.test.ts`
- [X] T109 [P] [US3] Add backend integration tests for data source config updates in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/data_sources_config.test.ts`
- [X] T110 [P] [US3] Add backend integration tests for missing market data gating in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/data_sources_missing_data.test.ts`
- [X] T111 [P] [US3] Add E2E test for data source disable flow in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-data-sources.spec.ts`
- [X] T112 [P] [US3] Add E2E edge case test for stale source auto-pause in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-data-sources-stale.spec.ts`
- [X] T113 [P] [US3] Add E2E edge case test for missing market data in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-data-sources-missing.spec.ts`
- [X] T114 [P] [US3] Add E2E fixtures for data source scenarios in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/fixtures/rl-data-sources.ts`

### Backend Milestone (User Story 3)

- [X] T115 [P] [US3] Implement data source status service in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_source_status_service.ts`
- [X] T116 [P] [US3] Implement data source monitor job in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/data_source_monitor.ts`
- [X] T117 [US3] Add data source routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/data_sources.ts`
- [X] T118 [US3] Register data source routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/index.ts`

### Frontend Milestone (User Story 3)

- [X] T119 [P] [US3] Add data source API client in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/data_sources.ts`
- [X] T120 [P] [US3] Add data source management page in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-data-sources/page.tsx`
- [X] T121 [P] [US3] Add data source status table component in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/rl-agent/DataSourceStatusTable.tsx`

### Dashboard Ingestion Analytics & Controls (User Story 3)

- [X] T122 [P] [US3] Add ingestion status aggregation service + endpoint in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/ingestion_status.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/ingestion.ts`
- [X] T123 [P] [US3] Add ingestion control routes for TradingView sync, Telegram ingest, and BingX backfill/refresh in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/ingestion.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/index.ts`
- [X] T124 [P] [US3] Add ingestion analytics + controls page in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/ingestion/page.tsx` and components in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/ingestion/`
- [X] T125 [P] [US3] Add E2E coverage for ingestion analytics and controls in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/ingestion-controls.spec.ts`

**Checkpoint**: User Story 3 should be fully functional and testable independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T126 [P] Document operator workflows and runbook in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-trading-agent.md`
- [X] T127 [P] Add monitoring metrics for decision latency and learning windows in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_metrics.ts`
- [X] T128 [P] Update E2E coverage matrix in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/coverage-matrix.md`
- [X] T125 [P] Add RL service README in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/README.md`
- [X] T126 [P] Add RL service operational checklist in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/ops_checklist.md`

---

## Phase 7: Ops Dashboard Integration (Ingestion + Trading Controls)

**Purpose**: Provide operator analytics and controls for TradingView/BingX/Telegram ingestion and paper/live trading modes.

- [X] T127 [US3] Extend data source status tracking for TradingView + Telegram ingestion in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_source_status_service.ts`, `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/data_sources.ts`
- [X] T128 [US3] Add BingX ingestion control endpoints (backfill/refresh/status) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/bingx_market_data.ts`
- [X] T129 [US3] Add ops dashboard page and control panel components in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-ops/page.tsx`, `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/rl-agent/OpsControlPanel.tsx`
- [X] T130 [US3] Add ops dashboard API client for ingestion + trading controls in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/rl_ops.ts`
- [X] T131 [US3] Add E2E tests for ops dashboard controls in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-ops-dashboard.spec.ts`
- [X] T156 [US3] Add data source run history + backfill endpoints in `backend/src/api/routes/data_sources.ts`, `backend/src/services/data_source_status_service.ts` to power `/data-sources/runs` and `/data-sources/backfill`.
- [X] T157 [US3] Add ops UI for run history + backfill requests in `frontend/src/components/rl-agent/DataSourceRunsTable.tsx`, `frontend/src/components/rl-agent/BackfillForm.tsx`, `frontend/src/app/rl-ops/page.tsx`.

---

## Phase 8: Data Quality + Dataset Lineage (US4)

**Purpose**: Track input quality, version datasets, and enforce lineage for reproducible training/evaluation.

- [X] T132 [US4] Add data quality + dataset lineage tables in `convex/data.ts` (data_quality_metrics, dataset_versions, dataset_lineage, feature_set_versions).
- [X] T133 [US4] Add repositories for data quality + datasets in `backend/src/db/repositories/data_quality_metrics.ts`, `backend/src/db/repositories/dataset_versions.ts`, `backend/src/db/repositories/feature_set_versions.ts`.
- [X] T134 [US4] Add data quality computation + gating service in `backend/src/services/data_quality_service.ts` and enforce gates in `backend/src/services/rl_agent_service.ts` before training/live runs.
- [X] T135 [US4] Extend RL dataset builder to emit dataset version + checksums in `backend/rl-service/src/data/dataset_builder.py` and expose via `backend/rl-service/src/api/datasets.py`.
- [X] T136 [US4] Add dataset + quality API routes in `backend/src/api/routes/datasets.ts`, `backend/src/api/routes/data_quality.ts`, register in `backend/src/api/routes/index.ts`.
- [X] T137 [US4] Add dataset/version UI panels in `frontend/src/components/rl-agent/DatasetPanel.tsx`, `frontend/src/app/rl-agent/page.tsx`.
- [X] T138 [US4] Add tests for dataset lineage + quality gating in `backend/tests/integration/datasets.test.ts`, `backend/tests/integration/data_quality.test.ts`, `backend/rl-service/tests/integration/test_datasets_api.py`.
- [X] T155 [US4] Document the RL environment (state/action/reward, fees, slippage, liquidation, partial fills) in `backend/rl-service/docs/environment.md` and reference from `backend/rl-service/README.md`.

---

## Phase 9: Safety Governance (US5)

**Purpose**: Add kill switches, promotion gates, and per-source gating for live safety.

- [X] T139 [US5] Extend RL governance schema in `convex/data.ts` (kill_switch, promotion_gate thresholds, source_policies, drift_alerts).
- [X] T140 [US5] Implement kill switch + promotion gate checks in `backend/src/services/rl_agent_service.ts`, `backend/src/services/rl_decision_pipeline.ts`, `backend/src/api/routes/agent.ts`.
- [X] T141 [US5] Add source gating rules in `backend/src/services/source_gating_service.ts`, `backend/src/services/signal_builder.ts`, `backend/src/db/repositories/source_policies.ts`.
- [X] T142 [US5] Add governance API routes in `backend/src/api/routes/rl_governance.ts` and wire ops audit logging in `backend/src/services/rl_audit.ts`.
- [X] T143 [US5] Add governance UI controls (kill switch, promotion gate status, source gating) in `frontend/src/components/rl-agent/GovernancePanel.tsx`.
- [X] T144 [US5] Add tests for kill switch and gating in `backend/tests/integration/rl_governance.test.ts`, `tests/e2e/rl-governance.spec.ts`.

---

## Phase 10: Monitoring + Drift Detection (US5)

**Purpose**: Detect model drift, alert operators, and auto-fallback.

- [X] T145 [US5] Implement drift detection logic in `backend/rl-service/src/monitoring/drift.py` and emit alerts via `backend/rl-service/src/api/monitoring.py`.
- [X] T146 [US5] Add drift alert repository + API routes in `backend/src/db/repositories/drift_alerts.ts`, `backend/src/api/routes/drift_alerts.ts`.
- [X] T147 [US5] Wire fallback to last promoted model in `backend/src/services/agent_version_service.ts`, `backend/src/services/rl_agent_service.ts`.
- [X] T148 [US5] Add drift monitoring UI in `frontend/src/components/rl-agent/DriftAlertsPanel.tsx`, `frontend/src/app/rl-agent/page.tsx`.
- [X] T149 [US5] Add tests for drift detection + fallback in `backend/tests/integration/drift_alerts.test.ts`, `backend/rl-service/tests/integration/test_drift_api.py`.

---

## Phase 11: Feature Inputs (News + OCR) (US6)

**Purpose**: Include news sentiment and OCR-derived chart text in RL feature sets.

- [X] T150 [US6] Extend RL data loader to include news sentiment + OCR text in `backend/rl-service/src/data/feature_inputs.py`, `backend/src/rl/data_loader.ts`.
- [X] T151 [US6] Add feature set versioning for news/OCR features in `backend/rl-service/src/features/feature_registry.py`, `backend/src/services/feature_set_service.ts`, `backend/src/api/routes/feature_sets.ts`.
- [X] T152 [US6] Add data source status mapping for news/OCR in `backend/src/services/data_source_status_service.ts`, `backend/src/api/routes/data_sources.ts`.
- [X] T153 [US6] Add UI toggles for feature inputs in `frontend/src/components/rl-agent/FeatureInputsPanel.tsx`.
- [X] T154 [US6] Add tests for news/OCR feature inputs in `backend/rl-service/tests/unit/test_feature_inputs.py`, `tests/e2e/rl-feature-inputs.spec.ts`.

---

## Dependencies & Execution Order

### Dependency Graph

```text
Phase 1 (Setup) -> Phase 2 (Foundational) -> {Phase 3 (US1), Phase 4 (US2), Phase 5 (US3)} -> Phase 6 (Polish) -> Phase 7 (Ops Dashboard) -> Phase 8 (Data Quality) -> Phase 9 (Governance) -> Phase 10 (Monitoring) -> Phase 11 (Feature Inputs)
```

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel if staffed
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete
- **Ops Dashboard (Phase 7)**: Depends on data source management (Phase 5) and live trading controls (Phase 3)
- **Data Quality (Phase 8)**: Depends on BingX market data + ingestion pipelines
- **Safety Governance (Phase 9)**: Depends on risk limits + agent lifecycle routes
- **Monitoring + Drift (Phase 10)**: Depends on model versioning and evaluation reporting
- **Feature Inputs (Phase 11)**: Depends on ingestion feeds and dataset versioning

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P2)**: Depends on ingestion pipelines and data source status (Phase 5)
- **User Story 5 (P3)**: Depends on model versioning and risk limits (Phases 3-4)
- **User Story 6 (P4)**: Depends on feature input availability (news/OCR ingestion)

---

## Parallel Execution Examples

### User Story 1

```text
T047–T065 (tests)
T066–T074 (RL service)
T076–T083 (backend services/routes)
T086–T089 (frontend)
```

### User Story 2

```text
T090–T097 (tests)
T098–T100 (RL service)
T104–T106 (frontend)
```

### User Story 3

```text
T107–T114 (tests)
T115–T118 (backend services/routes)
T119–T121 (frontend)
```

---

## Phase 8: Production Hardening (Post-MVP)

**Purpose**: Production readiness requirements for execution integrity, risk, data integrity, observability, security, resilience, and deployment.

- [x] T900 Order execution integrity: implement state machine + idempotency keys in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_execution.ts`
- [x] T901 Exchange reconciliation job: reconcile orders, fills, and positions in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/` with audit logs in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/ops_audit.ts`
- [x] T902 Account risk guardrails: margin checks, exposure caps, and circuit breakers in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/account_risk_service.ts`
- [x] T903 Data integrity gates: timestamp alignment + gap verification in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_integrity_service.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts`
- [x] T904 Observability + SLOs: latency, lag, slippage, drift metrics + alerts in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/`
- [x] T905 Security + audit: secrets rotation + RBAC enforcement across write routes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/middleware/rbac.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rbac_service.ts`
- [x] T906 Resilience + recovery: retry queues + replay protection + DR runbooks in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/`
- [x] T907 Deployment safety: staging + canary pipelines + rollback automation in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/scripts/` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/`
- [x] T908 Execution replay safety: resolve missing `exchange_order_id` via client order ID, add bounded retries + alerts in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_execution.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_reconciliation.ts`
- [x] T909 Single-token RBAC: ignore role headers when `API_TOKEN` is set; update tests in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rbac.test.ts`
- [x] T910 Candle ordering enforcement: sort timestamps + warnings in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_integrity_service.ts` with unit coverage
- [x] T911 Search scalability: avoid full-table scans for `ilike`/`or` filters; add indexed query paths or external search with perf tests
- [x] T912 Exit controls: add close/cancel endpoints, reduce‑only adapter support, and audit logging in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_execution.ts` + `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/trades.ts`
- [x] T913 Allowed instrument enforcement: block run start + execution when `allowed_instruments` excludes the pair

---

## Phase 12: Model Stack Completion (Post-Hardening)

**Purpose**: Replace RL stubs with real SB3 + Nautilus training, durable artifacts, deterministic datasets, and backtest-driven evaluations.

### Milestone M12.1: Deterministic Datasets + Lineage Enforcement

**Context**: Decision provenance must reference a reproducible dataset snapshot. Training and evaluation must be tied to immutable hashes.

- [x] T920 Dataset snapshot builder: generate dataset snapshots and hashes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/dataset_service.ts` and export bundles for RL service in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/data_loader.ts`.
- [x] T921 Snapshot provenance enforcement: persist `dataset_version_id` + `dataset_hash` into `MarketInputSnapshot` and require them in decision provenance in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts`.
- [x] T922 Contracts + data model: update dataset/decision schemas in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/data-model.md` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/contracts/openapi.yaml`.
- [x] T923 Tests: unit tests for hashing/replay determinism (`backend/src/rl/__tests__`), integration tests for dataset APIs (`backend/tests/integration/datasets.test.ts`), and E2E coverage for dataset lineage (`tests/e2e/rl-data-sources.spec.ts` or new spec).

### Milestone M12.2: Model Artifacts + Registry

**Context**: Model artifacts must be durable and reloadable, with metadata used for promotion/rollback.

- [x] T930 Artifact storage: add Convex file storage integration and artifact metadata persistence in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/models/registry.py` and backend repositories.
- [x] T931 Registry load/update: load agent versions by `artifact_uri` with checksum validation and fallback in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/models/registry.py`.
- [x] T932 Backend linking: attach artifact metadata to agent versions and evaluations in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/agent_versions.ts` and `evaluation_reports.ts`.
- [x] T933 Contracts + data model: add artifact metadata fields in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/data-model.md` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/contracts/openapi.yaml`.
- [x] T934 Tests: RL service unit tests for registry load/checksum (`backend/rl-service/tests/unit/`), integration tests for artifact metadata, and E2E promotion flow (`tests/e2e/rl-evaluations.spec.ts`).

### Milestone M12.3: SB3 + Nautilus Training Pipeline

**Context**: Training must run against a real Gymnasium-compatible environment and persist checkpoints.

- [x] T940 Gymnasium env: implement Nautilus-backed environment in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/envs/` with deterministic reset/step behavior.
- [x] T941 Training loop: add SB3 training + checkpointing pipeline in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/continuous.py` and store checkpoints via registry.
- [x] T942 Inference adapter: load SB3 models for inference in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/inference/`.
- [x] T943 Tests: unit tests for env determinism and observation shapes, integration tests for a minimal training run producing a checkpoint, and E2E `train → evaluate → promote` flow behind a fast-test flag.

### Milestone M12.4: Backtest Evaluation (Nautilus)

**Context**: Evaluation must use Nautilus backtests rather than synthetic trades.

- [x] T950 Nautilus backtest runner: implement evaluation runs in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/evaluation.py`.
- [x] T951 Metrics + gating: compute win rate/PnL/drawdown from backtest trades and enforce promotion gates in backend evaluation routes.
- [x] T952 Contracts + data model: add `backtest_run_id`, `artifact_uri`, `dataset_hash` fields in the evaluation schema and API contract.
- [x] T953 Tests: unit tests for metric calculations, integration tests for evaluation endpoints, and E2E evaluation report validation.

### Milestone M12.5: End-to-End Provenance and Robustness

**Context**: Full traceability from dataset → model → decision is required for production.

- [x] T960 Decision provenance enforcement: reject decisions without dataset hash + artifact URI references.
- [x] T961 Failure-path tests: missing artifact, dataset hash mismatch, and training run failures.
- [x] T962 E2E provenance run: seed dataset snapshot, train, evaluate, promote, and start a paper run with linked provenance.

---

## Phase 13: TA-Lib Feature Store + Champion/Challenger Online Learning (US7)

**Purpose**: Implement TA-Lib-powered feature enrichment with a canonical feature pipeline, snapshot caching, walk-forward evaluation, and safer online learning promotion gates.

**Commit-size rule**: Each task below should be deliverable in one focused commit touching only the listed files (or a tightly related new file in the same folder).

### Tests for User Story 7 (Unit + Integration + E2E)

- [x] T970 [P] [US7] Add RL service unit tests for TA-Lib feature determinism and warmup handling in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_talib_pipeline.py`
- [x] T971 [P] [US7] Add RL service unit tests for cross-path feature parity (train/infer/backtest vectors) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/unit/test_feature_parity.py`
- [x] T972 [P] [US7] Add backend integration tests for feature snapshot repository read/write and idempotency in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/rl_feature_snapshots.test.ts`
- [x] T973 [P] [US7] Add backend integration tests for dataset hash reproducibility with cached feature snapshots in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/datasets_feature_cache.test.ts`
- [x] T974 [P] [US7] Add RL service integration tests for walk-forward evaluation folds in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/integration/test_walk_forward_evaluations_api.py`
- [x] T975 [P] [US7] Add backend integration tests for challenger-vs-champion promotion decisions in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/integration/online_learning_challenger.test.ts`
- [x] T976 [P] [US7] Add E2E test for TA-Lib-backed train → evaluate → promote cycle in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-talib-promotion.spec.ts`
- [x] T977 [P] [US7] Add E2E test for forced hold on OOD/missing critical features in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/rl-ood-safety.spec.ts`

### Milestone M13.1: Feature Set v2 Contract + Snapshot Storage

- [x] T978 [US7] Add feature-set `v2` TA parameter contract and parsing helpers in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/feature_set_service.ts`
- [x] T979 [US7] Add `rl_feature_snapshots` Timescale schema + indexes in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/timescale/market_data.ts`
- [x] T980 [US7] Implement feature snapshot repository (upsert/list/missing-range) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/rl_feature_snapshots.ts`
- [x] T981 [US7] Extend RL domain types for feature snapshot payloads and fold config fields in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/types/rl.ts`

### Milestone M13.2: TA-Lib Pipeline in RL Service

- [x] T982 [US7] Add TA-Lib runtime dependency and extras wiring in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/pyproject.toml`
- [x] T983 [US7] Implement TA-Lib canonical feature builder module in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/features/technical_pipeline.py`
- [x] T984 [US7] Update feature registry to carry TA config and schema fingerprinting in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/features/feature_registry.py`
- [x] T985 [US7] Update RL service schemas to accept enriched dataset feature payloads and fold configs in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/schemas.py`

### Milestone M13.3: Canonical Pipeline Reuse (Train/Infer/Backtest)

- [x] T986 [US7] Refactor feature extraction entrypoints to source vectors from technical pipeline in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/features/extractors.py`
- [x] T987 [US7] Refactor environment observation generation to consume canonical vectors in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/envs/market_env.py`
- [x] T988 [US7] Refactor strategy inference to use canonical TA-Lib vectors in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/rl_strategy.py`
- [x] T989 [US7] Refactor evaluation pipeline to reuse canonical vectors before Nautilus backtest execution in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/evaluation.py`

### Milestone M13.4: Dataset Snapshot Cache Integration

- [x] T990 [US7] Add feature snapshot read-through cache service in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/feature_snapshot_service.ts`
- [x] T991 [US7] Integrate dataset builder to use snapshot-first retrieval with write-back on misses in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/dataset_service.ts`
- [x] T992 [US7] Include feature-set schema fingerprint in dataset hashing and version metadata in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/data/dataset_builder.py`

### Milestone M13.5: Walk-Forward Evaluation Contracts + Persistence

- [x] T993 [US7] Extend backend evaluation request schema/types for walk-forward fold config in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/schemas.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/types/rl.ts`
- [x] T994 [US7] Extend RL service evaluations API contract for fold parameters in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/api/evaluations.py` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/schemas.py`
- [x] T995 [US7] Implement walk-forward split utility with purge/embargo support in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/training/walk_forward.py`
- [x] T996 [US7] Persist fold-level metrics and aggregate stats into evaluation report metadata in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/evaluation_service.ts`

### Milestone M13.6: Champion/Challenger Online Learning Gates

- [x] T997 [US7] Implement champion snapshot resolution and challenger comparison flow in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/online_learning_service.ts`
- [x] T998 [US7] Add delta-based promotion/rejection gates (PnL, drawdown, trade count, win-rate) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/learning_updates.ts`
- [x] T999 [US7] Persist promotion decision reasons and metric deltas in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/db/repositories/learning_updates.ts`

### Milestone M13.7: Safety + Observability for Enriched Features

- [x] T1000 [US7] Implement feature quality gate (missing critical fields, OOD checks) in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/feature_quality_gate.ts`
- [x] T1001 [US7] Enforce forced-hold behavior from feature quality gate in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_decision_pipeline.ts`
- [x] T1002 [US7] Emit feature freshness/missing/OOD metrics in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_metrics.ts` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/observability_service.ts`

### Milestone M13.8: Documentation and Operations

- [x] T1003 [US7] Add TA-Lib installation and troubleshooting runbook in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/README.md`
- [x] T1004 [US7] Document rollout/rollback and online-learning toggles for TA-Lib phase in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-trading-agent.md`
- [x] T1005 [US7] Align design + execution references in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-ta-lib-feature-architecture.md` and `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-ta-lib-execution-plan.md` with implemented contracts

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run unit, integration, and E2E tests for User Story 1 using a Convex dev deployment

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. User Story 1 → Validate live trading controls
3. User Story 2 → Validate evaluation reports
4. User Story 3 → Validate data source gating
5. Polish → Update docs and monitoring

### Parallel Team Strategy

1. Team completes Setup + Foundational
2. Parallel execution by story: US1, US2, US3
3. Polish once desired stories are complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Avoid cross-story file conflicts when running tasks in parallel
