import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

test("GET /metrics returns 200 and Prometheus-style body", async () => {
  const res = await app.request("/metrics");
  expect(res.status).toBe(200);
  const contentType = res.headers.get("Content-Type");
  expect(contentType).toContain("text/plain");
  expect(contentType).toContain("version=0.0.4");
  const body = await res.text();
  expect(body.endsWith("\n")).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  expect(body.includes("up ") || body.includes("gvfx_")).toBe(true);
});
