import { createHash } from "node:crypto";
import { storeBinaryFile, getFileUrl } from "../db/storage";
import { insertModelArtifact } from "../db/repositories/model_artifacts";
import { updateAgentVersion } from "../db/repositories/agent_versions";

export function parseStorageId(artifactUri: string) {
  const prefix = "convex://storage/";
  if (!artifactUri.startsWith(prefix)) {
    return null;
  }
  const storageId = artifactUri.slice(prefix.length);
  return storageId.length > 0 ? storageId : null;
}

export async function storeModelArtifact(input: {
  agentVersionId: string;
  payload: Uint8Array;
  contentType: string;
  trainingWindowStart?: string | null;
  trainingWindowEnd?: string | null;
  expectedChecksum?: string | null;
}) {
  const checksum = createHash("sha256").update(input.payload).digest("hex");
  if (input.expectedChecksum && checksum !== input.expectedChecksum) {
    throw new Error("Artifact checksum mismatch");
  }
  const stored = await storeBinaryFile({
    data: input.payload,
    contentType: input.contentType,
    filename: `${input.agentVersionId}.zip`,
  });
  const artifactUri = `convex://storage/${stored.storageId}`;
  const artifact = await insertModelArtifact({
    agent_version_id: input.agentVersionId,
    artifact_uri: artifactUri,
    artifact_checksum: checksum,
    artifact_size_bytes: input.payload.length,
    content_type: input.contentType,
    training_window_start: input.trainingWindowStart ?? null,
    training_window_end: input.trainingWindowEnd ?? null,
  });
  await updateAgentVersion(input.agentVersionId, {
    artifact_uri: artifactUri,
    artifact_checksum: checksum,
    artifact_size_bytes: input.payload.length,
  });
  return artifact;
}

export async function resolveArtifactUrl(artifactUri: string) {
  const storageId = parseStorageId(artifactUri);
  if (!storageId) return null;
  return getFileUrl(storageId);
}
