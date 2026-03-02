import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { convex } from "../src/db/client";
import { updateAgentConfig } from "../src/db/repositories/agent_config";
import { upsertDataSourceStatus } from "../src/db/repositories/data_source_status";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../src/db/timescale/rl_ops";

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

async function hasConvexConnectivity() {
  if (!process.env.CONVEX_URL) return false;
  try {
    const probe = await convex.from("agent_configurations").select("id").limit(1).maybeSingle();
    if (probe.error) {
      throw new Error(probe.error.message);
    }
    return true;
  } catch (error) {
    console.warn(`[tests/setup] Convex connectivity unavailable: ${String(error)}`);
    return false;
  }
}

async function hasTimescaleConnectivity() {
  if (!rlOpsUsesTimescale()) return false;
  try {
    await listRlOpsRows("agent_configurations", { limit: 1 });
    return true;
  } catch (error) {
    console.warn(`[tests/setup] Timescale connectivity unavailable: ${String(error)}`);
    return false;
  }
}

async function seedTestData() {
  const now = new Date().toISOString();
  const riskLimitId = "11111111-1111-4111-8111-111111111111";
  const agentVersionId = "22222222-2222-4222-8222-222222222222";
  const featureSetId = "33333333-3333-4333-8333-333333333333";
  const datasetVersionId = "44444444-4444-4444-8444-444444444444";
  const artifactId = "55555555-5555-4555-8555-555555555555";
  const datasetHash = "seeded-dataset-checksum";
  const artifactUri = "file:///tmp/seeded-artifact.zip";
  const artifactChecksum = "seeded-checksum";

  if (rlOpsUsesTimescale()) {
    await upsertRlOpsRow(
      "risk_limit_sets",
      {
        id: riskLimitId,
        name: "Baseline Risk Limits",
        max_position_size: 1.5,
        leverage_cap: 3,
        max_daily_loss: 200,
        max_drawdown: 300,
        max_open_positions: 3,
        effective_from: now,
        active: true,
        created_at: now,
        updated_at: now,
      },
      ["id"],
    );

    await upsertRlOpsRow(
      "feature_set_versions",
      {
        id: featureSetId,
        label: "Seeded Features",
        description: "Seeded feature set",
        created_at: now,
        updated_at: now,
      },
      ["id"],
    );

    await upsertRlOpsRow(
      "dataset_versions",
      {
        id: datasetVersionId,
        pair: "Gold-USDT",
        interval: "1m",
        start_at: new Date(Date.now() - 3600000).toISOString(),
        end_at: now,
        checksum: datasetHash,
        dataset_hash: datasetHash,
        window_size: 30,
        stride: 1,
        feature_set_version_id: featureSetId,
        created_at: now,
      },
      ["id"],
    );

    await upsertRlOpsRow(
      "agent_versions",
      {
        id: agentVersionId,
        name: "Seeded Version",
        status: "promoted",
        dataset_version_id: datasetVersionId,
        dataset_hash: datasetHash,
        feature_set_version_id: featureSetId,
        artifact_uri: artifactUri,
        artifact_checksum: artifactChecksum,
        artifact_size_bytes: 16,
        promoted_at: now,
        created_at: now,
        updated_at: now,
      },
      ["id"],
    );

    await upsertRlOpsRow(
      "model_artifacts",
      {
        id: artifactId,
        agent_version_id: agentVersionId,
        artifact_uri: artifactUri,
        artifact_checksum: artifactChecksum,
        artifact_size_bytes: 16,
        content_type: "application/zip",
        training_window_start: new Date(Date.now() - 7200000).toISOString(),
        training_window_end: now,
        created_at: now,
      },
      ["id"],
    );
  } else {
    const riskLimitResult = await convex
      .from("risk_limit_sets")
      .insert({
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
    if (riskLimitResult.error || !riskLimitResult.data) {
      throw new Error(`seed risk_limit_sets failed: ${riskLimitResult.error?.message ?? "missing data"}`);
    }
    const featureSetResult = await convex
      .from("feature_set_versions")
      .insert({
        label: `Seeded Features ${Date.now()}`,
        description: "Seeded feature set",
      })
      .select("*")
      .single();
    if (featureSetResult.error || !featureSetResult.data) {
      throw new Error(`seed feature_set_versions failed: ${featureSetResult.error?.message ?? "missing data"}`);
    }
    const featureSet = featureSetResult.data;
    const datasetVersionResult = await convex
      .from("dataset_versions")
      .insert({
        pair: "Gold-USDT",
        interval: "1m",
        start_at: new Date(Date.now() - 3600000).toISOString(),
        end_at: now,
        checksum: datasetHash,
        dataset_hash: datasetHash,
        window_size: 30,
        stride: 1,
        feature_set_version_id: featureSet.id,
      })
      .select("*")
      .single();
    if (datasetVersionResult.error || !datasetVersionResult.data) {
      throw new Error(`seed dataset_versions failed: ${datasetVersionResult.error?.message ?? "missing data"}`);
    }
    const datasetVersion = datasetVersionResult.data;
    const agentVersionResult = await convex
      .from("agent_versions")
      .insert({
        name: `Seeded Version ${Date.now()}`,
        status: "promoted",
        dataset_version_id: datasetVersion.id,
        dataset_hash: datasetHash,
        feature_set_version_id: featureSet.id,
        artifact_uri: artifactUri,
        artifact_checksum: artifactChecksum,
        artifact_size_bytes: 16,
        promoted_at: now,
      })
      .select("*")
      .single();
    if (agentVersionResult.error || !agentVersionResult.data) {
      throw new Error(`seed agent_versions failed: ${agentVersionResult.error?.message ?? "missing data"}`);
    }
    const modelArtifactResult = await convex
      .from("model_artifacts")
      .insert({
        agent_version_id: agentVersionResult.data.id,
        artifact_uri: artifactUri,
        artifact_checksum: artifactChecksum,
        artifact_size_bytes: 16,
        content_type: "application/zip",
        training_window_start: new Date(Date.now() - 7200000).toISOString(),
        training_window_end: now,
      })
      .select("*")
      .single();
    if (modelArtifactResult.error || !modelArtifactResult.data) {
      throw new Error(`seed model_artifacts failed: ${modelArtifactResult.error?.message ?? "missing data"}`);
    }
  }

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
      await upsertDataSourceStatus({
        pair,
        source_type: sourceType,
        last_seen_at: now,
        freshness_threshold_seconds: 120,
        status: "ok",
        updated_at: now,
      });
    }
  }

  const configPayload = {
    enabled: true,
    mode: "paper",
    max_position_size: 1.5,
    daily_loss_limit: 0,
    allowed_instruments: ["GOLD-USDT", "XAUTUSDT", "PAXGUSDT"],
    kill_switch: false,
    kill_switch_reason: null,
    min_confidence_score: 0,
    allowed_source_ids: [],
    promotion_required: false,
    promotion_min_trades: 0,
    promotion_min_win_rate: 0,
    promotion_min_net_pnl: 0,
    promotion_max_drawdown: 0,
  };

  if (rlOpsUsesTimescale()) {
    await updateAgentConfig(configPayload);
  } else {
    const existing = await convex.from("agent_configurations").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) {
      throw new Error(`seed agent_configurations probe failed: ${existing.error.message}`);
    }
    if (existing.data?.id) {
      const updated = await convex
        .from("agent_configurations")
        .update({ ...configPayload, updated_at: now })
        .eq("id", existing.data.id)
        .select("*")
        .single();
      if (updated.error) {
        throw new Error(`seed agent_configurations update failed: ${updated.error.message}`);
      }
    } else {
      const created = await convex.from("agent_configurations").insert(configPayload).select("*").single();
      if (created.error) {
        throw new Error(`seed agent_configurations insert failed: ${created.error.message}`);
      }
    }
  }
}

const [timescaleAvailable, convexAvailable] = await Promise.all([hasTimescaleConnectivity(), hasConvexConnectivity()]);
const dbAvailable = timescaleAvailable || convexAvailable;

process.env.TIMESCALE_TEST_ENABLED = timescaleAvailable ? "true" : "false";
process.env.CONVEX_TEST_ENABLED = convexAvailable ? "true" : "false";
process.env.DB_TEST_ENABLED = dbAvailable ? "true" : "false";

if (dbAvailable) {
  await seedTestData();
}
