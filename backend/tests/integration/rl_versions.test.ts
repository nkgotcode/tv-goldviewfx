import { test, expect } from "bun:test";
import { insertAgentVersion, getAgentVersion } from "../../src/db/repositories/agent_versions";
import { rlApiRequest } from "../fixtures/rl_api";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("rl version routes require Convex configuration", () => {});
} else {
  test("promote and rollback agent versions", async () => {
    const baseVersion = await insertAgentVersion({
      name: `Base Version ${Date.now()}`,
      status: "promoted",
      artifact_uri: "convex://models/base",
    });

    const nextVersion = await insertAgentVersion({
      name: `Next Version ${Date.now()}`,
      status: "evaluating",
      artifact_uri: "convex://models/next",
    });

    const promoteResponse = await rlApiRequest(
      `/agents/gold-rl-agent/versions/${nextVersion.id}/promote`,
      { method: "POST" },
    );
    expect(promoteResponse.status).toBe(200);

    const updatedNext = await getAgentVersion(nextVersion.id);
    const updatedBase = await getAgentVersion(baseVersion.id);
    expect(updatedNext.status).toBe("promoted");
    expect(updatedBase.status).toBe("retired");

    const rollbackResponse = await rlApiRequest(
      `/agents/gold-rl-agent/versions/${baseVersion.id}/rollback`,
      { method: "POST" },
    );
    expect(rollbackResponse.status).toBe(200);

    const rollbackBase = await getAgentVersion(baseVersion.id);
    expect(rollbackBase.status).toBe("promoted");
  });
}
