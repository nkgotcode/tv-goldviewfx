# Phase 0 Research: RL Trading Agent for Gold

**Date**: 2026-01-12  
**Spec**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/spec.md

## Decision 1: RL stack selection

**Decision**: Use Nautilus Trader to supply the trading environment and backtesting loop, paired with Stable-Baselines3 (Gymnasium-compatible) for RL algorithms and checkpoints.

**Rationale**: Nautilus Trader provides market simulation and event-driven trading workflows suited to backtesting and paper runs. Stable-Baselines3 is widely used, straightforward to integrate with Gym-style environments, and supports incremental training and checkpointing needed for continuous learning windows.

**Alternatives considered**: Ray RLlib (distributed but heavier operationally), FinRL (higher-level but less flexible for custom execution), TensorTrade (less active ecosystem).

## Decision 2: Continuous learning approach

**Decision**: Implement rolling-window incremental training with gated promotion. New data (market, ideas, signals, news, trades) enters a fixed training window; the model is updated on a schedule or trigger and promoted only if evaluation metrics meet thresholds. The last-known-good model remains active until promotion succeeds.

**Rationale**: This satisfies continuous learning without destabilizing live trading, supports rollback, and aligns with risk limits and auditability requirements.

**Alternatives considered**: Pure online learning on every tick (higher instability), manual retraining only (fails continuous learning requirement).

## Decision 3: Service boundary for ML

**Decision**: Run RL training/inference as a dedicated Python service with a stable HTTP API used by the Bun backend for decision requests and model management.

**Rationale**: Isolates heavy ML dependencies, allows independent scaling and deployment, and keeps the existing TS/Bun stack focused on exchange connectivity and risk enforcement.

**Alternatives considered**: Embedding Python in the Bun runtime (fragile and operationally complex), JS-only RL libraries (insufficient maturity for this scope).

## Decision 4: BingX market data as canonical source

**Decision**: Use the BingX perpetual REST API as the canonical source for chart and market microstructure data (candles, order book, recent trades, funding rates, open interest, mark/index prices, and tickers) for the supported gold perpetual pairs.

**Rationale**: This keeps training and live trading on a single exchange data source, reduces discrepancies between simulated and live environments, and provides the specific perpetual market metrics required for RL features.

**Alternatives considered**: TradingView-only chart ingestion (insufficient microstructure data), mixed multi-exchange feeds (higher normalization complexity and inconsistent funding/mark price data).

## Decision 5: Model artifact storage and versioning

**Decision**: Store model artifacts and checkpoints in Convex file storage and track metadata, evaluation results, and promotion status in the Convex database.

**Rationale**: Uses existing project infrastructure, enables rollback to prior versions, and keeps artifact access controlled.

**Alternatives considered**: Local filesystem only (not durable), third-party artifact registry (additional dependency and credentials).

## Decision 6: Test strategy for trading workflows

**Decision**: Require unit tests for RL logic and backend validation, integration tests for API routes and trading flows, and E2E tests for operator journeys and edge cases (risk limits, stale data, partial fills, volatility spikes) before enabling live trading.

**Rationale**: Matches constitution requirements, protects against regressions, and ensures critical edge cases are validated prior to live deployment.

**Alternatives considered**: Unit-only coverage (insufficient for multi-service flows), manual-only QA (too risky for trading).

## Decision 7: Convex dev deployment for tests

**Decision**: Run all unit, integration, and E2E test suites against a Convex dev deployment with seeded test data.

**Rationale**: Ensures deterministic test data, avoids risk to production data, and aligns with least-privilege and audit requirements.

**Alternatives considered**: Shared remote Convex project (higher risk and non-deterministic), mocked database only (misses integration behaviors).

## Decision 8: Data quality gating and lineage

**Decision**: Compute per-feed quality metrics (coverage %, missing fields, parse confidence) and version datasets with lineage metadata and checksums before training or live trading.

**Rationale**: Ensures reproducibility and prevents the agent from training or trading on degraded data.

**Alternatives considered**: Manual checks only (error-prone) or ad-hoc quality checks without lineage (non-reproducible evaluations).

## Decision 9: Drift detection and fallback

**Decision**: Implement drift monitoring with alert thresholds and automatic fallback to the last promoted model.

**Rationale**: Guards against live performance degradation while preserving auditability and rapid recovery.

**Alternatives considered**: Manual monitoring only (slow response) or always-on rollback (too conservative).

## Decision 10: Feature inputs from news and OCR

**Decision**: Support optional feature inputs from news sentiment and OCR-extracted chart text with feature set versioning.

**Rationale**: Enriches the feature space with contextual signals while allowing deterministic versioning for model comparisons.

**Alternatives considered**: Excluding contextual features (loss of signal) or mixing them without versioning (hard to compare results).
