"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_PAIRS, MARKET_SYMBOL_INFO } from "../config/marketCatalog";
import { fetchBingxCandles, fetchTradesForChart, type BingxCandle } from "../services/market_data";
import type { Trade } from "../services/api";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const MODES = ["all", "paper", "live"] as const;
const INITIAL_BAR_COUNT = 360;
const HISTORY_CHUNK_BARS = 500;
const UPDATE_FETCH_BARS = 240;
const LIVE_POLL_MS = 4000;

type TradeMode = (typeof MODES)[number];

type MarketKlinePanelProps = {
  title: string;
  description: string;
  defaultPair?: string;
  pairs?: string[];
  defaultInterval?: (typeof INTERVALS)[number];
  defaultMode?: TradeMode;
  showModeToggle?: boolean;
  tone?: "ember" | "teal" | "slate" | "olive" | "clay";
};

type KlinePeriod = { span: number; type: "minute" | "hour" | "day" };
type ChartCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toPeriod(interval: string): KlinePeriod {
  if (interval.endsWith("m")) {
    return { span: Number(interval.replace("m", "")) || 1, type: "minute" };
  }
  if (interval.endsWith("h")) {
    return { span: Number(interval.replace("h", "")) || 1, type: "hour" };
  }
  return { span: 1, type: "day" };
}

function toIntervalMs(interval: string) {
  if (interval.endsWith("m")) return (Number(interval.replace("m", "")) || 1) * 60_000;
  if (interval.endsWith("h")) return (Number(interval.replace("h", "")) || 1) * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function normalizeKlineData(candles: BingxCandle[]): ChartCandle[] {
  const sorted = candles
    .map((candle) => ({
      timestamp: toTimestamp(candle.open_time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }))
    .filter((candle) => candle.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  const deduped: ChartCandle[] = [];
  for (const candle of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.timestamp === candle.timestamp) {
      deduped[deduped.length - 1] = candle;
      continue;
    }
    deduped.push(candle);
  }
  return deduped;
}

function tradeLabel(trade: Trade) {
  const direction = trade.side === "long" ? "Buy" : "Sell";
  const mode = trade.mode === "paper" ? "Paper" : "Live";
  return `${direction} · ${mode}`;
}

function tradePrice(trade: Trade) {
  return trade.avg_fill_price ?? trade.tp_price ?? trade.sl_price ?? trade.liquidation_price ?? null;
}

export default function MarketKlinePanel({
  title,
  description,
  defaultPair = "XAUTUSDT",
  pairs = ALL_PAIRS,
  defaultInterval = "1m",
  defaultMode = "all",
  showModeToggle = true,
  tone = "ember",
}: MarketKlinePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const libRef = useRef<any>(null);
  const overlayIdsRef = useRef<string[]>([]);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const defaultResolvedPair = pairs.includes(defaultPair) ? defaultPair : pairs[0] ?? ALL_PAIRS[0] ?? "XAUTUSDT";
  const [pair, setPair] = useState(defaultResolvedPair);
  const [timeframe, setTimeframe] = useState(defaultInterval);
  const [mode, setMode] = useState<TradeMode>(defaultMode);
  const [chartReady, setChartReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ candles: 0, trades: 0 });

  const period = useMemo(() => toPeriod(timeframe), [timeframe]);

  useEffect(() => {
    if (!pairs.includes(pair)) {
      setPair(defaultResolvedPair);
    }
  }, [pair, pairs, defaultResolvedPair]);

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | null = null;

    const setup = async () => {
      if (typeof window === "undefined") return;
      if (!containerRef.current) return;
      if (!libRef.current) {
        libRef.current = await import("klinecharts");
      }
      if (!active) return;
      if (!chartRef.current) {
        chartRef.current = libRef.current.init(containerRef.current);
        chartRef.current.createIndicator("VOL");
        setChartReady(true);
      }
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => chartRef.current?.resize());
        observer.observe(containerRef.current);
      }
    };

    setup();

    return () => {
      active = false;
      observer?.disconnect();
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      if (libRef.current && chartRef.current) {
        overlayIdsRef.current.forEach((id) => chartRef.current.removeOverlay(id));
        overlayIdsRef.current = [];
        libRef.current.dispose(chartRef.current);
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    const intervalMs = toIntervalMs(timeframe);
    let preferProxyOnly = false;
    const loadedBounds = {
      earliest: null as number | null,
      latest: null as number | null,
      loadedCount: 0,
    };

    const syncCount = () => {
      setCounts((previous) => ({ ...previous, candles: Math.max(loadedBounds.loadedCount, 0) }));
    };

    const setInitCount = (count: number) => {
      loadedBounds.loadedCount = count;
      syncCount();
    };

    const addLoadedCount = (count: number) => {
      loadedBounds.loadedCount += count;
      syncCount();
    };

    const clearOverlays = () => {
      overlayIdsRef.current.forEach((id) => chart.removeOverlay(id));
      overlayIdsRef.current = [];
    };

    const loadTradeOverlays = async (rangeStartIso: string, rangeEndIso: string) => {
      let trades: Trade[] = [];
      try {
        trades = await fetchTradesForChart({
          instrument: pair,
          start: rangeStartIso,
          end: rangeEndIso,
          mode: mode === "all" ? undefined : mode,
          pageSize: 2000,
        });
      } catch {
        trades = [];
      }
      if (canceled) return;
      clearOverlays();
      trades.forEach((trade) => {
        const price = tradePrice(trade);
        const timestamp = toTimestamp(trade.created_at);
        if (!price || !timestamp) return;
        const overlayId = chart.createOverlay({
          name: "simpleAnnotation",
          extendData: tradeLabel(trade),
          points: [{ timestamp, value: price }],
        });
        if (overlayId) {
          overlayIdsRef.current.push(...(Array.isArray(overlayId) ? overlayId : [overlayId]));
        }
      });
      setCounts((previous) => ({ ...previous, trades: trades.length }));
    };

    const fetchRange = async (startMs: number, endMs: number, limit: number) => {
      const startIso = toIso(startMs);
      const endIso = toIso(endMs);
      if (!preferProxyOnly) {
        try {
          const candles = await fetchBingxCandles({
            pair,
            interval: timeframe,
            start: startIso,
            end: endIso,
            limit,
          });
          return normalizeKlineData(candles);
        } catch {
          preferProxyOnly = true;
        }
      }

      try {
        const candles = await fetchBingxCandles({
          pair,
          interval: timeframe,
          limit,
        });
        const filtered = candles.filter((candle) => {
          const ts = toTimestamp(candle.open_time);
          return ts >= startMs && ts <= endMs;
        });
        return normalizeKlineData(filtered);
      } catch {
        throw new Error("Unable to fetch candles.");
      }
    };

    const updateBounds = (data: ChartCandle[]) => {
      if (data.length === 0) return;
      loadedBounds.earliest = loadedBounds.earliest === null ? data[0].timestamp : Math.min(loadedBounds.earliest, data[0].timestamp);
      loadedBounds.latest =
        loadedBounds.latest === null ? data[data.length - 1].timestamp : Math.max(loadedBounds.latest, data[data.length - 1].timestamp);
    };

    const handleDataLoad = async ({
      type,
      timestamp,
      callback,
    }: {
      type: "init" | "forward" | "backward" | "update";
      timestamp: number | null;
      callback: (data: ChartCandle[], more?: boolean | { backward?: boolean; forward?: boolean }) => void;
    }) => {
      try {
        if (type === "init") {
          const now = Date.now() + intervalMs;
          const start = now - INITIAL_BAR_COUNT * intervalMs;
          const data = await fetchRange(start, now, INITIAL_BAR_COUNT);
          if (canceled) return;
          updateBounds(data);
          setInitCount(data.length);
          callback(data, { forward: true, backward: true });
          if (data.length > 0) {
            await loadTradeOverlays(toIso(data[0].timestamp), toIso(data[data.length - 1].timestamp + intervalMs));
          } else {
            setCounts((previous) => ({ ...previous, trades: 0 }));
          }
          setLoading(false);
          setError(null);
          return;
        }

        if (type === "forward") {
          const anchor = timestamp ?? loadedBounds.earliest ?? Date.now();
          const end = anchor - 1;
          const start = end - HISTORY_CHUNK_BARS * intervalMs;
          const data = (await fetchRange(start, end, HISTORY_CHUNK_BARS)).filter((candle) => candle.timestamp < anchor);
          if (canceled) return;
          updateBounds(data);
          addLoadedCount(data.length);
          callback(data, { forward: data.length >= HISTORY_CHUNK_BARS, backward: true });
          return;
        }

        if (type === "backward") {
          const anchor = timestamp ?? loadedBounds.latest ?? Date.now() - intervalMs;
          const start = anchor + 1;
          const end = Date.now() + intervalMs;
          const data = (await fetchRange(start, end, UPDATE_FETCH_BARS)).filter((candle) => candle.timestamp > anchor);
          if (canceled) return;
          updateBounds(data);
          addLoadedCount(data.length);
          callback(data, { forward: true, backward: true });
          return;
        }

        callback([], { forward: true, backward: true });
      } catch (err) {
        if (!canceled) {
          const message = err instanceof Error ? err.message : "Unable to load market chart.";
          setError(message);
          setLoading(false);
        }
        callback([], { forward: false, backward: true });
      }
    };

    const startLivePolling = ({
      callback,
    }: {
      callback: (data: ChartCandle) => void;
    }) => {
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }

      let inFlight = false;
      liveTimerRef.current = window.setInterval(async () => {
        if (canceled || inFlight) return;
        inFlight = true;
        try {
          const latest = loadedBounds.latest ?? Date.now() - intervalMs * 2;
          const start = latest - intervalMs;
          const end = Date.now() + intervalMs;
          const updates = await fetchRange(start, end, UPDATE_FETCH_BARS);
          if (canceled) return;
          for (const candle of updates) {
            if (candle.timestamp < latest - intervalMs) continue;
            const isNew = loadedBounds.latest === null || candle.timestamp > loadedBounds.latest;
            callback(candle);
            if (isNew) {
              loadedBounds.latest = candle.timestamp;
              loadedBounds.loadedCount += 1;
              syncCount();
            } else if (loadedBounds.latest === null || candle.timestamp > loadedBounds.latest) {
              loadedBounds.latest = candle.timestamp;
            }
          }
        } catch {
          // Keep polling; transient API failures should not break live updates.
        } finally {
          inFlight = false;
        }
      }, LIVE_POLL_MS);
    };

    setLoading(true);
    setError(null);
    setCounts({ candles: 0, trades: 0 });
    clearOverlays();

    const symbolInfo = MARKET_SYMBOL_INFO[pair] ?? { pricePrecision: 2, volumePrecision: 3 };
    chart.setSymbol({ ticker: pair, ...symbolInfo });
    chart.setPeriod(period);

    if (typeof chart.setDataLoader !== "function" || typeof chart.resetData !== "function") {
      setLoading(false);
      setError("Chart library is missing data-loader support.");
      return;
    }

    chart.setDataLoader({
      getBars: handleDataLoad,
      subscribeBar: startLivePolling,
      unsubscribeBar: () => {
        if (liveTimerRef.current) {
          clearInterval(liveTimerRef.current);
          liveTimerRef.current = null;
        }
      },
    });
    chart.resetData();

    return () => {
      canceled = true;
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      clearOverlays();
    };
  }, [pair, timeframe, mode, period, chartReady]);

  return (
    <section className="table-card chart-panel" data-tone={tone}>
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="chart-controls">
          <label>
            Pair
            <select value={pair} onChange={(event) => setPair(event.target.value)}>
              {pairs.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interval
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as typeof timeframe)}>
              {INTERVALS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {showModeToggle ? (
            <label>
              Trades
              <select value={mode} onChange={(event) => setMode(event.target.value as TradeMode)}>
                {MODES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      <div className="chart-shell">
        <div ref={containerRef} className="chart-canvas" />
        {loading ? <div className="chart-overlay">Loading market tape…</div> : null}
        {error ? <div className="chart-overlay chart-error">{error}</div> : null}
      </div>
      <div className="inline-muted">{counts.candles} candles · {counts.trades} trades</div>
    </section>
  );
}
