/**
 * Binance Futures Data Ingestion Service
 *
 * Handles all futures-specific data: candles, agg trades, orderbook, ticker,
 * funding rates, open interest, OI statistics, mark/index/premium price klines,
 * L/S ratios (3 types), taker buy/sell volume, and basis.
 * Sentiment endpoints use the `period` parameter for granularity.
 */

import { loadEnv } from "../config/env";
import { getBinancePairs, getBinanceIntervals, getBinanceSentimentPeriods, toBinanceSymbol } from "../config/binance_market_catalog";
import { BinanceClient } from "../integrations/exchange/binance_client";
import {
    upsertBinanceCandles,
    getBinanceLatestCandleTime,
    upsertBinanceAggTrades,
    getBinanceLatestAggTradeId,
    insertBinanceOrderbookSnapshot,
    upsertBinanceTickers,
    upsertBinanceFundingRates,
    getBinanceLatestFundingTime,
    upsertBinanceOpenInterest,
    upsertBinanceOiStatistics,
    getBinanceLatestOiStatsTime,
    upsertBinanceMarkPriceKlines,
    getBinanceLatestMarkKlineTime,
    upsertBinanceIndexPriceKlines,
    getBinanceLatestIndexKlineTime,
    upsertBinancePremiumIndexKlines,
    getBinanceLatestPremiumKlineTime,
    upsertBinanceLsRatio,
    getBinanceLatestLsRatioTime,
    upsertBinanceTakerBuySell,
    getBinanceLatestTakerTime,
    upsertBinanceBasis,
    getBinanceLatestBasisTime,
    type BinanceCandleRow,
    type BinanceAggTradeRow,
    type BinanceTickerRow,
    type BinanceFundingRateRow,
    type BinanceOpenInterestRow,
    type BinanceOiStatisticsRow,
    type BinanceKlineRow,
    type BinanceLsRatioRow,
    type BinanceTakerBuySellRow,
    type BinanceBasisRow,
} from "../db/timescale/binance_market_data";
import { logInfo, logWarn } from "./logger";

const BINANCE_SOURCE = "binance_futures_rest";
const EXCHANGE = "futures";
const KLINE_LIMIT = 1500;
const AGG_TRADE_LIMIT = 1000;
const FUNDING_LIMIT = 1000;
const SENTIMENT_LIMIT = 500;

export type BinanceFuturesIngestSummary = {
    pair: string;
    candlesInserted: number;
    aggTradesInserted: number;
    orderbookInserted: number;
    tickersInserted: number;
    fundingInserted: number;
    oiInserted: number;
    oiStatsInserted: number;
    markKlinesInserted: number;
    indexKlinesInserted: number;
    premiumKlinesInserted: number;
    lsRatioInserted: number;
    takerInserted: number;
    basisInserted: number;
};

export async function runBinanceFuturesIngest(options?: {
    pairs?: string[];
    intervals?: string[];
    maxBatches?: number;
}): Promise<BinanceFuturesIngestSummary[]> {
    const env = loadEnv();
    if (!env.BINANCE_MARKET_DATA_ENABLED) {
        logInfo("Binance futures ingest skipped (disabled)");
        return [];
    }

    const pairs = options?.pairs ?? getBinancePairs();
    const intervals = options?.intervals ?? getBinanceIntervals();
    const maxBatches = options?.maxBatches ?? 50;
    const sentimentPeriods = getBinanceSentimentPeriods();
    const client = new BinanceClient();
    const summaries: BinanceFuturesIngestSummary[] = [];

    for (const pair of pairs) {
        const summary: BinanceFuturesIngestSummary = {
            pair,
            candlesInserted: 0,
            aggTradesInserted: 0,
            orderbookInserted: 0,
            tickersInserted: 0,
            fundingInserted: 0,
            oiInserted: 0,
            oiStatsInserted: 0,
            markKlinesInserted: 0,
            indexKlinesInserted: 0,
            premiumKlinesInserted: 0,
            lsRatioInserted: 0,
            takerInserted: 0,
            basisInserted: 0,
        };

        try {
            // 1. Futures candles
            for (const interval of intervals) {
                const count = await ingestFuturesCandles(client, pair, interval, maxBatches);
                summary.candlesInserted += count;
            }

            // 2. Agg trades
            summary.aggTradesInserted = await ingestFuturesAggTrades(client, pair, maxBatches);

            // 3. Orderbook
            summary.orderbookInserted = await ingestFuturesOrderbook(client, pair);

            // 4. Ticker
            summary.tickersInserted = await ingestFuturesTicker(client, pair);

            // 5. Funding rates
            summary.fundingInserted = await ingestFundingRates(client, pair, maxBatches);

            // 6. Open interest
            summary.oiInserted = await ingestOpenInterest(client, pair);

            // 7. OI statistics (sentiment, 30d)
            for (const period of sentimentPeriods) {
                summary.oiStatsInserted += await ingestOiStatistics(client, pair, period);
            }

            // 8. Mark price klines
            for (const interval of intervals) {
                summary.markKlinesInserted += await ingestMarkPriceKlines(client, pair, interval, maxBatches);
            }

            // 9. Index price klines
            for (const interval of intervals) {
                summary.indexKlinesInserted += await ingestIndexPriceKlines(client, pair, interval, maxBatches);
            }

            // 10. Premium index klines
            for (const interval of intervals) {
                summary.premiumKlinesInserted += await ingestPremiumIndexKlines(client, pair, interval, maxBatches);
            }

            // 11. L/S ratios (3 types)
            for (const period of sentimentPeriods) {
                summary.lsRatioInserted += await ingestLsRatios(client, pair, period);
            }

            // 12. Taker buy/sell
            for (const period of sentimentPeriods) {
                summary.takerInserted += await ingestTakerBuySell(client, pair, period);
            }

            // 13. Basis
            for (const period of sentimentPeriods) {
                summary.basisInserted += await ingestBasis(client, pair, period);
            }
        } catch (error) {
            logWarn("Binance futures ingest error", { pair, error: String(error) });
        }

        summaries.push(summary);
        logInfo("Binance futures ingest pair complete", { pair, ...summary });
    }

    return summaries;
}

// ─── Candles ───

async function ingestFuturesCandles(client: BinanceClient, pair: string, interval: string, maxBatches: number): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;
    const latestStr = await getBinanceLatestCandleTime(EXCHANGE, pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        const raw = await client.getFuturesKlines({ symbol, interval, startTime, limit: KLINE_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceCandleRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                exchange: EXCHANGE, pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                close_time: new Date(arr[6] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
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
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── Agg Trades ───

async function ingestFuturesAggTrades(client: BinanceClient, pair: string, maxBatches: number): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;
    const latestId = await getBinanceLatestAggTradeId(EXCHANGE, pair);
    let fromId = latestId ? Number(latestId) + 1 : undefined;

    for (let batch = 0; batch < Math.min(maxBatches, 3); batch++) {
        const params: { symbol: string; fromId?: number; limit: number } = { symbol, limit: AGG_TRADE_LIMIT };
        if (fromId !== undefined) params.fromId = fromId;

        const raw = await client.getFuturesAggTrades(params);
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceAggTradeRow[] = raw.map((t: unknown) => {
            const trade = t as Record<string, unknown>;
            return {
                exchange: EXCHANGE, pair,
                agg_trade_id: String(trade.a),
                price: Number(trade.p), quantity: Number(trade.q),
                first_trade_id: String(trade.f), last_trade_id: String(trade.l),
                executed_at: new Date(trade.T as number).toISOString(),
                is_buyer_maker: Boolean(trade.m),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceAggTrades(rows);
        total += rows.length;
        fromId = (raw[raw.length - 1] as Record<string, unknown>).a as number + 1;
        if (raw.length < AGG_TRADE_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── Orderbook ───

async function ingestFuturesOrderbook(client: BinanceClient, pair: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const data = await client.getFuturesDepth({ symbol, limit: 20 });
        await insertBinanceOrderbookSnapshot({
            exchange: EXCHANGE, pair,
            captured_at: new Date().toISOString(),
            depth_level: 20,
            bids: data.bids, asks: data.asks,
            source: BINANCE_SOURCE,
        });
        return 1;
    } catch (error) {
        logWarn("Binance futures orderbook error", { pair, error: String(error) });
        return 0;
    }
}

// ─── Ticker ───

async function ingestFuturesTicker(client: BinanceClient, pair: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const data = await client.getFuturesTicker24hr({ symbol });
        const row: BinanceTickerRow = {
            exchange: EXCHANGE, pair,
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
        logWarn("Binance futures ticker error", { pair, error: String(error) });
        return 0;
    }
}

// ─── Funding Rates ───

async function ingestFundingRates(client: BinanceClient, pair: string, maxBatches: number): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;
    const latestStr = await getBinanceLatestFundingTime(pair);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        const raw = await client.getFundingRate({ symbol, startTime, limit: FUNDING_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceFundingRateRow[] = raw.map((f: unknown) => {
            const item = f as Record<string, unknown>;
            return {
                pair,
                funding_time: new Date(item.fundingTime as number).toISOString(),
                funding_rate: Number(item.fundingRate),
                mark_price: item.markPrice ? Number(item.markPrice) : null,
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceFundingRates(rows);
        total += rows.length;
        startTime = (raw[raw.length - 1] as Record<string, unknown>).fundingTime as number + 1;
        if (raw.length < FUNDING_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── Open Interest (current snapshot) ───

async function ingestOpenInterest(client: BinanceClient, pair: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const data = await client.getOpenInterest({ symbol }) as Record<string, unknown>;
        const row: BinanceOpenInterestRow = {
            pair,
            captured_at: new Date(data.time as number || Date.now()).toISOString(),
            open_interest: Number(data.openInterest),
            source: BINANCE_SOURCE,
        };
        await upsertBinanceOpenInterest([row]);
        return 1;
    } catch (error) {
        logWarn("Binance OI error", { pair, error: String(error) });
        return 0;
    }
}

// ─── OI Statistics (30-day rolling) ───

async function ingestOiStatistics(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const latestStr = await getBinanceLatestOiStatsTime(pair, period);
        const startTime = latestStr ? new Date(latestStr).getTime() + 1 : Date.now() - 30 * 24 * 60 * 60 * 1000;

        const raw = await client.getOiStatistics({ symbol, period, startTime, limit: SENTIMENT_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) return 0;

        const rows: BinanceOiStatisticsRow[] = raw.map((item: unknown) => {
            const d = item as Record<string, unknown>;
            return {
                pair, period,
                captured_at: new Date(d.timestamp as number).toISOString(),
                sum_oi: Number(d.sumOpenInterest),
                sum_oi_value: Number(d.sumOpenInterestValue),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceOiStatistics(rows);
        return rows.length;
    } catch (error) {
        logWarn("Binance OI stats error", { pair, period, error: String(error) });
        return 0;
    }
}

// ─── Mark Price Klines ───

async function ingestMarkPriceKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;
    const latestStr = await getBinanceLatestMarkKlineTime(pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        const raw = await client.getMarkPriceKlines({ symbol, interval, startTime, limit: KLINE_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceKlineRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceMarkPriceKlines(rows);
        total += rows.length;
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── Index Price Klines ───

async function ingestIndexPriceKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number): Promise<number> {
    let total = 0;
    const latestStr = await getBinanceLatestIndexKlineTime(pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        // Index klines use `pair` parameter (base asset pair like "BTCUSDT")
        const raw = await client.getIndexPriceKlines({ pair: toBinanceSymbol(pair), interval, startTime, limit: KLINE_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceKlineRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceIndexPriceKlines(rows);
        total += rows.length;
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── Premium Index Klines ───

async function ingestPremiumIndexKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;
    const latestStr = await getBinanceLatestPremiumKlineTime(pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
        const raw = await client.getPremiumIndexKlines({ symbol, interval, startTime, limit: KLINE_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const rows: BinanceKlineRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinancePremiumIndexKlines(rows);
        total += rows.length;
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(100);
    }
    return total;
}

// ─── L/S Ratios (3 types) ───

async function ingestLsRatios(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;

    const types: Array<{ method: "topPosition" | "topAccount" | "global"; ratioType: BinanceLsRatioRow["ratio_type"] }> = [
        { method: "topPosition", ratioType: "top_position" },
        { method: "topAccount", ratioType: "top_account" },
        { method: "global", ratioType: "global" },
    ];

    for (const { method, ratioType } of types) {
        try {
            const latestStr = await getBinanceLatestLsRatioTime(pair, ratioType, period);
            const startTime = latestStr ? new Date(latestStr).getTime() + 1 : Date.now() - 30 * 24 * 60 * 60 * 1000;

            let raw: unknown[];
            if (method === "topPosition") {
                raw = await client.getTopLongShortPositionRatio({ symbol, period, startTime, limit: SENTIMENT_LIMIT });
            } else if (method === "topAccount") {
                raw = await client.getTopLongShortAccountRatio({ symbol, period, startTime, limit: SENTIMENT_LIMIT });
            } else {
                raw = await client.getGlobalLongShortRatio({ symbol, period, startTime, limit: SENTIMENT_LIMIT });
            }

            if (!Array.isArray(raw) || raw.length === 0) continue;

            const rows: BinanceLsRatioRow[] = raw.map((item: unknown) => {
                const d = item as Record<string, unknown>;
                return {
                    pair, ratio_type: ratioType, period,
                    captured_at: new Date(d.timestamp as number).toISOString(),
                    long_short_ratio: Number(d.longShortRatio),
                    long_account: Number(d.longAccount ?? d.longPosition ?? 0),
                    short_account: Number(d.shortAccount ?? d.shortPosition ?? 0),
                    source: BINANCE_SOURCE,
                };
            });

            await upsertBinanceLsRatio(rows);
            total += rows.length;
        } catch (error) {
            logWarn("Binance L/S ratio error", { pair, period, method, error: String(error) });
        }
    }

    return total;
}

// ─── Taker Buy/Sell Volume ───

async function ingestTakerBuySell(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    try {
        const latestStr = await getBinanceLatestTakerTime(pair, period);
        const startTime = latestStr ? new Date(latestStr).getTime() + 1 : Date.now() - 30 * 24 * 60 * 60 * 1000;

        const raw = await client.getTakerBuySellVolume({ symbol, period, startTime, limit: SENTIMENT_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) return 0;

        const rows: BinanceTakerBuySellRow[] = raw.map((item: unknown) => {
            const d = item as Record<string, unknown>;
            return {
                pair, period,
                captured_at: new Date(d.timestamp as number).toISOString(),
                buy_sell_ratio: Number(d.buySellRatio),
                buy_vol: Number(d.buyVol),
                sell_vol: Number(d.sellVol),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceTakerBuySell(rows);
        return rows.length;
    } catch (error) {
        logWarn("Binance taker buy/sell error", { pair, period, error: String(error) });
        return 0;
    }
}

// ─── Basis ───

async function ingestBasis(client: BinanceClient, pair: string, period: string): Promise<number> {
    try {
        const latestStr = await getBinanceLatestBasisTime(pair, period);
        const startTime = latestStr ? new Date(latestStr).getTime() + 1 : Date.now() - 30 * 24 * 60 * 60 * 1000;

        const raw = await client.getBasis({ pair: toBinanceSymbol(pair), contractType: "CURRENT_QUARTER", period, startTime, limit: SENTIMENT_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) return 0;

        const rows: BinanceBasisRow[] = raw.map((item: unknown) => {
            const d = item as Record<string, unknown>;
            return {
                pair, period,
                captured_at: new Date(d.timestamp as number).toISOString(),
                index_price: Number(d.indexPrice),
                futures_price: Number(d.futuresPrice ?? d.contractPrice ?? 0),
                basis: Number(d.basis),
                basis_rate: Number(d.basisRate),
                annualized_basis_rate: Number(d.annualizedBasisRate ?? 0),
                contract_type: String(d.contractType ?? "CURRENT_QUARTER"),
                source: BINANCE_SOURCE,
            };
        });

        await upsertBinanceBasis(rows);
        return rows.length;
    } catch (error) {
        logWarn("Binance basis error", { pair, period, error: String(error) });
        return 0;
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
