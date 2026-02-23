# fix_plan

## Active

- [ ] Enforce explicit fail-closed dataset behavior in production mode (no synthetic fallback) with dedicated regression tests.

## Discovered

- [ ] Integration/E2E suites requiring DB-backed env remain gated behind `DB_TEST_ENABLED` / `E2E_RUN`.
- [ ] Frontend `next build` currently fails on an unrelated type issue in `frontend/src/app/library/page.tsx` (`CrudFilter` operator typing), so full production build verification is blocked.

## Completed

- [x] Added futures-context dataset enrichment (`funding/open-interest/mark-index/ticker`) into dataset feature rows.
- [x] Added futures-aware PPO reward controls (leverage, taker fee, slippage, funding weight, drawdown penalty) across training/evaluation contracts.
- [x] Added PPO hard-window feedback rounds so post-backtest hard samples feed additional gradient updates.
- [x] Added feature-set `v2` contract with TA config + schema fingerprinting.
- [x] Added `rl_feature_snapshots` storage (Timescale schema + repository + read-through cache service).
- [x] Refactored dataset build path to snapshot-first retrieval with feature schema fingerprint propagation.
- [x] Added canonical RL-service technical pipeline and wired train/infer/backtest paths.
- [x] Added walk-forward evaluation support with fold + aggregate report metadata.
- [x] Added champion/challenger online learning gates with persisted reasons and metric deltas.
- [x] Added feature-quality gate and forced-hold integration in decision pipeline + observability metrics.
- [x] Surfaced challenger/champion and delta-gate telemetry in mission-control online learning panel.
- [x] Added evaluation-level Nautilus controls (interval + leverage/fee/slippage/funding/drawdown + walk-forward params) across backend schema, RL-service contract, and dashboard form.
- [x] Added dataset provenance metadata for evaluations (requested vs resolved ticker/symbol, source tables, row counts, and feature fields) and surfaced it in `/rl-evaluations`.
- [x] De-duplicated “All pairs” evaluation runs by resolved BingX symbol to avoid alias duplicates (`Gold-USDT` vs `XAUTUSDT`).
- [x] Fixed chart history proxy to honor `start/end` range when fetching BingX candles, enabling deep historical pagination in KLine chart loaders.
- [x] Expanded market chart viewport and default history preload so dashboards open with substantially more candles and taller chart real estate.
- [x] Made KLine history loading resilient to variable BingX page sizes and sparse/gapped ranges by using adaptive lookback paging instead of fixed-size stop conditions.
- [x] Added confidence-aware promotion gates in online learning (effect size, minimum sample size, win-rate confidence z-score), exposed via ops API/UI overrides, and covered with targeted backend unit tests.
- [x] Added pre-trade margin/liquidation feasibility checks (mark/index-price aware) in account-risk evaluation with deterministic unit coverage.
- [x] Added automated critical-module coverage gates with CI enforcement across backend (LCOV parser), RL-service (Cobertura parser), and frontend (raised Vitest thresholds + service tests).
- [x] Added DB-backed ingestion lease semantics (`startIngestionRunIfIdle`) for TradingView/Telegram/News/OCR pipelines to prevent duplicate worker races.
- [x] Added deterministic post-heal verification in data gap monitor: healed windows are re-queried and only resolved when gaps no longer overlap the target interval, with audit events for verified/unresolved outcomes.
