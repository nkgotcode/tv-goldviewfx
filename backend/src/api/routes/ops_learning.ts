import { Hono } from "hono";
import { z } from "zod";
import { loadEnv } from "../../config/env";
import { resolveSupportedPair } from "../../config/market_catalog";
import { loadRlServiceConfig } from "../../config/rl_service";
import { getEvaluationReport, getLatestEvaluationReport } from "../../db/repositories/evaluation_reports";
import { listRecentLearningUpdates } from "../../db/repositories/learning_updates";
import {
  resolveOnlineLearningPairs,
  runOnlineLearningBatch,
  type OnlineLearningRunOverrides,
} from "../../services/online_learning_service";
import { recordOpsAudit } from "../../services/ops_audit";
import { logWarn } from "../../services/logger";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import type { TradingPair } from "../../types/rl";

export const opsLearningRoutes = new Hono();

opsLearningRoutes.use("*", withOpsIdentity);

const intervalRegex = /^\d+(m|h|d|w|M)$/;

const manualRunPayloadSchema = z.object({
  pair: z.string().min(1).optional(),
  pairs: z.array(z.string().min(1)).optional(),
  useConfiguredPairs: z.boolean().optional(),
  interval: z.string().regex(intervalRegex).optional(),
  contextIntervals: z.array(z.string().regex(intervalRegex)).optional(),
  contextIntervalsCsv: z.string().optional(),
  trainWindowMin: z.number().int().positive().optional(),
  evalWindowMin: z.number().int().positive().optional(),
  evalLagMin: z.number().int().nonnegative().optional(),
  windowSize: z.number().int().positive().optional(),
  stride: z.number().int().positive().optional(),
  timesteps: z.number().int().positive().optional(),
  decisionThreshold: z.number().positive().optional(),
  autoRollForward: z.boolean().optional(),
  promotionGates: z
    .object({
      minWinRate: z.number().min(0).max(1).optional(),
      minNetPnl: z.number().optional(),
      maxDrawdown: z.number().min(0).max(1).optional(),
      minTradeCount: z.number().int().nonnegative().optional(),
      minWinRateDelta: z.number().optional(),
      minNetPnlDelta: z.number().optional(),
      maxDrawdownDelta: z.number().nonnegative().optional(),
      minTradeCountDelta: z.number().int().optional(),
      minEffectSize: z.number().nonnegative().optional(),
      minConfidenceZ: z.number().nonnegative().optional(),
      minSampleSize: z.number().int().nonnegative().optional(),
    })
    .optional(),
  rolloutPolicy: z
    .object({
      mode: z.enum(["shadow", "canary", "full"]).optional(),
      canaryMinTradeCount: z.number().int().nonnegative().optional(),
      canaryMaxDrawdown: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

function parseContextIntervals(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeContextIntervals(baseInterval: string, values?: string[] | null) {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const interval = value.trim();
    if (!intervalRegex.test(interval)) continue;
    if (interval === baseInterval) continue;
    if (seen.has(interval)) continue;
    seen.add(interval);
    normalized.push(interval);
  }
  return normalized;
}

function buildOnlineLearningConfig(env: ReturnType<typeof loadEnv>) {
  return {
    enabled: env.RL_ONLINE_LEARNING_ENABLED,
    intervalMin: env.RL_ONLINE_LEARNING_INTERVAL_MIN,
    interval: env.RL_ONLINE_LEARNING_INTERVAL,
    contextIntervals: normalizeContextIntervals(
      env.RL_ONLINE_LEARNING_INTERVAL,
      parseContextIntervals(env.RL_ONLINE_LEARNING_CONTEXT_INTERVALS),
    ),
    pair: env.RL_ONLINE_LEARNING_PAIR,
    pairs: resolveOnlineLearningPairs(),
    trainWindowMin: env.RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN,
    evalWindowMin: env.RL_ONLINE_LEARNING_EVAL_WINDOW_MIN,
    evalLagMin: env.RL_ONLINE_LEARNING_EVAL_LAG_MIN,
    windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
    stride: env.RL_ONLINE_LEARNING_STRIDE,
    timesteps: env.RL_ONLINE_LEARNING_TIMESTEPS,
    decisionThreshold: env.RL_ONLINE_LEARNING_DECISION_THRESHOLD,
    autoRollForward: env.RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD,
    minWinRate: env.RL_ONLINE_LEARNING_MIN_WIN_RATE,
    minNetPnl: env.RL_ONLINE_LEARNING_MIN_NET_PNL,
    maxDrawdown: env.RL_ONLINE_LEARNING_MAX_DRAWDOWN,
    minTradeCount: env.RL_ONLINE_LEARNING_MIN_TRADE_COUNT,
    minWinRateDelta: env.RL_ONLINE_LEARNING_MIN_WIN_RATE_DELTA,
    minNetPnlDelta: env.RL_ONLINE_LEARNING_MIN_NET_PNL_DELTA,
    maxDrawdownDelta: env.RL_ONLINE_LEARNING_MAX_DRAWDOWN_DELTA,
    minTradeCountDelta: env.RL_ONLINE_LEARNING_MIN_TRADE_COUNT_DELTA,
    minEffectSize: env.RL_ONLINE_LEARNING_MIN_EFFECT_SIZE,
    minConfidenceZ: env.RL_ONLINE_LEARNING_MIN_CONFIDENCE_Z,
    minSampleSize: env.RL_ONLINE_LEARNING_MIN_SAMPLE_SIZE,
    rolloutMode: env.RL_ONLINE_LEARNING_ROLLOUT_MODE,
    canaryMinTradeCount: env.RL_ONLINE_LEARNING_CANARY_MIN_TRADE_COUNT,
    canaryMaxDrawdown: env.RL_ONLINE_LEARNING_CANARY_MAX_DRAWDOWN,
    leverageDefault: env.RL_PPO_LEVERAGE_DEFAULT,
    takerFeeBps: env.RL_PPO_TAKER_FEE_BPS,
    slippageBps: env.RL_PPO_SLIPPAGE_BPS,
    fundingWeight: env.RL_PPO_FUNDING_WEIGHT,
    drawdownPenalty: env.RL_PPO_DRAWDOWN_PENALTY,
    feedbackRounds: env.RL_PPO_FEEDBACK_ROUNDS,
    feedbackTimesteps: env.RL_PPO_FEEDBACK_TIMESTEPS,
    feedbackHardRatio: env.RL_PPO_FEEDBACK_HARD_RATIO,
  };
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canonicalPair(value: unknown) {
  if (typeof value !== "string") return null;
  return resolveSupportedPair(value) ?? value;
}

function formatEvaluation(report: any) {
  if (!report) return null;
  const metadata = (report.metadata ?? {}) as Record<string, unknown>;
  return {
    id: report.id,
    agentVersionId: report.agent_version_id,
    pair: canonicalPair(report.pair),
    periodStart: report.period_start,
    periodEnd: report.period_end,
    winRate: toNumber(report.win_rate),
    netPnlAfterFees: toNumber(report.net_pnl_after_fees),
    maxDrawdown: toNumber(report.max_drawdown),
    tradeCount: toNumber(report.trade_count),
    backtestRunId: report.backtest_run_id ?? null,
    status: report.status,
    createdAt: report.created_at ?? null,
    metadata: {
      foldMetrics: (metadata.fold_metrics ?? metadata.foldMetrics ?? []) as unknown[],
      aggregate: (metadata.aggregate ?? null) as Record<string, unknown> | null,
      featureSchemaFingerprint: (metadata.feature_schema_fingerprint ??
        metadata.featureSchemaFingerprint ??
        null) as string | null,
      promotionComparison: (metadata.promotion_comparison ??
        metadata.promotionComparison ??
        null) as Record<string, unknown> | null,
    },
  };
}

opsLearningRoutes.get("/status", async (c) => {
  const env = loadEnv();
  const rlConfig = loadRlServiceConfig();
  const limit = Number.parseInt(c.req.query("limit") ?? "5", 10);
  const configuredPairs = resolveOnlineLearningPairs();
  const pair = (c.req.query("pair") ?? configuredPairs[0] ?? env.RL_ONLINE_LEARNING_PAIR) as string;

  try {
    const updates = await listRecentLearningUpdates(Number.isFinite(limit) ? limit : 5);
    const enriched = await Promise.all(
      updates.map(async (update) => {
        const reportPromise = update.evaluation_report_id
          ? getEvaluationReport(update.evaluation_report_id).catch(() => null)
          : Promise.resolve(null);
        const championPromise = update.champion_evaluation_report_id
          ? getEvaluationReport(update.champion_evaluation_report_id).catch(() => null)
          : Promise.resolve(null);
        const [report, championReport] = await Promise.all([reportPromise, championPromise]);
        return {
          id: update.id,
          agentVersionId: update.agent_version_id,
          windowStart: update.window_start,
          windowEnd: update.window_end,
          status: update.status,
          startedAt: update.started_at ?? null,
          completedAt: update.completed_at ?? null,
          evaluationReportId: update.evaluation_report_id ?? null,
          championEvaluationReportId: update.champion_evaluation_report_id ?? null,
          promoted: update.promoted ?? null,
          decisionReasons: (update.decision_reasons ?? []) as string[],
          metricDeltas: (update.metric_deltas ?? {}) as Record<string, number>,
          pair: canonicalPair(report?.pair ?? championReport?.pair ?? null),
          evaluationReport: formatEvaluation(report),
          championEvaluationReport: formatEvaluation(championReport),
        };
      }),
    );

    const latestReport = await getLatestEvaluationReport({ pair });
    const latestReportsByPair = await Promise.all(
      configuredPairs.map(async (configuredPair) => ({
        pair: configuredPair,
        report: formatEvaluation(await getLatestEvaluationReport({ pair: configuredPair })),
      })),
    );

    return c.json({
      generatedAt: new Date().toISOString(),
      config: buildOnlineLearningConfig(env),
      rlService: {
        url: rlConfig.url,
        mock: rlConfig.mock,
      },
      latestUpdates: enriched,
      latestReport: formatEvaluation(latestReport),
      latestReportsByPair,
    });
  } catch (error) {
    logWarn("Failed to load online learning status", { error: String(error) });
    return c.json({
      generatedAt: new Date().toISOString(),
      config: buildOnlineLearningConfig(env),
      rlService: {
        url: rlConfig.url,
        mock: rlConfig.mock,
      },
      latestUpdates: [],
      latestReport: null,
      latestReportsByPair: [],
    });
  }
});

opsLearningRoutes.post("/run", requireOperatorRole, async (c) => {
  try {
    const env = loadEnv();
    const rawPayload = await c.req.json().catch(() => ({}));
    const parsed = manualRunPayloadSchema.safeParse(rawPayload ?? {});
    if (!parsed.success) {
      return c.json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);
    }
    const payload = parsed.data;
    const resolvedPair = payload.pair ? resolveSupportedPair(payload.pair) : null;
    if (payload.pair && !resolvedPair) {
      return c.json({ error: "unsupported_pair", pair: payload.pair }, 400);
    }
    const resolvedPairs = (payload.pairs ?? [])
      .map((entry) => resolveSupportedPair(entry))
      .filter((entry): entry is string => Boolean(entry));
    if ((payload.pairs?.length ?? 0) > 0 && resolvedPairs.length !== payload.pairs!.length) {
      const invalidPairs = payload.pairs!.filter((entry) => !resolveSupportedPair(entry));
      return c.json({ error: "unsupported_pairs", pairs: invalidPairs }, 400);
    }
    const interval = payload.interval ?? env.RL_ONLINE_LEARNING_INTERVAL;
    const hasContextOverride = payload.contextIntervals !== undefined || payload.contextIntervalsCsv !== undefined;
    const mergedContextIntervals = normalizeContextIntervals(interval, [
      ...(payload.contextIntervals ?? []),
      ...parseContextIntervals(payload.contextIntervalsCsv),
    ]);
    const overrides: OnlineLearningRunOverrides = {
      pair: (resolvedPair ?? undefined) as TradingPair | undefined,
      pairs: payload.useConfiguredPairs ? undefined : ((resolvedPairs.length > 0 ? resolvedPairs : undefined) as TradingPair[] | undefined),
      interval: payload.interval,
      contextIntervals: hasContextOverride ? mergedContextIntervals : undefined,
      trainWindowMin: payload.trainWindowMin,
      evalWindowMin: payload.evalWindowMin,
      evalLagMin: payload.evalLagMin,
      windowSize: payload.windowSize,
      stride: payload.stride,
      timesteps: payload.timesteps,
      decisionThreshold: payload.decisionThreshold,
      autoRollForward: payload.autoRollForward,
      promotionGates: payload.promotionGates ?? null,
      rolloutPolicy: payload.rolloutPolicy ?? null,
    };
    const result = await runOnlineLearningBatch("manual", overrides);
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "online_learning.run",
      resource_type: "learning_update",
      metadata: {
        result,
        overrides,
      },
    });
    return c.json({ ...result, ranAt: new Date().toISOString() });
  } catch (error) {
    logWarn("Failed to run online learning", { error: String(error) });
    return c.json({ error: "online_learning_failed" }, 500);
  }
});
