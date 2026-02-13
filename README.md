# tv-goldviewfx

To install dependencies:

```bash
bun install
```

To run the backend API:

```bash
cd backend
bun install
bun run dev
```

To daemonize the API + worker (uses `backend/.env` if present):

```bash
./scripts/daemonize-backend.sh start
./scripts/daemonize-backend.sh status
```

## Dependency policy

- Use the latest stable versions of Bun, TypeScript, Python 3.12+ (via uv), Next.js, and all libraries.
- Update pinned versions promptly when new stable releases are available.

## Development workflow (Ralph loop)

This project follows the Ralph Wiggum loop architecture:
https://github.com/coleam00/ralph-loop-quickstart

- Create/verify `activity.md` at the repo root before starting any work session.
- Append a dated entry for every session or autonomous iteration.
- If using a PRD loop, keep `prd.md` and `PROMPT.md` current.
- Run the loop with `./ralph.sh 20` (adjust iterations as needed).

See `docs/development-workflow.md` for the logging format and requirements.
Production hardening and model stack completion tasks live in `prd.md` and `specs/002-rl-trading-agent/tasks.md` (Phases 8 + 12).

## Dashboard (Next.js)

```bash
cd frontend
bun install
bun run dev
```

The dashboard expects the backend API on `http://localhost:8787` and uses the
latest stable Next.js release.
Use the header toggle to switch between light and dark modes.
The landing dashboard surfaces the system atlas plus links into dedicated views:
`/controls`, `/ops`, `/insights`, `/library`, `/ingestion`, `/rl-agent`, `/rl-ops`,
`/rl-data-sources`, and `/rl-evaluations`.
Market tape panels use KLineChart overlays to annotate trades and backtests.

## RL service (Python 3.12+ + uv)

```bash
cd backend/rl-service
uv venv
uv pip install -e ".[test,ml]"
uv run pytest
```

Run the service locally:

```bash
cd backend/rl-service
uv run uvicorn server:app --host 0.0.0.0 --port 9101
```

## Convex deployments

- Start a dev deployment and generate Convex config:

```bash
npx convex dev
```

- Deploy functions and schema updates to production:

```bash
npx convex deploy
```

- Import/export data as needed:

```bash
npx convex import --table <tableName> <path>
npx convex export --path <directoryPath>
```

See `docs/production-ops.md` for deployment and data import/export notes.
For legacy data migration, see `docs/convex-migration.md`.

## TradingView sync

- Set `TRADINGVIEW_PROFILE_URL` to the Goldviewfx profile.
- For live scraping, set `TRADINGVIEW_USE_BROWSER=true` and optionally provide
  `TRADINGVIEW_COOKIES_PATH` from a logged-in session.
- For fixtures/tests only, set `TRADINGVIEW_USE_HTML=true` with
  `TRADINGVIEW_HTML_PATH=tradingview.html`.
- Use `TRADINGVIEW_HTTP_TIMEOUT_MS` to cap profile/idea fetch timeouts (default 15000ms).
- Automatic TradingView sync runs only when the backend scheduler is running.
- Scheduling uses `TRADINGVIEW_SYNC_INTERVAL_MIN` (default 60) unless overridden by ops
  ingestion config for that source.

## Telegram ingestion

- Create Telegram sources via `POST /telegram/sources` or the ops dashboard before
  scheduled ingestion runs.
- Automatic Telegram ingestion runs only when the backend scheduler is running.
- Scheduling uses `TELEGRAM_INGEST_INTERVAL_MIN` (default 60) unless overridden by ops
  ingestion config for that source.

## Testing (Convex dev deployment)

- All unit, integration, and E2E tests require `CONVEX_URL` pointing at a Convex dev deployment.
- Follow the workflow in `docs/rl-test-data.md` before running test suites.
- For deterministic E2E ingestion runs, start the backend with:
  `TRADINGVIEW_USE_HTML=true TRADINGVIEW_HTML_PATH=../tradingview.html FETCH_FULL=false TELEGRAM_MESSAGES_PATH=../tests/e2e/fixtures/telegram_messages.json`
- To run the fully scripted E2E flow (Convex + backend + frontend + Playwright): `./scripts/e2e-local.sh`
- The E2E script auto-selects free backend/frontend ports and sets `BINGX_MARKET_DATA_MOCK=true` to avoid live BingX calls.

## BingX perpetuals (GOLD-USDT)

- Set `BINGX_API_KEY` and `BINGX_SECRET_KEY` for live trading.
- Use `POST /agent/enable` and `PUT /agent/config` to switch `mode` to `live`.
- The default instrument is `GOLD-USDT` (BingX perpetuals).
- Orders are tagged with `client_order_id` (gvfx-*) so only system orders are managed.
- BingX API symbols map as: `XAUTUSDT` → `XAUT-USDT`, `PAXGUSDT` → `PAXG-USDT`.
  If `GOLD-USDT` is missing in `/openApi/swap/v2/quote/contracts`, confirm the exact symbol to use.

## BingX market data ingestion cadence

- BingX market data uses REST polling across candles, order book, trades, funding, open
  interest, mark/index, and ticker feeds.
- Set `BINGX_MARKET_DATA_INTERVALS` to a comma-separated list of all supported
  BingX candle intervals when you want full-history coverage across timeframes.
- Set `BINGX_MARKET_DATA_INTERVAL_MIN` to the smallest candle interval (typically 1m)
  so candle updates are pulled on interval cadence.
- Set `BINGX_MARKET_DATA_BACKFILL=true` to keep backfills running during scheduled
  ingestion until the earliest available candle is reached.
- Backfills page until the earliest available candle when `max_batches` is omitted.
  If you set `max_batches`, the run stops after that many batches.
- Funding rate history supports `startTime`/`endTime` and is backfilled until the
  earliest available funding window.
- Trades are sourced from the BingX recent trades feed (max 1000 rows per call);
  the system builds trade history forward from the first ingest and cannot backfill
  beyond the API’s recent-trade window.
- Open interest and mark/index prices are snapshotted on each ingest run to build
  time-series history from the moment ingestion starts.
- BingX candles are stored in Convex with an indexed `(pair, interval, open_time)` key
  for efficient range reads. Dataset builds prefer Convex candles and only top up
  missing head/tail bars from the live BingX API to stay fresh without overloading
  the exchange.

## BingX WebSocket market data

- The worker opens a WebSocket connection to `wss://open-api-swap.bingx.com/swap-market`
  and subscribes to trades, depth, kline, ticker, and mark price streams for
  `GOLD-USDT`, `XAUT-USDT`, and `PAXG-USDT`.
- WebSocket payloads are gzip-compressed; the server sends `Ping` every ~5s and expects `Pong`.
- Configure via `BINGX_WS_ENABLED`, `BINGX_WS_URL`, `BINGX_WS_DEPTH_LEVEL`,
  `BINGX_WS_DEPTH_SPEED_MS`, and `BINGX_WS_FLUSH_INTERVAL_MS`.
- Set `BINGX_WS_PAUSE_REST=true` to skip scheduled REST polling for candles, trades,
  order book, and ticker while WS feeds are healthy; REST still handles backfill,
  funding, open interest, and mark/index snapshots.
- WebSocket writes use `source=bingx_ws`; mark price updates reuse the latest
  available index price snapshot when present.

## Data gap monitoring + self-heal

- The gap monitor scans BingX candles for missing intervals and flags stale feeds
  across TradingView, Telegram, BingX, news, and OCR sources.
- Configure the scan window and heal cadence with:
  `DATA_GAP_LOOKBACK_DAYS`, `DATA_GAP_MAX_POINTS`, `DATA_GAP_MONITOR_INTERVAL_MIN`,
  `DATA_GAP_HEAL_ENABLED`, and `DATA_GAP_HEAL_COOLDOWN_MIN`.
- Gap detections and heal attempts are logged in `/ops/audit`.
- Check `/ops/gaps/health` (optional `pair`, `source_type`, `limit`) for the latest open/healing gap summary.

## RL trading agent (spec 002)

- The RL trading agent specification requires full BingX perpetual market data ingestion for:
  - Candles (chart data)
  - Order book snapshots
  - Recent trades
  - Funding rates
  - Open interest
  - Mark/index prices
  - Tickers (last price + 24h stats)
- These feeds must be available and time-aligned before RL training, evaluation, or live inference runs.

## Sentiment analysis (OpenRouter)

Example OpenRouter configuration for Gemini Flash:

```bash
OPENAI_API_KEY=your_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-3-flash-preview
OPENROUTER_REFERER=https://yourapp.example
OPENROUTER_TITLE=Goldviewfx Intelligence
```

This project uses the latest stable [Bun](https://bun.com) runtime.
