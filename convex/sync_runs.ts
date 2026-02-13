import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const nullableString = v.optional(v.union(v.string(), v.null()));

function stripMetadata(doc: Record<string, unknown>) {
  const { _id, _creationTime, ...rest } = doc as Record<string, unknown>;
  return rest;
}

async function collectRuns(
  db: { query: (table: string) => any },
  args: { source_id?: string | null },
  takeCount: number,
) {
  let queryBuilder;
  if (args.source_id !== undefined) {
    queryBuilder = db
      .query("sync_runs")
      .withIndex("by_source_id_started_at", (q: any) => q.eq("source_id", args.source_id ?? null));
  } else {
    queryBuilder = db.query("sync_runs").withIndex("by_started_at", (q: any) => q);
  }

  return (await queryBuilder.order("desc").take(takeCount)) as Array<Record<string, unknown>>;
}

export const create = mutation({
  args: {
    source_id: v.string(),
    status: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const row = {
      id,
      source_id: args.source_id,
      status: args.status ?? "running",
      started_at: nowIso,
      finished_at: null,
      new_count: 0,
      updated_count: 0,
      error_count: 0,
      error_summary: null,
      coverage_pct: null,
      missing_fields_count: null,
      parse_confidence: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await db.insert("sync_runs", row);
    return row;
  },
});

export const complete = mutation({
  args: {
    id: v.string(),
    status: v.string(),
    new_count: v.number(),
    updated_count: v.number(),
    error_count: v.number(),
    error_summary: nullableString,
    coverage_pct: v.optional(v.union(v.number(), v.null())),
    missing_fields_count: v.optional(v.union(v.number(), v.null())),
    parse_confidence: v.optional(v.union(v.number(), v.null())),
  },
  handler: async ({ db }, args) => {
    const existing = await db.query("sync_runs").withIndex("by_run_id", (q: any) => q.eq("id", args.id)).first();
    if (!existing) {
      return null;
    }
    const patch = {
      status: args.status,
      finished_at: new Date().toISOString(),
      new_count: args.new_count,
      updated_count: args.updated_count,
      error_count: args.error_count,
      error_summary: args.error_summary ?? null,
      coverage_pct: args.coverage_pct ?? null,
      missing_fields_count: args.missing_fields_count ?? null,
      parse_confidence: args.parse_confidence ?? null,
      updated_at: new Date().toISOString(),
    };
    await db.patch(existing._id, patch);
    return stripMetadata({ ...existing, ...patch });
  },
});

export const list = query({
  args: {
    source_id: nullableString,
    page: v.optional(v.number()),
    page_size: v.optional(v.number()),
  },
  handler: async ({ db }, args) => {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(250, Math.max(1, args.page_size ?? 50));
    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize - 1;
    const docs = await collectRuns(db, args, to + 1);
    const windowed = docs.slice(from, to + 1).map(stripMetadata);
    return { data: windowed, count: null };
  },
});
