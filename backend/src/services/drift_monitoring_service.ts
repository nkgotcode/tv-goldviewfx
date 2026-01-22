import { loadRlServiceConfig } from "../config/rl_service";
import { insertDriftAlert } from "../db/repositories/drift_alerts";
import { listEvaluationReports } from "../db/repositories/evaluation_reports";
import { listAgentRuns } from "../db/repositories/agent_runs";
import { rlServiceClient } from "../rl/client";
import { fallbackRunToLastPromoted } from "./rl_agent_service";

const DEFAULT_DRIFT_THRESHOLD = 0.1;

function resolveMetricValue(report: any, metric: string) {
  if (!report) return null;
  if (metric === "win_rate") return Number(report.win_rate ?? 0);
  if (metric === "max_drawdown") return Number(report.max_drawdown ?? 0);
  if (metric === "net_pnl_after_fees") return Number(report.net_pnl_after_fees ?? 0);
  return null;
}

export async function evaluateDriftForLatestReport(params: {
  agentId: string;
  agentVersionId: string;
  metric?: "win_rate" | "max_drawdown" | "net_pnl_after_fees";
  threshold?: number;
}) {
  const reports = await listEvaluationReports(params.agentVersionId);
  if (reports.length < 2) {
    return null;
  }

  const current = reports[0];
  const baseline = reports[1];
  const metric = params.metric ?? "win_rate";
  const baselineValue = resolveMetricValue(baseline, metric);
  const currentValue = resolveMetricValue(current, metric);
  if (baselineValue === null || currentValue === null) {
    return null;
  }

  const threshold = params.threshold ?? DEFAULT_DRIFT_THRESHOLD;
  const config = loadRlServiceConfig();
  const driftResult = config.mock
    ? {
        drifted: Math.abs(currentValue - baselineValue) >= threshold,
        metric,
        baselineValue,
        currentValue,
        delta: currentValue - baselineValue,
      }
    : await rlServiceClient.checkDrift({
        agentId: params.agentId,
        metric,
        baselineValue,
        currentValue,
        threshold,
      });

  if (!driftResult.drifted) {
    return null;
  }

  const liveRuns = await listAgentRuns({ status: "running", mode: "live" });
  let actionTaken: string | null = null;
  if (liveRuns.length > 0) {
    await fallbackRunToLastPromoted(liveRuns[0].id);
    actionTaken = "fallback_last_promoted";
  }

  return insertDriftAlert({
    agent_id: params.agentId,
    detected_at: new Date().toISOString(),
    metric,
    baseline_value: baselineValue,
    current_value: currentValue,
    status: "open",
    action_taken: actionTaken,
  });
}
