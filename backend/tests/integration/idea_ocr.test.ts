import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { insertIdea } from "../../src/db/repositories/ideas";
import { insertIdeaMedia } from "../../src/db/repositories/idea_media";
import { hashContent } from "../../src/services/dedup";
import { runOcrBatch } from "../../src/services/ocr";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("ocr tests require Supabase configuration", () => {});
} else {
  test("idea OCR endpoint returns media", async () => {
    const source = await getOrCreateSource("tradingview", `ocr-${Date.now()}`, "OCR Source");
    const idea = await insertIdea({
      source_id: source.id,
      external_id: `ext-${Date.now()}`,
      url: "https://example.com",
      title: "OCR Idea",
      author_handle: "tester",
      content: "Idea content",
      content_hash: hashContent("Idea content"),
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });
    await insertIdeaMedia({ idea_id: idea.id, media_url: "https://example.com/chart.png" });

    const response = await app.request(`/idea-ocr/${idea.id}`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);

    const batch = await runOcrBatch(1);
    expect(batch.skipped + batch.processed + batch.failed).toBeGreaterThan(0);
  });
}
