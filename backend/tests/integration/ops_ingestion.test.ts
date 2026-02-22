import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("ops ingestion endpoints require Convex configuration", () => {});
} else {
  test("GET /ops/ingestion/status returns sources", async () => {
    const response = await app.request("/ops/ingestion/status");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.sources)).toBe(true);
  });

  test("PUT /ops/ingestion/config upserts config", async () => {
    const response = await app.request("/ops/ingestion/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_type: "tradingview",
        source_id: null,
        feed: null,
        enabled: true,
        refresh_interval_seconds: 600,
      }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.source_type).toBe("tradingview");
  });

  test("GET /ops/ingestion/runs returns run list", async () => {
    const response = await app.request("/ops/ingestion/runs");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);
  });
}
