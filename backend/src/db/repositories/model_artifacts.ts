import { convex } from "../client";
import { assertNoError } from "./base";

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
  const result = await convex.from("model_artifacts").insert(payload).select("*").single();
  return assertNoError(result, "insert model artifact");
}

export async function listModelArtifacts(agentVersionId: string) {
  const result = await convex.from("model_artifacts").select("*").eq("agent_version_id", agentVersionId);
  return assertNoError(result, "list model artifacts");
}

export async function getModelArtifactByUri(artifactUri: string) {
  const result = await convex.from("model_artifacts").select("*").eq("artifact_uri", artifactUri).maybeSingle();
  if (result.error) {
    throw new Error(`get model artifact by uri: ${result.error.message}`);
  }
  return result.data;
}
