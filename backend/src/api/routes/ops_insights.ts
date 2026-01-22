import { Hono } from "hono";
import { getSourceEfficacy, getSentimentPnlCorrelation, getTopicTrends } from "../../services/insights_analytics";
import { logWarn } from "../../services/logger";

export const opsInsightsRoutes = new Hono();

opsInsightsRoutes.get("/source-efficacy", async (c) => {
  try {
    const data = await getSourceEfficacy();
    return c.json(data);
  } catch (error) {
    logWarn("Failed to load source efficacy insights", { error: String(error) });
    return c.json({ generated_at: new Date().toISOString(), sources: [] });
  }
});

opsInsightsRoutes.get("/sentiment-pnl", async (c) => {
  try {
    const data = await getSentimentPnlCorrelation();
    return c.json(data);
  } catch (error) {
    logWarn("Failed to load sentiment pnl insights", { error: String(error) });
    return c.json({ generated_at: new Date().toISOString(), correlation: 0, by_sentiment: [] });
  }
});

opsInsightsRoutes.get("/topic-trends", async (c) => {
  const period = c.req.query("period") ?? undefined;
  try {
    const data = await getTopicTrends(period);
    return c.json({ generated_at: new Date().toISOString(), trends: data });
  } catch (error) {
    logWarn("Failed to load topic trends", { error: String(error), period });
    return c.json({ generated_at: new Date().toISOString(), trends: [] });
  }
});
