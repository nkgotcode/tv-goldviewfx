import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { insertIdea } from "../../src/db/repositories/ideas";
import { supabase } from "../../src/db/client";
import { hashContent, normalizeContent } from "../../src/services/dedup";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup(identifier: string) {
  const sources = await supabase.from("sources").select("id").eq("identifier", identifier);
  if (sources.data) {
    for (const source of sources.data) {
      await supabase.from("sources").delete().eq("id", source.id);
    }
  }
}

if (!hasEnv) {
  test.skip("enrichment endpoint requires Supabase configuration", () => {});
} else {
  test("POST /enrichment/run enriches ideas", async () => {
    const identifier = `enrichment-test-${Date.now()}`;
    await cleanup(identifier);

    const source = await getOrCreateSource("tradingview", identifier, "Enrichment Test");
    const content = "Sample idea for enrichment";
    const idea = await insertIdea({
      source_id: source.id,
      external_id: null,
      url: `https://example.com/idea/${Date.now()}`,
      title: "Test Idea",
      author_handle: "tester",
      content,
      content_hash: hashContent(normalizeContent(content)),
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });

    const response = await app.request("/enrichment/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea_ids: [idea.id] }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.processed).toBe(1);
  });
}
