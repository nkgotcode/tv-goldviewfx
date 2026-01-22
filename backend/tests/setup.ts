import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { seedSupabase } from "./helpers/supabase_seed";

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

process.env.API_TOKEN = "";

const status = await seedSupabase();

if (status?.apiUrl) {
  process.env.SUPABASE_URL = status.apiUrl;
}
if (status?.serviceRoleKey) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.serviceRoleKey;
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase test configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

if (!/localhost|127\.0\.0\.1/.test(supabaseUrl)) {
  throw new Error(`Supabase URL must point to local Docker. Received: ${supabaseUrl}`);
}
