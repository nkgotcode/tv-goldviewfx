import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale } from "../timescale/rl_ops";

export type MarketInputSnapshotInsert = {
  pair: string;
  captured_at?: string;
  dataset_version_id?: string | null;
  dataset_hash?: string | null;
  feature_set_version_id?: string | null;
  agent_version_id?: string | null;
  artifact_uri?: string | null;
  market_features_ref?: string | null;
  chart_features_ref?: string | null;
  idea_features_ref?: string | null;
  signal_features_ref?: string | null;
  news_features_ref?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertMarketInputSnapshot(payload: MarketInputSnapshotInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("market_input_snapshots", {
      id: randomUUID(),
      captured_at: now,
      metadata: payload.metadata ?? {},
      created_at: now,
      updated_at: now,
      ...payload,
      captured_at: payload.captured_at ?? now,
    });
  }
  const result = await convex
    .from("market_input_snapshots")
    .insert({
      ...payload,
      metadata: payload.metadata ?? {},
    })
    .select("*")
    .single();
  return assertNoError(result, "insert market input snapshot");
}

export async function listMarketInputSnapshots(pair: MarketInputSnapshotInsert["pair"]) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("market_input_snapshots", {
      filters: [{ field: "pair", value: pair }],
      orderBy: "captured_at",
      direction: "desc",
    });
  }
  const result = await convex
    .from("market_input_snapshots")
    .select("*")
    .eq("pair", pair)
    .order("captured_at", { ascending: false });
  return assertNoError(result, "list market input snapshots");
}
