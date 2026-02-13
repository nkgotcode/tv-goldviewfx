import { Hono } from "hono";
import { convex } from "../../db/client";
import { listEnrichmentRevisions } from "../../db/repositories/enrichment_runs";

export const enrichmentRunsRoutes = new Hono();

enrichmentRunsRoutes.get("/", async (c) => {
  const result = await convex
    .from("enrichment_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);
  return c.json({ data: result.data ?? [] });
});

enrichmentRunsRoutes.get("/:enrichmentId/revisions", async (c) => {
  const enrichmentId = c.req.param("enrichmentId");
  const revisions = await listEnrichmentRevisions(enrichmentId);
  return c.json({ data: revisions });
});
