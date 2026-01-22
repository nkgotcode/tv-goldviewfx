import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { insertIdea } from "../../src/db/repositories/ideas";
import { insertSignal } from "../../src/db/repositories/signals";
import { supabase } from "../../src/db/client";
import { hashContent, normalizeContent } from "../../src/services/dedup";
import { normalizeListPayload } from "../helpers/api_list";

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
  test.skip("trades endpoint requires Supabase configuration", () => {});
} else {
  test("GET /trades returns an array", async () => {
    const identifier = `trade-test-${Date.now()}`;
    await cleanup(identifier);

    const source = await getOrCreateSource("tradingview", identifier, "Trade Test");
    const content = "Sample idea for trade";
    const idea = await insertIdea({
      source_id: source.id,
      external_id: null,
      url: `https://example.com/idea/${Date.now()}`,
      title: "Trade Idea",
      author_handle: "tester",
      content,
      content_hash: hashContent(normalizeContent(content)),
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });

    await insertSignal({
      source_type: "tradingview",
      idea_id: idea.id,
      enrichment_id: null,
      payload_summary: "trade signal",
      confidence_score: 0,
    });

    await app.request("/agent/enable", { method: "POST" });

    const response = await app.request("/trades");
    expect(response.status).toBe(200);
    const payload = await response.json();
    const items = normalizeListPayload(payload);
    expect(Array.isArray(items)).toBe(true);
  });
}
