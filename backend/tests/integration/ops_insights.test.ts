import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("ops insights endpoints require Convex configuration", () => {});
} else {
  test("GET /ops/insights/source-efficacy returns sources", async () => {
    const response = await app.request("/ops/insights/source-efficacy");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.sources)).toBe(true);
  });

  test("GET /ops/insights/sentiment-pnl returns correlation", async () => {
    const response = await app.request("/ops/insights/sentiment-pnl");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.correlation).toBe("number");
  });

  test("GET /ops/insights/topic-trends returns trends", async () => {
    const response = await app.request("/ops/insights/topic-trends");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.trends)).toBe(true);
  });
}
