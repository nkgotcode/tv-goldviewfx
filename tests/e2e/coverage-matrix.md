# E2E Coverage Matrix

| Feature Area | User Story | Test File | Primary Assertions |
| --- | --- | --- | --- |
| TradingView sync | US1 | tests/e2e/tradingview-sync.spec.ts | Sync run returns run id |
| TradingView validation | US1 | tests/e2e/tradingview-sync-edge.spec.ts | Invalid payload rejected |
| TradingView dedup | US1 | tests/e2e/tradingview-dedup.spec.ts | Idempotent sync, duplicates tracked |
| Telegram ingestion | US1 | tests/e2e/telegram-ingest.spec.ts | Telegram posts ingested |
| Telegram edits | US1 | tests/e2e/telegram-edge.spec.ts | Edits/removals reflected |
| Telegram dedup | US1 | tests/e2e/telegram-dedup.spec.ts | Duplicates handled |
| Enrichment run | US1 | tests/e2e/enrichment.spec.ts | Enrichment creates signals |
| Enrichment validation | US1 | tests/e2e/enrichment-edge.spec.ts | Invalid payload rejected |
| Agent paper trading | US1 | tests/e2e/agent-paper.spec.ts | Trades created in paper mode |
| Agent risk controls | US1 | tests/e2e/agent-edge.spec.ts | Risk limits block trades |
| RL live trading | US1 | tests/e2e/rl-agent-live.spec.ts | Live run executes trades |
| RL risk limit breach | US1 | tests/e2e/rl-agent-risk-limit.spec.ts | Breach pauses run |
| RL partial fill | US1 | tests/e2e/rl-agent-partial-fill.spec.ts | Partial fills handled |
| RL maintenance halt | US1 | tests/e2e/rl-agent-maintenance.spec.ts | Missing market data pauses |
| RL volatility spike | US1 | tests/e2e/rl-agent-volatility.spec.ts | Volatility triggers pause |
| RL learning window | US1 | tests/e2e/rl-agent-learning-window.spec.ts | Learning continues in run |
| RL conflicting signals | US1 | tests/e2e/rl-agent-conflicting-signals.spec.ts | Conflicts flagged |
| RL learning rollback | US1 | tests/e2e/rl-agent-learning-rollback.spec.ts | Rollback on degraded performance |
| Evaluation workflow | US2 | tests/e2e/rl-evaluations.spec.ts | Pass report produced |
| Evaluation thresholds | US2 | tests/e2e/rl-evaluations-fail.spec.ts | Fail status on low metrics |
| Evaluation missing data | US2 | tests/e2e/rl-evaluations-missing-data.spec.ts | Empty window rejected |
| Ingestion analytics | US3 | tests/e2e/ingestion-controls.spec.ts | Controls + status render |
| Data source disable | US3 | tests/e2e/rl-data-sources.spec.ts | Config toggles applied |
| Data source stale | US3 | tests/e2e/rl-data-sources-stale.spec.ts | Stale sources detected |
| Data source missing | US3 | tests/e2e/rl-data-sources-missing.spec.ts | Missing data flagged |
| Ops dashboard | US3 | tests/e2e/rl-ops-dashboard.spec.ts | Ops controls render |
| Governance controls | US5 | tests/e2e/rl-governance.spec.ts | Kill switch + gates visible |
| Feature inputs | US6 | tests/e2e/rl-feature-inputs.spec.ts | Feature set toggles listed |
| Dashboard lists | US4 | tests/e2e/dashboard.spec.ts | Summary + filters render |
| Trade drill-down | US4 | tests/e2e/dashboard-trade-detail.spec.ts | Trade detail view renders |
