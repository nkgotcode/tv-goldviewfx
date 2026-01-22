import { Hono } from "hono";
import { supabase } from "../../db/client";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/summary", async (c) => {
  const ideasCount = await supabase.from("ideas").select("id", { count: "exact", head: true });
  const signalsCount = await supabase.from("signals").select("id", { count: "exact", head: true });
  const tradesCount = await supabase.from("trades").select("id", { count: "exact", head: true });
  const lastSync = await supabase
    .from("sync_runs")
    .select("status, started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return c.json({
    idea_count: ideasCount.count ?? 0,
    signal_count: signalsCount.count ?? 0,
    trade_count: tradesCount.count ?? 0,
    last_sync_status: lastSync.data?.status ?? null,
    last_sync_at: lastSync.data?.started_at ?? null,
  });
});
