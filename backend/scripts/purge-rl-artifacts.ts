import { convex } from "../src/db/client";
import { deleteFile } from "../src/db/storage";
import { parseStorageId } from "../src/services/model_artifact_service";

type DbRow = Record<string, any>;

async function listTable(table: string) {
  const response = await convex.from<DbRow>(table).select("*");
  if (response.error) {
    throw new Error(`Failed to list ${table}: ${response.error.message}`);
  }
  return response.data ?? [];
}

async function purgeModelArtifacts() {
  const artifacts = await listTable("model_artifacts");
  let deletedFiles = 0;
  for (const artifact of artifacts) {
    const uri = typeof artifact.artifact_uri === "string" ? artifact.artifact_uri : "";
    const storageId = uri ? parseStorageId(uri) : null;
    if (storageId) {
      try {
        await deleteFile(storageId);
        deletedFiles += 1;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Skipping storage delete for ${storageId}: ${String(error)}`);
      }
    }
    if (artifact.id) {
      await convex.from("model_artifacts").delete().eq("id", artifact.id);
    }
  }
  return { artifacts: artifacts.length, deletedFiles };
}

async function retireAgentVersions() {
  const versions = await listTable("agent_versions");
  for (const version of versions) {
    if (!version.id) continue;
    await convex
      .from("agent_versions")
      .update({
        artifact_uri: null,
        artifact_checksum: null,
        artifact_size_bytes: null,
        status: "retired",
        promoted_at: null,
      })
      .eq("id", version.id);
  }
  return { versions: versions.length };
}

async function main() {
  const artifactSummary = await purgeModelArtifacts();
  const versionSummary = await retireAgentVersions();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        modelArtifacts: artifactSummary.artifacts,
        deletedFiles: artifactSummary.deletedFiles,
        agentVersions: versionSummary.versions,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
