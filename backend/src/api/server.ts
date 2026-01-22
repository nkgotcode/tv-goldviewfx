import { serve } from "bun";
import app from "./routes/index";
import { loadEnv } from "../config/env";
import { logInfo } from "../services/logger";

const env = loadEnv();

serve({
  port: env.PORT,
  fetch: app.fetch,
});

logInfo("API server started", { port: env.PORT });
