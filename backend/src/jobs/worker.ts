import { loadEnv } from "../config/env";
import { logInfo } from "../services/logger";
import { startBingxMarketDataWs } from "../services/bingx_market_data_ws";
import { metricsHandler } from "../services/metrics";
import { registerCoreJobs } from "./registry";
import { listJobs, startScheduler } from "./scheduler";

loadEnv();
registerCoreJobs();
startBingxMarketDataWs();

const metricsPort = process.env.METRICS_PORT ? Number.parseInt(process.env.METRICS_PORT, 10) : 0;
if (Number.isFinite(metricsPort) && metricsPort > 0) {
  Bun.serve({
    port: metricsPort,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/metrics" || url.pathname === "/metrics/") {
        return metricsHandler();
      }
      return new Response("Not Found", { status: 404 });
    },
  });
  logInfo("Worker metrics server listening", { port: metricsPort });
}

const jobs = listJobs();
logInfo("Job scheduler started", {
  jobs: jobs.map((job) => ({ name: job.name, intervalMs: job.intervalMs })),
});
startScheduler();
