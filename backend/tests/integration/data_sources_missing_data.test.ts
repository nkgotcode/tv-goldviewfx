import { test, expect } from "bun:test";
import { insertAgentRun, getAgentRun } from "../../src/db/repositories/agent_runs";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";
import { runDecisionPipeline } from "../../src/services/rl_decision_pipeline";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("data source gating requires database configuration", () => {});
} else {
  test("decision pipeline pauses when required market data is unavailable", async () => {
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
      last_seen_at: null,
      freshness_threshold_seconds: 60,
      status: "unavailable",
    });

    await runDecisionPipeline({
      runId: run.id,
      market: {
        candles: [
          {
            timestamp: new Date(Date.now() - 120000).toISOString(),
            open: 2300,
            high: 2302,
            low: 2298,
            close: 2301,
            volume: 100,
          },
          {
            timestamp: new Date().toISOString(),
            open: 2301,
            high: 2303,
            low: 2299,
            close: 2302,
            volume: 120,
          },
        ],
        lastPrice: 2302,
        spread: 0.4,
      },
    });

    const updated = await getAgentRun(run.id);
    expect(updated.status).toBe("paused");
  });
}
