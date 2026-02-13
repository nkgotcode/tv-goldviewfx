import { mkdirSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

type TableRow = { row: Record<string, unknown> | null };

function resolveTables(envTables: string | undefined, dbTables: string[]) {
  if (!envTables) {
    return dbTables;
  }
  return envTables
    .split(",")
    .map((table) => table.trim())
    .filter((table) => table.length > 0);
}

function isSafeTableName(table: string) {
  return /^[a-zA-Z0-9_]+$/.test(table);
}

async function fetchPublicTables(client: Client) {
  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  return result.rows
    .map((row) => row.table_name)
    .filter((table) => !table.startsWith("pg_") && table !== "schema_migrations");
}

async function exportTable(client: Client, table: string, outputDir: string) {
  if (!isSafeTableName(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }
  const outputPath = resolve(outputDir, `${table}.jsonl`);
  const stream = createWriteStream(outputPath, { encoding: "utf-8" });
  const result = await client.query<TableRow>(`select row_to_json(t) as row from "${table}" t`);
  for (const row of result.rows) {
    if (!row.row) continue;
    stream.write(`${JSON.stringify(row.row)}\n`);
  }
  await new Promise<void>((resolveStream, reject) => {
    stream.end(() => resolveStream());
    stream.on("error", reject);
  });
  return outputPath;
}

async function main() {
  const databaseUrl = process.env.LEGACY_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("LEGACY_DATABASE_URL is required.");
  }
  const outputDir = process.env.LEGACY_EXPORT_DIR
    ? resolve(process.env.LEGACY_EXPORT_DIR)
    : resolve(process.cwd(), "data/legacy-export");

  mkdirSync(outputDir, { recursive: true });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const dbTables = await fetchPublicTables(client);
    const tables = resolveTables(process.env.LEGACY_TABLES, dbTables);
    for (const table of tables) {
      const path = await exportTable(client, table, outputDir);
      console.log(`Exported ${table} -> ${path}`);
    }
  } finally {
    await client.end();
  }
}

await main();
