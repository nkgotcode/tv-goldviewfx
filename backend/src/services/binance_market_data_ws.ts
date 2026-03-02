/**
 * Binance Market Data WebSocket Service
 *
 * Manages combined streams for both spot and futures:
 * - Spot: kline, aggTrade, depth@100ms, ticker
 * - Futures: kline, aggTrade, depth@100ms, ticker, markPrice@1s
 *
 * Architecture: buffered flush, auto-reconnect with exponential backoff,
 * ping/pong keepalive.
 */

import { loadEnv } from "../config/env";
import { getBinancePairs, getBinanceIntervals, toBinanceSymbol, toWsStreamSymbol } from "../config/binance_market_catalog";
import {
    upsertBinanceCandles,
    upsertBinanceAggTrades,
    insertBinanceOrderbookSnapshot,
    upsertBinanceTickers,
    type BinanceCandleRow,
    type BinanceAggTradeRow,
    type BinanceTickerRow,
} from "../db/timescale/binance_market_data";
import { logInfo, logWarn, logError } from "./logger";

export type BinanceWsController = {
    stop: () => void;
    status: () => BinanceWsStatus;
};

export type BinanceWsStatus = {
    spotConnected: boolean;
    futuresConnected: boolean;
    lastSpotMessageAt: string | null;
    lastFuturesMessageAt: string | null;
    spotTopics: number;
    futuresTopics: number;
};

// ─── Buffered data ───

type PendingBuffers = {
    candles: Map<string, BinanceCandleRow>;
    aggTrades: Map<string, BinanceAggTradeRow>;
    tickers: Map<string, BinanceTickerRow>;
    orderbooks: Map<string, { exchange: string; pair: string; captured_at: string; depth_level: number; bids: unknown; asks: unknown; source: string }>;
};

let wsController: BinanceWsController | null = null;

export function startBinanceMarketDataWs(): BinanceWsController | null {
    const env = loadEnv();
    if (!env.BINANCE_WS_ENABLED || !env.BINANCE_MARKET_DATA_ENABLED) {
        logInfo("Binance WS disabled");
        return null;
    }

    if (wsController) {
        logWarn("Binance WS already running, stopping existing");
        wsController.stop();
    }

    const pairs = getBinancePairs();
    const intervals = getBinanceIntervals();
    const flushIntervalMs = env.BINANCE_WS_FLUSH_INTERVAL_MS;
    const reconnectMinMs = env.BINANCE_WS_RECONNECT_MIN_MS;
    const reconnectMaxMs = env.BINANCE_WS_RECONNECT_MAX_MS;

    let spotWs: WebSocket | null = null;
    let futuresWs: WebSocket | null = null;
    let stopped = false;
    let spotReconnectMs = reconnectMinMs;
    let futuresReconnectMs = reconnectMinMs;
    let spotReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let futuresReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSpotMessageAt: string | null = null;
    let lastFuturesMessageAt: string | null = null;

    const spotBuffers: PendingBuffers = {
        candles: new Map(),
        aggTrades: new Map(),
        tickers: new Map(),
        orderbooks: new Map(),
    };

    const futuresBuffers: PendingBuffers = {
        candles: new Map(),
        aggTrades: new Map(),
        tickers: new Map(),
        orderbooks: new Map(),
    };

    // ─── Build stream URLs ───

    function buildSpotStreamUrl(): string {
        const baseUrl = env.BINANCE_SPOT_WS_URL;
        const streams: string[] = [];
        for (const pair of pairs) {
            const s = toWsStreamSymbol(pair);
            for (const interval of intervals) {
                streams.push(`${s}@kline_${interval}`);
            }
            streams.push(`${s}@aggTrade`);
            streams.push(`${s}@depth@100ms`);
            streams.push(`${s}@ticker`);
        }
        return `${baseUrl}/stream?streams=${streams.join("/")}`;
    }

    function buildFuturesStreamUrl(): string {
        const baseUrl = env.BINANCE_FUTURES_WS_URL;
        const streams: string[] = [];
        for (const pair of pairs) {
            const s = toWsStreamSymbol(pair);
            for (const interval of intervals) {
                streams.push(`${s}@kline_${interval}`);
            }
            streams.push(`${s}@aggTrade`);
            streams.push(`${s}@depth@100ms`);
            streams.push(`${s}@ticker`);
            streams.push(`${s}@markPrice@1s`);
        }
        return `${baseUrl}/stream?streams=${streams.join("/")}`;
    }

    // ─── Message handler ───

    function handleMessage(raw: string | Buffer, exchange: "spot" | "futures", buffers: PendingBuffers) {
        try {
            const msg = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString());
            const data = msg.data;
            if (!data) return;

            const stream = msg.stream as string | undefined;
            if (!stream) return;

            if (exchange === "spot") {
                lastSpotMessageAt = new Date().toISOString();
            } else {
                lastFuturesMessageAt = new Date().toISOString();
            }

            const pairSymbol = stream.split("@")[0]?.toUpperCase() ?? "";

            if (stream.includes("@kline_")) {
                const k = data.k;
                if (!k) return;
                const key = `${exchange}:${pairSymbol}:${k.i}:${k.t}`;
                buffers.candles.set(key, {
                    exchange,
                    pair: pairSymbol,
                    interval: k.i,
                    open_time: new Date(k.t).toISOString(),
                    close_time: new Date(k.T).toISOString(),
                    open: Number(k.o),
                    high: Number(k.h),
                    low: Number(k.l),
                    close: Number(k.c),
                    volume: Number(k.v),
                    quote_volume: Number(k.q) || null,
                    trade_count: Number(k.n) || null,
                    taker_buy_base_vol: Number(k.V) || null,
                    taker_buy_quote_vol: Number(k.Q) || null,
                    source: `binance_${exchange}_ws`,
                });
            } else if (stream.includes("@aggTrade")) {
                const key = `${exchange}:${pairSymbol}:${data.a}`;
                buffers.aggTrades.set(key, {
                    exchange,
                    pair: pairSymbol,
                    agg_trade_id: String(data.a),
                    price: Number(data.p),
                    quantity: Number(data.q),
                    first_trade_id: String(data.f),
                    last_trade_id: String(data.l),
                    executed_at: new Date(data.T).toISOString(),
                    is_buyer_maker: Boolean(data.m),
                    source: `binance_${exchange}_ws`,
                });
            } else if (stream.includes("@depth")) {
                const key = `${exchange}:${pairSymbol}`;
                buffers.orderbooks.set(key, {
                    exchange,
                    pair: pairSymbol,
                    captured_at: new Date().toISOString(),
                    depth_level: Math.max(data.bids?.length ?? 0, data.asks?.length ?? 0),
                    bids: data.bids ?? data.b ?? [],
                    asks: data.asks ?? data.a ?? [],
                    source: `binance_${exchange}_ws`,
                });
            } else if (stream.includes("@ticker")) {
                const key = `${exchange}:${pairSymbol}`;
                buffers.tickers.set(key, {
                    exchange,
                    pair: pairSymbol,
                    captured_at: new Date().toISOString(),
                    last_price: Number(data.c),
                    price_change: Number(data.p) || null,
                    price_change_pct: Number(data.P) || null,
                    weighted_avg_price: Number(data.w) || null,
                    open_price: Number(data.o) || null,
                    high_price: Number(data.h) || null,
                    low_price: Number(data.l) || null,
                    volume: Number(data.v) || null,
                    quote_volume: Number(data.q) || null,
                    open_time: null,
                    close_time: null,
                    trade_count: Number(data.n) || null,
                    source: `binance_${exchange}_ws`,
                });
            }
            // markPrice@1s — for futures, we just log/track, no dedicated table flush
        } catch (error) {
            logWarn("Binance WS message parse error", { exchange, error: String(error) });
        }
    }

    // ─── Flush buffers to DB ───

    async function flushBuffers(buffers: PendingBuffers, exchange: string) {
        try {
            // Flush candles
            if (buffers.candles.size > 0) {
                const rows = [...buffers.candles.values()];
                buffers.candles.clear();
                await upsertBinanceCandles(rows);
            }

            // Flush agg trades
            if (buffers.aggTrades.size > 0) {
                const rows = [...buffers.aggTrades.values()];
                buffers.aggTrades.clear();
                await upsertBinanceAggTrades(rows);
            }

            // Flush tickers
            if (buffers.tickers.size > 0) {
                const rows = [...buffers.tickers.values()];
                buffers.tickers.clear();
                await upsertBinanceTickers(rows);
            }

            // Flush orderbooks
            if (buffers.orderbooks.size > 0) {
                const entries = [...buffers.orderbooks.values()];
                buffers.orderbooks.clear();
                for (const ob of entries) {
                    await insertBinanceOrderbookSnapshot(ob);
                }
            }
        } catch (error) {
            logWarn("Binance WS flush error", { exchange, error: String(error) });
        }
    }

    // ─── Connect functions ───

    function connectSpot() {
        if (stopped) return;
        const url = buildSpotStreamUrl();
        logInfo("Binance spot WS connecting", { url: url.slice(0, 120) + "..." });

        try {
            const ws = new WebSocket(url);
            spotWs = ws;

            ws.addEventListener("open", () => {
                logInfo("Binance spot WS connected");
                spotReconnectMs = reconnectMinMs;
            });

            ws.addEventListener("message", (event) => {
                handleMessage(event.data as string, "spot", spotBuffers);
            });

            ws.addEventListener("close", () => {
                logWarn("Binance spot WS closed");
                spotWs = null;
                scheduleSpotReconnect();
            });

            ws.addEventListener("error", (error) => {
                logError("Binance spot WS error", { error: String(error) });
            });
        } catch (error) {
            logError("Binance spot WS connect failed", { error: String(error) });
            scheduleSpotReconnect();
        }
    }

    function connectFutures() {
        if (stopped) return;
        const url = buildFuturesStreamUrl();
        logInfo("Binance futures WS connecting", { url: url.slice(0, 120) + "..." });

        try {
            const ws = new WebSocket(url);
            futuresWs = ws;

            ws.addEventListener("open", () => {
                logInfo("Binance futures WS connected");
                futuresReconnectMs = reconnectMinMs;
            });

            ws.addEventListener("message", (event) => {
                handleMessage(event.data as string, "futures", futuresBuffers);
            });

            ws.addEventListener("close", () => {
                logWarn("Binance futures WS closed");
                futuresWs = null;
                scheduleFuturesReconnect();
            });

            ws.addEventListener("error", (error) => {
                logError("Binance futures WS error", { error: String(error) });
            });
        } catch (error) {
            logError("Binance futures WS connect failed", { error: String(error) });
            scheduleFuturesReconnect();
        }
    }

    function scheduleSpotReconnect() {
        if (stopped) return;
        logInfo("Binance spot WS reconnecting", { delayMs: spotReconnectMs });
        spotReconnectTimer = setTimeout(() => {
            connectSpot();
            spotReconnectMs = Math.min(spotReconnectMs * 2, reconnectMaxMs);
        }, spotReconnectMs);
    }

    function scheduleFuturesReconnect() {
        if (stopped) return;
        logInfo("Binance futures WS reconnecting", { delayMs: futuresReconnectMs });
        futuresReconnectTimer = setTimeout(() => {
            connectFutures();
            futuresReconnectMs = Math.min(futuresReconnectMs * 2, reconnectMaxMs);
        }, futuresReconnectMs);
    }

    // ─── Start ───

    connectSpot();
    connectFutures();

    // Flush loop
    const flushInterval = setInterval(async () => {
        await flushBuffers(spotBuffers, "spot");
        await flushBuffers(futuresBuffers, "futures");
    }, flushIntervalMs);

    // ─── Controller ───

    const controller: BinanceWsController = {
        stop() {
            stopped = true;
            clearInterval(flushInterval);
            if (spotReconnectTimer) clearTimeout(spotReconnectTimer);
            if (futuresReconnectTimer) clearTimeout(futuresReconnectTimer);
            if (spotWs) {
                try { spotWs.close(); } catch { }
            }
            if (futuresWs) {
                try { futuresWs.close(); } catch { }
            }
            spotWs = null;
            futuresWs = null;
            wsController = null;
            logInfo("Binance WS stopped");
        },
        status() {
            return {
                spotConnected: spotWs !== null && spotWs.readyState === WebSocket.OPEN,
                futuresConnected: futuresWs !== null && futuresWs.readyState === WebSocket.OPEN,
                lastSpotMessageAt,
                lastFuturesMessageAt,
                spotTopics: pairs.length * (intervals.length + 3),
                futuresTopics: pairs.length * (intervals.length + 4),
            };
        },
    };

    wsController = controller;
    logInfo("Binance WS controller started", {
        pairs: pairs.length,
        intervals: intervals.length,
        flushIntervalMs,
    });

    return controller;
}
