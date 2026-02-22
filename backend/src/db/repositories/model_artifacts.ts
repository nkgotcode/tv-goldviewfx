import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowByField, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale } from "../timescale/rl_ops";

export type ModelArtifactInsert = {
  agent_version_id: string;
  artifact_uri: string;
  artifact_checksum: string;
  artifact_size_bytes: number;
  content_type?: string | null;
  training_window_start?: string | null;
  training_window_end?: string | null;
};

export async function insertModelArtifact(payload: ModelArtifactInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("model_artifacts", {
      id: randomUUID(),
      created_at: now,
      ...payload,
    });
  }
  const result = await convex.from("model_artifacts").insert(payload).select("*").single();
  return assertNoError(result, "insert model artifact");
}

export async function listModelArtifacts(agentVersionId: string) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("model_artifacts", {
      filters: [{ field: "agent_version_id", value: agentVersionId }],
      orderBy: "created_at",
      direction: "desc",
    });
  }
  const result = await convex.from("model_artifacts").select("*").eq("agent_version_id", agentVersionId);
  return assertNoError(result, "list model artifacts");
}

export async function getModelArtifactByUri(artifactUri: string) {
  if (rlOpsUsesTimescale()) {
    return getRlOpsRowByField("model_artifacts", "artifact_uri", artifactUri);
  }
  const result = await convex.from("model_artifacts").select("*").eq("artifact_uri", artifactUri).maybeSingle();
  if (result.error) {
    throw new Error(`get model artifact by uri: ${result.error.message}`);
  }
  return result.data;
}
