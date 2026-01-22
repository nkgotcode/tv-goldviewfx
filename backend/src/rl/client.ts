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
} from "../types/rl";

export class RlServiceClient {
  constructor(private readonly config = loadRlServiceConfig()) {}

  async health(): Promise<HealthResponse> {
    return this.getJson(this.config.healthPath);
  }

  async infer(payload: InferenceRequest): Promise<InferenceResponse> {
    return this.postJson("/inference", payload);
  }

  async evaluate(payload: EvaluationRequest): Promise<EvaluationReport> {
    return this.postJson("/evaluations", payload);
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
