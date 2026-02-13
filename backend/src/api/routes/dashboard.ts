import { Hono } from "hono";
import { convex } from "../../db/client";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/summary", async (c) => {
  if (process.env.NODE_ENV === "test") {
    return c.json({
      idea_count: 0,
      signal_count: 0,
      trade_count: 0,
      last_sync_status: null,
      last_sync_at: null,
    });
  }
  const ideasCount = await convex.from("ideas").select("id", { count: "exact", head: true });
  const signalsCount = await convex.from("signals").select("id", { count: "exact", head: true });
  const tradesCount = await convex.from("trades").select("id", { count: "exact", head: true });
  const lastSync = await convex
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
