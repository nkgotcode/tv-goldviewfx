import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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

function rewriteInternalConvexUrl(rawUrl: string) {
  const configuredBase = process.env.CONVEX_URL;
  if (!configuredBase) return rawUrl;
  try {
    const target = new URL(rawUrl);
    const base = new URL(configuredBase);
    const isInternalHost =
      target.hostname.endsWith(".service.nomad") ||
      target.hostname.endsWith(".internal") ||
      target.hostname === "convex-backend";
    if (!isInternalHost) {
      return rawUrl;
    }
    target.protocol = base.protocol;
    target.host = base.host;
    return target.toString();
  } catch {
    return rawUrl;
  }
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
  let artifactUri: string;
  if (process.env.CONVEX_URL) {
    const stored = await storeBinaryFile({
      data: input.payload,
      contentType: input.contentType,
      filename: `${input.agentVersionId}.zip`,
    });
    artifactUri = `convex://storage/${stored.storageId}`;
  } else {
    const dir = resolve(process.cwd(), ".artifacts");
    await mkdir(dir, { recursive: true });
    const filePath = resolve(dir, `${input.agentVersionId}-${Date.now()}.zip`);
    await writeFile(filePath, input.payload);
    artifactUri = `file://${filePath}`;
  }

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
  if (storageId) {
    const rawUrl = await getFileUrl(storageId);
    return rewriteInternalConvexUrl(rawUrl);
  }
  if (artifactUri.startsWith("file://")) {
    return artifactUri;
  }
  if (artifactUri.startsWith("http://") || artifactUri.startsWith("https://")) {
    return artifactUri;
  }
  return null;
}
