/**
 * Binance Full Backfill Service
 *
 * Orchestrates full history fetch:
 * - Klines: walks backward from earliest DB row to exchange genesis, forward to now
 * - Agg trades: paginate by fromId, walking full history
 * - Funding rates: paginate by startTime (limit 1000)
 * - Mark/index/premium klines: same strategy as klines
 * - Sentiment data (OI stats, L/S, taker, basis): backfill rolling 30 days at all periods
 * - Rate limit aware with adaptive sleep
 */

import { loadEnv } from "../config/env";
import { getBinancePairs, getBinanceIntervals, getBinanceSentimentPeriods, toBinanceSymbol } from "../config/binance_market_catalog";
import { BinanceClient } from "../integrations/exchange/binance_client";
import {
    getBinanceEarliestCandleTime,
    getBinanceLatestCandleTime,
    upsertBinanceCandles,
    getBinanceLatestAggTradeId,
    upsertBinanceAggTrades,
    getBinanceEarliestFundingTime,
    getBinanceLatestFundingTime,
    upsertBinanceFundingRates,
    getBinanceEarliestMarkKlineTime,
    getBinanceLatestMarkKlineTime,
    upsertBinanceMarkPriceKlines,
    getBinanceEarliestIndexKlineTime,
    getBinanceLatestIndexKlineTime,
    upsertBinanceIndexPriceKlines,
    getBinanceEarliestPremiumKlineTime,
    getBinanceLatestPremiumKlineTime,
    upsertBinancePremiumIndexKlines,
    upsertBinanceOiStatistics,
    getBinanceLatestOiStatsTime,
    upsertBinanceLsRatio,
    getBinanceLatestLsRatioTime,
    upsertBinanceTakerBuySell,
    getBinanceLatestTakerTime,
    upsertBinanceBasis,
    getBinanceLatestBasisTime,
    type BinanceCandleRow,
    type BinanceAggTradeRow,
    type BinanceFundingRateRow,
    type BinanceKlineRow,
    type BinanceOiStatisticsRow,
    type BinanceLsRatioRow,
    type BinanceTakerBuySellRow,
    type BinanceBasisRow,
} from "../db/timescale/binance_market_data";
import { logInfo, logWarn } from "./logger";

const KLINE_LIMIT = 1500;
const FUNDING_LIMIT = 1000;
const AGG_TRADE_LIMIT = 1000;
const SENTIMENT_LIMIT = 500;
const BATCH_DELAY_MS = 200;

export type BinanceBackfillResult = {
    totalBatches: number;
    totalRowsInserted: number;
    errors: string[];
};

export async function runBinanceFullBackfill(options?: {
    maxBatches?: number;
    pairs?: string[];
}): Promise<BinanceBackfillResult> {
    const env = loadEnv();
    if (!env.BINANCE_BACKFILL_ENABLED && !env.BINANCE_MARKET_DATA_ENABLED) {
        logInfo("Binance backfill skipped (disabled)");
        return { totalBatches: 0, totalRowsInserted: 0, errors: [] };
    }

    const maxBatches = options?.maxBatches ?? env.BINANCE_BACKFILL_MAX_BATCHES;
    const pairs = options?.pairs ?? getBinancePairs();
    const intervals = getBinanceIntervals();
    const sentimentPeriods = getBinanceSentimentPeriods();
    const client = new BinanceClient();

    let totalBatches = 0;
    let totalRowsInserted = 0;
    const errors: string[] = [];

    for (const pair of pairs) {
        logInfo("Binance backfill starting pair", { pair });

        // ─── 1. Spot + Futures Candles ───
        for (const exchange of ["spot", "futures"] as const) {
            for (const interval of intervals) {
                try {
                    const result = await backfillCandles(client, pair, interval, exchange, maxBatches);
                    totalBatches += result.batches;
                    totalRowsInserted += result.rows;
                } catch (error) {
                    const msg = `Candles ${exchange}/${pair}/${interval}: ${String(error)}`;
                    logWarn("Binance backfill error", { msg });
                    errors.push(msg);
                }
            }
        }

        // ─── 2. Agg Trades ───
        for (const exchange of ["spot", "futures"] as const) {
            try {
                const result = await backfillAggTrades(client, pair, exchange, maxBatches);
                totalBatches += result.batches;
                totalRowsInserted += result.rows;
            } catch (error) {
                const msg = `AggTrades ${exchange}/${pair}: ${String(error)}`;
                logWarn("Binance backfill error", { msg });
                errors.push(msg);
            }
        }

        // ─── 3. Funding Rates ───
        try {
            const result = await backfillFundingRates(client, pair, maxBatches);
            totalBatches += result.batches;
            totalRowsInserted += result.rows;
        } catch (error) {
            const msg = `FundingRates ${pair}: ${String(error)}`;
            logWarn("Binance backfill error", { msg });
            errors.push(msg);
        }

        // ─── 4. Mark Price Klines ───
        for (const interval of intervals) {
            try {
                const result = await backfillMarkPriceKlines(client, pair, interval, maxBatches);
                totalBatches += result.batches;
                totalRowsInserted += result.rows;
            } catch (error) {
                const msg = `MarkPriceKlines ${pair}/${interval}: ${String(error)}`;
                errors.push(msg);
            }
        }

        // ─── 5. Index Price Klines ───
        for (const interval of intervals) {
            try {
                const result = await backfillIndexPriceKlines(client, pair, interval, maxBatches);
                totalBatches += result.batches;
                totalRowsInserted += result.rows;
            } catch (error) {
                const msg = `IndexPriceKlines ${pair}/${interval}: ${String(error)}`;
                errors.push(msg);
            }
        }

        // ─── 6. Premium Index Klines ───
        for (const interval of intervals) {
            try {
                const result = await backfillPremiumIndexKlines(client, pair, interval, maxBatches);
                totalBatches += result.batches;
                totalRowsInserted += result.rows;
            } catch (error) {
                const msg = `PremiumIndexKlines ${pair}/${interval}: ${String(error)}`;
                errors.push(msg);
            }
        }

        // ─── 7. Sentiment data (30-day rolling) ───
        for (const period of sentimentPeriods) {
            try {
                totalRowsInserted += await backfillOiStatistics(client, pair, period);
                totalBatches++;
            } catch (error) {
                errors.push(`OiStats ${pair}/${period}: ${String(error)}`);
            }

            try {
                totalRowsInserted += await backfillLsRatios(client, pair, period);
                totalBatches++;
            } catch (error) {
                errors.push(`LsRatios ${pair}/${period}: ${String(error)}`);
            }

            try {
                totalRowsInserted += await backfillTakerBuySell(client, pair, period);
                totalBatches++;
            } catch (error) {
                errors.push(`TakerBuySell ${pair}/${period}: ${String(error)}`);
            }

            try {
                totalRowsInserted += await backfillBasis(client, pair, period);
                totalBatches++;
            } catch (error) {
                errors.push(`Basis ${pair}/${period}: ${String(error)}`);
            }
        }

        logInfo("Binance backfill pair complete", { pair, totalBatches, totalRowsInserted, errorCount: errors.length });
    }

    return { totalBatches, totalRowsInserted, errors };
}

// ─── Candle backfill ───

async function backfillCandles(
    client: BinanceClient,
    pair: string,
    interval: string,
    exchange: "spot" | "futures",
    maxBatches: number,
): Promise<{ batches: number; rows: number }> {
    const symbol = toBinanceSymbol(pair);
    let batches = 0;
    let rows = 0;

    // Forward fill: from latest to now
    const latestStr = await getBinanceLatestCandleTime(exchange, pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let i = 0; i < maxBatches; i++) {
        const raw = exchange === "spot"
            ? await client.getSpotKlines({ symbol, interval, startTime, limit: KLINE_LIMIT })
            : await client.getFuturesKlines({ symbol, interval, startTime, limit: KLINE_LIMIT });

        if (!Array.isArray(raw) || raw.length === 0) break;

        const candleRows: BinanceCandleRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                exchange, pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                close_time: new Date(arr[6] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
                volume: Number(arr[5]),
                quote_volume: Number(arr[7]) || null,
                trade_count: Number(arr[8]) || null,
                taker_buy_base_vol: Number(arr[9]) || null,
                taker_buy_quote_vol: Number(arr[10]) || null,
                source: `binance_${exchange}_backfill`,
            };
        });

        await upsertBinanceCandles(candleRows);
        batches++;
        rows += candleRows.length;
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(BATCH_DELAY_MS);
    }

    // Backward fill: from earliest DB row to exchange genesis
    const earliestStr = await getBinanceEarliestCandleTime(exchange, pair, interval);
    if (earliestStr) {
        let endTime = new Date(earliestStr).getTime() - 1;
        for (let i = 0; i < maxBatches; i++) {
            const raw = exchange === "spot"
                ? await client.getSpotKlines({ symbol, interval, endTime, limit: KLINE_LIMIT })
                : await client.getFuturesKlines({ symbol, interval, endTime, limit: KLINE_LIMIT });

            if (!Array.isArray(raw) || raw.length === 0) break;

            const candleRows: BinanceCandleRow[] = raw.map((k: unknown) => {
                const arr = k as unknown[];
                return {
                    exchange, pair, interval,
                    open_time: new Date(arr[0] as number).toISOString(),
                    close_time: new Date(arr[6] as number).toISOString(),
                    open: Number(arr[1]), high: Number(arr[2]),
                    low: Number(arr[3]), close: Number(arr[4]),
                    volume: Number(arr[5]),
                    quote_volume: Number(arr[7]) || null,
                    trade_count: Number(arr[8]) || null,
                    taker_buy_base_vol: Number(arr[9]) || null,
                    taker_buy_quote_vol: Number(arr[10]) || null,
                    source: `binance_${exchange}_backfill`,
                };
            });

            await upsertBinanceCandles(candleRows);
            batches++;
            rows += candleRows.length;
            endTime = (raw[0] as unknown[])[0] as number - 1;
            if (raw.length < KLINE_LIMIT) break;
            await sleep(BATCH_DELAY_MS);
        }
    }

    return { batches, rows };
}

// ─── Agg Trade backfill ───

async function backfillAggTrades(
    client: BinanceClient,
    pair: string,
    exchange: "spot" | "futures",
    maxBatches: number,
): Promise<{ batches: number; rows: number }> {
    const symbol = toBinanceSymbol(pair);
    let batches = 0;
    let rows = 0;
    const latestId = await getBinanceLatestAggTradeId(exchange, pair);
    let fromId = latestId ? Number(latestId) + 1 : undefined;

    for (let i = 0; i < maxBatches; i++) {
        const params: { symbol: string; fromId?: number; limit: number } = { symbol, limit: AGG_TRADE_LIMIT };
        if (fromId !== undefined) params.fromId = fromId;

        const raw = exchange === "spot"
            ? await client.getSpotAggTrades(params)
            : await client.getFuturesAggTrades(params);

        if (!Array.isArray(raw) || raw.length === 0) break;

        const tradeRows: BinanceAggTradeRow[] = raw.map((t: unknown) => {
            const trade = t as Record<string, unknown>;
            return {
                exchange, pair,
                agg_trade_id: String(trade.a),
                price: Number(trade.p), quantity: Number(trade.q),
                first_trade_id: String(trade.f), last_trade_id: String(trade.l),
                executed_at: new Date(trade.T as number).toISOString(),
                is_buyer_maker: Boolean(trade.m),
                source: `binance_${exchange}_backfill`,
            };
        });

        await upsertBinanceAggTrades(tradeRows);
        batches++;
        rows += tradeRows.length;
        fromId = (raw[raw.length - 1] as Record<string, unknown>).a as number + 1;
        if (raw.length < AGG_TRADE_LIMIT) break;
        await sleep(BATCH_DELAY_MS);
    }

    return { batches, rows };
}

// ─── Funding Rate backfill ───

async function backfillFundingRates(
    client: BinanceClient,
    pair: string,
    maxBatches: number,
): Promise<{ batches: number; rows: number }> {
    const symbol = toBinanceSymbol(pair);
    let batches = 0;
    let rows = 0;

    // Forward from latest
    const latestStr = await getBinanceLatestFundingTime(pair);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let i = 0; i < maxBatches; i++) {
        const raw = await client.getFundingRate({ symbol, startTime, limit: FUNDING_LIMIT });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const fundingRows: BinanceFundingRateRow[] = raw.map((f: unknown) => {
            const item = f as Record<string, unknown>;
            return {
                pair,
                funding_time: new Date(item.fundingTime as number).toISOString(),
                funding_rate: Number(item.fundingRate),
                mark_price: item.markPrice ? Number(item.markPrice) : null,
                source: "binance_futures_backfill",
            };
        });

        await upsertBinanceFundingRates(fundingRows);
        batches++;
        rows += fundingRows.length;
        startTime = (raw[raw.length - 1] as Record<string, unknown>).fundingTime as number + 1;
        if (raw.length < FUNDING_LIMIT) break;
        await sleep(BATCH_DELAY_MS);
    }

    // Backward from earliest
    const earliestStr = await getBinanceEarliestFundingTime(pair);
    if (earliestStr) {
        let endTime = new Date(earliestStr).getTime() - 1;
        for (let i = 0; i < maxBatches; i++) {
            const raw = await client.getFundingRate({ symbol, endTime, limit: FUNDING_LIMIT });
            if (!Array.isArray(raw) || raw.length === 0) break;

            const fundingRows: BinanceFundingRateRow[] = raw.map((f: unknown) => {
                const item = f as Record<string, unknown>;
                return {
                    pair,
                    funding_time: new Date(item.fundingTime as number).toISOString(),
                    funding_rate: Number(item.fundingRate),
                    mark_price: item.markPrice ? Number(item.markPrice) : null,
                    source: "binance_futures_backfill",
                };
            });

            await upsertBinanceFundingRates(fundingRows);
            batches++;
            rows += fundingRows.length;
            endTime = (raw[0] as Record<string, unknown>).fundingTime as number - 1;
            if (raw.length < FUNDING_LIMIT) break;
            await sleep(BATCH_DELAY_MS);
        }
    }

    return { batches, rows };
}

// ─── Mark/Index/Premium kline backfill (same pattern) ───

async function backfillMarkPriceKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number) {
    return backfillSpecialKlines(client, pair, interval, maxBatches, "mark");
}

async function backfillIndexPriceKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number) {
    return backfillSpecialKlines(client, pair, interval, maxBatches, "index");
}

async function backfillPremiumIndexKlines(client: BinanceClient, pair: string, interval: string, maxBatches: number) {
    return backfillSpecialKlines(client, pair, interval, maxBatches, "premium");
}

async function backfillSpecialKlines(
    client: BinanceClient,
    pair: string,
    interval: string,
    maxBatches: number,
    klineType: "mark" | "index" | "premium",
): Promise<{ batches: number; rows: number }> {
    const symbol = toBinanceSymbol(pair);
    let batches = 0;
    let rows = 0;

    const getLatest = klineType === "mark" ? getBinanceLatestMarkKlineTime
        : klineType === "index" ? getBinanceLatestIndexKlineTime
            : getBinanceLatestPremiumKlineTime;

    const getEarliest = klineType === "mark" ? getBinanceEarliestMarkKlineTime
        : klineType === "index" ? getBinanceEarliestIndexKlineTime
            : getBinanceEarliestPremiumKlineTime;

    const upsert = klineType === "mark" ? upsertBinanceMarkPriceKlines
        : klineType === "index" ? upsertBinanceIndexPriceKlines
            : upsertBinancePremiumIndexKlines;

    async function fetchKlines(params: { startTime?: number; endTime?: number }) {
        if (klineType === "mark") {
            return client.getMarkPriceKlines({ symbol, interval, ...params, limit: KLINE_LIMIT });
        } else if (klineType === "index") {
            return client.getIndexPriceKlines({ pair: symbol, interval, ...params, limit: KLINE_LIMIT });
        } else {
            return client.getPremiumIndexKlines({ symbol, interval, ...params, limit: KLINE_LIMIT });
        }
    }

    // Forward fill
    const latestStr = await getLatest(pair, interval);
    let startTime = latestStr ? new Date(latestStr).getTime() + 1 : undefined;

    for (let i = 0; i < maxBatches; i++) {
        const raw = await fetchKlines({ startTime });
        if (!Array.isArray(raw) || raw.length === 0) break;

        const klineRows: BinanceKlineRow[] = raw.map((k: unknown) => {
            const arr = k as unknown[];
            return {
                pair, interval,
                open_time: new Date(arr[0] as number).toISOString(),
                open: Number(arr[1]), high: Number(arr[2]),
                low: Number(arr[3]), close: Number(arr[4]),
                source: `binance_futures_backfill`,
            };
        });

        await upsert(klineRows);
        batches++;
        rows += klineRows.length;
        startTime = (raw[raw.length - 1] as unknown[])[0] as number + 1;
        if (raw.length < KLINE_LIMIT) break;
        await sleep(BATCH_DELAY_MS);
    }

    // Backward fill
    const earliestStr = await getEarliest(pair, interval);
    if (earliestStr) {
        let endTime = new Date(earliestStr).getTime() - 1;
        for (let i = 0; i < maxBatches; i++) {
            const raw = await fetchKlines({ endTime });
            if (!Array.isArray(raw) || raw.length === 0) break;

            const klineRows: BinanceKlineRow[] = raw.map((k: unknown) => {
                const arr = k as unknown[];
                return {
                    pair, interval,
                    open_time: new Date(arr[0] as number).toISOString(),
                    open: Number(arr[1]), high: Number(arr[2]),
                    low: Number(arr[3]), close: Number(arr[4]),
                    source: `binance_futures_backfill`,
                };
            });

            await upsert(klineRows);
            batches++;
            rows += klineRows.length;
            endTime = (raw[0] as unknown[])[0] as number - 1;
            if (raw.length < KLINE_LIMIT) break;
            await sleep(BATCH_DELAY_MS);
        }
    }

    return { batches, rows };
}

// ─── Sentiment backfills (30 days) ───

async function backfillOiStatistics(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
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
            source: "binance_futures_backfill",
        };
    });

    await upsertBinanceOiStatistics(rows);
    return rows.length;
}

async function backfillLsRatios(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
    let total = 0;

    const types: Array<{ method: "topPosition" | "topAccount" | "global"; ratioType: BinanceLsRatioRow["ratio_type"] }> = [
        { method: "topPosition", ratioType: "top_position" },
        { method: "topAccount", ratioType: "top_account" },
        { method: "global", ratioType: "global" },
    ];

    for (const { method, ratioType } of types) {
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
                source: "binance_futures_backfill",
            };
        });

        await upsertBinanceLsRatio(rows);
        total += rows.length;
    }

    return total;
}

async function backfillTakerBuySell(client: BinanceClient, pair: string, period: string): Promise<number> {
    const symbol = toBinanceSymbol(pair);
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
            source: "binance_futures_backfill",
        };
    });

    await upsertBinanceTakerBuySell(rows);
    return rows.length;
}

async function backfillBasis(client: BinanceClient, pair: string, period: string): Promise<number> {
    const latestStr = await getBinanceLatestBasisTime(pair, period);
    const startTime = latestStr ? new Date(latestStr).getTime() + 1 : Date.now() - 30 * 24 * 60 * 60 * 1000;

    const raw = await client.getBasis({
        pair: toBinanceSymbol(pair),
        contractType: "CURRENT_QUARTER",
        period,
        startTime,
        limit: SENTIMENT_LIMIT,
    });
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
            source: "binance_futures_backfill",
        };
    });

    await upsertBinanceBasis(rows);
    return rows.length;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
