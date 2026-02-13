import { z } from "zod";

export const ideaSchema = z
  .object({
    id: z.string(),
    source_id: z.string(),
    external_id: z.string().nullable().optional(),
    url: z.string(),
    title: z.string(),
    author_handle: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    content_hash: z.string(),
    published_at: z.string().nullable().optional(),
    dedup_status: z.string().optional(),
    enrichments: z
      .array(
        z
          .object({
            sentiment_label: z.string(),
            sentiment_score: z.number(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const tradeSchema = z
  .object({
    id: z.string(),
    instrument: z.string(),
    side: z.string(),
    quantity: z.number(),
    status: z.string(),
    mode: z.string(),
  })
  .passthrough();

export const riskLimitSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    max_position_size: z.number(),
    leverage_cap: z.number(),
    max_daily_loss: z.number(),
    max_drawdown: z.number(),
    max_open_positions: z.number(),
  })
  .passthrough();

export const opsAlertSchema = z
  .object({
    id: z.string().optional(),
    category: z.string(),
    severity: z.string(),
    metric: z.string(),
    value: z.number(),
    status: z.string().optional(),
    triggered_at: z.string().optional(),
  })
  .passthrough();

export const retryQueueSchema = z
  .object({
    id: z.string().optional(),
    job_type: z.string(),
    status: z.string().optional(),
    attempts: z.number().optional(),
    max_attempts: z.number().optional(),
    next_attempt_at: z.string().optional(),
  })
  .passthrough();

export const accountRiskSchema = z
  .object({
    policy: z
      .object({
        id: z.string(),
        name: z.string(),
        max_total_exposure: z.number(),
        max_instrument_exposure: z.number(),
        max_open_positions: z.number(),
        max_daily_loss: z.number(),
        circuit_breaker_loss: z.number(),
        cooldown_minutes: z.number(),
        max_leverage: z.number().optional().nullable(),
        active: z.boolean().optional(),
        effective_from: z.string().optional(),
      })
      .passthrough(),
    state: z
      .object({
        id: z.string(),
        status: z.string(),
        cooldown_until: z.string().nullable().optional(),
        last_triggered_at: z.string().nullable().optional(),
        trigger_reason: z.string().nullable().optional(),
      })
      .passthrough(),
    snapshot: z
      .object({
        exposureByInstrument: z.record(z.string(), z.union([z.number(), z.string()])),
        totalExposure: z.number(),
        openPositions: z.number(),
        dailyLoss: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

export const agentVersionSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    status: z.string().optional(),
    promoted_at: z.string().optional().nullable(),
    artifact_uri: z.string().optional().nullable(),
    artifact_checksum: z.string().optional().nullable(),
  })
  .passthrough();

export const featureSetSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();
