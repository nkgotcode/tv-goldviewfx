import { listAgentRuns } from "../db/repositories/agent_runs";
import { pauseAgentRun } from "../services/rl_agent_service";
import {
  evaluateDataSourceGate,
  listDataSourceStatusWithConfig,
  recordDataSourceStatus,
} from "../services/data_source_status_service";
import { logInfo, logWarn } from "../services/logger";

export async function runDataSourceMonitor() {
  const statuses = await listDataSourceStatusWithConfig();

  await Promise.all(
    statuses.map((status) =>
      recordDataSourceStatus({
        pair: status.pair,
        sourceType: status.sourceType,
        lastSeenAt: status.lastSeenAt,
        freshnessThresholdSeconds: status.freshnessThresholdSeconds,
      }),
    ),
  );

  const pairs = Array.from(new Set(statuses.map((status) => status.pair)));
  for (const pair of pairs) {
    const gate = await evaluateDataSourceGate(pair);
    if (!gate.allowed) {
      const runs = await listAgentRuns({ pair, status: "running" });
      for (const run of runs) {
        await pauseAgentRun(run.id);
        logWarn("Paused run due to stale data sources", {
          run_id: run.id,
          pair,
          blocking_sources: gate.blockingSources,
        });
      }
    } else {
      logInfo("Data sources healthy", { pair });
    }
  }
}
