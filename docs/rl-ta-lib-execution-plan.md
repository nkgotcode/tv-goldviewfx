# Execution Plan: TA-Lib Feature Store + Online Learning + Walk-Forward Backtesting

## Objective

Implement a production-safe RL lifecycle based on:

1. TA-Lib derived feature snapshots.
2. Canonical feature reuse across train/infer/backtest.
3. Champion/challenger online learning promotion.
4. Walk-forward Nautilus evaluation.

## Scope

### In Scope

- Feature snapshot persistence and retrieval.
- TA-Lib integration in RL service.
- Feature schema/version updates.
- Walk-forward evaluation support.
- Promotion policy upgrade to challenger vs champion.
- Documentation and tests.

### Out of Scope

- Exchange expansion beyond current supported pairs.
- Strategy class redesign beyond feature/selection policy.
- UI redesign (except minimal observability surfacing if needed).

## Workstreams and Deliverables

## Workstream A: Feature Schema and Storage

### Deliverables

1. Feature set `v2` config contract.
2. New Timescale table for feature snapshots.
3. Repository methods for upsert and range reads.

### Target Files

- `backend/src/services/feature_set_service.ts`
- `backend/src/db/timescale/market_data.ts`
- `backend/src/db/repositories/rl_feature_snapshots.ts` (new)
- `backend/src/types/rl.ts`

### Acceptance

- Upsert/read paths work for at least 50k rows per pair/interval window.
- Duplicate inserts are idempotent on unique key.

## Workstream B: TA-Lib Feature Pipeline

### Deliverables

1. Canonical feature engine module in RL service.
2. Indicator config parser from feature set description.
3. Deterministic feature vector ordering.

### Target Files

- `backend/rl-service/src/features/technical_pipeline.py` (new)
- `backend/rl-service/src/features/extractors.py`
- `backend/rl-service/src/features/feature_registry.py`
- `backend/rl-service/pyproject.toml`

### Acceptance

- Given identical input candles and config, vectors are byte-for-byte stable.
- Warmup/incomplete rows are explicitly flagged.

## Workstream C: Pipeline Unification

### Deliverables

1. Training path consumes canonical vectors.
2. Inference path consumes canonical vectors.
3. Nautilus strategy/evaluation consume canonical vectors.

### Target Files

- `backend/rl-service/src/envs/market_env.py`
- `backend/rl-service/src/training/sb3_trainer.py`
- `backend/rl-service/src/training/rl_strategy.py`
- `backend/rl-service/src/training/evaluation.py`

### Acceptance

- Feature consistency tests pass across all three paths.
- No separate ad hoc feature math remains.

## Workstream D: Dataset Builder and Caching

### Deliverables

1. Dataset builder reads stored snapshots first.
2. Missing windows trigger compute + cache write-back.
3. Dataset hash includes feature set + config fingerprint.

### Target Files

- `backend/src/services/dataset_service.ts`
- `backend/src/db/repositories/dataset_versions.ts`

### Acceptance

- Repeat dataset build for same window and feature set yields same `dataset_hash`.
- Build latency drops after cache warm-up.

## Workstream E: Walk-Forward Backtesting

### Deliverables

1. Fold config support in evaluation request.
2. Walk-forward split runner with purge/embargo.
3. Fold-level report persistence.

### Target Files

- `backend/src/services/evaluation_service.ts`
- `backend/src/types/rl.ts`
- `backend/rl-service/src/schemas.py`
- `backend/rl-service/src/api/evaluations.py`
- `backend/rl-service/src/training/evaluation.py`

### Acceptance

- Evaluation report records fold metrics and aggregate stats.
- Strict mode fails if any fold backtest fails.

## Workstream F: Champion/Challenger Promotion

### Deliverables

1. Online learning cycle compares challenger vs champion.
2. Promotion policy uses delta-based gates.
3. Rejection reasons persisted for audit.

### Target Files

- `backend/src/services/online_learning_service.ts`
- `backend/src/jobs/learning_updates.ts`
- `backend/src/db/repositories/learning_updates.ts`

### Acceptance

- Challenger never promotes without passing delta gates.
- Rollback path remains available and tested.

## Workstream G: Safety and Observability

### Deliverables

1. OOD gate on feature vectors.
2. Feature freshness and missing-rate metrics.
3. Promotion telemetry and reason codes.

### Target Files

- `backend/src/services/rl_decision_pipeline.ts`
- `backend/src/services/rl_metrics.ts`
- `backend/src/services/observability_service.ts`

### Acceptance

- Forced hold occurs on OOD or missing critical features.
- Metrics visible in existing ops endpoints/logs.

## Sequenced Timeline (10 Working Days)

1. Day 1: Workstream A design + migration scaffolding.
2. Day 2-3: Workstream B TA-Lib pipeline implementation.
3. Day 4: Workstream C train/infer/backtest unification.
4. Day 5: Workstream D dataset cache integration.
5. Day 6-7: Workstream E walk-forward evaluation and report schema.
6. Day 8: Workstream F champion/challenger policy gates.
7. Day 9: Workstream G safety + observability integration.
8. Day 10: full test pass, dry run, runbook updates.

## Implementation Backlog (Checklist)

- [x] Add TA-Lib dependency and install notes.
- [x] Introduce `v2` feature set description contract.
- [x] Add `rl_feature_snapshots` Timescale schema and repository.
- [x] Build TA-Lib technical pipeline and deterministic vector order.
- [x] Replace ad hoc feature calculations in `market_env.py`.
- [x] Refactor inference and strategy paths to canonical vectors.
- [x] Make dataset service snapshot-first with cache fill.
- [x] Extend evaluation request for fold configs.
- [x] Implement walk-forward + purge/embargo splits.
- [x] Persist fold metrics into evaluation report metadata.
- [x] Add challenger-vs-champion comparison in online learning.
- [x] Add promotion delta gates and rejection reasons.
- [x] Add OOD and missing-feature hold gates in decision pipeline.
- [x] Add unit/integration tests for leakage, determinism, and promotion.
- [x] Update runbooks and operational defaults.

## Test Plan

### Unit

- TA indicator calculations and parameter handling.
- Warmup row handling and leak guards.
- Feature ordering determinism.
- Promotion gate decision logic.

### Integration

- Dataset build from snapshots + cache fill.
- RL service evaluation with multi-fold backtesting.
- Online learning cycle with champion/challenger outcomes.

### End-to-End

- Train challenger from live-ingested data.
- Run evaluation with walk-forward folds.
- Verify promote or reject with expected reason.

## Risks and Mitigations

1. TA-Lib build friction on local/dev hosts.
   - Mitigation: document wheel-first and source-build fallback; pin tested versions.
2. Feature drift between backend and RL service schemas.
   - Mitigation: one canonical schema contract + strict serialization tests.
3. Increased evaluation runtime from multi-fold backtests.
   - Mitigation: cap fold count initially; parallelize where safe.
4. Overfitting from indicator-heavy vectors.
   - Mitigation: start with constrained indicator set and ablation tests.

## Rollout and Rollback

### Rollout

1. Deploy feature snapshot storage disabled by default.
2. Enable TA feature generation in paper mode only.
3. Enable walk-forward evaluation gates.
4. Enable champion/challenger promotions for online learning.
5. Enable live auto-roll-forward only after 7-day stability.

### Rollback

1. Disable TA feature-set selection and revert to core feature set.
2. Disable auto promotion; force manual promotion only.
3. Keep raw ingestion and existing evaluation endpoints unchanged.

## Operations Notes

- Keep `RL_STRICT_BACKTEST=true` in non-test environments.
- Keep `RL_ONLINE_LEARNING_ENABLED=false` by default until Workstreams E/F are complete.
- Maintain append-only audit trail for promotion and rollback actions.
