# Institutional-Grade Architecture Plan (Pragmatic Rollout)

## Objective
Build an institutional-grade RL trading infrastructure from the current tv-goldviewfx baseline, with phased delivery that prioritizes correctness, reliability, risk control, and reproducibility.

This plan is implementation-focused for this repository and current stack (Bun/TypeScript backend + Python RL service + Timescale/Convex + BingX).

## Scope Decision for Now
Per current direction, this plan does **not** require implementing:

- Authenticated APIs
- Strict RBAC

These are intentionally deferred so core data/execution/learning infrastructure can be hardened first.

## Deferred Security Controls (Track, Don’t Block)
The following controls remain deferred and should be tracked in backlog:

- API authentication middleware hard enforcement
- Strict role-based authorization for operator actions
- Signed command approvals for promote/rollback/kill-switch actions

Status: `Deferred (not in current execution phases)`

## Current Gaps Summary
The system is functional but not institutional-grade yet due to:

- Hardcoded exchange precision/instrument assumptions in Nautilus backtest setup
- Simplified fee/slippage/funding modeling disconnected from venue/account reality
- Batch-style online learning orchestration rather than true event-driven continuous updates
- In-process scheduler and job coordination (no distributed lease/leader control)
- Non-atomic model promotion and immediate run roll-forward without staged rollout
- Approximate risk sizing/exposure semantics (quantity-based vs notional/portfolio-aware)
- WS ingestion without strict sequence integrity/replay guarantees
- Large JSON payload transfer of full datasets between backend and RL service
- Limited drift methodology and weak statistical promotion confidence

## Target Architecture (End State)

### 1) Control Plane (without auth/RBAC hardening for now)
Responsibilities:

- Global runtime configuration and policy state
- Promotion/rollback orchestration state
- Kill-switch and risk-policy controls
- Full immutable operational audit trail

Required properties:

- Deterministic, idempotent control actions
- Human-readable and machine-verifiable audit records
- Explicit state transitions with rollback points

### 2) Market Data Plane
Responsibilities:

- Ingest BingX WS + REST backfill streams
- Guarantee ordered, deduplicated, replayable event history
- Provide canonical time-aligned bars and microstructure features

Required properties:

- Sequence checks and gap detection at ingest boundary
- Backfill/replay with deterministic idempotent writes
- Provenance on source, freshness, and quality

### 3) Feature Plane
Responsibilities:

- Single canonical feature contract used by train/infer/backtest
- Versioned feature-set definitions and fingerprints
- Cached snapshots with deterministic regeneration

Required properties:

- No silent synthetic fallback in production mode
- Strict schema compatibility checks
- Reproducible datasets by hash and lineage

### 4) Learning Plane
Responsibilities:

- Train/evaluate challenger models continuously
- Compare vs champion under walk-forward methodology
- Promote only on statistically and economically meaningful improvement

Required properties:

- True fold-based retraining/evaluation workflow
- Promotion policy with confidence-aware gates
- Staged rollout support (shadow -> canary -> full)

### 5) Execution and Risk Plane
Responsibilities:

- Pre-trade validation against exchange metadata + risk policies
- Order placement, reconciliation, and lifecycle state machine
- Account-level risk, exposure, and circuit-breakers

Required properties:

- Precision/step-size/minQty quantization before order submission
- Notional- and portfolio-aware risk checks
- Deterministic handling of partials/cancels/retries/reconciliation

### 6) Observability and Reliability Plane
Responsibilities:

- SLO metrics for decisioning, ingestion, execution, and learning
- Incident detection and auto-remediation workflows
- Recovery tooling and runbooks

Required properties:

- Alerting on objective guardrails, not ad-hoc thresholds only
- Replay-ready forensic trails per decision/execution
- Defined RPO/RTO for stateful services

## Phased Implementation Roadmap

## Phase 0: Exchange Correctness Foundation (2 weeks)
Goal: eliminate exchange contract approximations.

Deliverables:

- Add exchange metadata sync service (contracts + precision + min trade constraints)
- Persist pair metadata cache with refresh strategy and validity timestamps
- Replace hardcoded precision in RL/Nautilus paths with metadata-driven instrument building
- Add pre-trade quantization utility used by live and paper execution paths

Exit criteria:

- No hardcoded pair precision logic remains in execution-critical paths
- Order payloads are quantized and validated before submission
- Backtests use dynamic instrument precision from metadata snapshot

## Phase 1: Cost and PnL Realism (2 weeks)
Goal: unify fee/slippage/funding semantics across train/eval/backtest/live.

Deliverables:

- Introduce venue-level fee model abstraction (maker/taker tiers, rebates, funding schedule)
- Wire fee model into Nautilus venue config and SB3 environment reward calculation
- Add account fee-tier fetch + periodic refresh in backend control state
- Add model metadata recording of fee assumptions used for each run/eval

Exit criteria:

- Evaluation and training use the same cost model parameters as execution policy
- Cost-model fingerprint is included in evaluation/training metadata

## Phase 2: Data Plane Hardening (3 weeks)
Goal: guarantee deterministic and replayable market data.

Deliverables:

- Add stream/event backbone abstraction (can be introduced behind repository interface)
- Enforce WS sequencing checks, out-of-order handling, and gap event emission
- Add replay job for gap intervals with deterministic idempotent writes
- Improve ingestion run state model with lease semantics (not single-process memory lock)

Exit criteria:

- Gap events and replay outcomes are measurable by pair/interval/source
- Duplicate workers cannot corrupt ingestion state
- Replay produces deterministic post-conditions

## Phase 3: Feature/Data Contract Hardening (2 weeks)
Goal: make train/infer/backtest feature parity strict.

Deliverables:

- Promote canonical feature contract to first-class schema artifact
- Disable synthetic dataset fallback for production mode
- Add schema/version compatibility gate between dataset versions and model versions
- Add parity tests: train vs infer vs backtest vectors for same time window

Exit criteria:

- Feature parity tests pass across all three paths
- Production dataset generation fails closed on missing required data

## Phase 4: Learning Workflow Institutionalization (4 weeks)
Goal: transition from cron-batch loop to robust workflowed online learning.

Deliverables:

- Move online learning to workflow engine pattern (long-running stateful orchestration)
- Implement true walk-forward retrain-per-fold for challenger evaluation
- Add confidence-aware promotion gates (effect size + minimum sample + drawdown controls)
- Add staged rollout hooks (shadow/canary/full) with rollback triggers

Exit criteria:

- Promotions are workflow-tracked, deterministic, and reversible
- Challenger cannot promote on single-window point estimate alone
- Canary failure auto-rolls back to last stable champion

## Phase 5: Risk and Execution Governance (3 weeks)
Goal: institutional risk semantics and deterministic execution controls.

Deliverables:

- Convert risk limits to notional + portfolio exposure metrics
- Add pre-trade margin/liquidation feasibility check using current mark/index
- Expand reconciliation semantics for partial close/cancel/replace edge cases
- Separate paper/live promotion metrics and tag by market regime

Exit criteria:

- Risk checks are not quantity-only
- Reconciliation converges all open executions to terminal state or active retry policy

## Phase 6: SRE + Model Risk Management (ongoing)
Goal: production reliability and model governance lifecycle.

Deliverables:

- Define SLOs and burn alerts for ingestion lag, decision latency, reject rate, promotion health
- Add periodic replay-based regression checks on current champion
- Add model inventory and lineage attestations for every promoted version
- Add DR tests for data and RL/ops state recovery

Exit criteria:

- SLO dashboards and actionable alerts in place
- Replay/regression jobs regularly validate production model quality

## Full Test Suite Coverage Plan (Mandatory)

Institutional-grade readiness requires full suite coverage across all planes, not just high line coverage. The objective is to ensure every critical behavior has at least one deterministic automated test path.

### Coverage Objectives

- 100% of critical-path capabilities mapped to at least one blocking automated test suite
- Deterministic replayability for ingestion, feature generation, evaluation, and promotion decisions
- No promotion/deployment path that can bypass failing quality gates
- Explicit flakiness budget: `0` tolerated flaky tests in blocking suites

### Test Pyramid by Plane

| Plane | Unit | Integration | End-to-End / Replay | Reliability |
| --- | --- | --- | --- | --- |
| Control plane | State transitions, idempotency, policy evaluation | Workflow promotion/rollback orchestration | Full promotion lifecycle replay from stored lineage | Failover and rollback drills |
| Market data plane | Sequence parser, dedup, gap detector | WS+REST ingest merge, idempotent writes | Historical gap replay with deterministic post-conditions | Long-run ingest soak and lag SLO checks |
| Feature plane | Feature transforms, schema rules | Dataset/feature snapshot services | Train/infer/backtest parity vector replay | Large-window regeneration stability |
| Learning plane | Reward math, gating policy, fold logic | Training/evaluation API contracts | Walk-forward challenger vs champion workflow run | Drift-trigger and rollback resilience |
| Execution/risk plane | Quantization, notional limits, kill-switch logic | Exchange adapter + reconciliation state machine | Order lifecycle simulation with partials/cancels/retries | Burst/retry/load and reject-rate guardrail tests |
| Observability plane | Metric emitter and alert predicate rules | End-to-end telemetry and audit event integrity | Incident trace reconstruction tests | Alert noise/burn-rate calibration tests |
| Frontend ops UI | Component/view-model tests | API contract rendering tests | Operator critical flows (run, rollback, kill-switch) | Browser stability smoke suite |

### Coverage Thresholds (Blocking)

- `backend` TypeScript:
  - Global line coverage `>= 85%`, branch coverage `>= 75%`
  - Critical modules (`trade_execution`, risk services, online learning orchestration, dataset/feature contracts): line `>= 90%`, branch `>= 85%`
- `backend/rl-service` Python:
  - Global line coverage `>= 85%`, branch coverage `>= 75%`
  - Critical modules (`market_env`, `nautilus_backtest`, promotion gating, walk-forward evaluator): line `>= 90%`, branch `>= 85%`
- `frontend`:
  - Global line coverage `>= 80%`, branch coverage `>= 70%`
  - RL ops and evaluation workflows (`OperationsPanel`, online learning controls, evaluation timeline): line `>= 90%`

### Phase-by-Phase Test Exit Gates

- Phase 0:
  - Add exchange metadata contract tests and precision quantization property tests
  - Add integration tests proving hardcoded pair precision is not used in order paths
- Phase 1:
  - Add fee/funding parity tests across SB3 env and Nautilus backtest outputs
  - Add account fee-tier refresh integration tests with stale-cache handling
- Phase 2:
  - Add WS sequencing, gap emission, and deterministic replay integration suites
  - Add dual-worker lease/contention tests to prevent state corruption
- Phase 3:
  - Add strict feature parity tests across train/infer/backtest for fixed windows
  - Add schema compatibility rejection tests (fail-closed behavior)
- Phase 4:
  - Add walk-forward fold progression and promotion confidence-gate tests
  - Add shadow/canary/full rollout and auto-rollback E2E tests
- Phase 5:
  - Add notional/portfolio risk guardrail suites and margin feasibility tests
  - Add reconciliation convergence tests for partial fills and cancel/replace races
- Phase 6:
  - Add replay-regression nightly suites, DR restore tests, and SLO alert tests
  - Add continuous model-risk checks for champion degradation and drift alarms

### CI/CD Test Cadence and Gate Policy

- Pull request gate (fast, blocking):
  - Lint + typecheck + critical unit tests + contract tests + smoke integration tests
- Main-branch gate (blocking):
  - Full backend integration suite (`backend/tests/**`)
  - Full RL-service suite (`backend/rl-service/tests/**`)
  - Frontend test suite and operator-flow smoke tests
  - Coverage thresholds enforced
- Nightly gate (blocking for next-day promotions):
  - Deterministic replay suite across ingestion/features/evaluation/execution
  - Long-window backtest regression checks against current champion baseline
  - Load/soak tests for ingestion lag and decision latency SLOs
- Weekly resilience gate:
  - Chaos tests (WS disconnect storms, delayed funding updates, DB failover)
  - DR exercises for Timescale RL/ops state recovery and artifact restoration

### Required Test Commands and Expansion

Use existing commands as baseline and extend them to enforce coverage thresholds:

- `cd backend && bun test --preload ./tests/setup.ts`
- `cd backend/rl-service && uv run pytest`
- `cd frontend && bun run test`

Additional required suites to add in repository:

- Replay and sequence integrity: `backend/tests/integration/ws_sequence_replay.test.ts`
- Exchange metadata contract conformance: `backend/tests/integration/exchange_metadata_contract.test.ts`
- Promotion/rollback canary lifecycle: `backend/tests/integration/online_learning_rollout.test.ts`
- RL deterministic walk-forward regression: `backend/rl-service/tests/integration/test_walk_forward_regression.py`
- Frontend operator critical-flow e2e: `frontend/tests/e2e/rl_ops_critical_flow.spec.ts`

### Test Data, Determinism, and Flake Control

- Freeze deterministic fixtures for market data slices, exchange metadata snapshots, and fee tiers
- Standardize seeded randomization in RL training tests (fixed seeds per suite)
- Persist golden outputs for parity-sensitive paths (feature vectors, fold metrics, gate decisions)
- Quarantine is not allowed for blocking suites; flaky tests must be fixed or demoted from blocking scope with explicit sign-off

## 30/60/90 Execution Plan

### First 30 days

- Complete Phase 0 and Phase 1
- Start Phase 2 sequencing and replay scaffolding
- Freeze new pair onboarding until exchange metadata correctness is complete

### Day 31-60

- Complete Phase 2 and Phase 3
- Start workflow engine migration for online learning (Phase 4)
- Add production parity and regression test gates

### Day 61-90

- Complete Phase 4 and Phase 5
- Define SLOs, DR, and model risk controls from Phase 6 baseline
- Start staged rollout policy for all future promotions

## Repository Implementation Map

Primary files/services likely touched in implementation:

- Backend orchestration/jobs:
  - `backend/src/jobs/scheduler.ts`
  - `backend/src/jobs/online_learning_job.ts`
  - `backend/src/services/online_learning_service.ts`
- RL training/evaluation:
  - `backend/rl-service/src/training/nautilus_backtest.py`
  - `backend/rl-service/src/training/evaluation.py`
  - `backend/rl-service/src/envs/market_env.py`
- Dataset/features:
  - `backend/src/services/dataset_service.ts`
  - `backend/src/services/feature_snapshot_service.ts`
- Execution/risk:
  - `backend/src/services/trade_execution.ts`
  - `backend/src/services/risk_limits_service.ts`
  - `backend/src/services/account_risk_service.ts`
  - `backend/src/integrations/exchange/bingx_client.ts`
- Market-data ingest:
  - `backend/src/services/bingx_market_data_ws.ts`
  - `backend/src/services/bingx_market_data_ingest.ts`
  - `backend/src/services/data_gap_service.ts`

## Program-Level Acceptance Criteria

The architecture upgrade is complete when all are true:

- Exchange precision/fee/funding assumptions are dynamic and versioned
- Feature parity across train/infer/backtest is test-enforced
- Online learning promotions are workflowed, staged, and confidence-gated
- Risk checks are portfolio/notional aware and deterministic
- Ingestion supports sequence integrity, replay, and auditable healing
- Promotion, rollback, and execution decisions are reproducible from stored lineage
- Full suite coverage gates (PR/main/nightly/weekly) pass with enforced thresholds and zero blocking-suite flake

## Known Deferrals

Explicitly deferred in this plan execution (for now):

- API auth hard enforcement
- Strict RBAC hard enforcement

These can be introduced later as a dedicated security hardening phase without blocking core institutionalization work above.
