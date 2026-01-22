import { loadEnv } from "../config/env";
import { getIngestionConfig } from "../db/repositories/ingestion_configs";
import { getLatestIngestionRun, markIngestionRunFailed } from "../db/repositories/ingestion_runs";

export type IngestionControlDecision = {
  allowed: boolean;
  reason?: string;
  nextRunAt?: string | null;
};

function computeBackoffSeconds(base: number, max: number, errorCount: number) {
  if (base <= 0) return 0;
  const exponent = Math.max(0, errorCount - 1);
  const backoff = base * Math.pow(2, exponent);
  return Math.min(backoff, max);
}

export async function shouldRunIngestion(params: {
  sourceType: string;
  sourceId?: string | null;
  feed?: string | null;
  trigger: "manual" | "schedule" | string;
}): Promise<IngestionControlDecision> {
  if (params.trigger === "manual") {
    return { allowed: true };
  }

  const env = loadEnv();
  const config = await getIngestionConfig(params.sourceType, params.sourceId ?? null, params.feed ?? null);
  if (config && !config.enabled) {
    return { allowed: false, reason: "paused" };
  }

  const defaultRefresh =
    params.sourceType === "bingx"
      ? env.BINGX_MARKET_DATA_INTERVAL_MIN * 60
      : env.INGESTION_DEFAULT_REFRESH_SECONDS;
  const refreshInterval = config?.refresh_interval_seconds ?? defaultRefresh;
  const lastRun = await getLatestIngestionRun(params.sourceType, params.sourceId ?? null, params.feed ?? null);
  if (lastRun?.status === "running") {
    const timeoutMin = env.INGESTION_RUN_TIMEOUT_MIN;
    const startedAt = lastRun.started_at ? new Date(lastRun.started_at).getTime() : 0;
    if (timeoutMin > 0 && startedAt > 0) {
      const timeoutMs = timeoutMin * 60 * 1000;
      if (Date.now() - startedAt > timeoutMs) {
        await markIngestionRunFailed(lastRun.id, "timeout");
      } else {
        return { allowed: false, reason: "running", nextRunAt: lastRun.started_at ?? null };
      }
    } else {
      return { allowed: false, reason: "running", nextRunAt: lastRun.started_at ?? null };
    }
  }
  const lastRunAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;
  if (lastRunAt && refreshInterval && refreshInterval > 0) {
    const lastTime = new Date(lastRunAt).getTime();
    if (!Number.isNaN(lastTime)) {
      const nextRunAt = new Date(lastTime + refreshInterval * 1000);
      if (Date.now() < nextRunAt.getTime()) {
        return { allowed: false, reason: "interval", nextRunAt: nextRunAt.toISOString() };
      }
    }
  }

  const backoffBase = config?.backoff_base_seconds ?? env.INGESTION_DEFAULT_BACKOFF_BASE_SECONDS;
  const backoffMax = config?.backoff_max_seconds ?? env.INGESTION_DEFAULT_BACKOFF_MAX_SECONDS;
  if (lastRun && lastRun.status === "failed") {
    const backoffSeconds = computeBackoffSeconds(backoffBase ?? 0, backoffMax ?? 0, lastRun.error_count ?? 1);
    if (backoffSeconds > 0) {
      const lastTime = new Date(lastRunAt ?? new Date().toISOString()).getTime();
      const retryAt = new Date(lastTime + backoffSeconds * 1000);
      if (Date.now() < retryAt.getTime()) {
        return { allowed: false, reason: "backoff", nextRunAt: retryAt.toISOString() };
      }
    }
  }

  return { allowed: true };
}
