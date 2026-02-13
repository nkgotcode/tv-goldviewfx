import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const orderbookSchema = v.object({
  pair: v.string(),
  captured_at: v.string(),
  depth_level: v.number(),
  bids: v.any(),
  asks: v.any(),
  source: v.optional(v.union(v.string(), v.null())),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const insertOne = mutation({
  args: {
    row: orderbookSchema,
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const insertRow = {
      ...args.row,
      created_at: args.row.created_at ?? nowIso,
      updated_at: args.row.updated_at ?? nowIso,
    };
    await db.insert("bingx_orderbook_snapshots", insertRow);
    return insertRow;
  },
});

export const latestTime = query({
  args: {
    pair: v.string(),
  },
  handler: async ({ db }, args) => {
    const row = await db
      .query("bingx_orderbook_snapshots")
      .withIndex("by_pair_captured_at", (q) => q.eq("pair", args.pair))
      .order("desc")
      .first();
    return row?.captured_at ?? null;
  },
});
