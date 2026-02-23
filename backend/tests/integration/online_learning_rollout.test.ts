import { expect, test } from "bun:test";
import { insertAgentVersion, getAgentVersion } from "../../src/db/repositories/agent_versions";
import { runLearningUpdateFromReport } from "../../src/jobs/learning_updates";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("online learning rollout tests require database configuration", () => {});
} else {
  test("shadow rollout records staged decision and blocks promotion", async () => {
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

    const update = await runLearningUpdateFromReport({
      report: {
        id: `report-${Date.now()}`,
        agent_version_id: challenger.id,
        pair: "Gold-USDT",
        period_start: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
        win_rate: 0.66,
        net_pnl_after_fees: 180,
        max_drawdown: 0.14,
        trade_count: 80,
        status: "pass",
      },
      championReport: {
        id: `champ-${Date.now()}`,
        win_rate: 0.55,
        net_pnl_after_fees: 120,
        max_drawdown: 0.16,
        trade_count: 65,
      },
      rollbackVersionId: champion.id,
      rolloutPolicy: {
        mode: "shadow",
      },
    });

    expect(update.promoted).toBe(false);
    expect(update.decision_reasons).toContain("rollout_stage:shadow");
    expect(update.decision_reasons).toContain("rollout_shadow_only");

    const refreshedChampion = await getAgentVersion(champion.id);
    expect(refreshedChampion.status).toBe("promoted");
  });

  test("canary drawdown breach prevents promotion and keeps rollback target promoted", async () => {
    const champion = await insertAgentVersion({
      name: `Canary Champion ${Date.now()}`,
      status: "promoted",
      artifact_uri: "convex://models/champion-canary",
    });
    const challenger = await insertAgentVersion({
      name: `Canary Challenger ${Date.now()}`,
      status: "evaluating",
      artifact_uri: "convex://models/challenger-canary",
    });

    const update = await runLearningUpdateFromReport({
      report: {
        id: `report-${Date.now()}`,
        agent_version_id: challenger.id,
        pair: "Gold-USDT",
        period_start: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
        win_rate: 0.68,
        net_pnl_after_fees: 220,
        max_drawdown: 0.19,
        trade_count: 120,
        status: "pass",
      },
      championReport: {
        id: `champ-${Date.now()}`,
        win_rate: 0.57,
        net_pnl_after_fees: 150,
        max_drawdown: 0.15,
        trade_count: 100,
      },
      rollbackVersionId: champion.id,
      rolloutPolicy: {
        mode: "canary",
        canaryMinTradeCount: 25,
        canaryMaxDrawdown: 0.12,
      },
    });

    expect(update.promoted).toBe(false);
    expect(update.decision_reasons).toContain("rollout_stage:canary");
    expect(update.decision_reasons).toContain("canary_drawdown_breach");

    const refreshedChampion = await getAgentVersion(champion.id);
    const refreshedChallenger = await getAgentVersion(challenger.id);
    expect(refreshedChampion.status).toBe("promoted");
    expect(refreshedChallenger.status).not.toBe("promoted");
  });
}
