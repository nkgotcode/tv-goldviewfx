import { test, expect } from "bun:test";
import { insertRiskLimitSet } from "../../src/db/repositories/risk_limit_sets";
import { insertAgentVersion } from "../../src/db/repositories/agent_versions";
import { insertDatasetVersion } from "../../src/db/repositories/dataset_versions";
import { insertFeatureSetVersion } from "../../src/db/repositories/feature_set_versions";
import { rlApiRequest } from "../fixtures/rl_api";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";
import { BINGX_SOURCE_TYPES } from "../../src/services/data_source_status_service";

const hasEnv = Boolean(process.env.CONVEX_URL);

function buildCandles() {
  const now = Date.now();
  const base = 2000;
  const step = 1;
  return Array.from({ length: 6 }).map((_, idx) => ({
    timestamp: new Date(now - (6 - idx) * 60000).toISOString(),
    open: base + step * idx,
    high: base + step * idx + 1,
    low: base + step * idx - 1,
    close: base + step * idx + 0.5,
    volume: 100 + idx,
  }));
}

if (!hasEnv) {
  test.skip("provenance gate requires Convex configuration", () => {});
} else {
  test("decision pipeline blocks without artifact provenance", async () => {
    const original = process.env.RL_ENFORCE_PROVENANCE;
    process.env.RL_ENFORCE_PROVENANCE = "true";

    try {
      const riskLimit = await insertRiskLimitSet({
        name: `Provenance Limits ${Date.now()}`,
        max_position_size: 1.0,
        leverage_cap: 3,
        max_daily_loss: 200,
        max_drawdown: 300,
        max_open_positions: 10,
        active: true,
      });

      await insertAgentVersion({
        name: `Provenance Version ${Date.now()}`,
        status: "promoted",
      });

      const featureSet = await insertFeatureSetVersion({
        label: `Provenance Feature Set ${Date.now()}`,
        description: "Feature set for provenance gate test",
      });

      const dataset = await insertDatasetVersion({
        pair: "Gold-USDT",
        interval: "1m",
        start_at: new Date(Date.now() - 3600000).toISOString(),
        end_at: new Date().toISOString(),
        checksum: `chk-${Date.now()}`,
        dataset_hash: `hash-${Date.now()}`,
        window_size: 30,
        stride: 1,
        feature_set_version_id: featureSet.id,
      });

      const now = new Date().toISOString();
      await Promise.all(
        BINGX_SOURCE_TYPES.map((sourceType) =>
          upsertDataSourceStatus({
            pair: "Gold-USDT",
            source_type: sourceType,
            last_seen_at: now,
            freshness_threshold_seconds: 120,
            status: "ok",
          }),
        ),
      );

      const startResponse = await rlApiRequest("/agents/gold-rl-agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "live",
          pair: "Gold-USDT",
          riskLimitSetId: riskLimit.id,
          learningEnabled: true,
          learningWindowMinutes: 30,
          datasetVersionId: dataset.id,
        }),
      });

      const run = await startResponse.json();
      expect(startResponse.status).toBe(200);

      const decisionResponse = await rlApiRequest(`/agents/gold-rl-agent/runs/${run.id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: { candles: buildCandles(), lastPrice: 2302.5, spread: 0.5 },
          ideas: [{ source: "ideas", timestamp: new Date().toISOString(), score: 0.4 }],
        }),
      });

      expect(decisionResponse.status).toBe(200);
      const result = await decisionResponse.json();
      expect(result.decision.action).toBe("hold");
      expect(result.decision.reason).toBe("provenance_artifact_missing");
    } finally {
      if (original === undefined) {
        delete process.env.RL_ENFORCE_PROVENANCE;
      } else {
        process.env.RL_ENFORCE_PROVENANCE = original;
      }
    }
  });
}
