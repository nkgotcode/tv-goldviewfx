import { loadEnv } from "../config/env";
import { listOpenDataGapEvents } from "../db/repositories/data_gap_events";
import { insertOpsAlert } from "../db/repositories/ops_alerts";
import { runBingxMarketDataIngest } from "./bingx_market_data_ingest";
import { BINGX_SOURCE_TYPES, listDataSourceStatusWithConfig, type DataSourceStatusView } from "./data_source_status_service";
import { logInfo, logWarn } from "./logger";

export type BingxSourcePressure = {
  nonOk: number;
  stale: number;
  unavailable: number;
};

export type BingxFullBackfillDecision = {
  shouldRun: boolean;
  reason: "disabled" | "forced" | "open_gaps" | "non_ok_sources" | "healthy";
  openGapCount: number;
  nonOkSourceCount: number;
  staleSourceCount: number;
  unavailableSourceCount: number;
};

export type RunBingxFullBackfillResult = {
  ran: boolean;
  decision: BingxFullBackfillDecision;
  totalInserted: number;
};

export function countBingxSourcePressure(statuses: DataSourceStatusView[]): BingxSourcePressure {
  const pressure = { nonOk: 0, stale: 0, unavailable: 0 };
  for (const status of statuses) {
    if (!status.enabled || !BINGX_SOURCE_TYPES.includes(status.sourceType)) {
      continue;
    }
    if (status.status === "ok") {
      continue;
    }
    pressure.nonOk += 1;
    if (status.status === "stale") pressure.stale += 1;
    if (status.status === "unavailable") pressure.unavailable += 1;
  }
  return pressure;
}

export function shouldRunBingxFullBackfill(params: {
  enabled: boolean;
  force: boolean;
  openGapCount: number;
  nonOkSourceCount: number;
  openGapThreshold: number;
  nonOkThreshold: number;
}) {
  if (!params.enabled && !params.force) {
    return { shouldRun: false, reason: "disabled" as const };
  }
  if (params.force) {
    return { shouldRun: true, reason: "forced" as const };
  }
  if (params.openGapCount >= params.openGapThreshold) {
    return { shouldRun: true, reason: "open_gaps" as const };
  }
  if (params.nonOkSourceCount >= params.nonOkThreshold) {
    return { shouldRun: true, reason: "non_ok_sources" as const };
  }
  return { shouldRun: false, reason: "healthy" as const };
}

export async function runBingxFullBackfillIfNeeded(options?: {
  force?: boolean;
  source?: string;
  openGapCountHint?: number;
  statusesHint?: DataSourceStatusView[];
}) {
  const env = loadEnv();
  const force = options?.force ?? env.BINGX_FULL_BACKFILL_FORCE;
  if (!env.BINGX_FULL_BACKFILL_ENABLED && !force) {
    const decision: BingxFullBackfillDecision = {
      shouldRun: false,
      reason: "disabled",
      openGapCount: 0,
      nonOkSourceCount: 0,
      staleSourceCount: 0,
      unavailableSourceCount: 0,
    };
    logInfo("BingX full backfill skipped", {
      source: options?.source ?? "unknown",
      ...decision,
    });
    return { ran: false, decision, totalInserted: 0 } satisfies RunBingxFullBackfillResult;
  }

  const openGapThreshold = Math.max(0, env.BINGX_FULL_BACKFILL_OPEN_GAP_THRESHOLD);
  const nonOkThreshold = Math.max(0, env.BINGX_FULL_BACKFILL_NON_OK_SOURCE_THRESHOLD);

  let openGapCount = options?.openGapCountHint;
  if (typeof openGapCount !== "number") {
    const limit = Math.max(openGapThreshold, 1);
    const openGaps = await listOpenDataGapEvents({ source_type: "bingx_candles", limit });
    openGapCount = openGaps.length;
  }

  const statuses = options?.statusesHint ?? (await listDataSourceStatusWithConfig());
  const pressure = countBingxSourcePressure(statuses);
  const check = shouldRunBingxFullBackfill({
    enabled: env.BINGX_FULL_BACKFILL_ENABLED,
    force,
    openGapCount,
    nonOkSourceCount: pressure.nonOk,
    openGapThreshold,
    nonOkThreshold,
  });

  const decision: BingxFullBackfillDecision = {
    shouldRun: check.shouldRun,
    reason: check.reason,
    openGapCount,
    nonOkSourceCount: pressure.nonOk,
    staleSourceCount: pressure.stale,
    unavailableSourceCount: pressure.unavailable,
  };

  if (!decision.shouldRun) {
    logInfo("BingX full backfill skipped", {
      source: options?.source ?? "unknown",
      ...decision,
    });
    return { ran: false, decision, totalInserted: 0 } satisfies RunBingxFullBackfillResult;
  }

  if (env.BINGX_FULL_BACKFILL_ALERT_ENABLED) {
    await insertOpsAlert({
      category: "ops",
      severity: decision.reason === "forced" ? "medium" : "low",
      metric: "bingx_full_backfill.triggered",
      value: decision.openGapCount + decision.nonOkSourceCount,
      threshold: Math.max(openGapThreshold, nonOkThreshold),
      metadata: {
        source: options?.source ?? "unknown",
        reason: decision.reason,
        open_gaps: decision.openGapCount,
        non_ok_sources: decision.nonOkSourceCount,
      },
    });
  }

  try {
    const summaries = await runBingxMarketDataIngest({
      backfill: true,
      trigger: "manual",
      maxBatches: env.BINGX_FULL_BACKFILL_MAX_BATCHES,
    });
    const totalInserted = summaries.reduce(
      (total, item) =>
        total +
        item.candlesInserted +
        item.tradesInserted +
        item.fundingInserted +
        item.openInterestInserted +
        item.markIndexInserted +
        item.tickersInserted,
      0,
    );

    logInfo("BingX full backfill complete", {
      source: options?.source ?? "unknown",
      summaries: summaries.length,
      totalInserted,
      reason: decision.reason,
    });

    if (env.BINGX_FULL_BACKFILL_ALERT_ENABLED) {
      await insertOpsAlert({
        category: "ops",
        severity: "low",
        metric: "bingx_full_backfill.inserted",
        value: totalInserted,
        threshold: null,
        metadata: {
          source: options?.source ?? "unknown",
          reason: decision.reason,
          summaries: summaries.length,
        },
      });
    }

    return { ran: true, decision, totalInserted } satisfies RunBingxFullBackfillResult;
  } catch (error) {
    logWarn("BingX full backfill failed", {
      source: options?.source ?? "unknown",
      reason: decision.reason,
      error: String(error),
    });
    if (env.BINGX_FULL_BACKFILL_ALERT_ENABLED) {
      await insertOpsAlert({
        category: "ops",
        severity: "high",
        metric: "bingx_full_backfill.failed",
        value: 1,
        threshold: 0,
        metadata: {
          source: options?.source ?? "unknown",
          reason: decision.reason,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    throw error;
  }
}
