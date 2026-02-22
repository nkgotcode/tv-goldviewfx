import { loadRlServiceConfig } from "../config/rl_service";
import type {
  DatasetPreviewRequest,
  DatasetPreviewResponse,
  DriftCheckRequest,
  DriftCheckResponse,
  EvaluationRequest,
  EvaluationReport,
  HealthResponse,
  InferenceRequest,
  InferenceResponse,
  TrainingRequest,
  TrainingResponse,
} from "../types/rl";

export class RlServiceClient {
  constructor(private readonly config = loadRlServiceConfig()) {}

  async health(): Promise<HealthResponse> {
    return this.getJson(this.config.healthPath);
  }

  async infer(payload: InferenceRequest): Promise<InferenceResponse> {
    return this.postJson("/inference", {
      run_id: payload.runId,
      pair: payload.pair,
      market: {
        pair: payload.market.pair,
        candles: payload.market.candles,
        last_price: payload.market.lastPrice,
        spread: payload.market.spread,
      },
      ideas: payload.ideas ?? [],
      signals: payload.signals ?? [],
      news: payload.news ?? [],
      ocr: payload.ocr ?? [],
      recent_trades: (payload.recentTrades ?? []).map((trade) => ({
        executed_at: trade.executedAt,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
      })),
      risk_limits: payload.riskLimits
        ? {
            max_position_size: payload.riskLimits.maxPositionSize,
            leverage_cap: payload.riskLimits.leverageCap,
            max_daily_loss: payload.riskLimits.maxDailyLoss,
            max_drawdown: payload.riskLimits.maxDrawdown,
            max_open_positions: payload.riskLimits.maxOpenPositions,
          }
        : undefined,
      learning_enabled: payload.learningEnabled ?? true,
      learning_window_minutes: payload.learningWindowMinutes ?? null,
      policy_version: payload.policyVersion ?? null,
      artifact_uri: payload.artifactUri ?? null,
      artifact_checksum: payload.artifactChecksum ?? null,
      artifact_download_url: payload.artifactDownloadUrl ?? null,
      artifact_base64: payload.artifactBase64 ?? null,
      feature_schema_fingerprint: payload.featureSchemaFingerprint ?? null,
    });
  }

  async evaluate(payload: EvaluationRequest): Promise<EvaluationReport> {
    return this.postJson("/evaluations", {
      pair: payload.pair,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      agent_version_id: payload.agentVersionId ?? null,
      dataset_version_id: payload.datasetVersionId ?? null,
      feature_set_version_id: payload.featureSetVersionId ?? null,
      dataset_hash: payload.datasetHash ?? null,
      artifact_uri: payload.artifactUri ?? null,
      artifact_checksum: payload.artifactChecksum ?? null,
      artifact_download_url: payload.artifactDownloadUrl ?? null,
      artifact_base64: payload.artifactBase64 ?? null,
      decision_threshold: payload.decisionThreshold ?? null,
      window_size: payload.windowSize ?? null,
      stride: payload.stride ?? null,
      leverage: payload.leverage ?? null,
      taker_fee_bps: payload.takerFeeBps ?? null,
      slippage_bps: payload.slippageBps ?? null,
      funding_weight: payload.fundingWeight ?? null,
      drawdown_penalty: payload.drawdownPenalty ?? null,
      walk_forward: payload.walkForward
        ? {
            folds: payload.walkForward.folds,
            purge_bars: payload.walkForward.purgeBars ?? 0,
            embargo_bars: payload.walkForward.embargoBars ?? 0,
            min_train_bars: payload.walkForward.minTrainBars ?? null,
            strict: payload.walkForward.strict ?? true,
          }
        : null,
      feature_schema_fingerprint: payload.featureSchemaFingerprint ?? null,
      dataset_features: payload.datasetFeatures ?? null,
    });
  }

  async datasetPreview(payload: DatasetPreviewRequest): Promise<DatasetPreviewResponse> {
    return this.postJson("/datasets/preview", {
      pair: payload.pair,
      interval: payload.interval,
      start_at: payload.startAt,
      end_at: payload.endAt,
      window_size: payload.windowSize,
      stride: payload.stride,
      feature_set_version_id: payload.featureSetVersionId,
      feature_schema_fingerprint: payload.featureSchemaFingerprint ?? null,
      features: payload.features,
    });
  }

  async checkDrift(payload: DriftCheckRequest): Promise<DriftCheckResponse> {
    return this.postJson("/monitoring/drift", {
      agent_id: payload.agentId,
      metric: payload.metric,
      baseline_value: payload.baselineValue,
      current_value: payload.currentValue,
      threshold: payload.threshold,
    });
  }

  async train(payload: TrainingRequest): Promise<TrainingResponse> {
    return this.postJson("/training/run", {
      pair: payload.pair,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      dataset_version_id: payload.datasetVersionId ?? null,
      feature_set_version_id: payload.featureSetVersionId ?? null,
      dataset_hash: payload.datasetHash ?? null,
      feature_schema_fingerprint: payload.featureSchemaFingerprint ?? null,
      timesteps: payload.timesteps,
      seed: payload.seed ?? null,
      window_size: payload.windowSize,
      stride: payload.stride,
      leverage: payload.leverage ?? null,
      taker_fee_bps: payload.takerFeeBps ?? null,
      slippage_bps: payload.slippageBps ?? null,
      funding_weight: payload.fundingWeight ?? null,
      drawdown_penalty: payload.drawdownPenalty ?? null,
      feedback_rounds: payload.feedbackRounds ?? null,
      feedback_timesteps: payload.feedbackTimesteps ?? null,
      feedback_hard_ratio: payload.feedbackHardRatio ?? null,
      dataset_features: payload.datasetFeatures ?? null,
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: HeadersInit = {
      ...(init.headers ?? {}),
    };

    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await fetch(`${this.config.url}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`RL service error (${response.status}): ${message}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const rlServiceClient = new RlServiceClient();
