import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("agent config requires database configuration", () => {});
} else {
  test("GET /agent/config returns a config", async () => {
    const response = await app.request("/agent/config");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.enabled).toBe("boolean");
  });

  test("PUT /agent/config updates config", async () => {
    const response = await app.request("/agent/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, max_position_size: 2 }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(true);
    expect(payload.max_position_size).toBe(2);
  });
}
