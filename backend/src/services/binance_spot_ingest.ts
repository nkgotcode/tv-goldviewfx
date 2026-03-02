/**
 * Binance Spot Data Ingestion Service
 *
 * Fetches candles (all intervals), agg trades, orderbook snapshots, and 24h tickers
 * for each configured pair from the Binance spot REST API.
 * Uses DB-latest tracking for incremental fetches.
 */

import { loadEnv } from "../config/env";
import { getBinancePairs, getBinanceIntervals, toBinanceSymbol } from "../config/binance_market_catalog";
import { BinanceClient } from "../integrations/exchange/binance_client";
import {
    upsertBinanceCandles,
    getBinanceLatestCandleTime,
    upsertBinanceAggTrades,
    getBinanceLatestAggTradeId,
    insertBinanceOrderbookSnapshot,
    upsertBinanceTickers,
    type BinanceCandleRow,
    type BinanceAggTradeRow,
    type BinanceTickerRow,
} from "../db/timescale/binance_market_data";
import { logInfo, logWarn } from "./logger";

const BINANCE_SOURCE = "binance_spot_rest";
const EXCHANGE = "spot";
const KLINE_LIMIT = 1000;
const AGG_TRADE_LIMIT = 1000;

export type BinanceSpotIngestSummary = {
    pair: string;
    candlesInserted: number;
    aggTradesInserted: number;
    orderbookInserted: number;
    tickersInserted: number;
};

export async function runBinanceSpotIngest(options?: {
    pairs?: string[];
    intervals?: string[];
    maxBatches?: number;
}): Promise<BinanceSpotIngestSummary[]> {
    const env = loadEnv();
    if (!env.BINANCE_MARKET_DATA_ENABLED) {
        logInfo("Binance spot ingest skipped (disabled)");
        return [];
    }

    const pairs = options?.pairs ?? getBinancePairs();
    const intervals = options?.intervals ?? getBinanceIntervals();
    const maxBatches = options?.maxBatches ?? 50;
    const client = new BinanceClient();
    const summaries: BinanceSpotIngestSummary[] = [];

    for (const pair of pairs) {
        const summary: BinanceSpotIngestSummary = {
            pair,
            candlesInserted: 0,
            aggTradesInserted: 0,
            orderbookInserted: 0,
            tickersInserted: 0,
        };

        try {
            // Candles
            for (const interval of intervals) {
                const count = await ingestSpotCandles(client, pair, interval, maxBatches);
                summary.candlesInserted += count;
            }

            // Agg trades
            summary.aggTradesInserted = await ingestSpotAggTrades(client, pair, maxBatches);

            // Orderbook snapshot
            summary.orderbookInserted = await ingestSpotOrderbook(client, pair);

            // 24h ticker
            summary.tickersInserted = await ingestSpotTicker(client, pair);
        } catch (error) {
            logWarn("Binance spot ingest error", { pair, error: String(error) });
        }

        summaries.push(summary);
        logInfo("Binance spot ingest pair complete", { pair, ...summary });
    }

    return summaries;
}

async function ingestSpotCandles(
    client: BinanceClient,
    pair: string,
    interval: string,
    maxBatches: number,
): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;

    // Get latest from DB for incremental fetch
    const latestStr = await getBinanceLatestCandleTime(EXCHANGE, pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        const rawKlines = await client.getSpotKlines({
            symbol,
            interval,
            startTime,
            limit: KLINE_LIMIT,
        });

        if (!Array.isArray(rawKlines) || rawKlines.length === 0) break;

        const rows: BinanceCandleRow[] = rawKlines.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                exchange: EXCHANGE,
                pair,
                interval,
                open_time: new Date(arr[0] as number).toISOString(),
                close_time: new Date(arr[6] as number).toISOString(),
                open: Number(arr[1]),
                high: Number(arr[2]),
                low: Number(arr[3]),
                close: Number(arr[4]),
                volume: Number(arr[5]),
                quote_volume: Number(arr[7]) || null,
                trade_count: Number(arr[8]) || null,
                taker_buy_base_vol: Number(arr[9]) || null,
                taker_buy_quote_vol: Number(arr[10]) || null,
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceCandles(rows);
        total += rows.length;

        // Move startTime forward for next batch
        const lastOpenTime = (rawKlines[rawKlines.length - 1] as unknown[])[0] as number;
        startTime = lastOpenTime + 1;

        if (rawKlines.length < KLINE_LIMIT) break;
        await sleep(100); // small delay between batches
    }

    return total;
}

async function ingestSpotAggTrades(
    client: BinanceClient,
    pair: string,
    maxBatches: number,
): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;

    const latestId = await getBinanceLatestAggTradeId(EXCHANGE, pair);
    let fromId = latestId ? Number(latestId) + 1 : undefined;

    for (let batch = 0; batch < Math.min(maxBatches, 3); batch++) {
        const params: { symbol: string; fromId?: number; limit: number } = {
            symbol,
            limit: AGG_TRADE_LIMIT,
        };
        if (fromId !== undefined) params.fromId = fromId;

        const rawTrades = await client.getSpotAggTrades(params);
        if (!Array.isArray(rawTrades) || rawTrades.length === 0) break;

        const rows: BinanceAggTradeRow[] = rawTrades.map((t: unknown) => {
            const trade = t as Record<string, unknown>;
            return {
                exchange: EXCHANGE,
                pair,
                agg_trade_id: String(trade.a),
                price: Number(trade.p),
                quantity: Number(trade.q),
                first_trade_id: String(trade.f),
                last_trade_id: String(trade.l),
                executed_at: new Date(trade.T as number).toISOString(),
                is_buyer_maker: Boolean(trade.m),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceAggTrades(rows);
        total += rows.length;

        const lastId = (rawTrades[rawTrades.length - 1] as Record<string, unknown>).a as number;
        fromId = lastId + 1;

        if (rawTrades.length < AGG_TRADE_LIMIT) break;
        await sleep(100);
    }

    return total;
}

async function ingestSpotOrderbook(client: BinanceClient, pair: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const data = await client.getSpotDepth({ symbol, limit: 20 });
        await insertBinanceOrderbookSnapshot({
            exchange: EXCHANGE,
            pair,
            captured_at: new Date().toISOString(),
            depth_level: 20,
            bids: data.bids,
            asks: data.asks,
            source: BINANCE_SOURCE,
        });
        return 1;
    } catch (error) {
        logWarn("Binance spot orderbook ingest error", { pair, error: String(error) });
        return 0;
    }
}

async function ingestSpotTicker(client: BinanceClient, pair: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const data = await client.getSpotTicker24hr({ symbol });
        const row: BinanceTickerRow = {
            exchange: EXCHANGE,
            pair,
            captured_at: new Date().toISOString(),
            last_price: Number(data.lastPrice),
            price_change: Number(data.priceChange) || null,
            price_change_pct: Number(data.priceChangePercent) || null,
            weighted_avg_price: Number(data.weightedAvgPrice) || null,
            open_price: Number(data.openPrice) || null,
            high_price: Number(data.highPrice) || null,
            low_price: Number(data.lowPrice) || null,
            volume: Number(data.volume) || null,
            quote_volume: Number(data.quoteVolume) || null,
            open_time: data.openTime ? new Date(data.openTime as number).toISOString() : null,
            close_time: data.closeTime ? new Date(data.closeTime as number).toISOString() : null,
            trade_count: Number(data.count) || null,
            source: BINANCE_SOURCE,
        };
        await upsertBinanceTickers([row]);
        return 1;
    } catch (error) {
        logWarn("Binance spot ticker ingest error", { pair, error: String(error) });
        return 0;
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
