import { Hono } from "hono";
import { requireOperatorRole } from "../middleware/rbac";
import { listVersions, promoteAgentVersion, rollbackAgentVersion } from "../../services/agent_version_service";
import { recordOpsAudit } from "../../services/ops_audit";

export const agentVersionsRoutes = new Hono();

agentVersionsRoutes.get("/:agentId/versions", async (c) => {
  const status = c.req.query("status") as "draft" | "evaluating" | "promoted" | "retired" | undefined;
  const versions = await listVersions(status);
  return c.json(versions);
});

agentVersionsRoutes.post("/:agentId/versions/:versionId/promote", requireOperatorRole, async (c) => {
  const versionId = c.req.param("versionId");
  const version = await promoteAgentVersion(versionId);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent_version.promote",
    resource_type: "agent_version",
    resource_id: versionId,
  });
  return c.json(version);
});

agentVersionsRoutes.post("/:agentId/versions/:versionId/rollback", requireOperatorRole, async (c) => {
  const versionId = c.req.param("versionId");
  const version = await rollbackAgentVersion(versionId);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent_version.rollback",
    resource_type: "agent_version",
    resource_id: versionId,
  });
  return c.json(version);
});
