import postgres from "postgres";
import { logInfo, logWarn } from "../../services/logger";

export type BingxCandleRow = {
  pair: string;
  interval: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume?: number | null;
  source?: string | null;
};

export type BingxTradeRow = {
  pair: string;
  trade_id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  executed_at: string;
  source?: string | null;
};

export type BingxOrderbookSnapshotRow = {
  pair: string;
  captured_at: string;
  depth_level: number;
  bids: unknown;
  asks: unknown;
  source?: string | null;
};

export type BingxFundingRateRow = {
  pair: string;
  funding_rate: number;
  funding_time: string;
  source?: string | null;
};

export type BingxOpenInterestRow = {
  pair: string;
  open_interest: number;
  captured_at: string;
  source?: string | null;
};

export type BingxMarkIndexPriceRow = {
  pair: string;
  mark_price: number;
  index_price: number;
  captured_at: string;
  source?: string | null;
};

export type BingxTickerRow = {
  pair: string;
  last_price: number;
  volume_24h?: number | null;
  price_change_24h?: number | null;
  captured_at: string;
  source?: string | null;
};

export type RlFeatureSnapshotRow = {
  pair: string;
  interval: string;
  feature_set_version_id: string;
  captured_at: string;
  schema_fingerprint: string;
  features: Record<string, number>;
  warmup: boolean;
  is_complete: boolean;
  source_window_start?: string | null;
  source_window_end?: string | null;
};

let sqlClient: postgres.Sql | null = null;
let schemaReadyPromise: Promise<void> | null = null;
const FEATURE_SNAPSHOT_UPSERT_CHUNK_SIZE = 4000;

function toIsoString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
}

function envBool(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  return defaultValue;
}

export function marketDataUsesTimescale() {
  const enabled = envBool("TIMESCALE_MARKET_DATA_ENABLED", false);
  const hasUrl = Boolean(process.env.TIMESCALE_URL);
  if (enabled && !hasUrl) {
    throw new Error("TIMESCALE_MARKET_DATA_ENABLED=true requires TIMESCALE_URL");
  }
  return enabled && hasUrl;
}

function getSql() {
  const url = process.env.TIMESCALE_URL;
  if (!url) {
    throw new Error("TIMESCALE_URL is required when TIMESCALE_MARKET_DATA_ENABLED=true");
  }
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

async function maybeCreateTimescaleHypertable(table: string, timeColumn: string) {
  const sql = getSql();
  try {
    await sql.unsafe(
      `select create_hypertable('${table}', '${timeColumn}', if_not_exists => true, migrate_data => true)`,
    );
  } catch (error) {
    logWarn("Timescale hypertable setup skipped", {
      table,
      timeColumn,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureTimescaleMarketDataSchema() {
  if (!marketDataUsesTimescale()) return;
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getSql();
      try {
        await sql`create extension if not exists timescaledb cascade`;
      } catch (error) {
        logWarn("Timescale extension check failed; continuing with plain Postgres tables", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await sql`
        create table if not exists bingx_candles (
          pair text not null,
          interval text not null,
          open_time timestamptz not null,
          close_time timestamptz not null,
          open double precision not null,
          high double precision not null,
          low double precision not null,
          close double precision not null,
          volume double precision not null,
          quote_volume double precision null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, interval, open_time)
        )
      `;
      await sql`create index if not exists idx_bingx_candles_pair_interval_time on bingx_candles (pair, interval, open_time desc)`;
      await maybeCreateTimescaleHypertable("bingx_candles", "open_time");

      await sql`
        create table if not exists bingx_trades (
          pair text not null,
          trade_id text not null,
          price double precision not null,
          quantity double precision not null,
          side text not null,
          executed_at timestamptz not null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, trade_id)
        )
      `;
      await sql`create index if not exists idx_bingx_trades_pair_exec on bingx_trades (pair, executed_at desc)`;
      await maybeCreateTimescaleHypertable("bingx_trades", "executed_at");

      await sql`
        create table if not exists bingx_orderbook_snapshots (
          pair text not null,
          captured_at timestamptz not null,
          depth_level integer not null,
          bids jsonb not null,
          asks jsonb not null,
          source text null,
          created_at timestamptz not null default now(),
          primary key (pair, captured_at, depth_level)
        )
      `;
      await sql`create index if not exists idx_bingx_orderbook_pair_captured on bingx_orderbook_snapshots (pair, captured_at desc)`;
      await maybeCreateTimescaleHypertable("bingx_orderbook_snapshots", "captured_at");

      await sql`
        create table if not exists bingx_funding_rates (
          pair text not null,
          funding_rate double precision not null,
          funding_time timestamptz not null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, funding_time)
        )
      `;
      await sql`create index if not exists idx_bingx_funding_pair_time on bingx_funding_rates (pair, funding_time desc)`;
      await maybeCreateTimescaleHypertable("bingx_funding_rates", "funding_time");

      await sql`
        create table if not exists bingx_open_interest (
          pair text not null,
          open_interest double precision not null,
          captured_at timestamptz not null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, captured_at)
        )
      `;
      await sql`create index if not exists idx_bingx_open_interest_pair_time on bingx_open_interest (pair, captured_at desc)`;
      await maybeCreateTimescaleHypertable("bingx_open_interest", "captured_at");

      await sql`
        create table if not exists bingx_mark_index_prices (
          pair text not null,
          mark_price double precision not null,
          index_price double precision not null,
          captured_at timestamptz not null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, captured_at)
        )
      `;
      await sql`create index if not exists idx_bingx_mark_index_pair_time on bingx_mark_index_prices (pair, captured_at desc)`;
      await maybeCreateTimescaleHypertable("bingx_mark_index_prices", "captured_at");

      await sql`
        create table if not exists bingx_tickers (
          pair text not null,
          last_price double precision not null,
          volume_24h double precision null,
          price_change_24h double precision null,
          captured_at timestamptz not null,
          source text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, captured_at)
        )
      `;
      await sql`create index if not exists idx_bingx_tickers_pair_time on bingx_tickers (pair, captured_at desc)`;
      await maybeCreateTimescaleHypertable("bingx_tickers", "captured_at");

      await sql`
        create table if not exists rl_feature_snapshots (
          pair text not null,
          interval text not null,
          feature_set_version_id text not null,
          captured_at timestamptz not null,
          schema_fingerprint text not null,
          features jsonb not null default '{}'::jsonb,
          warmup boolean not null default false,
          is_complete boolean not null default true,
          source_window_start timestamptz null,
          source_window_end timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (pair, interval, feature_set_version_id, captured_at)
        )
      `;
      await sql`create index if not exists idx_rl_feature_snapshots_pair_time on rl_feature_snapshots (pair, interval, feature_set_version_id, captured_at desc)`;
      await sql`create index if not exists idx_rl_feature_snapshots_schema on rl_feature_snapshots (schema_fingerprint)`;
      await maybeCreateTimescaleHypertable("rl_feature_snapshots", "captured_at");

      logInfo("Timescale market-data schema ready");
    })();
  }
  await schemaReadyPromise;
}

type RangeFilters = {
  start?: string;
  end?: string;
  limit?: number;
};

function pushRangeFilters(column: string, filters: RangeFilters, params: unknown[]) {
  let clause = "";
  if (filters.start) {
    params.push(filters.start);
    clause += ` and ${column} >= $${params.length}`;
  }
  if (filters.end) {
    params.push(filters.end);
    clause += ` and ${column} <= $${params.length}`;
  }
  return clause;
}

export async function upsertTimescaleCandles(rows: BingxCandleRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_candles ${sql(
      rows.map((row) => ({
        ...row,
        quote_volume: row.quote_volume ?? null,
        source: row.source ?? null,
      })),
      "pair",
      "interval",
      "open_time",
      "close_time",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "quote_volume",
      "source",
    )}
    on conflict (pair, interval, open_time)
    do update set
      close_time = excluded.close_time,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      quote_volume = excluded.quote_volume,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestCandleTime(pair: string, interval: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select open_time
    from bingx_candles
    where pair = ${pair}
      and interval = ${interval}
    order by open_time desc
    limit 1
  `) as Array<{ open_time: string }>;
  return toIsoString(rows[0]?.open_time);
}

export async function getTimescaleEarliestCandleTime(pair: string, interval: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select open_time
    from bingx_candles
    where pair = ${pair}
      and interval = ${interval}
    order by open_time asc
    limit 1
  `) as Array<{ open_time: string }>;
  return toIsoString(rows[0]?.open_time);
}

export async function listTimescaleCandles(filters: {
  pair: string;
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair, filters.interval];
  const rangeClause = pushRangeFilters("open_time", filters, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, interval, open_time, close_time, open, high, low, close, volume, quote_volume, source
      from bingx_candles
      where pair = $1
        and interval = $2
        ${rangeClause}
      order by open_time asc
      ${limitClause}
    `,
    params,
  )) as BingxCandleRow[];
  return rows.map((row) => ({
    ...row,
    open_time: toIsoString(row.open_time) ?? String(row.open_time),
    close_time: toIsoString(row.close_time) ?? String(row.close_time),
  }));
}

export async function listTimescaleCandleOpenTimes(filters: {
  pair: string;
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair, filters.interval];
  const rangeClause = pushRangeFilters("open_time", filters, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select open_time
      from bingx_candles
      where pair = $1
        and interval = $2
        ${rangeClause}
      order by open_time asc
      ${limitClause}
    `,
    params,
  )) as Array<{ open_time: string }>;
  return rows
    .map((row) => toIsoString(row.open_time))
    .filter((value): value is string => Boolean(value));
}

export async function upsertTimescaleTrades(rows: BingxTradeRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_trades ${sql(
      rows.map((row) => ({ ...row, source: row.source ?? null })),
      "pair",
      "trade_id",
      "price",
      "quantity",
      "side",
      "executed_at",
      "source",
    )}
    on conflict (pair, trade_id)
    do update set
      price = excluded.price,
      quantity = excluded.quantity,
      side = excluded.side,
      executed_at = excluded.executed_at,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestTradeTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select executed_at
    from bingx_trades
    where pair = ${pair}
    order by executed_at desc
    limit 1
  `) as Array<{ executed_at: string }>;
  return toIsoString(rows[0]?.executed_at);
}

export async function insertTimescaleOrderbookSnapshot(payload: BingxOrderbookSnapshotRow) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_orderbook_snapshots (
      pair,
      captured_at,
      depth_level,
      bids,
      asks,
      source
    )
    values (
      ${payload.pair},
      ${payload.captured_at},
      ${payload.depth_level},
      ${JSON.stringify(payload.bids)},
      ${JSON.stringify(payload.asks)},
      ${payload.source ?? null}
    )
    on conflict (pair, captured_at, depth_level) do nothing
  `;
  return payload;
}

export async function getTimescaleLatestOrderbookTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select captured_at
    from bingx_orderbook_snapshots
    where pair = ${pair}
    order by captured_at desc
    limit 1
  `) as Array<{ captured_at: string }>;
  return toIsoString(rows[0]?.captured_at);
}

export async function upsertTimescaleFundingRates(rows: BingxFundingRateRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_funding_rates ${sql(
      rows.map((row) => ({ ...row, source: row.source ?? null })),
      "pair",
      "funding_rate",
      "funding_time",
      "source",
    )}
    on conflict (pair, funding_time)
    do update set
      funding_rate = excluded.funding_rate,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestFundingTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select funding_time
    from bingx_funding_rates
    where pair = ${pair}
    order by funding_time desc
    limit 1
  `) as Array<{ funding_time: string }>;
  return toIsoString(rows[0]?.funding_time);
}

export async function getTimescaleEarliestFundingTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select funding_time
    from bingx_funding_rates
    where pair = ${pair}
    order by funding_time asc
    limit 1
  `) as Array<{ funding_time: string }>;
  return toIsoString(rows[0]?.funding_time);
}

export async function listTimescaleFundingRates(filters: {
  pair: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair];
  const rangeClause = pushRangeFilters("funding_time", { start: filters.start, end: filters.end }, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, funding_rate, funding_time, source
      from bingx_funding_rates
      where pair = $1
      ${rangeClause}
      order by funding_time asc
      ${limitClause}
    `,
    params,
  )) as BingxFundingRateRow[];
  return rows.map((row) => ({
    ...row,
    funding_time: toIsoString(row.funding_time) ?? String(row.funding_time),
  }));
}

export async function upsertTimescaleOpenInterest(rows: BingxOpenInterestRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_open_interest ${sql(
      rows.map((row) => ({ ...row, source: row.source ?? null })),
      "pair",
      "open_interest",
      "captured_at",
      "source",
    )}
    on conflict (pair, captured_at)
    do update set
      open_interest = excluded.open_interest,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestOpenInterestTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select captured_at
    from bingx_open_interest
    where pair = ${pair}
    order by captured_at desc
    limit 1
  `) as Array<{ captured_at: string }>;
  return toIsoString(rows[0]?.captured_at);
}

export async function listTimescaleOpenInterest(filters: {
  pair: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair];
  const rangeClause = pushRangeFilters("captured_at", { start: filters.start, end: filters.end }, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, open_interest, captured_at, source
      from bingx_open_interest
      where pair = $1
      ${rangeClause}
      order by captured_at asc
      ${limitClause}
    `,
    params,
  )) as BingxOpenInterestRow[];
  return rows.map((row) => ({
    ...row,
    captured_at: toIsoString(row.captured_at) ?? String(row.captured_at),
  }));
}

export async function upsertTimescaleMarkIndexPrices(rows: BingxMarkIndexPriceRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_mark_index_prices ${sql(
      rows.map((row) => ({ ...row, source: row.source ?? null })),
      "pair",
      "mark_price",
      "index_price",
      "captured_at",
      "source",
    )}
    on conflict (pair, captured_at)
    do update set
      mark_price = excluded.mark_price,
      index_price = excluded.index_price,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestMarkIndexTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select captured_at
    from bingx_mark_index_prices
    where pair = ${pair}
    order by captured_at desc
    limit 1
  `) as Array<{ captured_at: string }>;
  return toIsoString(rows[0]?.captured_at);
}

export async function getTimescaleLatestMarkIndexSnapshot(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select pair, mark_price, index_price, captured_at, source
    from bingx_mark_index_prices
    where pair = ${pair}
    order by captured_at desc
    limit 1
  `) as BingxMarkIndexPriceRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    captured_at: toIsoString(row.captured_at) ?? String(row.captured_at),
  };
}

export async function listTimescaleMarkIndexPrices(filters: {
  pair: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair];
  const rangeClause = pushRangeFilters("captured_at", { start: filters.start, end: filters.end }, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, mark_price, index_price, captured_at, source
      from bingx_mark_index_prices
      where pair = $1
      ${rangeClause}
      order by captured_at asc
      ${limitClause}
    `,
    params,
  )) as BingxMarkIndexPriceRow[];
  return rows.map((row) => ({
    ...row,
    captured_at: toIsoString(row.captured_at) ?? String(row.captured_at),
  }));
}

export async function upsertTimescaleTickers(rows: BingxTickerRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  await sql`
    insert into bingx_tickers ${sql(
      rows.map((row) => ({
        ...row,
        volume_24h: row.volume_24h ?? null,
        price_change_24h: row.price_change_24h ?? null,
        source: row.source ?? null,
      })),
      "pair",
      "last_price",
      "volume_24h",
      "price_change_24h",
      "captured_at",
      "source",
    )}
    on conflict (pair, captured_at)
    do update set
      last_price = excluded.last_price,
      volume_24h = excluded.volume_24h,
      price_change_24h = excluded.price_change_24h,
      source = excluded.source,
      updated_at = now()
  `;
  return rows;
}

export async function getTimescaleLatestTickerTime(pair: string) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const rows = (await sql`
    select captured_at
    from bingx_tickers
    where pair = ${pair}
    order by captured_at desc
    limit 1
  `) as Array<{ captured_at: string }>;
  return toIsoString(rows[0]?.captured_at);
}

export async function listTimescaleTickers(filters: {
  pair: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair];
  const rangeClause = pushRangeFilters("captured_at", { start: filters.start, end: filters.end }, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, last_price, volume_24h, price_change_24h, captured_at, source
      from bingx_tickers
      where pair = $1
      ${rangeClause}
      order by captured_at asc
      ${limitClause}
    `,
    params,
  )) as BingxTickerRow[];
  return rows.map((row) => ({
    ...row,
    captured_at: toIsoString(row.captured_at) ?? String(row.captured_at),
  }));
}

export async function upsertTimescaleFeatureSnapshots(rows: RlFeatureSnapshotRow[]) {
  if (rows.length === 0) return [];
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  for (let start = 0; start < rows.length; start += FEATURE_SNAPSHOT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + FEATURE_SNAPSHOT_UPSERT_CHUNK_SIZE);
    await sql`
      insert into rl_feature_snapshots ${sql(
        chunk.map((row) => ({
          ...row,
          features: JSON.stringify(row.features ?? {}),
          source_window_start: row.source_window_start ?? null,
          source_window_end: row.source_window_end ?? null,
        })),
        "pair",
        "interval",
        "feature_set_version_id",
        "captured_at",
        "schema_fingerprint",
        "features",
        "warmup",
        "is_complete",
        "source_window_start",
        "source_window_end",
      )}
      on conflict (pair, interval, feature_set_version_id, captured_at)
      do update set
        schema_fingerprint = excluded.schema_fingerprint,
        features = excluded.features,
        warmup = excluded.warmup,
        is_complete = excluded.is_complete,
        source_window_start = excluded.source_window_start,
        source_window_end = excluded.source_window_end,
        updated_at = now()
    `;
  }
  return rows;
}

export async function listTimescaleFeatureSnapshots(filters: {
  pair: string;
  interval: string;
  featureSetVersionId: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  await ensureTimescaleMarketDataSchema();
  const sql = getSql();
  const params: unknown[] = [filters.pair, filters.interval, filters.featureSetVersionId];
  const rangeClause = pushRangeFilters("captured_at", { start: filters.start, end: filters.end }, params);
  const limitClause =
    typeof filters.limit === "number" && filters.limit > 0 ? ` limit ${Math.min(filters.limit, 50000)}` : "";
  const rows = (await sql.unsafe(
    `
      select pair, interval, feature_set_version_id, captured_at, schema_fingerprint, features, warmup, is_complete, source_window_start, source_window_end
      from rl_feature_snapshots
      where pair = $1
        and interval = $2
        and feature_set_version_id = $3
        ${rangeClause}
      order by captured_at asc
      ${limitClause}
    `,
    params,
  )) as Array<RlFeatureSnapshotRow>;
  return rows.map((row) => ({
    ...row,
    captured_at: toIsoString(row.captured_at) ?? String(row.captured_at),
    source_window_start: toIsoString(row.source_window_start) ?? null,
    source_window_end: toIsoString(row.source_window_end) ?? null,
  }));
}
