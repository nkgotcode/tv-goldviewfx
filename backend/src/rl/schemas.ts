import { z } from "zod";
import { isSupportedPair, resolveSupportedPair } from "../config/market_catalog";

export const tradingPairSchema = z
  .string()
  .min(1)
  .transform((value) => resolveSupportedPair(value) ?? value.trim())
  .refine((value) => isSupportedPair(value), "Unsupported trading pair");
export const agentModeSchema = z.enum(["paper", "live"]);
export const agentRunStatusSchema = z.enum(["running", "paused", "stopped"]);
export const candleIntervalSchema = z
  .string()
  .regex(/^\d+(m|h|d|w|M)$/, "Invalid interval format (expected like 1m, 5m, 1h, 1d)");
export const contextIntervalsSchema = z
  .array(candleIntervalSchema)
  .max(12, "Too many context intervals")
  .transform((intervals) => Array.from(new Set(intervals.map((value) => value.trim()))))
  .optional();
export const dataSourceTypeSchema = z.enum([
  "bingx_candles",
  "bingx_orderbook",
  "bingx_trades",
  "bingx_funding",
  "bingx_open_interest",
  "bingx_mark_price",
  "bingx_index_price",
  "bingx_ticker",
  "ideas",
  "signals",
  "news",
  "ocr_text",
  "trades",
]);

export const riskLimitSetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  maxPositionSize: z.number().positive(),
  leverageCap: z.number().positive(),
  maxDailyLoss: z.number().positive(),
  maxDrawdown: z.number().positive(),
  maxOpenPositions: z.number().int().positive(),
});

export const agentStartRequestSchema = z.object({
  mode: agentModeSchema,
  pair: tradingPairSchema,
  riskLimitSetId: z.string().uuid(),
  learningEnabled: z.boolean().optional(),
  learningWindowMinutes: z.number().int().positive().optional(),
  datasetVersionId: z.string().uuid().optional(),
  featureSetVersionId: z.string().uuid().optional(),
});

export const agentConfigPatchSchema = z.object({
  riskLimitSetId: z.string().uuid().optional(),
  learningEnabled: z.boolean().optional(),
  learningWindowMinutes: z.number().int().positive().optional(),
  dataSourceConfig: z
    .object({
      sources: z.array(
        z.object({
          sourceType: dataSourceTypeSchema,
          enabled: z.boolean(),
          freshnessThresholdSeconds: z.number().int().positive().optional(),
        }),
      ),
    })
    .optional(),
});

export const evaluationRequestSchema = z.object({
  pair: tradingPairSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  interval: candleIntervalSchema.optional(),
  contextIntervals: contextIntervalsSchema,
  agentVersionId: z.string().uuid().optional(),
  datasetVersionId: z.string().uuid().optional(),
  featureSetVersionId: z.string().uuid().optional(),
  decisionThreshold: z.number().nonnegative().optional(),
  windowSize: z.number().int().positive().optional(),
  stride: z.number().int().positive().optional(),
  leverage: z.number().positive().optional(),
  takerFeeBps: z.number().nonnegative().optional(),
  slippageBps: z.number().nonnegative().optional(),
  fundingWeight: z.number().nonnegative().optional(),
  drawdownPenalty: z.number().nonnegative().optional(),
  walkForward: z
    .object({
      folds: z.number().int().min(1).max(24),
      purgeBars: z.number().int().nonnegative().optional(),
      embargoBars: z.number().int().nonnegative().optional(),
      minTrainBars: z.number().int().positive().optional(),
      strict: z.boolean().optional(),
    })
    .optional(),
  featureSchemaFingerprint: z.string().min(8).optional(),
});

export const trainingRequestSchema = z.object({
  pair: tradingPairSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  interval: candleIntervalSchema.optional(),
  contextIntervals: contextIntervalsSchema,
  datasetVersionId: z.string().uuid().optional(),
  featureSetVersionId: z.string().uuid().optional(),
  windowSize: z.number().int().positive().optional(),
  stride: z.number().int().positive().optional(),
  timesteps: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
  featureSchemaFingerprint: z.string().min(8).optional(),
});

export const dataSourceConfigSchema = z.object({
  sources: z.array(
    z.object({
      sourceType: dataSourceTypeSchema,
      enabled: z.boolean(),
      freshnessThresholdSeconds: z.number().int().positive().optional(),
    }),
  ),
});

export type AgentStartRequest = z.infer<typeof agentStartRequestSchema>;
export type AgentConfigPatch = z.infer<typeof agentConfigPatchSchema>;
export type RiskLimitSetInput = z.infer<typeof riskLimitSetSchema>;
export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export type TrainingRequest = z.infer<typeof trainingRequestSchema>;
export type DataSourceConfig = z.infer<typeof dataSourceConfigSchema>;
