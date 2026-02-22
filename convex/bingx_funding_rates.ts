import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const fundingSchema = v.object({
  pair: v.string(),
  funding_time: v.string(),
  funding_rate: v.number(),
  source: v.optional(v.union(v.string(), v.null())),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: {
    rows: v.array(fundingSchema),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const results = [];
    const deduped = new Map<string, (typeof args.rows)[number]>();
    for (const row of args.rows) {
      deduped.set(`${row.pair}:${row.funding_time}`, row);
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
        (a, b) => new Date(a.funding_time).getTime() - new Date(b.funding_time).getTime(),
      );
      const minTime = sorted[0]?.funding_time;
      const maxTime = sorted[sorted.length - 1]?.funding_time;
      const existingByTime = new Map<string, typeof sorted[number] & { _id: any }>();

      if (minTime && maxTime) {
        const existingRows = await db
          .query("bingx_funding_rates")
          .withIndex("by_pair_funding_time", (q) =>
            q.eq("pair", group.pair).gte("funding_time", minTime).lte("funding_time", maxTime),
          )
          .collect();
        for (const existing of existingRows) {
          existingByTime.set(existing.funding_time, existing);
        }
      }

      for (const row of sorted) {
        const existing = existingByTime.get(row.funding_time);
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
          await db.insert("bingx_funding_rates", insertRow);
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
      .query("bingx_funding_rates")
      .withIndex("by_pair_funding_time", (q) => q.eq("pair", args.pair))
      .order("desc")
      .first();
    return row?.funding_time ?? null;
  },
});

export const earliestTime = query({
  args: {
    pair: v.string(),
  },
  handler: async ({ db }, args) => {
    const row = await db
      .query("bingx_funding_rates")
      .withIndex("by_pair_funding_time", (q) => q.eq("pair", args.pair))
      .order("asc")
      .first();
    return row?.funding_time ?? null;
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
      .query("bingx_funding_rates")
      .withIndex("by_pair_funding_time", (q) => {
        if (args.start && args.end) {
          return q.eq("pair", args.pair).gte("funding_time", args.start).lte("funding_time", args.end);
        }
        if (args.start) {
          return q.eq("pair", args.pair).gte("funding_time", args.start);
        }
        if (args.end) {
          return q.eq("pair", args.pair).lte("funding_time", args.end);
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
