const baseUrl = process.env.PERF_API_BASE_URL ?? "http://localhost:8787";
const concurrency = Number.parseInt(process.env.PERF_CONCURRENCY ?? "5", 10);
const iterations = Number.parseInt(process.env.PERF_ITERATIONS ?? "20", 10);
const token = process.env.API_TOKEN;

function headers() {
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function buildMarketCandles(count = 6) {
  const now = Date.now();
  return Array.from({ length: count }).map((_, idx) => ({
    timestamp: new Date(now - (count - idx) * 60000).toISOString(),
    open: 2300 + idx,
    high: 2302 + idx,
    low: 2298 + idx,
    close: 2301 + idx,
    volume: 100 + idx,
  }));
}

async function fetchJson(path: string, options?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  return response.json();
}

async function run() {
  const limits = (await fetchJson("/risk-limits")) as Array<{ id: string }>;
  const limitId = limits[0]?.id;
  if (!limitId) {
    throw new Error("No risk limit set found.");
  }

  const runResponse = await fetchJson("/agents/gold-rl-agent/start", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      mode: "paper",
      pair: "Gold-USDT",
      riskLimitSetId: limitId,
      learningEnabled: false,
    }),
  });

  const runId = runResponse.id as string;
  const payload = JSON.stringify({ market: { candles: buildMarketCandles() } });

  let completed = 0;
  const start = Date.now();

  for (let i = 0; i < iterations; i += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, iterations - i) }).map(() =>
      fetch(`${baseUrl}/agents/gold-rl-agent/runs/${runId}/decisions`, {
        method: "POST",
        headers: headers(),
        body: payload,
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`Decision failed: ${res.status}`);
        }
        completed += 1;
      }),
    );
    await Promise.all(batch);
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(`Decisions completed: ${completed} in ${elapsed.toFixed(2)}s`);

  await fetchJson("/agents/gold-rl-agent/stop", {
    method: "POST",
    headers: headers(),
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
