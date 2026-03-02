import { randomUUID } from "node:crypto";
import {
  getRlOpsRowByField,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
} from "../timescale/rl_ops";

export type ModelArtifactInsert = {
  agent_version_id: string;
  artifact_uri: string;
  artifact_checksum: string;
  artifact_size_bytes: number;
  artifact_base64?: string | null;
  content_type?: string | null;
  training_window_start?: string | null;
  training_window_end?: string | null;
};

export async function insertModelArtifact(payload: ModelArtifactInsert) {
  requireRlOpsTimescaleEnabled("insertModelArtifact");
  const now = new Date().toISOString();
  return insertRlOpsRow("model_artifacts", {
    id: randomUUID(),
    created_at: now,
    ...payload,
  });
}

export async function listModelArtifacts(agentVersionId: string) {
  requireRlOpsTimescaleEnabled("listModelArtifacts");
  return listRlOpsRows("model_artifacts", {
    filters: [{ field: "agent_version_id", value: agentVersionId }],
    orderBy: "created_at",
    direction: "desc",
  });
}

export async function getModelArtifactByUri(artifactUri: string) {
  requireRlOpsTimescaleEnabled("getModelArtifactByUri");
  return getRlOpsRowByField("model_artifacts", "artifact_uri", artifactUri);
}
