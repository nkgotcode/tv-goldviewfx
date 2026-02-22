import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const markIndexSchema = v.object({
  pair: v.string(),
  captured_at: v.string(),
  mark_price: v.number(),
  index_price: v.number(),
  source: v.optional(v.union(v.string(), v.null())),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: {
    rows: v.array(markIndexSchema),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const results = [];
    const deduped = new Map<string, (typeof args.rows)[number]>();
    for (const row of args.rows) {
      deduped.set(`${row.pair}:${row.captured_at}`, row);
    }

    const grouped = new Map<string, { pair: string; rows: (typeof args.rows)[number][] }>();
    for (const row of deduped.values()) {
      const group = grouped.get(row.pair);
      if (group) {
        group.rows.push(row);
      } else {
        grouped.set(row.pair, { pair: row.pair, rows: [row] });
      }
    }

    for (const group of grouped.values()) {
      const sorted = [...group.rows].sort(
        (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
      );
      const minTime = sorted[0]?.captured_at;
      const maxTime = sorted[sorted.length - 1]?.captured_at;
      const existingByTime = new Map<string, typeof sorted[number] & { _id: any }>();

      if (minTime && maxTime) {
        const existingRows = await db
          .query("bingx_mark_index_prices")
          .withIndex("by_pair_captured_at", (q) =>
            q.eq("pair", group.pair).gte("captured_at", minTime).lte("captured_at", maxTime),
          )
          .collect();
        for (const existing of existingRows) {
          existingByTime.set(existing.captured_at, existing);
        }
      }

      for (const row of sorted) {
        const existing = existingByTime.get(row.captured_at);
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
          await db.insert("bingx_mark_index_prices", insertRow);
          results.push(insertRow);
        }
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
      .query("bingx_mark_index_prices")
      .withIndex("by_pair_captured_at", (q) => q.eq("pair", args.pair))
      .order("desc")
      .first();
    return row?.captured_at ?? null;
  },
});

export const latestSnapshot = query({
  args: {
    pair: v.string(),
  },
  handler: async ({ db }, args) => {
    const row = await db
      .query("bingx_mark_index_prices")
      .withIndex("by_pair_captured_at", (q) => q.eq("pair", args.pair))
      .order("desc")
      .first();
    if (!row) return null;
    return {
      mark_price: row.mark_price,
      index_price: row.index_price,
      captured_at: row.captured_at,
    };
  },
});

export const listByRange = query({
  args: {
    pair: v.string(),
    start: v.optional(v.string()),
    end: v.optional(v.string()),
    limit: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async ({ db }, args) => {
    const queryBuilder = db
      .query("bingx_mark_index_prices")
      .withIndex("by_pair_captured_at", (q) => {
        if (args.start && args.end) {
          return q.eq("pair", args.pair).gte("captured_at", args.start).lte("captured_at", args.end);
        }
        if (args.start) {
          return q.eq("pair", args.pair).gte("captured_at", args.start);
        }
        if (args.end) {
          return q.eq("pair", args.pair).lte("captured_at", args.end);
        }
        return q.eq("pair", args.pair);
      })
      .order(args.order === "desc" ? "desc" : "asc");

    if (args.limit !== undefined) {
      return queryBuilder.take(args.limit);
    }
    return queryBuilder.collect();
  },
});
