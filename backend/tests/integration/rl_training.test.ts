import { test, expect } from "bun:test";
import { rlApiRequest } from "../fixtures/rl_api";
import { upsertBingxCandles } from "../../src/db/repositories/bingx_market_data/candles";

const hasEnv = Boolean(process.env.CONVEX_URL);

function buildCandles(start: Date, count: number, intervalMs: number) {
  const rows = [];
  for (let idx = 0; idx < count; idx += 1) {
    const openTime = new Date(start.getTime() + idx * intervalMs);
    const closeTime = new Date(openTime.getTime() + intervalMs);
    const base = 2300 + idx * 0.5;
    rows.push({
      pair: "Gold-USDT" as const,
      interval: "1m",
      open_time: openTime.toISOString(),
      close_time: closeTime.toISOString(),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 100 + idx,
      quote_volume: 1000 + idx,
      source: "seed",
    });
  }
  return rows;
}

if (!hasEnv) {
  test.skip("rl training requires Convex configuration", () => {});
} else {
  test("training endpoint persists version and artifact", async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    await upsertBingxCandles(buildCandles(start, 20, 60_000));

    const response = await rlApiRequest("/agents/gold-rl-agent/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair: "Gold-USDT",
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        windowSize: 5,
        stride: 1,
        timesteps: 25,
      }),
    });

    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.agentVersion).toBeTruthy();
    expect(result.datasetVersion).toBeTruthy();
    expect(result.artifact).toBeTruthy();
    expect(result.agentVersion.artifact_uri).toBeTruthy();
    expect(result.agentVersion.dataset_version_id).toBe(result.datasetVersion.id);
  });
}
