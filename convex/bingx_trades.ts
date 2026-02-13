import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const tradeSchema = v.object({
  pair: v.string(),
  trade_id: v.string(),
  price: v.number(),
  quantity: v.number(),
  side: v.string(),
  executed_at: v.string(),
  source: v.optional(v.union(v.string(), v.null())),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: {
    rows: v.array(tradeSchema),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const results = [];
    const deduped = new Map<string, (typeof args.rows)[number]>();
    for (const row of args.rows) {
      deduped.set(`${row.pair}:${row.trade_id}`, row);
    }

    for (const row of deduped.values()) {
      const existing = await db
        .query("bingx_trades")
        .withIndex("by_pair_trade_id", (q) => q.eq("pair", row.pair).eq("trade_id", row.trade_id))
        .first();
      if (existing?._id) {
        const patch = {
          ...row,
          updated_at: row.updated_at ?? nowIso,
        };
        await db.patch(existing._id, patch);
        results.push({ ...existing, ...patch });
      } else {
        const insertRow = {
          ...row,
          created_at: row.created_at ?? nowIso,
          updated_at: row.updated_at ?? nowIso,
        };
        await db.insert("bingx_trades", insertRow);
        results.push(insertRow);
      }
    }

    return results;
  },
});

export const latestTime = query({
  args: {
    pair: v.string(),
  },
  handler: async ({ db }, args) => {
    const row = await db
      .query("bingx_trades")
      .withIndex("by_pair_executed_at", (q) => q.eq("pair", args.pair))
      .order("desc")
      .first();
    return row?.executed_at ?? null;
  },
});
