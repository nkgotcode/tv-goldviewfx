# Quickstart: Trading Idea Intelligence Platform

**Feature**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/spec.md
**Date**: 2026-01-11

## Prerequisites

- Latest stable Bun and TypeScript installed
- Convex project (dev deployment)
- TradingView profile access and Telegram premium access
- BingX credentials for futures trading (paper mode by default)
- News feed credentials for macro/gold sources (if enabled)
- OCR provider credentials for chart images (optional)
- Runtime and library dependencies stay on the latest stable releases.

## Environment Configuration

Create an environment file for backend services:

- `CONVEX_URL`
- `TRADINGVIEW_PROFILE_URL` (e.g., https://www.tradingview.com/u/Goldviewfx/)
- `TRADINGVIEW_HTML_PATH` (optional fixture path for local tests)
- `TRADINGVIEW_USE_HTML` (optional; set true to force HTML fixtures)
- `TRADINGVIEW_COOKIES_PATH` (optional; enables browser-based live sync)
- `TRADINGVIEW_USE_BROWSER` (optional; browser-based live sync without cookies)
- `TRADINGVIEW_RECENT_DAYS` (optional; recency cutoff in days, default 180)
- `TRADINGVIEW_HTTP_TIMEOUT_MS` (optional; default 15000ms for profile + idea fetch)
- `TRADINGVIEW_SYNC_INTERVAL_MIN` (optional; scheduler interval minutes, default 60)
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`
- `TELEGRAM_CHAT_IDS` (comma-separated identifiers to ingest)
- `TELEGRAM_MESSAGES_PATH` (optional fixture path for local tests)
- `TELEGRAM_INGEST_INTERVAL_MIN` (optional; scheduler interval minutes, default 60)
- `NEWS_API_KEY` (optional; required if news ingestion enabled)
- `NEWS_SOURCES` (optional; comma-separated identifiers/URLs)
- `NEWS_BACKFILL_DAYS` (optional; default 30)
- `OCR_ENABLED` (optional; default false)
- `OCR_PROVIDER` (optional; provider identifier)
- `OCR_API_KEY` (optional; if OCR provider requires a key)
- `INGESTION_QUALITY_THRESHOLD` (optional; minimum coverage % for completeness)
- `INGESTION_MAX_RETRIES` (optional; max re-fetch attempts)
- `INGESTION_BACKOFF_BASE_SECONDS` (optional; default backoff base)
- `BINGX_API_KEY`
- `BINGX_SECRET_KEY`
- `BINGX_BASE_URL` (optional; default https://open-api.bingx.com)
- `BINGX_RECV_WINDOW` (optional; default 5000ms)
- `BINGX_MARKET_DATA_INTERVALS` (optional; comma-separated intervals for full-history coverage)
- `BINGX_MARKET_DATA_INTERVAL_MIN` (optional; set to 1 to match smallest candle interval)
- `BINGX_MARKET_DATA_BACKFILL` (optional; default true, runs continuous backfill on schedule)
- `BINGX_WS_ENABLED` (optional; default true, enables BingX WebSocket capture)
- `BINGX_WS_URL` (optional; default wss://open-api-swap.bingx.com/swap-market)
- `BINGX_WS_DEPTH_LEVEL` (optional; default 5)
- `BINGX_WS_DEPTH_SPEED_MS` (optional; depth cadence, e.g. 500)
- `BINGX_WS_FLUSH_INTERVAL_MS` (optional; DB flush interval for WS batches)
- `BINGX_WS_PAUSE_REST` (optional; default true, skip REST polling when WS feeds are healthy)
- `DATA_GAP_LOOKBACK_DAYS` (optional; default 30)
- `DATA_GAP_MAX_POINTS` (optional; default 100000)
- `DATA_GAP_MIN_MISSING_POINTS` (optional; default 1)
- `DATA_GAP_MONITOR_INTERVAL_MIN` (optional; default 15)
- `DATA_GAP_HEAL_ENABLED` (optional; default true)
- `DATA_GAP_HEAL_COOLDOWN_MIN` (optional; default 30)
- `OPENAI_API_KEY` (required for sentiment analysis)
- `OPENAI_MODEL` (optional; default google/gemini-3-flash-preview)
- `OPENAI_BASE_URL` (optional; set to https://openrouter.ai/api/v1 for OpenRouter)
- `OPENROUTER_REFERER` (optional; OpenRouter request header)
- `OPENROUTER_TITLE` (optional; OpenRouter request header)
- `API_TOKEN` (optional auth gate for API endpoints)
- `CORS_ORIGIN` (optional; set to http://localhost:3000 for dashboard access)

Example OpenRouter configuration for Gemini Flash:

```bash
OPENAI_API_KEY=your_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-3-flash-preview
OPENROUTER_REFERER=https://yourapp.example
OPENROUTER_TITLE=Goldviewfx Intelligence
```

Create an environment file for the dashboard:

- `NEXT_PUBLIC_API_BASE_URL` (e.g., http://localhost:8787)
- `NEXT_PUBLIC_API_TOKEN` (optional; only if API auth is enabled)

## Database Setup

- Define tables and query patterns in `convex/data.ts`.
- Store similarity embeddings as document fields.
- Ensure deduplication keys (source_id + content_hash, duplicate_of_id) are enforced in logic.
- Assign operator/analyst roles before enabling live trading controls in the dashboard.

## Run Backend Services

- Start the API server (routes defined in
  /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/contracts/api.yaml).
- Start the ingestion worker for TradingView and Telegram syncs.
- The ingestion worker also runs BingX WebSocket capture when enabled.
- Auto-sync only runs when the scheduler is running and sources exist.
- Start the enrichment worker for sentiment and similarity runs.
- Start the news ingestion worker if configured.
- Start the OCR pipeline worker if enabled.
- Start the trading agent service in paper mode (switch to live via `PUT /agent/config`).
- Default live instrument is `GOLD-USDT` for BingX perpetuals.
- Orders are tagged with a `client_order_id` (gvfx-*) so only system orders are managed.
- BingX backfills run until the earliest available candle when `max_batches` is omitted.
- Use `GET /ops/gaps/health` to review open/healing data gaps by pair/source.
- Funding history backfills via `startTime`/`endTime` until the earliest available window.
- Trades come from the BingX recent trades feed (max 1000 rows/call) and build history
  forward from the first ingest; the API does not provide deeper backfill.
- Open interest and mark/index prices are snapshotted on each ingest run to build
  a time-series from ingestion start.

### Live TradingView Sync

- Save TradingView cookies from a logged-in session to a JSON file.
- Set `TRADINGVIEW_COOKIES_PATH` to that file to enable browser-based fetching.
- If no login is required, set `TRADINGVIEW_USE_BROWSER=true` and omit cookies.

```bash
cd backend
bun run tradingview:login
```

## Run Dashboard

- Start the Next.js (latest stable) dashboard in `frontend/` and verify access to
  ideas, signals, trades, and Telegram posts.
- Use the header toggle to switch between light and dark modes.

```bash
cd frontend
bun install
bun run dev
```

## Tests

- Run backend unit and integration tests.
- Run dashboard unit tests.
- Run dashboard end-to-end tests for critical flows.

```bash
bun run test:backend
bun run test:frontend
bun run test:e2e
```
