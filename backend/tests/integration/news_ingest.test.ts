import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { runNewsIngest } from "../../src/services/news_ingest";
import { convex } from "../../src/db/client";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("news ingestion tests require Convex configuration", () => {});
} else {
  test("news ingestion stores items", async () => {
    const fixture = resolve(import.meta.dir, "../fixtures/news.json");
    process.env.NEWS_FEED_PATH = fixture;
    const result = await runNewsIngest("manual");
    expect(result.newCount + result.skippedCount).toBeGreaterThan(0);

    const stored = await convex.from("news_items").select("id").limit(1);
    expect((stored.data ?? []).length).toBeGreaterThan(0);
  });
}
