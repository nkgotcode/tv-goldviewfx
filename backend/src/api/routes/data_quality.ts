import { Hono } from "hono";
import { z } from "zod";
import { tradingPairSchema } from "../../rl/schemas";
import { getLatestDataQualityMetrics, refreshDataQualityMetrics } from "../../services/data_quality_service";

export const dataQualityRoutes = new Hono();

dataQualityRoutes.get("/status", async (c) => {
  const pair = c.req.query("pair") as z.infer<typeof tradingPairSchema> | undefined;
  if (pair && !tradingPairSchema.safeParse(pair).success) {
    return c.json({ error: "Invalid pair" }, 400);
  }
  await refreshDataQualityMetrics(pair);
  const metrics = await getLatestDataQualityMetrics(pair);
  return c.json(metrics);
});
