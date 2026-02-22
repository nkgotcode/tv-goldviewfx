import { expect, test } from "bun:test";
import { insertAgentVersion } from "../../src/db/repositories/agent_versions";
import { runLearningUpdateFromReport } from "../../src/jobs/learning_updates";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("online learning challenger tests require database configuration", () => {});
} else {
  test("challenger promotion stores delta decision fields", async () => {
    const champion = await insertAgentVersion({
      name: `Champion ${Date.now()}`,
      status: "promoted",
      artifact_uri: "convex://models/champion",
    });
    const challenger = await insertAgentVersion({
      name: `Challenger ${Date.now()}`,
      status: "evaluating",
      artifact_uri: "convex://models/challenger",
    });
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date().toISOString();

    const update = await runLearningUpdateFromReport({
      report: {
        id: `report-${Date.now()}`,
        agent_version_id: challenger.id,
        pair: "Gold-USDT",
        period_start: windowStart,
        period_end: windowEnd,
        win_rate: 0.62,
        net_pnl_after_fees: 140,
        max_drawdown: 0.18,
        trade_count: 55,
        status: "pass",
      },
      championReport: {
        id: `champ-${Date.now()}`,
        win_rate: 0.59,
        net_pnl_after_fees: 120,
        max_drawdown: 0.19,
        trade_count: 54,
      },
      rollbackVersionId: champion.id,
    });

    expect(update.status).toBe("succeeded");
    expect(update.promoted).toBe(true);
    expect(Array.isArray(update.decision_reasons)).toBe(true);
    expect(typeof update.metric_deltas).toBe("object");
    expect(Number((update.metric_deltas as any).netPnlDelta)).toBeGreaterThan(0);
  });
}
