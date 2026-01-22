import { Hono } from "hono";
import { getDatasetLineage } from "../../db/repositories/dataset_lineage";
import { getDatasetVersion, listDatasetVersions } from "../../db/repositories/dataset_versions";
export const datasetsRoutes = new Hono();

datasetsRoutes.get("/", async (c) => {
  const datasets = await listDatasetVersions();
  return c.json(datasets);
});

datasetsRoutes.get("/:datasetId", async (c) => {
  const dataset = await getDatasetVersion(c.req.param("datasetId"));
  return c.json(dataset);
});

datasetsRoutes.get("/:datasetId/lineage", async (c) => {
  const lineage = await getDatasetLineage(c.req.param("datasetId"));
  if (!lineage) {
    return c.json({ error: "Dataset lineage not found" }, 404);
  }
  return c.json(lineage);
});
