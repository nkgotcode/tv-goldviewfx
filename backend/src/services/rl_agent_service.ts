import { insertAgentRun, listAgentRuns, updateAgentRun, getAgentRun } from "../db/repositories/agent_runs";
import { listAgentVersions } from "../db/repositories/agent_versions";
import { getAgentConfig } from "../db/repositories/agent_config";
import { getLatestEvaluationReport } from "../db/repositories/evaluation_reports";
import { fetchRiskLimitSet } from "./risk_limits_service";
import { evaluateDataQualityGate } from "./data_quality_service";
import { fallbackToLastPromotedVersion } from "./agent_version_service";
import { isSupportedPair, resolveSupportedPair } from "../config/market_catalog";
import { assertInstrumentAllowed } from "./instrument_policy";

const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

export type StartRunInput = {
  mode: "paper" | "live";
  pair: string;
  riskLimitSetId: string;
  learningEnabled?: boolean;
  learningWindowMinutes?: number | null;
  datasetVersionId?: string | null;
  featureSetVersionId?: string | null;
};

type PromotionGateStatus = "pass" | "fail" | "unknown";

function shouldEnforcePromotionGate(config: Record<string, unknown>) {
  const required = Boolean(config.promotion_required);
  const thresholds = [
    config.promotion_min_trades,
    config.promotion_min_win_rate,
    config.promotion_min_net_pnl,
    config.promotion_max_drawdown,
  ].map((value) => Number(value ?? 0));
  return required || thresholds.some((value) => value > 0);
}

function passesPromotionGate(report: any, config: Record<string, unknown>) {
  if (!report) return false;
  const minTrades = Number(config.promotion_min_trades ?? 0);
  const minWinRate = Number(config.promotion_min_win_rate ?? 0);
  const minNetPnl = Number(config.promotion_min_net_pnl ?? 0);
  const maxDrawdown = Number(config.promotion_max_drawdown ?? 0);

  if (minTrades && Number(report.trade_count ?? 0) < minTrades) return false;
  if (minWinRate && Number(report.win_rate ?? 0) < minWinRate) return false;
  if (minNetPnl && Number(report.net_pnl_after_fees ?? 0) < minNetPnl) return false;
  if (maxDrawdown && Number(report.max_drawdown ?? 0) > maxDrawdown) return false;
  return true;
}

async function resolvePromotionGateStatus(agentVersionId?: string | null): Promise<PromotionGateStatus> {
  const config = await getAgentConfig();
  if (!shouldEnforcePromotionGate(config)) {
    return "pass";
  }
  if (!agentVersionId) {
    return "unknown";
  }
  const report = await getLatestEvaluationReport({ agentVersionId });
  if (!report) {
    return "unknown";
  }
  return passesPromotionGate(report, config) ? "pass" : "fail";
}

export async function startAgentRun(input: StartRunInput) {
  const pair = resolveSupportedPair(input.pair) ?? input.pair;
  if (!isSupportedPair(pair)) {
    throw new Error(`Unsupported pair: ${input.pair}`);
  }

  const config = await getAgentConfig();
  assertInstrumentAllowed(pair, config.allowed_instruments ?? []);

  await fetchRiskLimitSet(input.riskLimitSetId);

  const qualityGate = await evaluateDataQualityGate(pair);
  if (!qualityGate.allowed) {
    throw new Error(`Data quality gate failed: ${qualityGate.blockingSources.join(", ")}`);
  }

  const simulationFlag = (process.env.ALLOW_LIVE_SIMULATION ?? "").toLowerCase();
  const allowLiveOverride =
    E2E_RUN_ENABLED || process.env.NODE_ENV === "test" || ["1", "true", "yes", "on"].includes(simulationFlag);

  assertInstrumentAllowed(pair, config.allowed_instruments ?? []);

  if (input.mode === "live" && config.kill_switch && !allowLiveOverride) {
    throw new Error("Kill switch enabled");
  }

  const existing = await listAgentRuns({ pair });
  const active = existing.find((run) => run.status !== "stopped");
  if (active) {
    const simulationFlag = (process.env.ALLOW_LIVE_SIMULATION ?? "").toLowerCase();
    const allowOverride = process.env.NODE_ENV === "test" || ["1", "true", "yes", "on"].includes(simulationFlag);
    if (allowOverride) {
      await updateAgentRun(active.id, { status: "stopped", stopped_at: new Date().toISOString() });
    } else {
      throw new Error(`Run already active for ${pair}`);
    }
  }

  const promotedVersions = await listAgentVersions({ status: "promoted" });
  const activeVersion = promotedVersions[0] ?? (await listAgentVersions())[0];
  if (!activeVersion) {
    throw new Error("No agent versions available");
  }

  if (input.mode === "live" && shouldEnforcePromotionGate(config) && !allowLiveOverride) {
    const report = await getLatestEvaluationReport({ agentVersionId: activeVersion.id });
    if (!passesPromotionGate(report, config)) {
      throw new Error("Promotion gate failed");
    }
  }

  return insertAgentRun({
    mode: input.mode,
    pair,
    status: "running",
    started_at: new Date().toISOString(),
    learning_enabled: input.learningEnabled ?? true,
    learning_window_minutes: input.learningWindowMinutes ?? null,
    agent_version_id: activeVersion.id,
    risk_limit_set_id: input.riskLimitSetId,
    dataset_version_id: input.datasetVersionId ?? null,
    feature_set_version_id: input.featureSetVersionId ?? null,
  });
}

export async function pauseAgentRun(runId: string) {
  const run = await getAgentRun(runId);
  if (run.status === "paused") {
    return run;
  }
  if (run.status !== "running") {
    throw new Error("Run must be running to pause");
  }
  return updateAgentRun(runId, { status: "paused" });
}

export async function resumeAgentRun(runId: string) {
  const run = await getAgentRun(runId);
  if (run.status !== "paused") {
    throw new Error("Run must be paused to resume");
  }
  return updateAgentRun(runId, { status: "running" });
}

export async function stopAgentRun(runId: string) {
  const run = await getAgentRun(runId);
  if (run.status === "stopped") {
    return run;
  }
  return updateAgentRun(runId, { status: "stopped", stopped_at: new Date().toISOString() });
}

export async function listRuns(pair?: StartRunInput["pair"]) {
  return listAgentRuns(pair ? { pair } : undefined);
}

export async function getRun(runId: string) {
  return getAgentRun(runId);
}

export async function getAgentStatus() {
  const runs = await listAgentRuns();
  const currentRun = runs.find((run) => run.status !== "stopped") ?? runs[0] ?? null;
  const versions = await listAgentVersions({ status: "promoted" });
  const activeVersion = versions[0] ?? null;
  const promotionGateStatus = await resolvePromotionGateStatus(activeVersion?.id ?? null);
  const config = await getAgentConfig();
  return {
    currentRun,
    activeVersion,
    killSwitchEnabled: config.kill_switch,
    promotionGateStatus,
  };
}

export async function updateRunConfig(runId: string, payload: {
  learningEnabled?: boolean;
  learningWindowMinutes?: number | null;
  riskLimitSetId?: string;
}) {
  return updateAgentRun(runId, {
    learning_enabled: payload.learningEnabled,
    learning_window_minutes: payload.learningWindowMinutes,
    risk_limit_set_id: payload.riskLimitSetId,
  });
}

export async function fallbackRunToLastPromoted(runId: string) {
  const run = await getAgentRun(runId);
  const version = await fallbackToLastPromotedVersion();
  if (run.agent_version_id === version.id) {
    return run;
  }
  return updateAgentRun(run.id, { agent_version_id: version.id });
}
