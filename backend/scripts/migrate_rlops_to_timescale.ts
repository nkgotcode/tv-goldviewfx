import { convex } from "../src/db/client";
import {
  assertTimescaleRlOpsReady,
  countRlOpsRows,
  listRlOpsTableColumns,
  upsertRlOpsRow,
} from "../src/db/timescale/rl_ops";

type TablePlan = {
  table: string;
  orderBy: string;
  recentField: string;
  conflictKeys: string[];
};

const TABLES: TablePlan[] = [
  { table: "feature_set_versions", orderBy: "created_at", recentField: "created_at", conflictKeys: ["id"] },
  { table: "dataset_versions", orderBy: "created_at", recentField: "created_at", conflictKeys: ["id"] },
  { table: "agent_versions", orderBy: "created_at", recentField: "created_at", conflictKeys: ["id"] },
  { table: "model_artifacts", orderBy: "created_at", recentField: "created_at", conflictKeys: ["id"] },
  { table: "evaluation_reports", orderBy: "created_at", recentField: "created_at", conflictKeys: ["id"] },
  { table: "learning_updates", orderBy: "started_at", recentField: "started_at", conflictKeys: ["id"] },
];

function parseArgs() {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.split("=", 2);
    if (!key.startsWith("--")) continue;
    args.set(key.slice(2), value ?? "true");
  }
  const batchSizeRaw = Number.parseInt(args.get("batch-size") ?? "200", 10);
  const recentDaysRaw = Number.parseInt(args.get("recent-days") ?? "60", 10);
  return {
    dryRun: (args.get("dry-run") ?? "false").toLowerCase() === "true",
    batchSize: Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 200,
    recentDays: Number.isFinite(recentDaysRaw) && recentDaysRaw > 0 ? recentDaysRaw : 60,
  };
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeRow(row: Record<string, unknown>, allowedColumns: Set<string>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowedColumns.has(key)) continue;
    normalized[key] = value === undefined ? null : value;
  }
  return normalized;
}

async function fetchConvexBatch(params: {
  table: string;
  orderBy: string;
  recentField: string;
  cutoff: string;
  from: number;
  to: number;
}) {
  const result = await convex
    .from(params.table)
    .select("*")
    .gte(params.recentField, params.cutoff)
    .order(params.orderBy, { ascending: true })
    .range(params.from, params.to);
  if (result.error) {
    throw new Error(`Convex batch query failed for ${params.table}: ${result.error.message}`);
  }
  return result;
}

async function migrateTable(plan: TablePlan, options: { cutoff: string; batchSize: number; dryRun: boolean }) {
  let migrated = 0;
  let offset = 0;
  const allowedColumns = new Set(await listRlOpsTableColumns(plan.table));
  while (true) {
    const batch = await fetchConvexBatch({
      table: plan.table,
      orderBy: plan.orderBy,
      recentField: plan.recentField,
      cutoff: options.cutoff,
      from: offset,
      to: offset + options.batchSize - 1,
    });
    const rows = batch.data ?? [];
    if (rows.length === 0) break;

    for (const row of rows as Record<string, unknown>[]) {
      if (!options.dryRun) {
        await upsertRlOpsRow(plan.table, normalizeRow(row, allowedColumns), plan.conflictKeys);
      }
      migrated += 1;
    }
    offset += rows.length;
    if (rows.length < options.batchSize) break;
  }
  return migrated;
}

async function countConvexRows(plan: TablePlan, cutoff: string) {
  const result = await convex
    .from(plan.table)
    .select("id", { count: "exact", head: true })
    .gte(plan.recentField, cutoff);
  if (result.error) {
    throw new Error(`Convex count query failed for ${plan.table}: ${result.error.message}`);
  }
  return result.count ?? 0;
}

async function main() {
  const { dryRun, batchSize, recentDays } = parseArgs();
  const cutoff = cutoffIso(recentDays);

  process.env.TIMESCALE_RL_OPS_ENABLED = "true";
  if (!process.env.TIMESCALE_URL) {
    throw new Error("TIMESCALE_URL is required");
  }
  if (!process.env.CONVEX_URL) {
    throw new Error("CONVEX_URL is required");
  }

  await assertTimescaleRlOpsReady();

  console.log(
    JSON.stringify(
      {
        action: "start_migration",
        dryRun,
        batchSize,
        recentDays,
        cutoff,
      },
      null,
      2,
    ),
  );

  for (const table of TABLES) {
    const sourceCount = await countConvexRows(table, cutoff);
    const migrated = await migrateTable(table, { cutoff, batchSize, dryRun });
    const targetCount = await countRlOpsRows(table.table);
    console.log(
      JSON.stringify(
        {
          table: table.table,
          sourceCount,
          migrated,
          targetCount,
          dryRun,
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        action: "migration_complete",
        dryRun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`RL ops migration failed: ${message}`);
  process.exit(1);
});
