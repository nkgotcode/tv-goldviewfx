import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { convex } from "../src/db/client";
import { updateAgentConfig } from "../src/db/repositories/agent_config";

function loadTestEnv() {
  const envPath = resolve(process.cwd(), ".env.test");
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;
    const value = rest.join("=").trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

process.env.TZ = "UTC";

loadTestEnv();

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

delete process.env.API_TOKEN;

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error("Convex test configuration is missing. Set CONVEX_URL.");
}

async function seedTestData() {
  const now = new Date().toISOString();
  const riskLimitId = "11111111-1111-4111-8111-111111111111";
  const riskExisting = await convex.from("risk_limit_sets").select("id").eq("id", riskLimitId).maybeSingle();
  if (!riskExisting.data) {
    await convex
      .from("risk_limit_sets")
      .insert({
        id: riskLimitId,
        name: "Baseline Risk Limits",
        max_position_size: 1.5,
        leverage_cap: 3,
        max_daily_loss: 200,
        max_drawdown: 300,
        max_open_positions: 3,
        effective_from: now,
        active: true,
      })
      .select("*")
      .single();
  }

  const agentVersionId = "22222222-2222-4222-8222-222222222222";
  const versionExisting = await convex.from("agent_versions").select("id").eq("id", agentVersionId).maybeSingle();
  if (!versionExisting.data) {
    await convex
      .from("agent_versions")
      .insert({
        id: agentVersionId,
        name: "Seeded Version",
        status: "promoted",
        artifact_uri: "convex://models/seeded",
        artifact_checksum: "seeded-checksum",
        artifact_size_bytes: 16,
        promoted_at: now,
      })
      .select("*")
      .single();
  } else {
    await convex
      .from("agent_versions")
      .update({
        artifact_checksum: "seeded-checksum",
        artifact_size_bytes: 16,
      })
      .eq("id", agentVersionId);
  }

  const featureSetId = "33333333-3333-4333-8333-333333333333";
  const featureExisting = await convex.from("feature_set_versions").select("id").eq("id", featureSetId).maybeSingle();
  if (!featureExisting.data) {
    await convex
      .from("feature_set_versions")
      .insert({
        id: featureSetId,
        label: "Seeded Features",
        description: "Seeded feature set",
        created_at: now,
      })
      .select("*")
      .single();
  }

  const datasetVersionId = "44444444-4444-4444-8444-444444444444";
  const datasetExisting = await convex.from("dataset_versions").select("id").eq("id", datasetVersionId).maybeSingle();
  if (!datasetExisting.data) {
    await convex
      .from("dataset_versions")
      .insert({
        id: datasetVersionId,
        pair: "Gold-USDT",
        interval: "1m",
        start_at: new Date(Date.now() - 3600000).toISOString(),
        end_at: now,
        checksum: "seeded-dataset-checksum",
        dataset_hash: "seeded-dataset-checksum",
        window_size: 30,
        stride: 1,
        feature_set_version_id: featureSetId,
        created_at: now,
      })
      .select("*")
      .single();
  }

  const artifactId = "55555555-5555-4555-8555-555555555555";
  const artifactExisting = await convex.from("model_artifacts").select("id").eq("id", artifactId).maybeSingle();
  if (!artifactExisting.data) {
    await convex
      .from("model_artifacts")
      .insert({
        id: artifactId,
        agent_version_id: agentVersionId,
        artifact_uri: "convex://storage/seeded-artifact",
        artifact_checksum: "seeded-checksum",
        artifact_size_bytes: 16,
        content_type: "application/zip",
        training_window_start: new Date(Date.now() - 7200000).toISOString(),
        training_window_end: now,
        created_at: now,
      })
      .select("*")
      .single();
  }

  await convex
    .from("agent_versions")
    .update({
      dataset_version_id: datasetVersionId,
      dataset_hash: "seeded-dataset-checksum",
      feature_set_version_id: featureSetId,
      artifact_uri: "convex://storage/seeded-artifact",
      artifact_checksum: "seeded-checksum",
      artifact_size_bytes: 16,
    })
    .eq("id", agentVersionId);

  const bingxSources = [
    "bingx_candles",
    "bingx_orderbook",
    "bingx_trades",
    "bingx_funding",
    "bingx_open_interest",
    "bingx_mark_price",
    "bingx_index_price",
    "bingx_ticker",
  ] as const;
  const pairs = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"] as const;
  for (const pair of pairs) {
    for (const sourceType of bingxSources) {
      await convex.from("data_source_status").upsert(
        {
          pair,
          source_type: sourceType,
          last_seen_at: now,
          freshness_threshold_seconds: 120,
          status: "ok",
          updated_at: now,
        },
        { onConflict: "pair,source_type" },
      );
    }
  }

  const configExisting = await convex.from("agent_configurations").select("*").limit(1).maybeSingle();
  const allowed = ["GOLD-USDT", "XAUTUSDT", "PAXGUSDT"];
  if (!configExisting.data) {
    await convex
      .from("agent_configurations")
      .insert({
        enabled: true,
        mode: "paper",
        max_position_size: 1,
        daily_loss_limit: 0,
        allowed_instruments: allowed,
        kill_switch: false,
        kill_switch_reason: null,
        min_confidence_score: 0,
        allowed_source_ids: [],
        promotion_required: false,
        promotion_min_trades: 0,
        promotion_min_win_rate: 0,
        promotion_min_net_pnl: 0,
        promotion_max_drawdown: 0,
        updated_at: now,
      })
      .select("*")
      .single();
  } else {
    await convex
      .from("agent_configurations")
      .update({
        allowed_instruments: allowed,
        updated_at: now,
      })
      .eq("id", configExisting.data.id)
      .select("*")
      .single();
  }

  await updateAgentConfig({ allowed_instruments: allowed });
}

await seedTestData();
