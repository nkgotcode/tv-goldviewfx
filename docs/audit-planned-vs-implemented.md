# Planned vs Implemented Audit (tv-goldviewfx)

Date: 2026-01-24
Scope: 001 trading idea platform + 002 RL trading agent, plus ops/infra.

## Executive Summary

- Core ingestion, backend APIs, and operator UI are present and runnable on Convex.
- Production hardening is implemented and previously flagged blockers (execution replay safety, role header trust, candle ordering, scalable search bounds, exit flows, allowed instrument enforcement) are now covered.
- RL model stack completion is implemented: deterministic datasets, SB3 training, artifact storage, and Nautilus backtests are wired end-to-end.

## Implemented (Core Functional)

### Ingestion + Data Pipeline
- BingX market data ingestion across candles/trades/order book/funding/OI/mark/index/ticker with backfill and mock mode.
  - Evidence: `backend/src/services/bingx_market_data_ingest.ts`, `backend/src/jobs/bingx_market_data.ts`
- TradingView + Telegram ingestion with ops controls and ingestion status views.
  - Evidence: `backend/src/services/tradingview_sync.ts`, `backend/src/services/telegram_ingest.ts`, `backend/src/services/ingestion_status.ts`

### Backend Core (Ops + RL)
- RL run lifecycle, risk limits, decisions, evaluations, governance endpoints, and persistence.
  - Evidence: `backend/src/services/rl_agent_service.ts`, `backend/src/services/rl_decision_pipeline.ts`, `backend/src/services/evaluation_service.ts`
- Data source status, gating, and ingestion configs (Convex).
  - Evidence: `backend/src/services/data_source_status_service.ts`, `backend/src/db/repositories/data_source_status.ts`

### Production Hardening (PH‑1..PH‑7)
- Execution integrity: order state machine, idempotency, reconciliation jobs.
  - Evidence: `backend/src/services/trade_state_machine.ts`, `backend/src/services/trade_reconciliation.ts`
- Risk guardrails: exposure caps, circuit breakers, account risk checks.
  - Evidence: `backend/src/services/account_risk_service.ts`
- Data integrity + provenance: gaps, alignment, cross‑source checks.
  - Evidence: `backend/src/services/data_integrity_service.ts`
- Observability + SLOs: latency/lag/slippage/drift metrics + alerts.
  - Evidence: `backend/src/services/observability_service.ts`, `backend/src/db/repositories/ops_alerts.ts`
- Security + audit + resilience: RBAC, audit logs, retry queues, DR/runbooks.
  - Evidence: `backend/src/api/middleware/rbac.ts`, `backend/src/services/retry_queue_service.ts`, `docs/`
- Deployment safety: staging/canary scripts + rollback + release/runbooks.
  - Evidence: `scripts/`, `docs/release-checklist.md`, `docs/oncall-runbook.md`

### Frontend Ops Dashboard
- Operator UI for ingestion, RL agent controls, evaluations, data sources, governance, and monitoring pages.
  - Evidence: `frontend/src/app/rl-agent/page.tsx`, `frontend/src/app/ingestion/page.tsx`, `frontend/src/app/rl-evaluations/page.tsx`

### Tests
- Unit/integration/E2E coverage across RL workflows and ingestion flows.
  - Evidence: `backend/tests/`, `tests/e2e/`

## Implemented but Stubbed / Partial

- No major stubbed items remain for Phase 12. Synthetic fallbacks are only used when `RL_SERVICE_MOCK=true` or `BINGX_MARKET_DATA_MOCK=true`.

## Residual Risks (Jan 2026)

- **Search scalability**: text search now requires bounds to avoid full scans; plan external search if global, unbounded queries are needed at scale.

## Ranked Backlog (Post‑Hardening)

- Track remaining improvements in `prd.md` and `specs/002-rl-trading-agent/tasks.md` (Phase 12).
