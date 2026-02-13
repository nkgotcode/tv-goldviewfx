import { test, expect } from "bun:test";
import { convex } from "../../src/db/client";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { createSyncRun, completeSyncRun } from "../../src/db/repositories/sync_runs";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("quality metrics require Convex configuration", () => {});
} else {
  test("sync runs store quality metrics", async () => {
    const source = await getOrCreateSource("tradingview", "quality-test", "Quality Test");
    const run = await createSyncRun(source.id);
    await completeSyncRun(run.id, {
      status: "succeeded",
      newCount: 0,
      updatedCount: 0,
      errorCount: 0,
      coveragePct: 88,
      missingFieldsCount: 2,
      parseConfidence: 0.88,
    });

    const result = await convex.from("sync_runs").select("coverage_pct, missing_fields_count, parse_confidence").eq("id", run.id).single();
    expect(result.data?.coverage_pct).toBe(88);
    expect(result.data?.missing_fields_count).toBe(2);
    expect(result.data?.parse_confidence).toBe(0.88);
  });
}
