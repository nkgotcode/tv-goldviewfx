import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getModelArtifactByUri, insertModelArtifact } from "../db/repositories/model_artifacts";
import { updateAgentVersion } from "../db/repositories/agent_versions";
import { requireRlOpsTimescaleEnabled } from "../db/timescale/rl_ops";

function isTimescaleArtifactUri(artifactUri: string) {
  return artifactUri.startsWith("timescale://model_artifacts/");
}

function isLegacyConvexArtifactUri(artifactUri: string) {
  return artifactUri.startsWith("convex://storage/");
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
  requireRlOpsTimescaleEnabled("storeModelArtifact");
  const artifactUri = `timescale://model_artifacts/${randomUUID()}`;
  const artifactBase64 = Buffer.from(input.payload).toString("base64");

  const artifact = await insertModelArtifact({
    agent_version_id: input.agentVersionId,
    artifact_uri: artifactUri,
    artifact_checksum: checksum,
    artifact_size_bytes: input.payload.length,
    artifact_base64: artifactBase64,
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
  if (isTimescaleArtifactUri(artifactUri)) {
    return null;
  }
  if (isLegacyConvexArtifactUri(artifactUri)) {
    throw new Error(
      "Legacy Convex artifact URI is not supported in Timescale-only RL ops. Run artifact URI normalization.",
    );
  }
  if (artifactUri.startsWith("file://")) {
    return artifactUri;
  }
  if (artifactUri.startsWith("http://") || artifactUri.startsWith("https://")) {
    return artifactUri;
  }
  return null;
}

export async function resolveEmbeddedArtifactPayload(artifactUri: string) {
  if (isTimescaleArtifactUri(artifactUri)) {
    const artifact = await getModelArtifactByUri(artifactUri);
    if (!artifact) return null;
    const artifactBase64 = typeof artifact.artifact_base64 === "string" ? artifact.artifact_base64 : null;
    if (!artifactBase64) return null;
    return {
      artifactBase64,
      artifactChecksum: typeof artifact.artifact_checksum === "string" ? artifact.artifact_checksum : null,
    };
  }

  if (isLegacyConvexArtifactUri(artifactUri)) {
    throw new Error(
      "Legacy Convex artifact URI is not supported in Timescale-only RL ops. Run artifact URI normalization.",
    );
  }

  if (artifactUri.startsWith("file://")) {
    const filePath = resolve(artifactUri.slice("file://".length));
    const bytes = await readFile(filePath);
    return {
      artifactBase64: Buffer.from(bytes).toString("base64"),
      artifactChecksum: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  return null;
}
