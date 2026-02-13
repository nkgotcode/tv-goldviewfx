import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const candleSchema = v.object({
  pair: v.string(),
  interval: v.string(),
  open_time: v.string(),
  close_time: v.string(),
  open: v.number(),
  high: v.number(),
  low: v.number(),
  close: v.number(),
  volume: v.number(),
  quote_volume: v.optional(v.union(v.number(), v.null())),
  source: v.optional(v.string()),
  id: v.optional(v.string()),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: {
    rows: v.array(candleSchema),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const results = [];
    const deduped = new Map<string, (typeof args.rows)[number]>();
    for (const row of args.rows) {
      deduped.set(`${row.pair}:${row.interval}:${row.open_time}`, row);
    }

    const grouped = new Map<string, { pair: string; interval: string; rows: (typeof args.rows)[number][] }>();
    for (const row of deduped.values()) {
      const key = `${row.pair}:${row.interval}`;
      const group = grouped.get(key);
      if (group) {
        group.rows.push(row);
      } else {
        grouped.set(key, { pair: row.pair, interval: row.interval, rows: [row] });
      }
    }

    for (const group of grouped.values()) {
      const sorted = [...group.rows].sort(
        (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
      );
      const minOpen = sorted[0]?.open_time;
      const maxOpen = sorted[sorted.length - 1]?.open_time;
      const existingByOpenTime = new Map<string, typeof sorted[number] & { _id: any }>();

      if (minOpen && maxOpen) {
        const existingRows = await db
          .query("bingx_candles")
          .withIndex("by_pair_interval_open_time", (q) =>
            q
              .eq("pair", group.pair)
              .eq("interval", group.interval)
              .gte("open_time", minOpen)
              .lte("open_time", maxOpen),
          )
          .collect();
        for (const existing of existingRows) {
          existingByOpenTime.set(existing.open_time, existing);
        }
      }

      for (const row of sorted) {
        const existing = existingByOpenTime.get(row.open_time);
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
          await db.insert("bingx_candles", insertRow);
          results.push(insertRow);
        }
      }
    }
    return results;
  },
});

export const listByRange = query({
  args: {
    pair: v.string(),
    interval: v.string(),
    start: v.optional(v.string()),
    end: v.optional(v.string()),
    limit: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async ({ db }, args) => {
    const queryBuilder = db
      .query("bingx_candles")
      .withIndex("by_pair_interval_open_time", (q) => {
        if (args.start && args.end) {
          return q
            .eq("pair", args.pair)
            .eq("interval", args.interval)
            .gte("open_time", args.start)
            .lte("open_time", args.end);
        }
        if (args.start) {
          return q.eq("pair", args.pair).eq("interval", args.interval).gte("open_time", args.start);
        }
        if (args.end) {
          return q.eq("pair", args.pair).eq("interval", args.interval).lte("open_time", args.end);
        }
        return q.eq("pair", args.pair).eq("interval", args.interval);
      })
      .order(args.order === "desc" ? "desc" : "asc");

    if (args.limit !== undefined) {
      return queryBuilder.take(args.limit);
    }
    return queryBuilder.collect();
  },
});

export const listOpenTimesByRange = query({
  args: {
    pair: v.string(),
    interval: v.string(),
    start: v.optional(v.string()),
    end: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async ({ db }, args) => {
    const queryBuilder = db
      .query("bingx_candles")
      .withIndex("by_pair_interval_open_time", (q) => {
        if (args.start && args.end) {
          return q
            .eq("pair", args.pair)
            .eq("interval", args.interval)
            .gte("open_time", args.start)
            .lte("open_time", args.end);
        }
        if (args.start) {
          return q.eq("pair", args.pair).eq("interval", args.interval).gte("open_time", args.start);
        }
        if (args.end) {
          return q.eq("pair", args.pair).eq("interval", args.interval).lte("open_time", args.end);
        }
        return q.eq("pair", args.pair).eq("interval", args.interval);
      })
      .order("asc");

    const rows =
      args.limit !== undefined ? await queryBuilder.take(args.limit) : await queryBuilder.collect();
    return rows.map((row) => row.open_time).filter(Boolean);
  },
});
