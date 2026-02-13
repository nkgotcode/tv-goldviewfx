import { loadEnv } from "../config/env";
import { listOpenDataGapEvents } from "../db/repositories/data_gap_events";
import { detectCandleGaps } from "./data_gap_service";
import { listDataSourceStatusWithConfig } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";

type IntegrityResult = {
  allowed: boolean;
  blockingReasons: string[];
  warnings: string[];
  provenance: Record<string, unknown>;
};

function parseIntervalMsFromCandles(timestamps: string[]) {
  if (timestamps.length < 2) return null;
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(sorted[i - 1]).getTime();
    const next = new Date(sorted[i]).getTime();
    if (Number.isFinite(prev) && Number.isFinite(next) && next > prev) {
      deltas.push(next - prev);
    }
  }
  if (deltas.length === 0) return null;
  return Math.min(...deltas);
}

function checkAlignment(timestamps: string[], intervalMs: number) {
  if (timestamps.length < 2) {
    return { aligned: true, misalignedCount: 0, toleranceMs: 0 };
  }
  const toleranceMs = Math.min(intervalMs * 0.15, 10_000);
  const baseline = new Date(timestamps[0]).getTime();
  let misaligned = 0;
  for (const ts of timestamps) {
    const time = new Date(ts).getTime();
    if (!Number.isFinite(time)) {
      misaligned += 1;
      continue;
    }
    const delta = Math.abs((time - baseline) % intervalMs);
    const within = delta <= toleranceMs || intervalMs - delta <= toleranceMs;
    if (!within) {
      misaligned += 1;
    }
  }
  return { aligned: misaligned === 0, misalignedCount: misaligned, toleranceMs };
}

export async function evaluateDataIntegrityGate(params: {
  pair: TradingPair;
  candles: Array<{ timestamp: string }> | undefined;
  now?: Date;
}): Promise<IntegrityResult> {
  const now = params.now ?? new Date();
  const candles = params.candles ?? [];
  const warnings: string[] = [];
  const blockingReasons: string[] = [];

  if (candles.length === 0) {
    return {
      allowed: false,
      blockingReasons: ["missing_candles"],
      warnings: ["missing_candles"],
      provenance: { candleCount: 0 },
    };
  }

  const timestamps = candles.map((candle) => candle.timestamp).filter(Boolean);
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const outOfOrder = sorted.length === timestamps.length && timestamps.some((ts, idx) => ts !== sorted[idx]);
  if (outOfOrder) {
    warnings.push("candles_unsorted");
  }
  const env = loadEnv();
  const fallbackIntervalMs = env.BINGX_MARKET_DATA_INTERVAL_MIN * 60 * 1000;
  const intervalMs = parseIntervalMsFromCandles(sorted) ?? fallbackIntervalMs;
  const alignment = checkAlignment(sorted, intervalMs);
  if (!alignment.aligned) {
    blockingReasons.push("timestamp_misalignment");
  }

  const lastTimestamp = sorted[sorted.length - 1];
  const lastMs = new Date(lastTimestamp).getTime();
  const staleThresholdMs = intervalMs * 2.5;
  if (!Number.isFinite(lastMs) || now.getTime() - lastMs > staleThresholdMs) {
    blockingReasons.push("stale_candles");
  }

  const gaps = detectCandleGaps(sorted, intervalMs, env.DATA_GAP_MIN_MISSING_POINTS);
  if (gaps.length > 0) {
    blockingReasons.push("candle_gaps_detected");
  }

  const openGaps = await listOpenDataGapEvents({ pair: params.pair, source_type: "bingx_candles", limit: 5 });
  if (openGaps.length > 0) {
    blockingReasons.push("open_gap_events");
  }

  const statuses = await listDataSourceStatusWithConfig(params.pair, now);
  const consistencySources = ["bingx_candles", "bingx_trades", "bingx_ticker"];
  const times = statuses
    .filter((status) => consistencySources.includes(status.sourceType))
    .map((status) => ({ source: status.sourceType, time: status.lastSeenAt }));
  const parsedTimes = times
    .map((entry) => ({ source: entry.source, ms: entry.time ? new Date(entry.time).getTime() : null }))
    .filter((entry) => entry.ms !== null) as Array<{ source: string; ms: number }>;
  if (parsedTimes.length >= 2) {
    const minMs = Math.min(...parsedTimes.map((entry) => entry.ms));
    const maxMs = Math.max(...parsedTimes.map((entry) => entry.ms));
    const deltaSeconds = Math.round((maxMs - minMs) / 1000);
    if (deltaSeconds > intervalMs / 1000 * 5) {
      blockingReasons.push("cross_source_divergence");
    } else if (deltaSeconds > intervalMs / 1000 * 2) {
      warnings.push("cross_source_drift");
    }
  }

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    provenance: {
      candleCount: candles.length,
      windowStart: sorted[0],
      windowEnd: sorted[sorted.length - 1],
      intervalMs,
      alignment,
      gapCount: gaps.length,
      openGapEvents: openGaps.length,
      crossSourceSamples: times,
    },
  };
}
