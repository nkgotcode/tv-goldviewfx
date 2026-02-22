# fix_plan

## Active

- [ ] None. Futures-aware PPO feedback loop slice completed in this iteration.

## Discovered

- [ ] Integration/E2E suites requiring DB-backed env remain gated behind `DB_TEST_ENABLED` / `E2E_RUN`.

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
