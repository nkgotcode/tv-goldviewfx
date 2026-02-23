import { createHash, randomUUID } from "node:crypto";
import { insertAgentVersion, getAgentVersion } from "../db/repositories/agent_versions";
import { getDatasetVersion } from "../db/repositories/dataset_versions";
import { buildDatasetFeatures, createDatasetVersion } from "./dataset_service";
import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { TrainingRequest, TrainingResponse, TradingPair } from "../types/rl";
import { storeModelArtifact } from "./model_artifact_service";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById } from "./feature_set_service";

export type TrainingRunInput = {
  pair: TradingPair;
  periodStart: string;
  periodEnd: string;
  interval?: string | null;
  contextIntervals?: string[] | null;
  datasetVersionId?: string | null;
  featureSetVersionId?: string | null;
  windowSize?: number;
  stride?: number;
  timesteps?: number;
  seed?: number | null;
};

function extractContextFeatureKeys(rows: Array<Record<string, unknown>>) {
  const keys = new Set<string>();
  const sampleCount = Math.min(rows.length, 200);
  for (let index = 0; index < sampleCount; index += 1) {
    const row = rows[index];
    for (const key of Object.keys(row)) {
      if (!key.startsWith("ctx_")) continue;
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}

export type TrainingRunResult = {
  agentVersion: Record<string, unknown>;
  datasetVersion: Record<string, unknown>;
  artifact: Record<string, unknown>;
};

function buildMockTrainingResponse(timesteps: number): TrainingResponse {
  const payload = Buffer.from(`mock-rl-artifact-${timesteps}`, "utf-8");
  const checksum = createHash("sha256").update(payload).digest("hex");
  return {
    artifactBase64: payload.toString("base64"),
    artifactChecksum: checksum,
    artifactSizeBytes: payload.length,
    algorithmLabel: "PPO",
    hyperparameterSummary: `timesteps=${timesteps}`,
  };
}

function normalizeTrainingResponse(payload: TrainingResponse & Record<string, unknown>): TrainingResponse {
  return {
    artifactBase64: (payload.artifactBase64 ?? payload.artifact_base64) as string,
    artifactChecksum: (payload.artifactChecksum ?? payload.artifact_checksum) as string,
    artifactSizeBytes: (payload.artifactSizeBytes ?? payload.artifact_size_bytes) as number,
    algorithmLabel: (payload.algorithmLabel ?? payload.algorithm_label) as string,
    hyperparameterSummary: (payload.hyperparameterSummary ?? payload.hyperparameter_summary) as string,
  };
}

function decodeArtifact(base64Payload: string, expectedChecksum?: string | null) {
  const buffer = Buffer.from(base64Payload, "base64");
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (expectedChecksum && checksum !== expectedChecksum) {
    throw new Error("Artifact checksum mismatch");
  }
  return { buffer, checksum };
}

function buildCostModelFingerprint(input: {
  leverage: number;
  takerFeeBps: number;
  slippageBps: number;
  fundingWeight: number;
  drawdownPenalty: number;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function runTraining(input: TrainingRunInput): Promise<TrainingRunResult> {
  const env = loadEnv();
  const windowSize = input.windowSize ?? 30;
  const stride = input.stride ?? 1;
  const timesteps = input.timesteps ?? 500;

  const dataset = input.datasetVersionId
    ? await getDatasetVersion(input.datasetVersionId)
    : await createDatasetVersion({
        pair: input.pair,
        interval: input.interval ?? "1m",
        contextIntervals: input.contextIntervals ?? [],
        startAt: input.periodStart,
        endAt: input.periodEnd,
        featureSetVersionId: input.featureSetVersionId ?? null,
        windowSize,
        stride,
      });
  const featureSetVersionId = input.featureSetVersionId ?? dataset.feature_set_version_id ?? null;
  const featureSchemaFingerprint =
    (dataset as Record<string, unknown>).feature_schema_fingerprint ??
    getFeatureSchemaFingerprint(await getFeatureSetConfigById(featureSetVersionId));

  const datasetFeatures = await buildDatasetFeatures({
    pair: input.pair,
    interval: dataset.interval,
    contextIntervals: input.contextIntervals ?? [],
    startAt: dataset.start_at,
    endAt: dataset.end_at,
    windowSize: dataset.window_size ?? windowSize,
    stride: dataset.stride ?? stride,
    featureSetVersionId,
    featureSchemaFingerprint: featureSchemaFingerprint as string,
  });
  const featureKeyExtras = extractContextFeatureKeys(datasetFeatures as Array<Record<string, unknown>>);

  if (datasetFeatures.length === 0) {
    throw new Error("No dataset features available for training");
  }

  const config = loadRlServiceConfig();
  const trainingRequest: TrainingRequest = {
    pair: input.pair,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    interval: dataset.interval,
    contextIntervals: input.contextIntervals ?? [],
    datasetVersionId: dataset.id,
    featureSetVersionId,
    datasetHash: dataset.dataset_hash ?? dataset.checksum ?? null,
    windowSize: dataset.window_size ?? windowSize,
    stride: dataset.stride ?? stride,
    leverage: env.RL_PPO_LEVERAGE_DEFAULT,
    takerFeeBps: env.RL_PPO_TAKER_FEE_BPS,
    slippageBps: env.RL_PPO_SLIPPAGE_BPS,
    fundingWeight: env.RL_PPO_FUNDING_WEIGHT,
    drawdownPenalty: env.RL_PPO_DRAWDOWN_PENALTY,
    feedbackRounds: env.RL_PPO_FEEDBACK_ROUNDS,
    feedbackTimesteps: env.RL_PPO_FEEDBACK_TIMESTEPS,
    feedbackHardRatio: env.RL_PPO_FEEDBACK_HARD_RATIO,
    timesteps,
    seed: input.seed ?? null,
    featureSchemaFingerprint: featureSchemaFingerprint as string,
    featureKeyExtras,
    datasetFeatures,
  };

  const rawResponse = config.mock ? buildMockTrainingResponse(timesteps) : await rlServiceClient.train(trainingRequest);
  const trainingResponse = normalizeTrainingResponse(rawResponse as TrainingResponse & Record<string, unknown>);
  const artifact = decodeArtifact(trainingResponse.artifactBase64, trainingResponse.artifactChecksum);
  const costModel = {
    leverage: env.RL_PPO_LEVERAGE_DEFAULT,
    takerFeeBps: env.RL_PPO_TAKER_FEE_BPS,
    slippageBps: env.RL_PPO_SLIPPAGE_BPS,
    fundingWeight: env.RL_PPO_FUNDING_WEIGHT,
    drawdownPenalty: env.RL_PPO_DRAWDOWN_PENALTY,
  };
  const costModelFingerprint = buildCostModelFingerprint(costModel);

  const version = await insertAgentVersion({
    name: `RL ${input.pair} ${randomUUID().slice(0, 8)}`,
    training_window_start: input.periodStart,
    training_window_end: input.periodEnd,
    algorithm_label: trainingResponse.algorithmLabel,
    hyperparameter_summary: `${trainingResponse.hyperparameterSummary};cost_model=${costModelFingerprint};taker_fee_bps=${costModel.takerFeeBps};slippage_bps=${costModel.slippageBps};funding_weight=${costModel.fundingWeight};drawdown_penalty=${costModel.drawdownPenalty}`,
    dataset_version_id: dataset.id,
    dataset_hash: dataset.dataset_hash ?? dataset.checksum ?? null,
    feature_set_version_id: featureSetVersionId,
    status: "evaluating",
  });

  const storedArtifact = await storeModelArtifact({
    agentVersionId: version.id,
    payload: artifact.buffer,
    contentType: "application/zip",
    trainingWindowStart: input.periodStart,
    trainingWindowEnd: input.periodEnd,
    expectedChecksum: artifact.checksum,
  });

  const updatedVersion = await getAgentVersion(version.id);

  return {
    agentVersion: updatedVersion,
    datasetVersion: dataset,
    artifact: storedArtifact,
  };
}
