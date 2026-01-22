import { Hono } from "hono";
import { listVersions, promoteAgentVersion, rollbackAgentVersion } from "../../services/agent_version_service";

export const agentVersionsRoutes = new Hono();

agentVersionsRoutes.get("/:agentId/versions", async (c) => {
  const status = c.req.query("status") as "draft" | "evaluating" | "promoted" | "retired" | undefined;
  const versions = await listVersions(status);
  return c.json(versions);
});

agentVersionsRoutes.post("/:agentId/versions/:versionId/promote", async (c) => {
  const version = await promoteAgentVersion(c.req.param("versionId"));
  return c.json(version);
});

agentVersionsRoutes.post("/:agentId/versions/:versionId/rollback", async (c) => {
  const version = await rollbackAgentVersion(c.req.param("versionId"));
  return c.json(version);
});
