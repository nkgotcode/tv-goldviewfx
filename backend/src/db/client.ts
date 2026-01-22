import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../config/env";

const env = loadEnv();

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
