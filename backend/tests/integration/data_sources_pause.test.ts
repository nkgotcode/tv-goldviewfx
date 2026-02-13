import { test, expect } from "bun:test";
import { insertAgentRun, getAgentRun } from "../../src/db/repositories/agent_runs";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";
import { runDataSourceMonitor } from "../../src/jobs/data_source_monitor";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("data source monitor requires Convex configuration", () => {});
} else {
  test("data source monitor pauses runs when sources are stale", async () => {
    const run = await insertAgentRun({
      mode: "paper",
      pair: "Gold-USDT",
      status: "running",
      learning_enabled: true,
      agent_version_id: "22222222-2222-4222-8222-222222222222",
      risk_limit_set_id: "11111111-1111-4111-8111-111111111111",
    });

    await upsertDataSourceStatus({
      pair: "Gold-USDT",
      source_type: "bingx_candles",
      last_seen_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      freshness_threshold_seconds: 60,
      status: "ok",
    });

    await runDataSourceMonitor();

    const updated = await getAgentRun(run.id);
    expect(updated.status).toBe("paused");
  });
}
