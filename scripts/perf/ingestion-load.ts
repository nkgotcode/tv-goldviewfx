const baseUrl = process.env.PERF_API_BASE_URL ?? "http://localhost:8787";
const concurrency = Number.parseInt(process.env.PERF_CONCURRENCY ?? "3", 10);
const iterations = Number.parseInt(process.env.PERF_ITERATIONS ?? "6", 10);
const token = process.env.API_TOKEN;

function headers() {
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function run() {
  const payload = JSON.stringify({ full_content: false, include_updates: false });
  let completed = 0;
  const start = Date.now();

  for (let i = 0; i < iterations; i += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, iterations - i) }).map(() =>
      fetch(`${baseUrl}/ingestion/tradingview/sync`, {
        method: "POST",
        headers: headers(),
        body: payload,
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`Ingestion failed: ${res.status}`);
        }
        completed += 1;
      }),
    );
    await Promise.all(batch);
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(`Ingestion requests completed: ${completed} in ${elapsed.toFixed(2)}s`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
