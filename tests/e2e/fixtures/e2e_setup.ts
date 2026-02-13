import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const RESET_TOKEN = "local-e2e";
if (process.env.E2E_RESET_TOKEN && process.env.E2E_RESET_TOKEN !== RESET_TOKEN) {
  throw new Error("E2E_RESET_TOKEN must match the Convex e2e reset token.");
}

function getRootDir() {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(currentFile, "../../../..");
}

export function loadLocalEnv() {
  if (process.env.CONVEX_URL) {
    return;
  }
  const rootDir = getRootDir();
  const envPath = resolve(rootDir, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) continue;
    process.env[key] = rest.join("=").trim();
  }
}

function isLocalConvexUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

async function sleep(ms: number) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForConvex(client: ConvexHttpClient, retries = 30, delayMs = 1000) {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await client.query(anyApi.e2e.ping, {});
      return;
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw lastError ?? new Error("Convex did not respond to ping.");
}

export async function runE2ESetup() {
  loadLocalEnv();
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error("CONVEX_URL is required to run e2e tests.");
  }
  if (!isLocalConvexUrl(convexUrl) && process.env.E2E_ALLOW_NONLOCAL_RESET !== "true") {
    throw new Error(`Refusing to reset non-local Convex URL: ${convexUrl}`);
  }

  const client = new ConvexHttpClient(convexUrl);
  await waitForConvex(client);
  await client.mutation(anyApi.e2e.reset, { token: RESET_TOKEN });
  await client.mutation(anyApi.e2e.seed, { token: RESET_TOKEN });
}
