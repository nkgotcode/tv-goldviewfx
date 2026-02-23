import { loadEnv } from "../config/env";
import { getSupportedPairs } from "../config/market_catalog";
import { listBingxCandleTimes } from "../db/repositories/bingx_market_data";
import {
  listOpenDataGapEvents,
  resolveDataGapEvent,
  upsertDataGapEvent,
  recordGapHealAttempt,
} from "../db/repositories/data_gap_events";
import { listSourcesByType } from "../db/repositories/sources";
import { listDataSourceStatusWithConfig } from "./data_source_status_service";
import { runTradingViewSync } from "./tradingview_sync";
import { runTelegramIngest } from "./telegram_ingest";
import { runNewsIngest } from "./news_ingest";
import { runOcrBatch } from "./ocr";
import { backfillBingxCandleWindow, runBingxMarketDataIngest } from "./bingx_market_data_ingest";
import { runBingxFullBackfillIfNeeded } from "./bingx_full_backfill_service";
import { recordOpsAudit } from "./ops_audit";
import { logInfo, logWarn } from "./logger";
import type { TradingPair } from "../types/rl";

const BINGX_SOURCE_TYPES = [
  "bingx_candles",
  "bingx_orderbook",
  "bingx_trades",
  "bingx_funding",
  "bingx_open_interest",
  "bingx_mark_price",
  "bingx_index_price",
  "bingx_ticker",
] as const;

type CandleGap = {
  gapStart: string;
  gapEnd: string;
  gapSeconds: number;
  missingPoints: number;
  expectedIntervalSeconds: number;
};

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

function parseIntervals(value: string | undefined) {
  if (!value) return null;
  const intervals = value
    .split(",")
    .map((interval) => interval.trim())
    .filter(Boolean);
  return intervals.length > 0 ? intervals : null;
}

export function detectCandleGaps(timestamps: string[], intervalMs: number, minMissingPoints: number) {
  const gaps: CandleGap[] = [];
  if (timestamps.length < 2) return gaps;
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(sorted[i - 1]).getTime();
    const next = new Date(sorted[i]).getTime();
    if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) {
      continue;
    }
    const delta = next - prev;
    if (delta <= intervalMs * 1.1) {
      continue;
    }
    const missingPoints = Math.max(0, Math.floor(delta / intervalMs) - 1);
    if (missingPoints < minMissingPoints) {
      continue;
    }
    const gapStart = new Date(prev + intervalMs).toISOString();
    const gapEnd = new Date(next - intervalMs).toISOString();
    gaps.push({
      gapStart,
      gapEnd,
      gapSeconds: Math.floor((delta - intervalMs) / 1000),
      missingPoints,
      expectedIntervalSeconds: Math.floor(intervalMs / 1000),
    });
  }
  return gaps;
}

export function hasOverlappingCandleGap(params: {
  timestamps: string[];
  intervalMs: number;
  minMissingPoints: number;
  rangeStart: string;
  rangeEnd: string;
}) {
  const rangeStartMs = Date.parse(params.rangeStart);
  const rangeEndMs = Date.parse(params.rangeEnd);
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs < rangeStartMs) {
    return false;
  }
  const gaps = detectCandleGaps(params.timestamps, params.intervalMs, params.minMissingPoints);
  return gaps.some((gap) => {
    const gapStartMs = Date.parse(gap.gapStart);
    const gapEndMs = Date.parse(gap.gapEnd);
    if (!Number.isFinite(gapStartMs) || !Number.isFinite(gapEndMs)) return false;
    return gapStartMs <= rangeEndMs && gapEndMs >= rangeStartMs;
  });
}

function gapKey(payload: { pair: TradingPair; source: string; interval?: string | null; start: string; end: string }) {
  return `${payload.pair}:${payload.source}:${payload.interval ?? "none"}:${payload.start}:${payload.end}`;
}

async function healCandleGap(params: {
  pair: TradingPair;
  interval: string;
  gapStart: string;
  gapEnd: string;
  maxBatches: number;
}) {
  await backfillBingxCandleWindow({
    pair: params.pair,
    interval: params.interval,
    startTime: params.gapStart,
    endTime: params.gapEnd,
    maxBatches: params.maxBatches,
  });
}

async function healStaleSources(statuses: Awaited<ReturnType<typeof listDataSourceStatusWithConfig>>) {
  const stale = statuses.filter((status) => status.enabled && status.status !== "ok");
  if (stale.length === 0) return;

  const staleByPair = new Map<TradingPair, typeof stale>();
  for (const status of stale) {
    const list = staleByPair.get(status.pair) ?? [];
    list.push(status);
    staleByPair.set(status.pair, list);
  }

  for (const [pair, list] of staleByPair) {
    const hasBingx = list.some((entry) => BINGX_SOURCE_TYPES.includes(entry.sourceType as (typeof BINGX_SOURCE_TYPES)[number]));
    if (hasBingx) {
      await runBingxMarketDataIngest({ pairs: [pair], backfill: false, trigger: "schedule" });
      await recordOpsAudit({
        actor: "system",
        action: "data_gap.heal",
        resource_type: "bingx",
        resource_id: pair,
        metadata: { pair, sources: list.map((entry) => entry.sourceType) },
      });
    }
  }

  const needsIdeas = stale.some((entry) => entry.sourceType === "ideas");
  if (needsIdeas) {
    await runTradingViewSync({ trigger: "schedule" });
    await recordOpsAudit({
      actor: "system",
      action: "data_gap.heal",
      resource_type: "tradingview",
      metadata: { source_type: "ideas" },
    });
  }

  const needsSignals = stale.some((entry) => entry.sourceType === "signals");
  if (needsSignals) {
    const sources = await listSourcesByType("telegram");
    for (const source of sources) {
      await runTelegramIngest({ sourceId: source.id, trigger: "schedule" });
    }
    await recordOpsAudit({
      actor: "system",
      action: "data_gap.heal",
      resource_type: "telegram",
      metadata: { source_type: "signals", sources: sources.map((source) => source.identifier) },
    });
  }

  const needsNews = stale.some((entry) => entry.sourceType === "news");
  if (needsNews) {
    await runNewsIngest("schedule");
    await recordOpsAudit({
      actor: "system",
      action: "data_gap.heal",
      resource_type: "news",
      metadata: { source_type: "news" },
    });
  }

  const needsOcr = stale.some((entry) => entry.sourceType === "ocr_text");
  if (needsOcr) {
    await runOcrBatch(20);
    await recordOpsAudit({
      actor: "system",
      action: "data_gap.heal",
      resource_type: "ocr",
      metadata: { source_type: "ocr_text" },
    });
  }
}

export async function runDataGapMonitor() {
  const env = loadEnv();
  const now = new Date();
  const intervals = parseIntervals(env.BINGX_MARKET_DATA_INTERVALS) ?? [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ];
  const lookbackDays = env.DATA_GAP_LOOKBACK_DAYS;
  const maxPoints = env.DATA_GAP_MAX_POINTS;
  const minMissingPoints = env.DATA_GAP_MIN_MISSING_POINTS;
  const healEnabled = env.DATA_GAP_HEAL_ENABLED;
  const healCooldownMs = env.DATA_GAP_HEAL_COOLDOWN_MIN * 60 * 1000;
  const healMaxGaps = env.DATA_GAP_HEAL_MAX_GAPS_PER_RUN;
  const healMaxBatches = env.DATA_GAP_HEAL_MAX_BATCHES;
  const healMaxAttempts = env.DATA_GAP_HEAL_MAX_ATTEMPTS;
  const supportedPairs = getSupportedPairs();

  const detectedKeys = new Set<string>();
  const healQueue: Array<{ id: string; pair: TradingPair; interval: string; gapStart: string; gapEnd: string }> = [];
  const windowStartByInterval = new Map<string, string>();

  for (const pair of supportedPairs) {
    for (const interval of intervals) {
      const intervalMs = parseIntervalMs(interval);
      const maxWindowMs = intervalMs * maxPoints;
      const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
      const windowMs = Math.min(lookbackMs, maxWindowMs);
      const windowStart = new Date(now.getTime() - windowMs).toISOString();
      const windowEnd = now.toISOString();
      windowStartByInterval.set(interval, windowStart);

      let times: string[] = [];
      try {
        times = await listBingxCandleTimes({
          pair,
          interval,
          start: windowStart,
          end: windowEnd,
          limit: maxPoints,
        });
      } catch (error) {
        logWarn("Data gap scan failed for candle times", { pair, interval, error: String(error) });
        continue;
      }
      const gaps = detectCandleGaps(times, intervalMs, minMissingPoints);
      for (const gap of gaps) {
        const { event, created } = await upsertDataGapEvent({
          pair,
          source_type: "bingx_candles",
          interval,
          gap_start: gap.gapStart,
          gap_end: gap.gapEnd,
          expected_interval_seconds: gap.expectedIntervalSeconds,
          gap_seconds: gap.gapSeconds,
          missing_points: gap.missingPoints,
          details: {
            window_start: windowStart,
            window_end: windowEnd,
            expected_points: Math.floor(windowMs / intervalMs),
            actual_points: times.length,
          },
        });

        detectedKeys.add(
          gapKey({ pair, source: "bingx_candles", interval, start: gap.gapStart, end: gap.gapEnd }),
        );

        if (created) {
          await recordOpsAudit({
            actor: "system",
            action: "data_gap.detected",
            resource_type: "data_gap_event",
            resource_id: event.id,
            metadata: { pair, source_type: "bingx_candles", interval },
          });
        }

        if (!healEnabled) {
          continue;
        }
        if (event.heal_attempts >= healMaxAttempts) {
          continue;
        }
        const lastHealAt = event.last_heal_at ? new Date(event.last_heal_at).getTime() : 0;
        if (lastHealAt && now.getTime() - lastHealAt < healCooldownMs) {
          continue;
        }
        healQueue.push({ id: event.id, pair, interval, gapStart: gap.gapStart, gapEnd: gap.gapEnd });
      }
    }
  }

  const statusViews = await listDataSourceStatusWithConfig();
  for (const status of statusViews) {
    if (!status.enabled || status.status === "ok") {
      continue;
    }
    const gapStart = status.lastSeenAt
      ? new Date(new Date(status.lastSeenAt).getTime() + status.freshnessThresholdSeconds * 1000).toISOString()
      : new Date(0).toISOString();
    const gapEnd = now.toISOString();
    const gapSeconds = Math.max(0, Math.floor((now.getTime() - new Date(gapStart).getTime()) / 1000));
    const { event, created } = await upsertDataGapEvent({
      pair: status.pair,
      source_type: status.sourceType,
      interval: null,
      gap_start: gapStart,
      gap_end: gapEnd,
      expected_interval_seconds: status.freshnessThresholdSeconds,
      gap_seconds: gapSeconds,
      missing_points: null,
      details: { status: status.status, last_seen_at: status.lastSeenAt },
    });
    detectedKeys.add(
      gapKey({ pair: status.pair, source: status.sourceType, interval: null, start: gapStart, end: gapEnd }),
    );
    if (created) {
      await recordOpsAudit({
        actor: "system",
        action: "data_gap.detected",
        resource_type: "data_gap_event",
        resource_id: event.id,
        metadata: { pair: status.pair, source_type: status.sourceType, status: status.status },
      });
    }
  }

  const openEvents = await listOpenDataGapEvents();
  for (const event of openEvents) {
    const key = gapKey({
      pair: event.pair,
      source: event.source_type,
      interval: event.interval,
      start: event.gap_start,
      end: event.gap_end,
    });
    if (event.source_type === "bingx_candles" && event.interval) {
      const windowStart = windowStartByInterval.get(event.interval);
      if (windowStart && new Date(event.gap_end).getTime() < new Date(windowStart).getTime()) {
        continue;
      }
    }
    if (!detectedKeys.has(key)) {
      await resolveDataGapEvent(event.id);
      await recordOpsAudit({
        actor: "system",
        action: "data_gap.resolved",
        resource_type: "data_gap_event",
        resource_id: event.id,
        metadata: { pair: event.pair, source_type: event.source_type, interval: event.interval },
      });
    }
  }

  if (healEnabled && healQueue.length > 0) {
    const limited = healQueue.slice(0, healMaxGaps);
    for (const item of limited) {
      try {
        await recordGapHealAttempt(item.id);
        await recordOpsAudit({
          actor: "system",
          action: "data_gap.heal",
          resource_type: "data_gap_event",
          resource_id: item.id,
          metadata: { pair: item.pair, interval: item.interval },
        });
        await healCandleGap({
          pair: item.pair,
          interval: item.interval,
          gapStart: item.gapStart,
          gapEnd: item.gapEnd,
          maxBatches: healMaxBatches,
        });

        const intervalMs = parseIntervalMs(item.interval);
        const gapStartMs = Date.parse(item.gapStart);
        const gapEndMs = Date.parse(item.gapEnd);
        if (!Number.isFinite(gapStartMs) || !Number.isFinite(gapEndMs)) {
          throw new Error("invalid_gap_window");
        }
        const verifyStart = new Date(gapStartMs - intervalMs).toISOString();
        const verifyEnd = new Date(gapEndMs + intervalMs).toISOString();
        const verifyTimes = await listBingxCandleTimes({
          pair: item.pair,
          interval: item.interval,
          start: verifyStart,
          end: verifyEnd,
          limit: Math.min(maxPoints, 5000),
        });
        const stillMissing = hasOverlappingCandleGap({
          timestamps: verifyTimes,
          intervalMs,
          minMissingPoints,
          rangeStart: item.gapStart,
          rangeEnd: item.gapEnd,
        });

        if (!stillMissing) {
          await resolveDataGapEvent(item.id);
          await recordOpsAudit({
            actor: "system",
            action: "data_gap.heal_verified",
            resource_type: "data_gap_event",
            resource_id: item.id,
            metadata: {
              pair: item.pair,
              interval: item.interval,
              verify_start: verifyStart,
              verify_end: verifyEnd,
            },
          });
        } else {
          await recordOpsAudit({
            actor: "system",
            action: "data_gap.heal_unresolved",
            resource_type: "data_gap_event",
            resource_id: item.id,
            metadata: {
              pair: item.pair,
              interval: item.interval,
              verify_start: verifyStart,
              verify_end: verifyEnd,
            },
          });
        }
      } catch (error) {
        logWarn("Failed to heal candle gap", { error: String(error), pair: item.pair, interval: item.interval });
      }
    }
  }

  try {
    await healStaleSources(statusViews);
  } catch (error) {
    logWarn("Failed to heal stale sources", { error: String(error) });
  }

  try {
    await runBingxFullBackfillIfNeeded({
      source: "data_gap_monitor",
      openGapCountHint: healQueue.length,
      statusesHint: statusViews,
    });
  } catch (error) {
    logWarn("Failed to run BingX full backfill check", { error: String(error) });
  }

  logInfo("Data gap monitor completed", { gaps: detectedKeys.size, heal_queue: healQueue.length });
}
