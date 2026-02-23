import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const nullableString = v.optional(v.union(v.string(), v.null()));

function stripMetadata(doc: Record<string, unknown>) {
  const { _id, _creationTime, ...rest } = doc as Record<string, unknown>;
  return rest;
}

async function collectRuns(
  db: { query: (table: string) => any },
  args: {
    source_type?: string;
    source_id?: string | null;
    feed?: string | null;
    status?: string;
    search?: string;
    scan_limit?: number;
  },
  takeCount: number,
) {
  const requestedCount = Math.max(1, takeCount);
  const scanLimit = Math.min(10000, Math.max(100, args.scan_limit ?? 5000));
  const hasClientFilters = args.feed !== undefined || typeof args.status === "string" || Boolean(args.search?.trim());
  const scanCount =
    hasClientFilters
      ? Math.min(scanLimit, Math.max(requestedCount * 25, 250))
      : Math.min(scanLimit, requestedCount);

  let queryBuilder;
  if (args.source_type && args.source_id !== undefined) {
    queryBuilder = db
      .query("ingestion_runs")
      .withIndex("by_source_type_source_id_started_at", (q: any) =>
        q.eq("source_type", args.source_type).eq("source_id", args.source_id ?? null),
      );
  } else if (args.source_type) {
    queryBuilder = db.query("ingestion_runs").withIndex("by_source_type_started_at", (q: any) =>
      q.eq("source_type", args.source_type),
    );
  } else {
    queryBuilder = db.query("ingestion_runs").withIndex("by_started_at", (q: any) => q);
  }

  let docs = (await queryBuilder.order("desc").take(scanCount)) as Array<Record<string, unknown>>;
  if (args.feed !== undefined) {
    docs = docs.filter((doc) => (args.feed === null ? doc.feed == null : doc.feed === args.feed));
  }
  if (typeof args.status === "string" && args.status.trim()) {
    docs = docs.filter((doc) => doc.status === args.status);
  }
  const search = (args.search ?? "").trim().toLowerCase();
  if (search) {
    docs = docs.filter((doc) => {
      const haystack = [
        doc.id,
        doc.source_type,
        doc.source_id,
        doc.feed,
        doc.trigger,
        doc.status,
        doc.error_summary,
      ]
        .map((value) => (typeof value === "string" ? value : value == null ? "" : String(value)))
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }
  return docs.slice(0, requestedCount);
}

export const create = mutation({
  args: {
    source_type: v.string(),
    source_id: nullableString,
    feed: nullableString,
    trigger: v.string(),
    status: v.string(),
    new_count: v.optional(v.number()),
    updated_count: v.optional(v.number()),
    error_count: v.optional(v.number()),
    error_summary: nullableString,
    coverage_pct: v.optional(v.union(v.number(), v.null())),
    missing_fields_count: v.optional(v.union(v.number(), v.null())),
    parse_confidence: v.optional(v.union(v.number(), v.null())),
    started_at: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const row = {
      id,
      source_type: args.source_type,
      source_id: args.source_id ?? null,
      feed: args.feed ?? null,
      trigger: args.trigger,
      status: args.status,
      started_at: args.started_at ?? nowIso,
      finished_at: null,
      new_count: args.new_count ?? 0,
      updated_count: args.updated_count ?? 0,
      error_count: args.error_count ?? 0,
      error_summary: args.error_summary ?? null,
      coverage_pct: args.coverage_pct ?? null,
      missing_fields_count: args.missing_fields_count ?? null,
      parse_confidence: args.parse_confidence ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await db.insert("ingestion_runs", row);
    return row;
  },
});

export const startIfIdle = mutation({
  args: {
    source_type: v.string(),
    source_id: nullableString,
    feed: nullableString,
    trigger: v.string(),
    timeout_minutes: v.optional(v.number()),
    started_at: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const timeoutMs = Math.max(0, args.timeout_minutes ?? 0) * 60 * 1000;
    const docs = await collectRuns(
      db,
      {
        source_type: args.source_type,
        source_id: args.source_id ?? null,
        feed: args.feed ?? null,
      },
      100,
    );

    const runningDocs = docs.filter((doc) => doc.status === "running");
    const staleRuns = runningDocs.filter((doc) => {
      if (timeoutMs <= 0) return false;
      const startedAtRaw = typeof doc.started_at === "string" ? doc.started_at : null;
      const startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : Number.NaN;
      return Number.isFinite(startedAtMs) && nowMs - startedAtMs > timeoutMs;
    });
    const staleRunIds: string[] = [];

    for (const stale of staleRuns) {
      await db.patch((stale as { _id: any })._id, {
        status: "failed",
        finished_at: nowIso,
        error_count: ((stale.error_count as number | undefined) ?? 0) + 1,
        error_summary: "timeout",
        updated_at: nowIso,
      });
      if (typeof stale.id === "string") {
        staleRunIds.push(stale.id);
      }
    }

    const activeRun = runningDocs.find((doc) => {
      if (timeoutMs <= 0) return true;
      const startedAtRaw = typeof doc.started_at === "string" ? doc.started_at : null;
      const startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : Number.NaN;
      if (!Number.isFinite(startedAtMs)) {
        return true;
      }
      return nowMs - startedAtMs <= timeoutMs;
    });

    if (activeRun) {
        return {
          created: false,
          reason: "running",
          run: stripMetadata(activeRun),
          timed_out_run_id: staleRunIds.length > 0 ? staleRunIds[0] : null,
        };
    }

    const row = {
      id: crypto.randomUUID(),
      source_type: args.source_type,
      source_id: args.source_id ?? null,
      feed: args.feed ?? null,
      trigger: args.trigger,
      status: "running",
      started_at: args.started_at ?? nowIso,
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
    await db.insert("ingestion_runs", row);
    return {
      created: true,
      reason: staleRunIds.length > 0 ? "timeout_reclaimed" : "started",
      run: row,
      timed_out_run_id: staleRunIds.length > 0 ? staleRunIds[0] : null,
    };
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
    const existing = await db
      .query("ingestion_runs")
      .withIndex("by_run_id", (q: any) => q.eq("id", args.id))
      .first();
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
    source_type: v.optional(v.string()),
    source_id: nullableString,
    feed: nullableString,
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    page_size: v.optional(v.number()),
    scan_limit: v.optional(v.number()),
  },
  handler: async ({ db }, args) => {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(250, Math.max(1, args.page_size ?? 25));
    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize - 1;
    const docs = await collectRuns(db, args, Math.max(to + 1, args.scan_limit ?? 5000));
    const windowed = docs.slice(from, to + 1).map(stripMetadata);
    return {
      data: windowed,
      count: docs.length,
      scan: {
        limit: Math.min(10000, Math.max(100, args.scan_limit ?? 5000)),
        truncated: docs.length >= Math.min(10000, Math.max(100, args.scan_limit ?? 5000)),
      },
    };
  },
});

export const latest = query({
  args: {
    source_type: v.string(),
    source_id: nullableString,
    feed: nullableString,
  },
  handler: async ({ db }, args) => {
    const docs = await collectRuns(db, args, 1);
    return docs.length > 0 ? stripMetadata(docs[0]) : null;
  },
});
