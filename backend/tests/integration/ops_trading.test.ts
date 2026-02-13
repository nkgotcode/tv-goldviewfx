import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("ops trading endpoints require Convex configuration", () => {});
} else {
  test("GET /ops/trading/summary returns metrics", async () => {
    const response = await app.request("/ops/trading/summary");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.net_pnl).toBe("number");
  });

  test("GET /ops/trading/metrics returns series", async () => {
    const response = await app.request("/ops/trading/metrics");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.series)).toBe(true);
  });
}
