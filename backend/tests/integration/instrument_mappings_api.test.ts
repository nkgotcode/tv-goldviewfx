import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

test("GET /instrument-mappings returns 200 and data array", async () => {
  const res = await app.request("/instrument-mappings");
  expect(res.status).toBe(200);
  const payload = await res.json();
  expect(Array.isArray(payload.data)).toBe(true);
});

test("GET /instrument-mappings?venue=BINGX returns 200", async () => {
  const res = await app.request("/instrument-mappings?venue=BINGX");
  expect(res.status).toBe(200);
  const payload = await res.json();
  expect(Array.isArray(payload.data)).toBe(true);
});

test("POST /instrument-mappings with invalid venue returns 400", async () => {
  const res = await app.request("/instrument-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venue: "INVALID_VENUE",
      venue_symbol: "BTC-USDT",
      tick_size: 0.01,
      step_size: 0.001,
    }),
  });
  expect(res.status).toBe(400);
  const payload = await res.json();
  expect(payload.error).toBe("unsupported_venue");
});

test("POST /instrument-mappings with missing required fields returns 400", async () => {
  const res = await app.request("/instrument-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue: "BINGX" }),
  });
  expect(res.status).toBe(400);
  const payload = await res.json();
  expect(payload.error).toBe("validation_failed");
});

test("POST /instrument-mappings with valid payload returns 201 or 503 when store unavailable", async () => {
  const res = await app.request("/instrument-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venue: "BINGX",
      venue_symbol: "BTC-USDT",
      tick_size: 0.01,
      step_size: 0.001,
    }),
  });
  expect([201, 503]).toContain(res.status);
  if (res.status === 201) {
    const payload = await res.json();
    expect(payload.canonical_instrument_id).toBe("BINGX:BTC-USDT:PERP");
    expect(payload.venue).toBe("BINGX");
    expect(payload.venue_symbol).toBe("BTC-USDT");
  }
});
