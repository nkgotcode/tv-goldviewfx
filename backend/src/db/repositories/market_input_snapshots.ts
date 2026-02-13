import { convex } from "../client";
import { assertNoError } from "./base";

export type MarketInputSnapshotInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  const result = await convex
    .from("market_input_snapshots")
    .select("*")
    .eq("pair", pair)
    .order("captured_at", { ascending: false });
  return assertNoError(result, "list market input snapshots");
}
