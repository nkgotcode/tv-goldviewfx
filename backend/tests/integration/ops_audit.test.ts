import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("ops audit endpoints require Convex configuration", () => {});
} else {
  test("GET /ops/audit returns log list", async () => {
    const response = await app.request("/ops/audit");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);
  });
}
