import { gunzipSync } from "zlib";
import { randomUUID } from "crypto";
import { loadEnv } from "../config/env";
import { fromBingxSymbol, getSupportedPairs, toBingxSymbol } from "../config/market_catalog";
import {
  upsertBingxCandles,
  upsertBingxTrades,
  upsertBingxTickers,
  upsertBingxMarkIndexPrices,
  insertOrderBookSnapshot,
  getLatestMarkIndexSnapshot,
} from "../db/repositories/bingx_market_data";
import { insertOpsAlert } from "../db/repositories/ops_alerts";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import { logInfo, logWarn } from "./logger";
import type { DataSourceType, TradingPair } from "../types/rl";

const DEFAULT_WS_URL = "wss://open-api-swap.bingx.com/swap-market";
const DEFAULT_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w", "1M"];
const DEFAULT_DEPTH_LEVEL = 5;

type BingxWsTopicOptions = {
  pairs: TradingPair[];
  intervals: string[];
  depthLevel: number;
  depthSpeedMs?: number | null;
  includeBookTicker?: boolean;
  includeLastPrice?: boolean;
};

type BingxWsEvent =
  | {
      kind: "trade";
      pair: TradingPair;
      trade_id: string;
      price: number;
      quantity: number;
      side: "buy" | "sell";
      executed_at: string;
    }
  | {
      kind: "kline";
      pair: TradingPair;
      interval: string;
      open_time: string;
      close_time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      quote_volume?: number | null;
    }
  | {
      kind: "orderbook";
      pair: TradingPair;
      bids: unknown;
      asks: unknown;
      depth_level: number;
      captured_at: string;
    }
  | {
      kind: "ticker";
      pair: TradingPair;
      last_price: number;
      volume_24h?: number | null;
      price_change_24h?: number | null;
      captured_at: string;
    }
  | {
      kind: "markPrice";
      pair: TradingPair;
      mark_price: number;
      captured_at: string;
    };

type BingxWsStatus = {
  connected: boolean;
  lastMessageAt: string | null;
  topics: string[];
};

type BingxWsController = {
  stop: () => void;
  status: () => BingxWsStatus;
};

type WsSocket = {
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  binaryType: string;
};

type PendingBuffers = {
  trades: Map<string, BingxWsEvent & { kind: "trade" }>;
  candles: Map<string, BingxWsEvent & { kind: "kline" }>;
  orderbooks: Map<TradingPair, BingxWsEvent & { kind: "orderbook" }>;
  tickers: Map<TradingPair, BingxWsEvent & { kind: "ticker" }>;
  markPrices: Map<TradingPair, BingxWsEvent & { kind: "markPrice" }>;
};

type IndexPriceCache = Map<TradingPair, { indexPrice: number; updatedAt: number }>;

export type WsSequenceAnomaly = {
  kind: "out_of_order" | "gap";
  deltaMs: number;
  expectedIntervalMs: number | null;
  missingEvents: number | null;
};

let wsController: BingxWsController | null = null;

function parseIntervals(value: string | undefined) {
  if (!value) return null;
  const intervals = value
    .split(",")
    .map((interval) => interval.trim())
    .filter(Boolean);
  return intervals.length > 0 ? intervals : null;
}

function parseIntervalMs(interval: string) {
  const match = interval.match(/^(\d+)([mhdwM])$/);
  if (!match) return 60_000;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  if (unit === "d") return value * 86_400_000;
  if (unit === "w") return value * 604_800_000;
  if (unit === "M") return value * 2_592_000_000;
  return value * 60_000;
}

function isTruthy(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toMillis(value: unknown) {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  const asInt = Math.trunc(numeric);
  if (asInt <= 0) return null;
  return asInt < 1_000_000_000_000 ? asInt * 1000 : asInt;
}

function toTimestamp(value: unknown) {
  const numeric = toNumber(value);
  if (!numeric) return null;
  const asInt = Math.trunc(numeric);
  if (asInt <= 0) return null;
  const ms = asInt < 1_000_000_000_000 ? asInt * 1000 : asInt;
  return new Date(ms).toISOString();
}

function decodeWsMessage(data: unknown) {
  if (typeof data === "string") return data;
  const buffer =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null;
  if (!buffer) return null;
  try {
    return gunzipSync(buffer).toString("utf-8");
  } catch {
    try {
      return buffer.toString("utf-8");
    } catch {
      return null;
    }
  }
}

export function detectWsSequenceAnomaly(params: {
  previousEventMs?: number | null;
  currentEventMs: number;
  expectedIntervalMs?: number | null;
  toleranceRatio?: number;
}): WsSequenceAnomaly | null {
  const previous = params.previousEventMs ?? null;
  if (!previous || !Number.isFinite(previous)) return null;
  if (!Number.isFinite(params.currentEventMs)) return null;
  const deltaMs = params.currentEventMs - previous;
  const expected = params.expectedIntervalMs ?? null;
  const toleranceRatio = params.toleranceRatio ?? 0.2;

  if (deltaMs < 0) {
    return {
      kind: "out_of_order",
      deltaMs,
      expectedIntervalMs: expected,
      missingEvents: null,
    };
  }
  if (expected && expected > 0 && deltaMs > expected * (1 + toleranceRatio)) {
    const missing = Math.max(1, Math.floor(deltaMs / expected) - 1);
    return {
      kind: "gap",
      deltaMs,
      expectedIntervalMs: expected,
      missingEvents: missing,
    };
  }
  return null;
}

export function buildBingxWsTopics(options: BingxWsTopicOptions) {
  const topics = new Set<string>();
  for (const pair of options.pairs) {
    const symbol = toBingxSymbol(pair);
    topics.add(`${symbol}@trade`);
    topics.add(`${symbol}@ticker`);
    topics.add(`${symbol}@markPrice`);
    const depthSuffix = options.depthSpeedMs ? `@${options.depthSpeedMs}ms` : "";
    topics.add(`${symbol}@depth${options.depthLevel}${depthSuffix}`);
    if (options.includeBookTicker) {
      topics.add(`${symbol}@bookTicker`);
    }
    if (options.includeLastPrice) {
      topics.add(`${symbol}@lastPrice`);
    }
    for (const interval of options.intervals) {
      topics.add(`${symbol}@kline_${interval}`);
    }
  }
  return Array.from(topics.values());
}

export function parseBingxWsMessage(message: string, intervalMsByKey: Map<string, number>) {
  let payload: any;
  try {
    payload = JSON.parse(message);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object") return [];
  const dataType = typeof payload.dataType === "string" ? payload.dataType : null;
  if (!dataType) return [];
  const data = payload.data ?? payload.data?.data ?? payload.data?.dataList ?? payload.data?.rows ?? payload.data;
  if (!data) return [];

  const events: BingxWsEvent[] = [];

  const klineMatch = dataType.match(/^(.+)@kline_([^@]+)$/);
  if (klineMatch) {
    const [, symbol, interval] = klineMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const intervalMs = intervalMsByKey.get(interval) ?? parseIntervalMs(interval);
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      const closeTimeMs = toMillis(row?.T ?? row?.t ?? payload?.timestamp);
      const openTimeMs = toMillis(row?.t) ?? (closeTimeMs ? closeTimeMs - intervalMs : null);
      if (!openTimeMs || !closeTimeMs) continue;
      const open = toNumber(row?.o ?? row?.open);
      const high = toNumber(row?.h ?? row?.high);
      const low = toNumber(row?.l ?? row?.low);
      const close = toNumber(row?.c ?? row?.close);
      const volume = toNumber(row?.v ?? row?.volume);
      if (open === null || high === null || low === null || close === null || volume === null) continue;
      events.push({
        kind: "kline",
        pair,
        interval,
        open_time: new Date(openTimeMs).toISOString(),
        close_time: new Date(closeTimeMs).toISOString(),
        open,
        high,
        low,
        close,
        volume,
        quote_volume: toNumber(row?.q ?? row?.quoteVolume),
      });
    }
    return events;
  }

  const depthMatch = dataType.match(/^(.+)@depth(\d+)(?:@\d+ms)?$/);
  if (depthMatch) {
    const [, symbol, depthRaw] = depthMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const depthLevel = Number.parseInt(depthRaw, 10);
    const capturedAt = toTimestamp(data?.timestamp ?? data?.E ?? payload?.timestamp) ?? new Date().toISOString();
    events.push({
      kind: "orderbook",
      pair,
      bids: data?.bids ?? data?.bid ?? [],
      asks: data?.asks ?? data?.ask ?? [],
      depth_level: Number.isFinite(depthLevel) ? depthLevel : Math.max(data?.bids?.length ?? 0, data?.asks?.length ?? 0),
      captured_at: capturedAt,
    });
    return events;
  }

  const tradeMatch = dataType.match(/^(.+)@trade$/);
  if (tradeMatch) {
    const [, symbol] = tradeMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const tradeId = String(data?.t ?? data?.tradeId ?? data?.id ?? "");
    if (!tradeId) return [];
    const price = toNumber(data?.p ?? data?.price);
    const quantity = toNumber(data?.q ?? data?.qty ?? data?.quantity);
    if (price === null || quantity === null) return [];
    const rawSide = typeof data?.side === "string" ? data.side.toLowerCase() : null;
    const side = rawSide
      ? rawSide.startsWith("b")
        ? "buy"
        : "sell"
      : data?.m === true
        ? "sell"
        : "buy";
    const executedAt =
      toTimestamp(data?.T ?? data?.E ?? payload?.timestamp ?? payload?.ts) ?? new Date().toISOString();
    events.push({
      kind: "trade",
      pair,
      trade_id: tradeId,
      price,
      quantity,
      side,
      executed_at: executedAt,
    });
    return events;
  }

  const tickerMatch = dataType.match(/^(.+)@ticker$/);
  if (tickerMatch) {
    const [, symbol] = tickerMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const lastPrice = toNumber(data?.c ?? data?.lastPrice ?? data?.p);
    if (lastPrice === null) return [];
    events.push({
      kind: "ticker",
      pair,
      last_price: lastPrice,
      volume_24h: toNumber(data?.v ?? data?.volume24h ?? data?.volume),
      price_change_24h: toNumber(data?.p ?? data?.priceChange24h),
      captured_at: toTimestamp(data?.E ?? payload?.timestamp ?? payload?.ts) ?? new Date().toISOString(),
    });
    return events;
  }

  const bookMatch = dataType.match(/^(.+)@bookTicker$/);
  if (bookMatch) {
    const [, symbol] = bookMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const bidPrice = toNumber(data?.b ?? data?.bidPrice);
    const bidQty = toNumber(data?.B ?? data?.bidQty);
    const askPrice = toNumber(data?.a ?? data?.askPrice);
    const askQty = toNumber(data?.A ?? data?.askQty);
    const capturedAt = toTimestamp(data?.E ?? payload?.timestamp ?? payload?.ts) ?? new Date().toISOString();
    events.push({
      kind: "orderbook",
      pair,
      bids: bidPrice !== null ? [{ p: bidPrice, a: bidQty ?? null }] : [],
      asks: askPrice !== null ? [{ p: askPrice, a: askQty ?? null }] : [],
      depth_level: 1,
      captured_at: capturedAt,
    });
    return events;
  }

  const lastMatch = dataType.match(/^(.+)@lastPrice$/);
  if (lastMatch) {
    const [, symbol] = lastMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const lastPrice = toNumber(data?.p ?? data?.lastPrice);
    if (lastPrice === null) return [];
    events.push({
      kind: "ticker",
      pair,
      last_price: lastPrice,
      volume_24h: null,
      price_change_24h: null,
      captured_at: toTimestamp(data?.E ?? payload?.timestamp ?? payload?.ts) ?? new Date().toISOString(),
    });
    return events;
  }

  const markMatch = dataType.match(/^(.+)@markPrice$/);
  if (markMatch) {
    const [, symbol] = markMatch;
    const pair = fromBingxSymbol(symbol);
    if (!pair) return [];
    const markPrice = toNumber(data?.p ?? data?.markPrice);
    if (markPrice === null) return [];
    events.push({
      kind: "markPrice",
      pair,
      mark_price: markPrice,
      captured_at: toTimestamp(data?.E ?? payload?.timestamp ?? payload?.ts) ?? new Date().toISOString(),
    });
    return events;
  }

  return events;
}

async function refreshIndexPrice(pair: TradingPair, cache: IndexPriceCache, maxAgeMs: number) {
  const cached = cache.get(pair);
  if (cached && Date.now() - cached.updatedAt <= maxAgeMs) {
    return cached.indexPrice;
  }
  try {
    const latest = await getLatestMarkIndexSnapshot(pair);
    if (!latest) return null;
    cache.set(pair, { indexPrice: latest.index_price, updatedAt: new Date(latest.captured_at).getTime() });
    return latest.index_price;
  } catch (error) {
    logWarn("Failed to refresh BingX index price cache", { pair, error: String(error) });
    return cached?.indexPrice ?? null;
  }
}

function buildIntervalMsMap(intervals: string[]) {
  const map = new Map<string, number>();
  for (const interval of intervals) {
    map.set(interval, parseIntervalMs(interval));
  }
  return map;
}

export function startBingxMarketDataWs(): BingxWsController | null {
  if (wsController) return wsController;
  const env = loadEnv();
  if (!env.BINGX_WS_ENABLED || env.BINGX_MARKET_DATA_MOCK || isTruthy(process.env.E2E_RUN)) {
    logInfo("BingX WebSocket ingestion disabled");
    return null;
  }

  const pairs: TradingPair[] = getSupportedPairs();
  const intervals = parseIntervals(env.BINGX_MARKET_DATA_INTERVALS) ?? DEFAULT_INTERVALS;
  const topics = buildBingxWsTopics({
    pairs,
    intervals,
    depthLevel: env.BINGX_WS_DEPTH_LEVEL ?? DEFAULT_DEPTH_LEVEL,
    depthSpeedMs: env.BINGX_WS_DEPTH_SPEED_MS ?? null,
    includeBookTicker: env.BINGX_WS_INCLUDE_BOOK_TICKER,
    includeLastPrice: env.BINGX_WS_INCLUDE_LAST_PRICE,
  });
  if (topics.length > 200) {
    logWarn("BingX WS topic limit exceeded", { topics: topics.length });
  }

  const intervalMsByKey = buildIntervalMsMap(intervals);
  const pending: PendingBuffers = {
    trades: new Map(),
    candles: new Map(),
    orderbooks: new Map(),
    tickers: new Map(),
    markPrices: new Map(),
  };
  const lastSeenBySource = new Map<string, { pair: TradingPair; sourceType: DataSourceType; lastSeenAt: string }>();
  const lastSequenceEventMs = new Map<string, number>();
  const lastSequenceAlertMs = new Map<string, number>();
  const indexPriceCache: IndexPriceCache = new Map();
  void Promise.all(pairs.map((pair) => refreshIndexPrice(pair, indexPriceCache, 0)));

  const WebSocketCtor = (globalThis as any).WebSocket as { new (url: string): WsSocket } | undefined;
  if (!WebSocketCtor) {
    logWarn("BingX WS unavailable: WebSocket global missing");
    return null;
  }
  let ws: WsSocket | null = null;
  let connected = false;
  let stopped = false;
  let lastMessageAt: string | null = null;
  let reconnectDelay = env.BINGX_WS_RECONNECT_MIN_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let flushInFlight = false;
  let flushBackoffMs = 0;
  let nextFlushAt = 0;

  const flushIntervalMs = env.BINGX_WS_FLUSH_INTERVAL_MS;
  const indexPriceMaxAgeMs = env.BINGX_WS_INDEX_CACHE_MAX_AGE_MS;
  const sequenceAlertCooldownMs = 60_000;

  const sequenceKeyForEvent = (eventItem: BingxWsEvent) => {
    if (eventItem.kind === "kline") return `${eventItem.kind}:${eventItem.pair}:${eventItem.interval}`;
    return `${eventItem.kind}:${eventItem.pair}`;
  };
  const eventTimeMs = (eventItem: BingxWsEvent) => {
    if (eventItem.kind === "trade") return Date.parse(eventItem.executed_at);
    if (eventItem.kind === "kline") return Date.parse(eventItem.close_time);
    if (eventItem.kind === "orderbook") return Date.parse(eventItem.captured_at);
    if (eventItem.kind === "ticker") return Date.parse(eventItem.captured_at);
    return Date.parse(eventItem.captured_at);
  };
  const expectedIntervalMs = (eventItem: BingxWsEvent) => {
    if (eventItem.kind === "kline") {
      return intervalMsByKey.get(eventItem.interval) ?? null;
    }
    return null;
  };
  const emitSequenceAlert = async (eventItem: BingxWsEvent, anomaly: WsSequenceAnomaly) => {
    const key = sequenceKeyForEvent(eventItem);
    const now = Date.now();
    const last = lastSequenceAlertMs.get(`${key}:${anomaly.kind}`) ?? 0;
    if (now - last < sequenceAlertCooldownMs) return;
    lastSequenceAlertMs.set(`${key}:${anomaly.kind}`, now);
    logWarn("BingX WS sequence anomaly detected", {
      key,
      pair: eventItem.pair,
      kind: eventItem.kind,
      anomaly: anomaly.kind,
      delta_ms: anomaly.deltaMs,
      expected_interval_ms: anomaly.expectedIntervalMs,
      missing_events: anomaly.missingEvents,
    });
    await insertOpsAlert({
      category: "ops",
      severity: "medium",
      metric: "bingx_ws_sequence_anomaly",
      value: Math.abs(anomaly.deltaMs),
      metadata: {
        key,
        pair: eventItem.pair,
        stream_kind: eventItem.kind,
        anomaly: anomaly.kind,
        delta_ms: anomaly.deltaMs,
        expected_interval_ms: anomaly.expectedIntervalMs,
        missing_events: anomaly.missingEvents,
      },
    }).catch(() => {});
  };

  const flushTimer = setInterval(async () => {
    if (flushInFlight) return;
    if (Date.now() < nextFlushAt) return;
    flushInFlight = true;

    const trades = Array.from(pending.trades.values());
    pending.trades.clear();
    const candles = Array.from(pending.candles.values());
    pending.candles.clear();
    const orderbooks = Array.from(pending.orderbooks.values());
    pending.orderbooks.clear();
    const tickers = Array.from(pending.tickers.values());
    pending.tickers.clear();
    const markPrices = Array.from(pending.markPrices.values());
    pending.markPrices.clear();

    try {
      if (trades.length) {
        await upsertBingxTrades(
          trades.map((trade) => ({
            pair: trade.pair,
            trade_id: trade.trade_id,
            price: trade.price,
            quantity: trade.quantity,
            side: trade.side,
            executed_at: trade.executed_at,
            source: "bingx_ws",
          })),
        );
      }
      if (candles.length) {
        await upsertBingxCandles(
          candles.map((candle) => ({
            pair: candle.pair,
            interval: candle.interval,
            open_time: candle.open_time,
            close_time: candle.close_time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            quote_volume: candle.quote_volume ?? null,
            source: "bingx_ws",
          })),
        );
      }
      if (orderbooks.length) {
        await Promise.all(
          orderbooks.map((orderbook) =>
            insertOrderBookSnapshot({
              pair: orderbook.pair,
              captured_at: orderbook.captured_at,
              depth_level: orderbook.depth_level,
              bids: orderbook.bids,
              asks: orderbook.asks,
              source: "bingx_ws",
            }),
          ),
        );
      }
      if (tickers.length) {
        await upsertBingxTickers(
          tickers.map((ticker) => ({
            pair: ticker.pair,
            last_price: ticker.last_price,
            volume_24h: ticker.volume_24h ?? null,
            price_change_24h: ticker.price_change_24h ?? null,
            captured_at: ticker.captured_at,
            source: "bingx_ws",
          })),
        );
      }
      if (markPrices.length) {
        const rows = [];
        for (const mark of markPrices) {
          const indexPrice = await refreshIndexPrice(mark.pair, indexPriceCache, indexPriceMaxAgeMs);
          if (indexPrice === null) continue;
          rows.push({
            pair: mark.pair,
            mark_price: mark.mark_price,
            index_price: indexPrice,
            captured_at: mark.captured_at,
            source: "bingx_ws",
          });
        }
        if (rows.length) {
          await upsertBingxMarkIndexPrices(rows);
        }
      }

      if (lastSeenBySource.size > 0) {
        const updates = Array.from(lastSeenBySource.values());
        lastSeenBySource.clear();
        await Promise.all(
          updates.map((update) =>
            recordDataSourceStatus({
              pair: update.pair,
              sourceType: update.sourceType,
              lastSeenAt: update.lastSeenAt,
              freshnessThresholdSeconds: getDefaultThreshold(update.sourceType),
            }),
          ),
        );
      }
      flushBackoffMs = 0;
    } catch (error) {
      logWarn("BingX WS flush failed", { error: String(error) });
      flushBackoffMs = Math.min(flushBackoffMs ? flushBackoffMs * 2 : 2000, 30000);
      nextFlushAt = Date.now() + flushBackoffMs;
      for (const trade of trades) pending.trades.set(`${trade.pair}:${trade.trade_id}`, trade);
      for (const candle of candles) {
        pending.candles.set(`${candle.pair}:${candle.interval}:${candle.open_time}`, candle);
      }
      for (const orderbook of orderbooks) pending.orderbooks.set(orderbook.pair, orderbook);
      for (const ticker of tickers) pending.tickers.set(ticker.pair, ticker);
      for (const mark of markPrices) pending.markPrices.set(mark.pair, mark);
    } finally {
      if (flushBackoffMs === 0) {
        nextFlushAt = 0;
      }
      flushInFlight = false;
    }
  }, flushIntervalMs);

  const wsUrl = env.BINGX_WS_URL ?? DEFAULT_WS_URL;

  const subscribeAll = async (socket: WebSocket) => {
    const batchSize = env.BINGX_WS_SUBSCRIBE_BATCH_SIZE;
    const delayMs = env.BINGX_WS_SUBSCRIBE_DELAY_MS;
    for (let i = 0; i < topics.length; i += batchSize) {
      const chunk = topics.slice(i, i + batchSize);
      for (const topic of chunk) {
        socket.send(
          JSON.stringify({
            id: randomUUID(),
            reqType: "sub",
            dataType: topic,
          }),
        );
      }
      if (delayMs > 0 && i + batchSize < topics.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    if (reconnectTimer) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, env.BINGX_WS_RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
    logWarn("BingX WS reconnect scheduled", { delayMs: delay });
  };

  const connect = () => {
    if (stopped) return;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
    }
    ws = new WebSocketCtor(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      connected = true;
      reconnectDelay = env.BINGX_WS_RECONNECT_MIN_MS;
      logInfo("BingX WS connected", { url: wsUrl, topics: topics.length });
      void subscribeAll(ws!);
    });

    ws.addEventListener("message", (event) => {
      const decoded = decodeWsMessage(event.data);
      if (!decoded) return;
      if (decoded === "Ping" || decoded === "ping") {
        ws?.send("Pong");
        return;
      }
      lastMessageAt = new Date().toISOString();
      const events = parseBingxWsMessage(decoded, intervalMsByKey);
      if (events.length === 0) return;
      for (const eventItem of events) {
        const seqKey = sequenceKeyForEvent(eventItem);
        const currentEventMs = eventTimeMs(eventItem);
        if (Number.isFinite(currentEventMs)) {
          const anomaly = detectWsSequenceAnomaly({
            previousEventMs: lastSequenceEventMs.get(seqKey) ?? null,
            currentEventMs,
            expectedIntervalMs: expectedIntervalMs(eventItem),
          });
          if (anomaly) {
            void emitSequenceAlert(eventItem, anomaly);
          }
          const previous = lastSequenceEventMs.get(seqKey) ?? 0;
          if (currentEventMs >= previous) {
            lastSequenceEventMs.set(seqKey, currentEventMs);
          }
        }
        if (eventItem.kind === "trade") {
          pending.trades.set(`${eventItem.pair}:${eventItem.trade_id}`, eventItem);
          lastSeenBySource.set(`${eventItem.pair}:bingx_trades`, {
            pair: eventItem.pair,
            sourceType: "bingx_trades",
            lastSeenAt: eventItem.executed_at,
          });
        } else if (eventItem.kind === "kline") {
          pending.candles.set(`${eventItem.pair}:${eventItem.interval}:${eventItem.open_time}`, eventItem);
          lastSeenBySource.set(`${eventItem.pair}:bingx_candles`, {
            pair: eventItem.pair,
            sourceType: "bingx_candles",
            lastSeenAt: eventItem.close_time,
          });
        } else if (eventItem.kind === "orderbook") {
          pending.orderbooks.set(eventItem.pair, eventItem);
          lastSeenBySource.set(`${eventItem.pair}:bingx_orderbook`, {
            pair: eventItem.pair,
            sourceType: "bingx_orderbook",
            lastSeenAt: eventItem.captured_at,
          });
        } else if (eventItem.kind === "ticker") {
          pending.tickers.set(eventItem.pair, eventItem);
          lastSeenBySource.set(`${eventItem.pair}:bingx_ticker`, {
            pair: eventItem.pair,
            sourceType: "bingx_ticker",
            lastSeenAt: eventItem.captured_at,
          });
        } else if (eventItem.kind === "markPrice") {
          pending.markPrices.set(eventItem.pair, eventItem);
          lastSeenBySource.set(`${eventItem.pair}:bingx_mark_price`, {
            pair: eventItem.pair,
            sourceType: "bingx_mark_price",
            lastSeenAt: eventItem.captured_at,
          });
        }
      }
    });

    ws.addEventListener("close", () => {
      connected = false;
      logWarn("BingX WS closed");
      scheduleReconnect();
    });

    ws.addEventListener("error", (event) => {
      logWarn("BingX WS error", { error: String(event) });
      scheduleReconnect();
    });
  };

  connect();

  wsController = {
    stop: () => {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearInterval(flushTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore close errors
        }
      }
    },
    status: () => ({
      connected,
      lastMessageAt,
      topics,
    }),
  };

  return wsController;
}
