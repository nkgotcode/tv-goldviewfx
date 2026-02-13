import { test, expect } from "bun:test";
import { insertIdea, listIdeas } from "../../src/db/repositories/ideas";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("idea search tests require Convex configuration", () => {});
} else {
  test("idea search requires bounds to avoid full scans", async () => {
    await expect(listIdeas({ query: "gold" })).rejects.toThrow("Search query requires");
  });

  test("idea search returns bounded results", async () => {
    const sourceId = `source-${Date.now()}`;
    const idea = await insertIdea({
      source_id: sourceId,
      external_id: `ext-${Date.now()}`,
      url: "https://example.com",
      title: "Gold breakout signal",
      author_handle: "trader",
      content: "Bullish momentum on gold futures",
      content_hash: `hash-${Date.now()}`,
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });

    const result = await listIdeas({
      sourceId,
      query: "gold",
      page: 1,
      pageSize: 5,
    });

    expect(result.data.some((row) => row.id === idea.id)).toBe(true);
  });
}
