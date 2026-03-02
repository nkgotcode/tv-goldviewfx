/**
 * Binance TimescaleDB Market Data Schema
 *
 * Creates and manages 13 hypertables for Binance spot + futures market data.
 * Re-uses the same TimescaleDB connection via `getTimescaleSql`.
 */

import { logInfo, logWarn } from "../../services/logger";
import { getTimescaleSql } from "./client";

// ─── Row types ───

export type BinanceCandleRow = {
    exchange: string;
    pair: string;
    interval: string;
    open_time: string;
    close_time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quote_volume: number | null;
    trade_count: number | null;
    taker_buy_base_vol: number | null;
    taker_buy_quote_vol: number | null;
    source: string | null;
};

export type BinanceAggTradeRow = {
    exchange: string;
    pair: string;
    agg_trade_id: string;
    price: number;
    quantity: number;
    first_trade_id: string;
    last_trade_id: string;
    executed_at: string;
    is_buyer_maker: boolean;
    source: string | null;
};

export type BinanceOrderbookSnapshotRow = {
    exchange: string;
    pair: string;
    captured_at: string;
    depth_level: number;
    bids: unknown;
    asks: unknown;
    source: string | null;
};

export type BinanceTickerRow = {
    exchange: string;
    pair: string;
    captured_at: string;
    last_price: number;
    price_change: number | null;
    price_change_pct: number | null;
    weighted_avg_price: number | null;
    open_price: number | null;
    high_price: number | null;
    low_price: number | null;
    volume: number | null;
    quote_volume: number | null;
    open_time: string | null;
    close_time: string | null;
    trade_count: number | null;
    source: string | null;
};

export type BinanceExchangeInfoRow = {
    exchange: string;
    symbol: string;
    status: string;
    base_asset: string;
    quote_asset: string;
    filters: unknown;
    maker_fee: number | null;
    taker_fee: number | null;
    captured_at: string;
};

export type BinanceFundingRateRow = {
    pair: string;
    funding_time: string;
    funding_rate: number;
    mark_price: number | null;
    source: string | null;
};

export type BinanceOpenInterestRow = {
    pair: string;
    captured_at: string;
    open_interest: number;
    source: string | null;
};

export type BinanceOiStatisticsRow = {
    pair: string;
    period: string;
    captured_at: string;
    sum_oi: number;
    sum_oi_value: number;
    source: string | null;
};

export type BinanceKlineRow = {
    pair: string;
    interval: string;
    open_time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    source: string | null;
};

export type BinanceLsRatioRow = {
    pair: string;
    ratio_type: "top_position" | "top_account" | "global";
    period: string;
    captured_at: string;
    long_short_ratio: number;
    long_account: number;
    short_account: number;
    source: string | null;
};

export type BinanceTakerBuySellRow = {
    pair: string;
    period: string;
    captured_at: string;
    buy_sell_ratio: number;
    buy_vol: number;
    sell_vol: number;
    source: string | null;
};

export type BinanceBasisRow = {
    pair: string;
    period: string;
    captured_at: string;
    index_price: number;
    futures_price: number;
    basis: number;
    basis_rate: number;
    annualized_basis_rate: number;
    contract_type: string;
    source: string | null;
};

// ─── Schema bootstrap ───

let binanceSchemaReady: Promise<void> | null = null;

function getSql() {
    return getTimescaleSql("BINANCE_MARKET_DATA_ENABLED=true");
}

async function maybeHypertable(table: string, timeColumn: string) {
    const sql = getSql();
    try {
        await sql.unsafe(
            `SELECT create_hypertable('${table}', '${timeColumn}', if_not_exists => true, migrate_data => true)`,
        );
    } catch (error) {
        logWarn("Binance hypertable setup skipped", {
            table,
            timeColumn,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export function binanceMarketDataEnabled() {
    const enabled = ["1", "true", "yes", "on"].includes(
        (process.env.BINANCE_MARKET_DATA_ENABLED ?? "").trim().toLowerCase(),
    );
    const hasUrl = Boolean(process.env.TIMESCALE_URL);
    if (enabled && !hasUrl) {
        throw new Error("BINANCE_MARKET_DATA_ENABLED=true requires TIMESCALE_URL");
    }
    return enabled && hasUrl;
}

export async function ensureBinanceMarketDataSchema() {
    if (!binanceMarketDataEnabled()) return;
    if (!binanceSchemaReady) {
        binanceSchemaReady = createBinanceSchema();
    }
    await binanceSchemaReady;
}

async function createBinanceSchema() {
    const sql = getSql();

    try {
        await sql`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`;
    } catch (error) {
        logWarn("TimescaleDB extension check failed; continuing with plain Postgres", {
            error: error instanceof Error ? error.message : String(error),
        });
    }

    // 1. binance_candles
    await sql`
    CREATE TABLE IF NOT EXISTS binance_candles (
      exchange text NOT NULL,
      pair text NOT NULL,
      interval text NOT NULL,
      open_time timestamptz NOT NULL,
      close_time timestamptz NOT NULL,
      open double precision NOT NULL,
      high double precision NOT NULL,
      low double precision NOT NULL,
      close double precision NOT NULL,
      volume double precision NOT NULL,
      quote_volume double precision,
      trade_count integer,
      taker_buy_base_vol double precision,
      taker_buy_quote_vol double precision,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (exchange, pair, interval, open_time)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_candles_lookup ON binance_candles (exchange, pair, interval, open_time DESC)`;
    await maybeHypertable("binance_candles", "open_time");

    // 2. binance_agg_trades
    await sql`
    CREATE TABLE IF NOT EXISTS binance_agg_trades (
      exchange text NOT NULL,
      pair text NOT NULL,
      agg_trade_id text NOT NULL,
      price double precision NOT NULL,
      quantity double precision NOT NULL,
      first_trade_id text NOT NULL,
      last_trade_id text NOT NULL,
      executed_at timestamptz NOT NULL,
      is_buyer_maker boolean NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (exchange, pair, agg_trade_id)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_agg_trades_pair_time ON binance_agg_trades (exchange, pair, executed_at DESC)`;
    await maybeHypertable("binance_agg_trades", "executed_at");

    // 3. binance_orderbook_snapshots
    await sql`
    CREATE TABLE IF NOT EXISTS binance_orderbook_snapshots (
      exchange text NOT NULL,
      pair text NOT NULL,
      captured_at timestamptz NOT NULL,
      depth_level integer NOT NULL,
      bids jsonb NOT NULL,
      asks jsonb NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (exchange, pair, captured_at, depth_level)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_ob_pair_time ON binance_orderbook_snapshots (exchange, pair, captured_at DESC)`;
    await maybeHypertable("binance_orderbook_snapshots", "captured_at");

    // 4. binance_tickers
    await sql`
    CREATE TABLE IF NOT EXISTS binance_tickers (
      exchange text NOT NULL,
      pair text NOT NULL,
      captured_at timestamptz NOT NULL,
      last_price double precision NOT NULL,
      price_change double precision,
      price_change_pct double precision,
      weighted_avg_price double precision,
      open_price double precision,
      high_price double precision,
      low_price double precision,
      volume double precision,
      quote_volume double precision,
      open_time timestamptz,
      close_time timestamptz,
      trade_count integer,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (exchange, pair, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_tickers_pair_time ON binance_tickers (exchange, pair, captured_at DESC)`;
    await maybeHypertable("binance_tickers", "captured_at");

    // 5. binance_exchange_info
    await sql`
    CREATE TABLE IF NOT EXISTS binance_exchange_info (
      exchange text NOT NULL,
      symbol text NOT NULL,
      status text NOT NULL,
      base_asset text NOT NULL,
      quote_asset text NOT NULL,
      filters jsonb,
      maker_fee double precision,
      taker_fee double precision,
      captured_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (exchange, symbol)
    )
  `;

    // 6. binance_funding_rates
    await sql`
    CREATE TABLE IF NOT EXISTS binance_funding_rates (
      pair text NOT NULL,
      funding_time timestamptz NOT NULL,
      funding_rate double precision NOT NULL,
      mark_price double precision,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, funding_time)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_funding_pair_time ON binance_funding_rates (pair, funding_time DESC)`;
    await maybeHypertable("binance_funding_rates", "funding_time");

    // 7. binance_open_interest
    await sql`
    CREATE TABLE IF NOT EXISTS binance_open_interest (
      pair text NOT NULL,
      captured_at timestamptz NOT NULL,
      open_interest double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_oi_pair_time ON binance_open_interest (pair, captured_at DESC)`;
    await maybeHypertable("binance_open_interest", "captured_at");

    // 8. binance_oi_statistics
    await sql`
    CREATE TABLE IF NOT EXISTS binance_oi_statistics (
      pair text NOT NULL,
      period text NOT NULL,
      captured_at timestamptz NOT NULL,
      sum_oi double precision NOT NULL,
      sum_oi_value double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, period, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_oi_stats_lookup ON binance_oi_statistics (pair, period, captured_at DESC)`;
    await maybeHypertable("binance_oi_statistics", "captured_at");

    // 9. binance_mark_price_klines
    await sql`
    CREATE TABLE IF NOT EXISTS binance_mark_price_klines (
      pair text NOT NULL,
      interval text NOT NULL,
      open_time timestamptz NOT NULL,
      open double precision NOT NULL,
      high double precision NOT NULL,
      low double precision NOT NULL,
      close double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, interval, open_time)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_mark_klines_lookup ON binance_mark_price_klines (pair, interval, open_time DESC)`;
    await maybeHypertable("binance_mark_price_klines", "open_time");

    // 10. binance_index_price_klines
    await sql`
    CREATE TABLE IF NOT EXISTS binance_index_price_klines (
      pair text NOT NULL,
      interval text NOT NULL,
      open_time timestamptz NOT NULL,
      open double precision NOT NULL,
      high double precision NOT NULL,
      low double precision NOT NULL,
      close double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, interval, open_time)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_index_klines_lookup ON binance_index_price_klines (pair, interval, open_time DESC)`;
    await maybeHypertable("binance_index_price_klines", "open_time");

    // 11. binance_premium_index_klines
    await sql`
    CREATE TABLE IF NOT EXISTS binance_premium_index_klines (
      pair text NOT NULL,
      interval text NOT NULL,
      open_time timestamptz NOT NULL,
      open double precision NOT NULL,
      high double precision NOT NULL,
      low double precision NOT NULL,
      close double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, interval, open_time)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_premium_klines_lookup ON binance_premium_index_klines (pair, interval, open_time DESC)`;
    await maybeHypertable("binance_premium_index_klines", "open_time");

    // 12. binance_ls_ratio (combined for top_position, top_account, global)
    await sql`
    CREATE TABLE IF NOT EXISTS binance_ls_ratio (
      pair text NOT NULL,
      ratio_type text NOT NULL,
      period text NOT NULL,
      captured_at timestamptz NOT NULL,
      long_short_ratio double precision NOT NULL,
      long_account double precision NOT NULL,
      short_account double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, ratio_type, period, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_ls_ratio_lookup ON binance_ls_ratio (pair, ratio_type, period, captured_at DESC)`;
    await maybeHypertable("binance_ls_ratio", "captured_at");

    // 13a. binance_taker_buy_sell
    await sql`
    CREATE TABLE IF NOT EXISTS binance_taker_buy_sell (
      pair text NOT NULL,
      period text NOT NULL,
      captured_at timestamptz NOT NULL,
      buy_sell_ratio double precision NOT NULL,
      buy_vol double precision NOT NULL,
      sell_vol double precision NOT NULL,
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, period, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_taker_lookup ON binance_taker_buy_sell (pair, period, captured_at DESC)`;
    await maybeHypertable("binance_taker_buy_sell", "captured_at");

    // 13b. binance_basis
    await sql`
    CREATE TABLE IF NOT EXISTS binance_basis (
      pair text NOT NULL,
      period text NOT NULL,
      captured_at timestamptz NOT NULL,
      index_price double precision NOT NULL,
      futures_price double precision NOT NULL,
      basis double precision NOT NULL,
      basis_rate double precision NOT NULL,
      annualized_basis_rate double precision NOT NULL,
      contract_type text NOT NULL DEFAULT 'CURRENT_QUARTER',
      source text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pair, period, captured_at)
    )
  `;
    await sql`CREATE INDEX IF NOT EXISTS idx_binance_basis_lookup ON binance_basis (pair, period, captured_at DESC)`;
    await maybeHypertable("binance_basis", "captured_at");

    logInfo("Binance market-data schema ready");
}

// ─── Upsert helpers ───

function toIso(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") {
        const ms = value > 1_000_000_000_000 ? value : value * 1000;
        return new Date(ms).toISOString();
    }
    if (typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? value : d.toISOString();
    }
    return null;
}

// ─── Candles ───

export async function upsertBinanceCandles(rows: BinanceCandleRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_candles ${sql(
        rows.map((r) => ({
            exchange: r.exchange,
            pair: r.pair,
            interval: r.interval,
            open_time: r.open_time,
            close_time: r.close_time,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
            quote_volume: r.quote_volume ?? null,
            trade_count: r.trade_count ?? null,
            taker_buy_base_vol: r.taker_buy_base_vol ?? null,
            taker_buy_quote_vol: r.taker_buy_quote_vol ?? null,
            source: r.source ?? null,
        })),
        "exchange", "pair", "interval", "open_time", "close_time",
        "open", "high", "low", "close", "volume",
        "quote_volume", "trade_count", "taker_buy_base_vol", "taker_buy_quote_vol", "source",
    )}
    ON CONFLICT (exchange, pair, interval, open_time)
    DO UPDATE SET
      close_time = EXCLUDED.close_time,
      open = EXCLUDED.open, high = EXCLUDED.high,
      low = EXCLUDED.low, close = EXCLUDED.close,
      volume = EXCLUDED.volume, quote_volume = EXCLUDED.quote_volume,
      trade_count = EXCLUDED.trade_count,
      taker_buy_base_vol = EXCLUDED.taker_buy_base_vol,
      taker_buy_quote_vol = EXCLUDED.taker_buy_quote_vol,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestCandleTime(exchange: string, pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_candles
    WHERE exchange = ${exchange} AND pair = ${pair} AND interval = ${interval}
    ORDER BY open_time DESC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

export async function getBinanceEarliestCandleTime(exchange: string, pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_candles
    WHERE exchange = ${exchange} AND pair = ${pair} AND interval = ${interval}
    ORDER BY open_time ASC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

// ─── Agg Trades ───

export async function upsertBinanceAggTrades(rows: BinanceAggTradeRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_agg_trades ${sql(
        rows.map((r) => ({
            exchange: r.exchange,
            pair: r.pair,
            agg_trade_id: r.agg_trade_id,
            price: r.price,
            quantity: r.quantity,
            first_trade_id: r.first_trade_id,
            last_trade_id: r.last_trade_id,
            executed_at: r.executed_at,
            is_buyer_maker: r.is_buyer_maker,
            source: r.source ?? null,
        })),
        "exchange", "pair", "agg_trade_id", "price", "quantity",
        "first_trade_id", "last_trade_id", "executed_at", "is_buyer_maker", "source",
    )}
    ON CONFLICT (exchange, pair, agg_trade_id) DO NOTHING
  `;
}

export async function getBinanceLatestAggTradeId(exchange: string, pair: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT agg_trade_id FROM binance_agg_trades
    WHERE exchange = ${exchange} AND pair = ${pair}
    ORDER BY executed_at DESC LIMIT 1
  `) as Array<{ agg_trade_id: string }>;
    return rows[0]?.agg_trade_id ?? null;
}

// ─── Orderbook Snapshots ───

export async function insertBinanceOrderbookSnapshot(row: BinanceOrderbookSnapshotRow) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_orderbook_snapshots (exchange, pair, captured_at, depth_level, bids, asks, source)
    VALUES (${row.exchange}, ${row.pair}, ${row.captured_at}, ${row.depth_level},
            ${JSON.stringify(row.bids)}, ${JSON.stringify(row.asks)}, ${row.source ?? null})
    ON CONFLICT (exchange, pair, captured_at, depth_level) DO NOTHING
  `;
}

// ─── Tickers ───

export async function upsertBinanceTickers(rows: BinanceTickerRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_tickers ${sql(
        rows.map((r) => ({
            exchange: r.exchange,
            pair: r.pair,
            captured_at: r.captured_at,
            last_price: r.last_price,
            price_change: r.price_change ?? null,
            price_change_pct: r.price_change_pct ?? null,
            weighted_avg_price: r.weighted_avg_price ?? null,
            open_price: r.open_price ?? null,
            high_price: r.high_price ?? null,
            low_price: r.low_price ?? null,
            volume: r.volume ?? null,
            quote_volume: r.quote_volume ?? null,
            open_time: r.open_time ?? null,
            close_time: r.close_time ?? null,
            trade_count: r.trade_count ?? null,
            source: r.source ?? null,
        })),
        "exchange", "pair", "captured_at", "last_price",
        "price_change", "price_change_pct", "weighted_avg_price",
        "open_price", "high_price", "low_price",
        "volume", "quote_volume", "open_time", "close_time", "trade_count", "source",
    )}
    ON CONFLICT (exchange, pair, captured_at)
    DO UPDATE SET
      last_price = EXCLUDED.last_price,
      price_change = EXCLUDED.price_change,
      price_change_pct = EXCLUDED.price_change_pct,
      source = EXCLUDED.source, updated_at = now()
  `;
}

// ─── Exchange Info ───

export async function upsertBinanceExchangeInfo(rows: BinanceExchangeInfoRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_exchange_info ${sql(
        rows.map((r) => ({
            exchange: r.exchange,
            symbol: r.symbol,
            status: r.status,
            base_asset: r.base_asset,
            quote_asset: r.quote_asset,
            filters: JSON.stringify(r.filters),
            maker_fee: r.maker_fee ?? null,
            taker_fee: r.taker_fee ?? null,
            captured_at: r.captured_at,
        })),
        "exchange", "symbol", "status", "base_asset", "quote_asset",
        "filters", "maker_fee", "taker_fee", "captured_at",
    )}
    ON CONFLICT (exchange, symbol)
    DO UPDATE SET
      status = EXCLUDED.status,
      filters = EXCLUDED.filters,
      maker_fee = EXCLUDED.maker_fee,
      taker_fee = EXCLUDED.taker_fee,
      captured_at = EXCLUDED.captured_at
  `;
}

// ─── Funding Rates ───

export async function upsertBinanceFundingRates(rows: BinanceFundingRateRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_funding_rates ${sql(
        rows.map((r) => ({
            pair: r.pair,
            funding_time: r.funding_time,
            funding_rate: r.funding_rate,
            mark_price: r.mark_price ?? null,
            source: r.source ?? null,
        })),
        "pair", "funding_time", "funding_rate", "mark_price", "source",
    )}
    ON CONFLICT (pair, funding_time)
    DO UPDATE SET
      funding_rate = EXCLUDED.funding_rate,
      mark_price = EXCLUDED.mark_price,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestFundingTime(pair: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT funding_time FROM binance_funding_rates
    WHERE pair = ${pair} ORDER BY funding_time DESC LIMIT 1
  `) as Array<{ funding_time: string }>;
    return toIso(rows[0]?.funding_time);
}

export async function getBinanceEarliestFundingTime(pair: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT funding_time FROM binance_funding_rates
    WHERE pair = ${pair} ORDER BY funding_time ASC LIMIT 1
  `) as Array<{ funding_time: string }>;
    return toIso(rows[0]?.funding_time);
}

// ─── Open Interest ───

export async function upsertBinanceOpenInterest(rows: BinanceOpenInterestRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_open_interest ${sql(
        rows.map((r) => ({
            pair: r.pair,
            captured_at: r.captured_at,
            open_interest: r.open_interest,
            source: r.source ?? null,
        })),
        "pair", "captured_at", "open_interest", "source",
    )}
    ON CONFLICT (pair, captured_at)
    DO UPDATE SET
      open_interest = EXCLUDED.open_interest,
      source = EXCLUDED.source, updated_at = now()
  `;
}

// ─── OI Statistics ───

export async function upsertBinanceOiStatistics(rows: BinanceOiStatisticsRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_oi_statistics ${sql(
        rows.map((r) => ({
            pair: r.pair,
            period: r.period,
            captured_at: r.captured_at,
            sum_oi: r.sum_oi,
            sum_oi_value: r.sum_oi_value,
            source: r.source ?? null,
        })),
        "pair", "period", "captured_at", "sum_oi", "sum_oi_value", "source",
    )}
    ON CONFLICT (pair, period, captured_at)
    DO UPDATE SET
      sum_oi = EXCLUDED.sum_oi,
      sum_oi_value = EXCLUDED.sum_oi_value,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestOiStatsTime(pair: string, period: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT captured_at FROM binance_oi_statistics
    WHERE pair = ${pair} AND period = ${period}
    ORDER BY captured_at DESC LIMIT 1
  `) as Array<{ captured_at: string }>;
    return toIso(rows[0]?.captured_at);
}

// ─── Mark Price Klines ───

export async function upsertBinanceMarkPriceKlines(rows: BinanceKlineRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_mark_price_klines ${sql(
        rows.map((r) => ({
            pair: r.pair, interval: r.interval, open_time: r.open_time,
            open: r.open, high: r.high, low: r.low, close: r.close,
            source: r.source ?? null,
        })),
        "pair", "interval", "open_time", "open", "high", "low", "close", "source",
    )}
    ON CONFLICT (pair, interval, open_time)
    DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high,
      low = EXCLUDED.low, close = EXCLUDED.close,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestMarkKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_mark_price_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time DESC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

export async function getBinanceEarliestMarkKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_mark_price_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time ASC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

// ─── Index Price Klines ───

export async function upsertBinanceIndexPriceKlines(rows: BinanceKlineRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_index_price_klines ${sql(
        rows.map((r) => ({
            pair: r.pair, interval: r.interval, open_time: r.open_time,
            open: r.open, high: r.high, low: r.low, close: r.close,
            source: r.source ?? null,
        })),
        "pair", "interval", "open_time", "open", "high", "low", "close", "source",
    )}
    ON CONFLICT (pair, interval, open_time)
    DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high,
      low = EXCLUDED.low, close = EXCLUDED.close,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestIndexKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_index_price_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time DESC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

export async function getBinanceEarliestIndexKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_index_price_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time ASC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

// ─── Premium Index Klines ───

export async function upsertBinancePremiumIndexKlines(rows: BinanceKlineRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_premium_index_klines ${sql(
        rows.map((r) => ({
            pair: r.pair, interval: r.interval, open_time: r.open_time,
            open: r.open, high: r.high, low: r.low, close: r.close,
            source: r.source ?? null,
        })),
        "pair", "interval", "open_time", "open", "high", "low", "close", "source",
    )}
    ON CONFLICT (pair, interval, open_time)
    DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high,
      low = EXCLUDED.low, close = EXCLUDED.close,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestPremiumKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_premium_index_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time DESC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

export async function getBinanceEarliestPremiumKlineTime(pair: string, interval: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT open_time FROM binance_premium_index_klines
    WHERE pair = ${pair} AND interval = ${interval}
    ORDER BY open_time ASC LIMIT 1
  `) as Array<{ open_time: string }>;
    return toIso(rows[0]?.open_time);
}

// ─── L/S Ratio ───

export async function upsertBinanceLsRatio(rows: BinanceLsRatioRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_ls_ratio ${sql(
        rows.map((r) => ({
            pair: r.pair,
            ratio_type: r.ratio_type,
            period: r.period,
            captured_at: r.captured_at,
            long_short_ratio: r.long_short_ratio,
            long_account: r.long_account,
            short_account: r.short_account,
            source: r.source ?? null,
        })),
        "pair", "ratio_type", "period", "captured_at",
        "long_short_ratio", "long_account", "short_account", "source",
    )}
    ON CONFLICT (pair, ratio_type, period, captured_at)
    DO UPDATE SET
      long_short_ratio = EXCLUDED.long_short_ratio,
      long_account = EXCLUDED.long_account,
      short_account = EXCLUDED.short_account,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestLsRatioTime(pair: string, ratioType: string, period: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT captured_at FROM binance_ls_ratio
    WHERE pair = ${pair} AND ratio_type = ${ratioType} AND period = ${period}
    ORDER BY captured_at DESC LIMIT 1
  `) as Array<{ captured_at: string }>;
    return toIso(rows[0]?.captured_at);
}

// ─── Taker Buy/Sell ───

export async function upsertBinanceTakerBuySell(rows: BinanceTakerBuySellRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_taker_buy_sell ${sql(
        rows.map((r) => ({
            pair: r.pair,
            period: r.period,
            captured_at: r.captured_at,
            buy_sell_ratio: r.buy_sell_ratio,
            buy_vol: r.buy_vol,
            sell_vol: r.sell_vol,
            source: r.source ?? null,
        })),
        "pair", "period", "captured_at", "buy_sell_ratio", "buy_vol", "sell_vol", "source",
    )}
    ON CONFLICT (pair, period, captured_at)
    DO UPDATE SET
      buy_sell_ratio = EXCLUDED.buy_sell_ratio,
      buy_vol = EXCLUDED.buy_vol,
      sell_vol = EXCLUDED.sell_vol,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestTakerTime(pair: string, period: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT captured_at FROM binance_taker_buy_sell
    WHERE pair = ${pair} AND period = ${period}
    ORDER BY captured_at DESC LIMIT 1
  `) as Array<{ captured_at: string }>;
    return toIso(rows[0]?.captured_at);
}

// ─── Basis ───

export async function upsertBinanceBasis(rows: BinanceBasisRow[]) {
    if (rows.length === 0) return;
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    await sql`
    INSERT INTO binance_basis ${sql(
        rows.map((r) => ({
            pair: r.pair,
            period: r.period,
            captured_at: r.captured_at,
            index_price: r.index_price,
            futures_price: r.futures_price,
            basis: r.basis,
            basis_rate: r.basis_rate,
            annualized_basis_rate: r.annualized_basis_rate,
            contract_type: r.contract_type,
            source: r.source ?? null,
        })),
        "pair", "period", "captured_at", "index_price", "futures_price",
        "basis", "basis_rate", "annualized_basis_rate", "contract_type", "source",
    )}
    ON CONFLICT (pair, period, captured_at)
    DO UPDATE SET
      index_price = EXCLUDED.index_price,
      futures_price = EXCLUDED.futures_price,
      basis = EXCLUDED.basis,
      basis_rate = EXCLUDED.basis_rate,
      annualized_basis_rate = EXCLUDED.annualized_basis_rate,
      contract_type = EXCLUDED.contract_type,
      source = EXCLUDED.source, updated_at = now()
  `;
}

export async function getBinanceLatestBasisTime(pair: string, period: string) {
    await ensureBinanceMarketDataSchema();
    const sql = getSql();
    const rows = (await sql`
    SELECT captured_at FROM binance_basis
    WHERE pair = ${pair} AND period = ${period}
    ORDER BY captured_at DESC LIMIT 1
  `) as Array<{ captured_at: string }>;
    return toIso(rows[0]?.captured_at);
}
