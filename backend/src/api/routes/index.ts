import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "../middleware/auth";
import { errorHandler } from "../middleware/error";
import { loadEnv } from "../../config/env";
import { healthRoutes } from "./health";
import { syncRoutes } from "./sync_tradingview";
import { syncRunsRoutes } from "./sync_runs";
import { ideasRoutes } from "./ideas";
import { enrichmentRoutes } from "./enrichment";
import { signalsRoutes } from "./signals";
import { agentRoutes, rlAgentRoutes } from "./agent";
import { tradesRoutes } from "./trades";
import { dashboardRoutes } from "./dashboard";
import { telegramRoutes } from "./telegram";
import { riskLimitsRoutes } from "./risk_limits";
import { agentVersionsRoutes } from "./agent_versions";
import { ingestionRoutes } from "./ingestion";
import { opsIngestionRoutes } from "./ops_ingestion";
import { opsTradingRoutes } from "./ops_trading";
import { opsInsightsRoutes } from "./ops_insights";
import { opsAuditRoutes } from "./ops_audit";
import { opsAlertsRoutes } from "./ops_alerts";
import { opsGapsRoutes } from "./ops_gaps";
import { opsRetryQueueRoutes } from "./ops_retry_queue";
import { opsLearningRoutes } from "./ops_learning";
import { ideaReviewRoutes } from "./idea_reviews";
import { ideaNotesRoutes } from "./idea_notes";
import { enrichmentRunsRoutes } from "./enrichment_runs";
import { newsRoutes } from "./news";
import { ideaOcrRoutes } from "./idea_ocr";
import { sourcePoliciesRoutes } from "./source_policies";
import { agentEvaluationsRoutes } from "./agent_evaluations";
import { agentTrainingRoutes } from "./agent_training";
import { dataSourcesRoutes } from "./data_sources";
import { bingxMarketDataRoutes } from "./bingx_market_data";
import { datasetsRoutes } from "./datasets";
import { featureSetsRoutes } from "./feature_sets";
import { dataQualityRoutes } from "./data_quality";
import { driftAlertsRoutes } from "./drift_alerts";
import { rlGovernanceRoutes } from "./rl_governance";

const app = new Hono();
const env = loadEnv();

app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use("*", errorHandler);
app.use("*", authMiddleware);

app.route("/health", healthRoutes);
app.route("/sync", syncRoutes);
app.route("/sync/runs", syncRunsRoutes);
app.route("/ideas", ideasRoutes);
app.route("/enrichment", enrichmentRoutes);
app.route("/signals", signalsRoutes);
app.route("/agent", agentRoutes);
app.route("/agents", rlAgentRoutes);
app.route("/agents", agentVersionsRoutes);
app.route("/agents", agentEvaluationsRoutes);
app.route("/agents", agentTrainingRoutes);
app.route("/agents", driftAlertsRoutes);
app.route("/agents", rlGovernanceRoutes);
app.route("/risk-limits", riskLimitsRoutes);
app.route("/trades", tradesRoutes);
app.route("/dashboard", dashboardRoutes);
app.route("/telegram", telegramRoutes);
app.route("/ingestion", ingestionRoutes);
app.route("/ops/ingestion", opsIngestionRoutes);
app.route("/ops/trading", opsTradingRoutes);
app.route("/ops/insights", opsInsightsRoutes);
app.route("/ops/audit", opsAuditRoutes);
app.route("/ops/alerts", opsAlertsRoutes);
app.route("/ops/gaps", opsGapsRoutes);
app.route("/ops/retry-queue", opsRetryQueueRoutes);
app.route("/ops/learning", opsLearningRoutes);
app.route("/idea-reviews", ideaReviewRoutes);
app.route("/idea-notes", ideaNotesRoutes);
app.route("/enrichment-runs", enrichmentRunsRoutes);
app.route("/news", newsRoutes);
app.route("/idea-ocr", ideaOcrRoutes);
app.route("/source-policies", sourcePoliciesRoutes);
app.route("/data-sources", dataSourcesRoutes);
app.route("/bingx/market-data", bingxMarketDataRoutes);
app.route("/datasets", datasetsRoutes);
app.route("/feature-sets", featureSetsRoutes);
app.route("/data-quality", dataQualityRoutes);

export default app;
