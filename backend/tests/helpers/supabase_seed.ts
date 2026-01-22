import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_RESET_RETRY_DELAY_MS = 2000;
const SUPABASE_RESET_RETRY_ATTEMPTS = 3;

function getRootDir() {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(currentFile, "../../../..");
}

async function runSupabase(args: string[], cwd: string) {
  const proc = Bun.spawn(["supabase", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Supabase command failed: supabase ${args.join(" ")}\n${stderr || stdout}`);
  }

  return stdout.trim();
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
    try {
      const stdout = await runSupabase(["status", "--output", "json"], cwd);
      if (stdout.includes("{") && stdout.includes("}")) {
        return;
      }
    } catch (error) {
      if (attempt === SUPABASE_RESET_RETRY_ATTEMPTS) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, SUPABASE_RESET_RETRY_DELAY_MS));
  }
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Unable to parse Supabase status JSON: ${text}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function resolveStatusValue(status: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = status[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

async function getSupabaseStatus(cwd: string) {
  const stdout = await runSupabase(["status", "--output", "json"], cwd);
  const status = extractJson(stdout);
  return {
    apiUrl: resolveStatusValue(status, ["api_url", "apiUrl", "API_URL"]),
    serviceRoleKey: resolveStatusValue(status, ["service_role_key", "serviceRoleKey", "SERVICE_ROLE_KEY"]),
    anonKey: resolveStatusValue(status, ["anon_key", "anonKey", "ANON_KEY"]),
  };
}

export async function seedSupabase({ includeEdge = true, reset = true } = {}) {
  const rootDir = getRootDir();
  if (!Bun.which("supabase")) {
    throw new Error("Supabase CLI not found. Install it before running tests.");
  }
  const seedFile = resolve(rootDir, "supabase", "seed.sql");
  if (!existsSync(seedFile)) {
    throw new Error(`Missing seed file: ${seedFile}`);
  }

  if (reset) {
    await runSupabase(["start"], rootDir);
    try {
      await runSupabase(["db", "reset", "--local"], rootDir);
    } catch (error) {
      if (!isResetRestartError(error)) {
        throw error;
      }
      console.warn("Supabase reset returned a 502 during restart; waiting for services to recover.");
      await waitForSupabaseStatus(rootDir);
    }
  }
  if (!includeEdge) {
    return getSupabaseStatus(rootDir);
  }
  return getSupabaseStatus(rootDir);
}
