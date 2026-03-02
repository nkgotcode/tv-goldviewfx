import { serve } from "bun";
import app from "./routes/index";
import { loadEnv } from "../config/env";
import { logInfo } from "../services/logger";
import { assertTimescaleRlOpsReady } from "../db/timescale/rl_ops";

const env = loadEnv();

if (env.TIMESCALE_RL_OPS_ENABLED) {
  try {
    await assertTimescaleRlOpsReady();
    logInfo("Timescale RL ops preflight passed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Timescale RL ops preflight failed with TIMESCALE_RL_OPS_ENABLED=true: ${message}`,
    );
  }
}

serve({
  port: env.PORT,
  fetch: app.fetch,
});

logInfo("API server started", { port: env.PORT });
