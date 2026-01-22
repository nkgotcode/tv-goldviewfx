import { z } from "zod";

export const tradingPairSchema = z.enum(["Gold-USDT", "XAUTUSDT", "PAXGUSDT"]);
export const agentModeSchema = z.enum(["paper", "live"]);
export const agentRunStatusSchema = z.enum(["running", "paused", "stopped"]);
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
  agentVersionId: z.string().uuid().optional(),
  datasetVersionId: z.string().uuid().optional(),
  featureSetVersionId: z.string().uuid().optional(),
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
export type DataSourceConfig = z.infer<typeof dataSourceConfigSchema>;
