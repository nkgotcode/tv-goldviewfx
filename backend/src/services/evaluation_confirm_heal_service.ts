import { backfillBingxCandleWindow } from "./bingx_market_data_ingest";
import { runDataGapMonitor } from "./data_gap_service";
import { runEvaluation } from "./evaluation_service";
import { logWarn } from "./logger";
import { recordOpsAudit } from "./ops_audit";
import { loadEnv } from "../config/env";
import { getSupportedPairs } from "../config/market_catalog";
import type { TradingPair } from "../types/rl";
import type { EvaluationRequest } from "../rl/schemas";

export type EvaluationConfirmHealPayload = {
  agentId: string;
  evaluation: EvaluationRequest;
  heal: {
    allPairs?: boolean;
    allIntervals?: boolean;
    intervals?: string[];
    maxBatches?: number;
    runGapMonitor?: boolean;
  };
  actor?: string;
};

export type EvaluationConfirmHealResult = {
  report: Awaited<ReturnType<typeof runEvaluation>>;
  heal: {
    status: "applied" | "partial";
    pair: string;
    intervals: string[];
    pairs: string[];
    max_batches: number;
    gap_monitor_ran: boolean;
    candle_rows_inserted_by_interval: Record<string, number>;
    warnings: string[];
  };
};

export function shouldQueueConfirmHeal(payload: EvaluationConfirmHealPayload): boolean {
  const { evaluation, heal } = payload;
  const periodMs =
    new Date(evaluation.periodEnd).getTime() - new Date(evaluation.periodStart).getTime();
  const periodDays = Number.isFinite(periodMs) && periodMs > 0 ? periodMs / (24 * 60 * 60 * 1000) : 0;
  const intervals = heal.intervals?.length ? heal.intervals : [evaluation.interval ?? "1m"];
  const foldCount = evaluation.walkForward?.folds ?? 0;
  const strategyCount = evaluation.strategyIds?.length ?? 0;
  const venueCount = evaluation.venueIds?.length ?? 0;

  if (heal.allPairs) return true;
  if (heal.allIntervals) return true;
  if (periodDays > 30) return true;
  if (foldCount >= 2) return true;
  if (intervals.length > 1) return true;
  if (strategyCount > 3) return true;
  if (venueCount > 1) return true;

  return false;
}

export async function runEvaluationConfirmHeal(
  payload: EvaluationConfirmHealPayload,
): Promise<EvaluationConfirmHealResult> {
  const { evaluation } = payload;
  const env = loadEnv();
  const requestedIntervals = payload.heal.intervals?.length
    ? payload.heal.intervals
    : [evaluation.interval ?? "1m"];
  const defaultIntervals =
    env.BINGX_MARKET_DATA_INTERVALS?.split(",").map((interval) => interval.trim()).filter(Boolean) ?? [
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
  const intervals = payload.heal.allIntervals ? defaultIntervals : requestedIntervals;
  const pairs = payload.heal.allPairs
    ? getSupportedPairs().map((pair) => pair as TradingPair)
    : [evaluation.pair as TradingPair];
  const maxBatches = payload.heal.maxBatches ?? env.DATA_GAP_HEAL_MAX_BATCHES;
  const runGapMonitor = payload.heal.runGapMonitor ?? true;

  const healWarnings: string[] = [];
  const candleRowsInsertedByInterval: Record<string, number> = {};

  for (const pair of pairs) {
    for (const interval of intervals) {
      try {
        const inserted = await backfillBingxCandleWindow({
          pair,
          interval,
          startTime: evaluation.periodStart,
          endTime: evaluation.periodEnd,
          maxBatches,
        });
        candleRowsInsertedByInterval[`${pair}:${interval}`] = inserted;
      } catch (error) {
        const message = `candle_backfill_failed:${pair}:${interval}:${error instanceof Error ? error.message : String(error)}`;
        healWarnings.push(message);
        logWarn("Confirm-heal candle backfill failed", {
          pair,
          interval,
          error: String(error),
        });
      }
    }
  }

  if (runGapMonitor) {
    try {
      await runDataGapMonitor({
        pairs: payload.heal.allPairs ? undefined : pairs,
        intervals,
        healEnabled: true,
        healMaxGaps: Math.max(intervals.length, 1),
        healMaxBatches: maxBatches,
        skipStaleSourceHealing: false,
        skipFullBackfillCheck: true,
      });
    } catch (error) {
      const message = `gap_monitor_failed:${error instanceof Error ? error.message : String(error)}`;
      healWarnings.push(message);
      logWarn("Confirm-heal scoped gap monitor failed", {
        pair: evaluation.pair,
        intervals,
        error: String(error),
      });
    }
  }

  const report = await runEvaluation(evaluation, {
    bypassDataGapGate: true,
    gapGateBypassReason: "manual_confirm_heal_and_continue",
  });

  await recordOpsAudit({
    actor: payload.actor ?? "system",
    action: "agent.evaluation.confirm_heal_and_run",
    resource_type: "evaluation_report",
    resource_id: report.id,
    metadata: {
      evaluation,
      heal: {
        intervals,
        maxBatches,
        runGapMonitor,
        candleRowsInsertedByInterval,
        warnings: healWarnings,
      },
    },
  });

  return {
    report,
    heal: {
      status: healWarnings.length > 0 ? "partial" : "applied",
      pair: payload.heal.allPairs ? "__all_pairs__" : evaluation.pair,
      pairs: pairs,
      intervals,
      max_batches: maxBatches,
      gap_monitor_ran: runGapMonitor,
      candle_rows_inserted_by_interval: candleRowsInsertedByInterval,
      warnings: healWarnings,
    },
  };
}
