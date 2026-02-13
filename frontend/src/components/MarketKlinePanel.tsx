"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBingxCandles, fetchTradesForChart, type BingxCandle } from "../services/market_data";
import type { Trade } from "../services/api";

const PAIRS = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"] as const;
const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const LIMITS = [200, 500, 1000] as const;
const MODES = ["all", "paper", "live"] as const;
const SYMBOL_INFO: Record<string, { pricePrecision: number; volumePrecision: number }> = {
  "Gold-USDT": { pricePrecision: 2, volumePrecision: 3 },
  XAUTUSDT: { pricePrecision: 2, volumePrecision: 3 },
  PAXGUSDT: { pricePrecision: 2, volumePrecision: 3 },
};

type TradeMode = (typeof MODES)[number];

type MarketKlinePanelProps = {
  title: string;
  description: string;
  defaultPair?: (typeof PAIRS)[number];
  defaultInterval?: (typeof INTERVALS)[number];
  defaultLimit?: (typeof LIMITS)[number];
  defaultMode?: TradeMode;
  showModeToggle?: boolean;
  tone?: "ember" | "teal" | "slate" | "olive" | "clay";
};

type KlinePeriod = { span: number; type: "minute" | "hour" | "day" };

function toPeriod(interval: string): KlinePeriod {
  if (interval.endsWith("m")) {
    return { span: Number(interval.replace("m", "")) || 1, type: "minute" };
  }
  if (interval.endsWith("h")) {
    return { span: Number(interval.replace("h", "")) || 1, type: "hour" };
  }
  return { span: 1, type: "day" };
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildKlineData(candles: BingxCandle[]) {
  return candles
    .map((candle) => ({
      timestamp: toTimestamp(candle.open_time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }))
    .filter((candle) => candle.timestamp > 0);
}

function applyChartData(chart: any, klineData: ReturnType<typeof buildKlineData>) {
  if (typeof chart.applyNewData === "function") {
    chart.applyNewData(klineData, true);
    return;
  }
  if (typeof chart.setData === "function") {
    chart.setData(klineData, true);
    return;
  }
  if (typeof chart.setKLineData === "function") {
    chart.setKLineData(klineData);
    return;
  }
  if (typeof chart.setDataLoader === "function" && typeof chart.resetData === "function") {
    chart.setDataLoader({
      getBars: ({ type, callback }: { type: string; callback: (data: any[], more?: any) => void }) => {
        if (type === "update") {
          const last = klineData[klineData.length - 1];
          callback(last ? [last] : [], false);
          return;
        }
        callback(klineData, false);
      },
    });
    chart.resetData();
    return;
  }
  throw new Error("Chart API mismatch: unable to apply kline data.");
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
  defaultPair = "Gold-USDT",
  defaultInterval = "1m",
  defaultLimit = 500,
  defaultMode = "all",
  showModeToggle = true,
  tone = "ember",
}: MarketKlinePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const libRef = useRef<any>(null);
  const overlayIdsRef = useRef<string[]>([]);
  const [pair, setPair] = useState(defaultPair);
  const [interval, setInterval] = useState(defaultInterval);
  const [limit, setLimit] = useState(defaultLimit);
  const [mode, setMode] = useState<TradeMode>(defaultMode);
  const [chartReady, setChartReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ candles: 0, trades: 0 });

  const period = useMemo(() => toPeriod(interval), [interval]);

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

    const load = async () => {
      if (!chartRef.current || !chartReady) return;
      setLoading(true);
      setError(null);
      try {
        const candles = await fetchBingxCandles({ pair, interval, limit });
        if (canceled) return;
        const klineData = buildKlineData(candles);
        const symbolInfo = SYMBOL_INFO[pair] ?? { pricePrecision: 2, volumePrecision: 3 };
        chartRef.current.setSymbol({ ticker: pair, ...symbolInfo });
        chartRef.current.setPeriod(period);
        applyChartData(chartRef.current, klineData);

        overlayIdsRef.current.forEach((id) => chartRef.current.removeOverlay(id));
        overlayIdsRef.current = [];

        let trades: Trade[] = [];
        if (candles.length > 0) {
          const rangeStart = candles[0]?.open_time;
          const rangeEnd = candles[candles.length - 1]?.close_time ?? candles[candles.length - 1]?.open_time;
          trades = await fetchTradesForChart({
            instrument: pair,
            start: rangeStart,
            end: rangeEnd,
            mode: mode === "all" ? undefined : mode,
            pageSize: 2000,
          });
          if (canceled) return;
          trades.forEach((trade) => {
            const price = tradePrice(trade);
            const timestamp = toTimestamp(trade.created_at);
            if (!price || !timestamp) return;
            const overlayId = chartRef.current.createOverlay({
              name: "simpleAnnotation",
              extendData: tradeLabel(trade),
              points: [{ timestamp, value: price }],
            });
            if (overlayId) {
              overlayIdsRef.current.push(...(Array.isArray(overlayId) ? overlayId : [overlayId]));
            }
          });
        }
        setCounts({ candles: klineData.length, trades: trades.length });
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Unable to load market chart.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    load();

    return () => {
      canceled = true;
    };
  }, [pair, interval, limit, mode, period, chartReady]);

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
            <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
              {PAIRS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interval
            <select value={interval} onChange={(event) => setInterval(event.target.value as typeof interval)}>
              {INTERVALS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Window
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value) as typeof limit)}>
              {LIMITS.map((option) => (
                <option key={option} value={option}>
                  {option} bars
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
