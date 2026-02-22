import { test, expect } from "bun:test";
import { rlApiRequest } from "../fixtures/rl_api";
import { startAgentRun } from "../../src/services/rl_agent_service";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("data quality routes require Convex configuration", () => {});
} else {
  test("data quality status endpoint returns metrics", async () => {
    const response = await rlApiRequest("/data-quality/status?pair=Gold-USDT", { method: "GET" });
    expect(response.status).toBe(200);
    const metrics = await response.json();
    expect(Array.isArray(metrics)).toBe(true);
  });

  test("data quality gate blocks run when critical sources fail", async () => {
    await upsertDataSourceStatus({
      pair: "Gold-USDT",
      source_type: "bingx_candles",
      last_seen_at: null,
      freshness_threshold_seconds: 60,
      status: "unavailable",
    });

    let error: Error | null = null;
    try {
      await startAgentRun({
        mode: "paper",
        pair: "Gold-USDT",
        riskLimitSetId: "11111111-1111-4111-8111-111111111111",
        learningEnabled: true,
        learningWindowMinutes: 30,
      });
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeTruthy();
    expect(error?.message ?? "").toContain("Data quality gate failed");
  });
}
