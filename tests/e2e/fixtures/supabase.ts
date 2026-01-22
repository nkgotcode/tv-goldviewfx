import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_RESET_RETRY_DELAY_MS = 2000;
const SUPABASE_RESET_RETRY_ATTEMPTS = 3;

function getRootDir() {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(currentFile, "../../../..");
}

function runSupabase(args: string[], cwd: string) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf-8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Supabase command failed: supabase ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

function isResetRestartError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("error status 502") || message.includes("invalid response was received from the upstream server");
}

async function waitForSupabaseStatus(cwd: string) {
  for (let attempt = 1; attempt <= SUPABASE_RESET_RETRY_ATTEMPTS; attempt += 1) {
    const status = spawnSync("supabase", ["status", "--output", "json"], {
      cwd,
      encoding: "utf-8",
    });
    if (status.status === 0 && status.stdout.includes("{") && status.stdout.includes("}")) {
      return;
    }
    if (attempt < SUPABASE_RESET_RETRY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SUPABASE_RESET_RETRY_DELAY_MS));
    }
  }
  throw new Error("Supabase status unavailable after reset retry.");
}

export async function seedSupabase() {
  const rootDir = getRootDir();
  const seedFile = resolve(rootDir, "supabase", "seed.sql");
  if (!existsSync(seedFile)) {
    throw new Error(`Missing seed file: ${seedFile}`);
  }

  runSupabase(["start"], rootDir);
  try {
    runSupabase(["db", "reset", "--local"], rootDir);
  } catch (error) {
    if (!isResetRestartError(error)) {
      throw error;
    }
    console.warn("Supabase reset returned a 502 during restart; waiting for services to recover.");
    await waitForSupabaseStatus(rootDir);
  }
}

export default async function globalSetup() {
  await seedSupabase();
}
