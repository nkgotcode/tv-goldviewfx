import { expect, test } from "bun:test";
import { resolveFeatureSetVersion } from "../../src/services/feature_set_service";
import { listRlFeatureSnapshots, upsertRlFeatureSnapshots } from "../../src/db/repositories/rl_feature_snapshots";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("rl feature snapshots require database configuration", () => {});
} else {
  test("feature snapshots upsert and list are idempotent by key", async () => {
    const featureSet = await resolveFeatureSetVersion({
      version: "v2",
      includeNews: false,
      includeOcr: false,
      technical: { enabled: true },
    });
    const baseTime = new Date();
    const t1 = new Date(baseTime.getTime() - 60_000).toISOString();
    const t2 = baseTime.toISOString();

    await upsertRlFeatureSnapshots([
      {
        pair: "Gold-USDT",
        interval: "1m",
        feature_set_version_id: featureSet.id,
        captured_at: t1,
        schema_fingerprint: "abc123",
        features: { last_price: 2300, sma_20: 2299.5 },
      },
      {
        pair: "Gold-USDT",
        interval: "1m",
        feature_set_version_id: featureSet.id,
        captured_at: t2,
        schema_fingerprint: "abc123",
        features: { last_price: 2301, sma_20: 2300.0 },
      },
    ]);

    await upsertRlFeatureSnapshots([
      {
        pair: "Gold-USDT",
        interval: "1m",
        feature_set_version_id: featureSet.id,
        captured_at: t2,
        schema_fingerprint: "abc123",
        features: { last_price: 2301.5, sma_20: 2300.2 },
      },
    ]);

    const snapshots = await listRlFeatureSnapshots({
      pair: "Gold-USDT",
      interval: "1m",
      featureSetVersionId: featureSet.id,
      start: t1,
      end: t2,
    });
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const updated = snapshots.find((snapshot: any) => snapshot.captured_at === t2);
    expect(updated).toBeTruthy();
    expect(Number((updated as any).features?.last_price)).toBe(2301.5);
  });
}
