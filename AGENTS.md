# tv-goldviewfx Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-12

## Active Technologies
- Convex database for similarity data (store embeddings as document fields) (001-trading-idea-platform)
- TypeScript (latest stable) on Bun (latest stable) + Bun runtime, Cheerio, Convex JS client, Zod, Hono, BingX API (direct), Next.js (latest stable), React, refine.dev, shadcn/ui (001-trading-idea-platform)
- TypeScript (latest stable) on Bun (latest stable); Python 3.12+ via uv for RL training/inference service + Bun, Hono, Convex JS client, Zod, Next.js/React, Nautilus Trader, Stable-Baselines3 (Gymnasium interface), BingX API (perpetual market data + trading) (002-rl-trading-agent)
- Convex database for configs, decisions, metrics, and evaluation reports; Convex file storage for model artifacts and checkpoints (002-rl-trading-agent)

## Project Structure

```text
backend/
frontend/
packages/
tests/
```

## Commands

- Backend tests: `cd backend && bun test --preload ./tests/setup.ts`
- Frontend dev: `cd frontend && bun run dev`
- RL service tests: `cd backend/rl-service && uv run pytest`
- Convex dev deployment: `npx convex dev`
- Timescale-local dev (example): set `TIMESCALE_RL_OPS_ENABLED=true`, `TIMESCALE_MARKET_DATA_ENABLED=true`, and `TIMESCALE_URL=postgresql://...`
- E2E ingestion fixtures: `TRADINGVIEW_USE_HTML=true TRADINGVIEW_HTML_PATH=../tradingview.html FETCH_FULL=false TELEGRAM_MESSAGES_PATH=../tests/e2e/fixtures/telegram_messages.json`
- Scripted E2E run: `./scripts/e2e-local.sh`
- E2E script notes: auto-selects free backend/frontend ports and sets `BINGX_MARKET_DATA_MOCK=true`.

## Code Style

TypeScript (latest stable) on Bun (latest stable): Follow standard conventions
Dependencies: keep all libraries and runtimes on the latest stable releases.

## Recent Changes
- 002-rl-trading-agent: Expanded specs/contracts to require full BingX perpetual market data ingestion for RL training
- 001-trading-idea-platform: Added dark mode toggle, BingX client order tagging, fixed pagination, tightened TradingView sync timeouts, and aligned agent defaults to `GOLD-USDT`

<!-- MANUAL ADDITIONS START -->
- RL/ops backend state is Timescale-capable: set `TIMESCALE_RL_OPS_ENABLED=true` with `TIMESCALE_URL` to run RL/ops repositories on Postgres; `CONVEX_URL` is no longer a hard backend bootstrap requirement in this mode.
- BingX persisted market data is Timescale-capable: set `TIMESCALE_MARKET_DATA_ENABLED=true` with `TIMESCALE_URL` to use Postgres market-data repositories.
- Backend integration tests are DB-backed via `backend/tests/setup.ts`; test setup now sets `DB_TEST_ENABLED=true` when either Timescale or Convex is reachable.
- E2E fixtures/reset remain Convex-backed and still require `CONVEX_URL`.
- Ingestion scheduling: TradingView and Telegram auto-sync only when the backend scheduler is running and sources exist; intervals default to `TRADINGVIEW_SYNC_INTERVAL_MIN=60` and `TELEGRAM_INGEST_INTERVAL_MIN=60` unless overridden by ops ingestion configs.
- BingX market data cadence should follow the smallest candle interval (typically 1m) by setting `BINGX_MARKET_DATA_INTERVAL_MIN=1`; use `BINGX_MARKET_DATA_INTERVALS` for full timeframe coverage and `BINGX_MARKET_DATA_BACKFILL=true` to keep backfills running until the earliest available candle when `max_batches` is omitted.
- BingX WebSocket capture runs in the worker when `BINGX_WS_ENABLED=true`, connects to `wss://open-api-swap.bingx.com/swap-market`, and can pause scheduled REST polling for candles/trades/order book/ticker via `BINGX_WS_PAUSE_REST`.
- Data gap monitor: configure `DATA_GAP_MONITOR_INTERVAL_MIN` and related env vars to detect missing BingX candles, stale sources, and trigger self-heal with audit logs.
- Gap health endpoint: `GET /ops/gaps/health` surfaces open/healing gaps with breakdowns by pair/source (optional `pair`, `source_type`, `limit`).
- Daemonize backend: use `./scripts/daemonize-backend.sh start` to keep the API and worker running with logs in `backend-api.log` and `backend-jobs.log`.
- BingX trades use the recent-trades feed (max 1000 rows per call); history accumulates forward from first ingest, while funding uses backfilled `startTime`/`endTime` windows and OI/mark/index are snapshotted each run.
- Development workflow: follow the Ralph loop architecture; create/verify `activity.md` before any session and append entries per `docs/development-workflow.md`.
<!-- MANUAL ADDITIONS END -->
