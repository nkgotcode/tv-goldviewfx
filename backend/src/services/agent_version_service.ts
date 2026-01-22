import { insertAgentVersion, listAgentVersions, updateAgentVersion, getAgentVersion } from "../db/repositories/agent_versions";

export async function createAgentVersion(payload: Parameters<typeof insertAgentVersion>[0]) {
  return insertAgentVersion(payload);
}

export async function listVersions(status?: Parameters<typeof listAgentVersions>[0]["status"]) {
  return listAgentVersions(status ? { status } : undefined);
}

export async function promoteAgentVersion(versionId: string) {
  const versions = await listAgentVersions({ status: "promoted" });
  for (const version of versions) {
    if (version.id !== versionId) {
      await updateAgentVersion(version.id, { status: "retired" });
    }
  }

  return updateAgentVersion(versionId, {
    status: "promoted",
    promoted_at: new Date().toISOString(),
  });
}

export async function rollbackAgentVersion(versionId: string) {
  return promoteAgentVersion(versionId);
}

export async function getVersion(id: string) {
  return getAgentVersion(id);
}

export async function getLatestPromotedVersion() {
  const versions = await listAgentVersions({ status: "promoted" });
  return versions[0] ?? null;
}

export async function fallbackToLastPromotedVersion() {
  const version = await getLatestPromotedVersion();
  if (!version) {
    throw new Error("No promoted versions available for fallback");
  }
  return version;
}
