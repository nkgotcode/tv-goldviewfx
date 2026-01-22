import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { runNewsIngest } from "../../src/services/news_ingest";
import { supabase } from "../../src/db/client";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("news ingestion tests require Supabase configuration", () => {});
} else {
  test("news ingestion stores items", async () => {
    const fixture = resolve(import.meta.dir, "../fixtures/news.json");
    process.env.NEWS_FEED_PATH = fixture;
    const result = await runNewsIngest("manual");
    expect(result.newCount).toBeGreaterThan(0);

    const stored = await supabase.from("news_items").select("id").limit(1);
    expect((stored.data ?? []).length).toBeGreaterThan(0);
  });
}
