# Production Operations (Supabase CLI)

## Authenticate and link

```bash
supabase login --token "$SUPABASE_ACCESS_TOKEN"
supabase link --project-ref "<project-ref>"
```

## Apply migrations

```bash
supabase db push
```

## Daemonize API + worker

```bash
./scripts/daemonize-backend.sh start
./scripts/daemonize-backend.sh status
```

- The script loads `backend/.env` if present.
- Logs: `backend-api.log`, `backend-jobs.log`
- Stop with `./scripts/daemonize-backend.sh stop`

## Check migration status

```bash
supabase migration list
```

## Dependency hygiene

- Confirm runtime and library dependencies are updated to the latest stable releases before deployment.

## Ingestion cadence and backfill

- TradingView and Telegram auto-sync only when the backend scheduler is running and sources exist.
- Verify configured sources and feeds with `GET /telegram/sources` and `GET /ops/ingestion/status`.
- Set `BINGX_MARKET_DATA_INTERVAL_MIN=1` to align REST polling with the smallest candle interval.
- Set `BINGX_MARKET_DATA_INTERVALS` to all supported BingX intervals for full-history coverage.
- Set `BINGX_MARKET_DATA_BACKFILL=true` to keep backfills running during scheduled ingestion.
- Backfills run until the earliest available candle when `max_batches` is omitted.
  If `max_batches` is set, the run stops after that many batches.
- Funding history backfills via `startTime`/`endTime` until the earliest available window.
- Trades are limited to the BingX recent trades feed (max 1000 rows/call); history
  accumulates from the first ingest and cannot backfill beyond the public window.
- Open interest and mark/index prices are snapshotted each ingest run to build a
  time-series from ingestion start.

## BingX WebSocket capture

- The scheduler worker also runs the BingX WebSocket client when `BINGX_WS_ENABLED=true`.
- WebSocket base URL defaults to `wss://open-api-swap.bingx.com/swap-market`.
- Set `BINGX_WS_PAUSE_REST=true` to skip scheduled REST polling for candles, trades,
  order book, and ticker when WS feeds are healthy; backfills and non-WS feeds
  (funding, open interest, mark/index) still use REST.
- Use `BINGX_WS_DEPTH_LEVEL` and `BINGX_WS_DEPTH_SPEED_MS` to tune order book depth
  and cadence, and `BINGX_WS_FLUSH_INTERVAL_MS` to control DB batch writes.

## Gap monitoring and auto-heal

- Run the scheduler with `DATA_GAP_MONITOR_INTERVAL_MIN` enabled to scan for candle gaps
  and stale feeds across BingX, TradingView, Telegram, news, and OCR.
- Use `/ops/audit` to review detected gaps and self-heal attempts.
- Query `/ops/gaps/health` (optional `pair`, `source_type`, `limit`) for the latest open/healing gap summary.

## Audit for test data

```sql
select id, url, title, published_at
from ideas
where url ilike '%example.com%'
   or title ilike '%test%'
order by published_at desc;
```

If legacy scraping tables exist:

```sql
select id, url, title, published_at
from tradingview_ideas
where url ilike '%example.com%'
   or title ilike '%test%'
order by published_at desc;
```

## Cleanup test records (verify first)

```sql
delete from ideas
where url ilike '%example.com%'
   or title ilike '%test%';
```

```sql
delete from tradingview_ideas
where url ilike '%example.com%'
   or title ilike '%test%';
```

## Full reset (truncate all data)

```sql
set role postgres;
truncate table
  trade_executions,
  trades,
  signals,
  enrichments,
  idea_revisions,
  ideas,
  telegram_posts,
  sync_runs,
  sources,
  agent_configurations
restart identity cascade;
```

> Review results in a transaction before deleting. Prefer a read-only check first.
