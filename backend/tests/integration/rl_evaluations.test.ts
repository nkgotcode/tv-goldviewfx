import { test, expect } from "bun:test";
import { insertAgentVersion } from "../../src/db/repositories/agent_versions";
import { rlApiRequest } from "../fixtures/rl_api";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("rl evaluations require database configuration", () => {});
} else {
  test("evaluation workflow persists reports", async () => {
    const version = await insertAgentVersion({
      name: `Eval Version ${Date.now()}`,
      status: "promoted",
      artifact_uri: "convex://models/eval",
    });

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 30 * 60 * 60 * 1000);

    const response = await rlApiRequest("/agents/gold-rl-agent/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair: "Gold-USDT",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        agentVersionId: version.id,
      }),
    });

    expect(response.status).toBe(202);
    const report = await response.json();
    expect(report.agent_version_id).toBe(version.id);
    expect(report.pair).toBe("Gold-USDT");
    expect(report.trade_count).toBeGreaterThan(0);
    expect(report.dataset_hash).toBeTruthy();
    expect(report.artifact_uri).toBeTruthy();

    const listResponse = await rlApiRequest(`/agents/gold-rl-agent/evaluations?agentVersionId=${version.id}`);
    expect(listResponse.status).toBe(200);
    const reports = await listResponse.json();
    expect(Array.isArray(reports)).toBe(true);
  });
}
