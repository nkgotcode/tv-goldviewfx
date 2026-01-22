import { loadEnv } from "../config/env";
import { logInfo } from "../services/logger";
import { startBingxMarketDataWs } from "../services/bingx_market_data_ws";
import { registerCoreJobs } from "./registry";
import { listJobs, startScheduler } from "./scheduler";

loadEnv();
registerCoreJobs();
startBingxMarketDataWs();
const jobs = listJobs();
logInfo("Job scheduler started", {
  jobs: jobs.map((job) => ({ name: job.name, intervalMs: job.intervalMs })),
});
startScheduler();
