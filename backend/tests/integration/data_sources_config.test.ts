import { test, expect } from "bun:test";
import { rlApiRequest } from "../fixtures/rl_api";
import { listDataSourceConfigs } from "../../src/db/repositories/data_source_configs";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("data source config requires Convex configuration", () => {});
} else {
  test("data source config updates all pairs", async () => {
    const response = await rlApiRequest("/data-sources/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: [{ sourceType: "ideas", enabled: false, freshnessThresholdSeconds: 120 }],
      }),
    });

    expect(response.status).toBe(200);
    const configs = await listDataSourceConfigs();
    const ideasConfigs = configs.filter((config) => config.source_type === "ideas");
    expect(ideasConfigs.length).toBeGreaterThanOrEqual(3);
    for (const config of ideasConfigs) {
      expect(config.enabled).toBe(false);
      expect(config.freshness_threshold_seconds).toBe(120);
    }
  });
}
