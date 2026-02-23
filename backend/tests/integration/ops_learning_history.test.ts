import { expect, test } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true" || process.env.TIMESCALE_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("ops learning history endpoint requires DB configuration", () => {});
} else {
  test("GET /ops/learning/history returns paginated payload", async () => {
    const response = await app.request("/ops/learning/history?page=1&page_size=5");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(typeof payload.pagination?.page).toBe("number");
    expect(typeof payload.pagination?.pageSize).toBe("number");
    expect(typeof payload.pagination?.total).toBe("number");
    expect(typeof payload.pagination?.totalPages).toBe("number");
  });

  test("GET /ops/learning/history accepts filters", async () => {
    const response = await app.request("/ops/learning/history?page=1&page_size=5&status=failed&pair=XAUTUSDT&search=fail");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.filters).toBeDefined();
    expect(payload.filters.status === "failed" || payload.filters.status === null).toBe(true);
  });
}
