import { loadEnv } from "../config/env";

type CandleLike = {
  timestamp?: string;
  close?: number;
};

export type FeatureQualityGateInput = {
  features: Record<string, number> | null | undefined;
  candles: CandleLike[];
  criticalFields: string[];
};

export type FeatureQualityGateResult = {
  allowed: boolean;
  reason?: string | null;
  missingFields: string[];
  missingCount: number;
  oodScore: number;
  freshnessSeconds: number | null;
};

function calcZScore(values: number[]) {
  if (values.length < 3) return 0;
  const last = values[values.length - 1] ?? 0;
  const sample = values.slice(0, -1);
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sample.length;
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std <= 1e-12) return 0;
  return Math.abs((last - mean) / std);
}

export function evaluateFeatureQualityGate(input: FeatureQualityGateInput): FeatureQualityGateResult {
  const env = loadEnv();
  const features = input.features ?? {};
  const missingFields = input.criticalFields.filter((field) => {
    const value = features[field];
    return value === undefined || value === null || Number.isNaN(value);
  });
  const missingCount = missingFields.length;
  const closes = input.candles
    .map((candle) => Number(candle.close))
    .filter((value) => Number.isFinite(value)) as number[];
  const oodScore = calcZScore(closes);

  const lastTimestamp = input.candles[input.candles.length - 1]?.timestamp;
  const freshnessSeconds = lastTimestamp
    ? Math.max(0, Math.floor((Date.now() - new Date(lastTimestamp).getTime()) / 1000))
    : null;

  if (missingCount > env.RL_FEATURE_MAX_MISSING_CRITICAL) {
    return {
      allowed: false,
      reason: "feature_missing_critical",
      missingFields,
      missingCount,
      oodScore,
      freshnessSeconds,
    };
  }
  if (oodScore > env.RL_FEATURE_OOD_ZSCORE_LIMIT) {
    return {
      allowed: false,
      reason: "feature_ood_detected",
      missingFields,
      missingCount,
      oodScore,
      freshnessSeconds,
    };
  }
  if (freshnessSeconds !== null && freshnessSeconds > env.RL_FEATURE_MAX_FRESHNESS_SEC) {
    return {
      allowed: false,
      reason: "feature_stale",
      missingFields,
      missingCount,
      oodScore,
      freshnessSeconds,
    };
  }
  return {
    allowed: true,
    reason: null,
    missingFields,
    missingCount,
    oodScore,
    freshnessSeconds,
  };
}
