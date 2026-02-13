import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import app from "../../src/api/routes/index";
import { normalizeListPayload } from "../helpers/api_list";

const hasEnv = Boolean(process.env.CONVEX_URL);
const fixturePath = fileURLToPath(new URL("../fixtures/telegram_messages.json", import.meta.url));

if (!hasEnv) {
  test.skip("telegram ingestion requires Convex configuration", () => {});
} else {
  test("POST /telegram/ingest ingests messages and creates signals", async () => {
    process.env.TELEGRAM_MESSAGES_PATH = fixturePath;

    const identifier = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceResponse = await app.request("/telegram/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "telegram", identifier }),
    });
    expect(sourceResponse.status).toBe(201);
    const source = await sourceResponse.json();

    const ingestResponse = await app.request("/telegram/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_id: source.id }),
    });
    expect(ingestResponse.status).toBe(202);
    const ingestPayload = await ingestResponse.json();
    expect(ingestPayload.runId).toBeTruthy();
    expect(ingestPayload.newCount).toBeGreaterThan(0);

    const signalsResponse = await app.request("/signals?source=telegram");
    expect(signalsResponse.status).toBe(200);
    const payload = await signalsResponse.json();
    const signals = normalizeListPayload(payload);
    expect(Array.isArray(signals)).toBe(true);
  });
}
