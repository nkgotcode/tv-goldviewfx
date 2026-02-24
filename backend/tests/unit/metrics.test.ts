import { test, expect } from "bun:test";
import {
  renderPrometheus,
  metricsHandler,
  counterInc,
  gaugeSet,
} from "../../src/services/metrics";

test("renderPrometheus returns non-empty string ending with newline", () => {
  const out = renderPrometheus();
  expect(typeof out).toBe("string");
  expect(out.length).toBeGreaterThan(0);
  expect(out.endsWith("\n")).toBe(true);
});

test("renderPrometheus includes up metric when no counters or gauges", () => {
  const out = renderPrometheus();
  expect(out).toContain("up ");
});

test("metricsHandler returns Response with Prometheus content-type", () => {
  const res = metricsHandler();
  expect(res).toBeInstanceOf(Response);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/plain");
  expect(res.headers.get("Content-Type")).toContain("version=0.0.4");
});

test("counterInc and gaugeSet affect renderPrometheus output", () => {
  counterInc("test_counter", { label: "a" }, 2);
  gaugeSet("test_gauge", { x: "1" }, 3.5);
  const out = renderPrometheus();
  expect(out).toMatch(/gvfx_test_counter\{[^}]*\}\s*2/);
  expect(out).toMatch(/gvfx_test_gauge\{[^}]*\}\s*3\.5/);
});
