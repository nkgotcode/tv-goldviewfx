import { test, expect } from "bun:test";
import { rlApiRequest } from "../fixtures/rl_api";
import { insertDatasetVersion } from "../../src/db/repositories/dataset_versions";
import { insertDatasetLineage } from "../../src/db/repositories/dataset_lineage";
import { insertFeatureSetVersion } from "../../src/db/repositories/feature_set_versions";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("dataset routes require Supabase configuration", () => {});
} else {
  test("dataset routes return versions and lineage", async () => {
    const featureSet = await insertFeatureSetVersion({
      label: `features-${Date.now()}`,
      description: "Test feature set",
    });
    const dataset = await insertDatasetVersion({
      pair: "Gold-USDT",
      interval: "1m",
      start_at: new Date(Date.now() - 3600000).toISOString(),
      end_at: new Date().toISOString(),
      checksum: `chk-${Date.now()}`,
      feature_set_version_id: featureSet.id,
    });
    await insertDatasetLineage({
      dataset_id: dataset.id,
      source_run_ids: [],
      parent_dataset_ids: [],
    });

    const listResponse = await rlApiRequest("/datasets", { method: "GET" });
    expect(listResponse.status).toBe(200);
    const datasets = await listResponse.json();
    expect(Array.isArray(datasets)).toBe(true);

    const detailResponse = await rlApiRequest(`/datasets/${dataset.id}`, { method: "GET" });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.id).toBe(dataset.id);

    const lineageResponse = await rlApiRequest(`/datasets/${dataset.id}/lineage`, { method: "GET" });
    expect(lineageResponse.status).toBe(200);
    const lineage = await lineageResponse.json();
    expect(lineage.dataset_id).toBe(dataset.id);

    const featuresResponse = await rlApiRequest("/feature-sets", { method: "GET" });
    expect(featuresResponse.status).toBe(200);
  });
}
