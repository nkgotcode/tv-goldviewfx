import { mutation as convexMutation, query as convexQuery } from "./_generated/server";
import { v } from "convex/values";

type AnyDoc = Record<string, unknown> & {
  _id?: string;
  _creationTime?: number;
};

const filterSchema = v.object({
  field: v.string(),
  op: v.string(),
  value: v.any(),
});

const orderSchema = v.object({
  field: v.string(),
  direction: v.union(v.literal("asc"), v.literal("desc")),
});

function isNil(value: unknown) {
  return value === null || value === undefined;
}

function matchesILike(value: unknown, pattern: string) {
  const text = String(value ?? "").toLowerCase();
  const normalized = pattern.toLowerCase();
  const startsWith = normalized.startsWith("%");
  const endsWith = normalized.endsWith("%");
  const core = normalized.replace(/^%/, "").replace(/%$/, "");
  if (startsWith && endsWith) {
    return text.includes(core);
  }
  if (startsWith) {
    return text.endsWith(core);
  }
  if (endsWith) {
    return text.startsWith(core);
  }
  return text === core;
}

function isPushdownSupported(filter: { field: string; op: string; value: unknown }) {
  switch (filter.op) {
    case "eq":
    case "gte":
    case "lte":
      return true;
    case "is":
      return true;
    case "in":
      return Array.isArray(filter.value) && filter.value.length > 0;
    default:
      return false;
  }
}

function buildFilterExpression(q: any, filter: { field: string; op: string; value: unknown }) {
  const field = q.field(filter.field);
  switch (filter.op) {
    case "eq":
      return q.eq(field, filter.value);
    case "gte":
      return q.gte(field, filter.value);
    case "lte":
      return q.lte(field, filter.value);
    case "is":
      return q.eq(field, isNil(filter.value) ? null : filter.value);
    case "in": {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        return null;
      }
      const expressions = filter.value.map((value) => q.eq(field, value));
      return expressions.length === 1 ? expressions[0] : q.or(...expressions);
    }
    default:
      return null;
  }
}

function buildAndExpression(q: any, filters: Array<{ field: string; op: string; value: unknown }>) {
  if (filters.length === 0) return null;
  const expressions = [];
  for (const filter of filters) {
    const expr = buildFilterExpression(q, filter);
    if (!expr) return null;
    expressions.push(expr);
  }
  if (expressions.length === 1) {
    return expressions[0];
  }
  return q.and(...expressions);
}

function matchesFilter(doc: AnyDoc, filter: { field: string; op: string; value: unknown }) {
  const value = doc[filter.field];
  switch (filter.op) {
    case "eq":
      return value === filter.value;
    case "in":
      return Array.isArray(filter.value) && filter.value.some((item) => item === value);
    case "gte":
      return !isNil(value) && !isNil(filter.value)
        ? (value as number | string) >= (filter.value as number | string)
        : false;
    case "lte":
      return !isNil(value) && !isNil(filter.value)
        ? (value as number | string) <= (filter.value as number | string)
        : false;
    case "ilike":
      return typeof filter.value === "string" && matchesILike(value, filter.value);
    case "is":
      return isNil(filter.value) ? isNil(value) : value === filter.value;
    default:
      return false;
  }
}

function applyFilters(
  docs: AnyDoc[],
  filters: Array<{ field: string; op: string; value: unknown }>,
  orFilters: Array<{ field: string; op: string; value: unknown }>,
) {
  const andFiltered = filters.length
    ? docs.filter((doc) => filters.every((filter) => matchesFilter(doc, filter)))
    : docs;
  if (orFilters.length === 0) {
    return andFiltered;
  }
  return andFiltered.filter((doc) => orFilters.some((filter) => matchesFilter(doc, filter)));
}

function applyOrder(docs: AnyDoc[], order?: { field: string; direction: "asc" | "desc" }) {
  if (!order) return docs;
  const direction = order.direction === "desc" ? -1 : 1;
  return [...docs].sort((a, b) => {
    const left = a[order.field];
    const right = b[order.field];
    if (left === right) return 0;
    if (left === undefined || left === null) return 1 * direction;
    if (right === undefined || right === null) return -1 * direction;
    return left > right ? direction : -direction;
  });
}

function applyWindow(docs: AnyDoc[], range?: { from: number; to: number }, limit?: number) {
  if (range) {
    const start = Math.max(0, range.from);
    const end = Math.max(start, range.to + 1);
    return docs.slice(start, end);
  }
  if (limit !== undefined) {
    return docs.slice(0, Math.max(0, limit));
  }
  return docs;
}

function applySelect(doc: AnyDoc, select?: string[]) {
  if (!select || select.length === 0) {
    const { _id, _creationTime, ...rest } = doc as Record<string, unknown>;
    return rest;
  }
  const selected: Record<string, unknown> = {};
  for (const field of select) {
    selected[field] = doc[field];
  }
  return selected;
}

function normalizeDoc(doc: AnyDoc) {
  const { _id, _creationTime, ...rest } = doc as Record<string, unknown>;
  return rest;
}

function ensureId(row: Record<string, unknown>) {
  if (!row.id) {
    const cryptoGlobal = typeof crypto !== "undefined" ? crypto : null;
    if (cryptoGlobal && typeof cryptoGlobal.randomUUID === "function") {
      row.id = cryptoGlobal.randomUUID();
    } else {
      row.id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
}

function applyInsertDefaults(table: string, row: Record<string, unknown>, nowIso: string) {
  ensureId(row);
  if (isNil(row.created_at)) {
    row.created_at = nowIso;
  }
  if (isNil(row.updated_at)) {
    row.updated_at = nowIso;
  }
  if (table === "ideas" || table === "telegram_posts" || table === "news_items") {
    if (isNil(row.ingested_at)) {
      row.ingested_at = nowIso;
    }
  }
  if (table === "signals") {
    if (isNil(row.generated_at)) {
      row.generated_at = nowIso;
    }
  }
  if (table === "sync_runs" || table === "ingestion_runs") {
    if (isNil(row.started_at)) {
      row.started_at = nowIso;
    }
  }
  if (table === "trade_executions") {
    if (isNil(row.executed_at)) {
      row.executed_at = nowIso;
    }
  }
  if (table === "trade_state_events") {
    if (isNil(row.recorded_at)) {
      row.recorded_at = nowIso;
    }
  }
  if (table === "trades") {
    if (isNil(row.closed_at)) {
      row.closed_at = null;
    }
  }
  if (table === "account_risk_policies") {
    if (isNil(row.effective_from)) {
      row.effective_from = nowIso;
    }
  }
  if (table === "observability_metrics") {
    if (isNil(row.recorded_at)) {
      row.recorded_at = nowIso;
    }
  }
  if (table === "ops_alerts") {
    if (isNil(row.triggered_at)) {
      row.triggered_at = nowIso;
    }
  }
  if (table === "idea_revisions") {
    if (isNil(row.recorded_at)) {
      row.recorded_at = nowIso;
    }
  }
  if (table === "tradingview_ideas" || table === "tradingview_idea_updates") {
    if (isNil(row.scraped_at)) {
      row.scraped_at = nowIso;
    }
  }
  return row;
}

function applyUpdateDefaults(row: Record<string, unknown>, nowIso: string) {
  if (isNil(row.updated_at)) {
    row.updated_at = nowIso;
  }
  return row;
}

async function collectDocs(
  db: { query: (table: string) => any },
  table: string,
  filters: Array<{ field: string; op: string; value: unknown }>,
) {
  const canPushdown = filters.length > 0 && filters.every(isPushdownSupported);
  let query = db.query(table);
  if (canPushdown) {
    query = query.filter((q: any) => buildAndExpression(q, filters));
  }
  const docs = await query.collect();
  return { docs: docs as AnyDoc[], pushdown: canPushdown };
}

export const query = convexQuery({
  args: {
    table: v.string(),
    select: v.optional(v.array(v.string())),
    filters: v.array(filterSchema),
    orFilters: v.optional(v.array(filterSchema)),
    order: v.optional(orderSchema),
    range: v.optional(v.object({ from: v.number(), to: v.number() })),
    limit: v.optional(v.number()),
    includeCount: v.optional(v.boolean()),
  },
  handler: async ({ db }, args) => {
    const orFilters = args.orFilters ?? [];
    const canPushdown = args.filters.length > 0 && args.filters.every(isPushdownSupported) && orFilters.length === 0;
    let queryBuilder = db.query(args.table);
    if (canPushdown) {
      queryBuilder = queryBuilder.filter((q: any) => buildAndExpression(q, args.filters));
    }
    const docs = (await queryBuilder.collect()) as AnyDoc[];
    const needsPostFilter = orFilters.length > 0 || (!canPushdown && args.filters.length > 0);
    const filtered = needsPostFilter ? applyFilters(docs, args.filters, orFilters) : docs;
    const ordered = applyOrder(filtered, args.order);
    const count = args.includeCount ? ordered.length : undefined;
    const windowed = applyWindow(ordered, args.range, args.limit);
    const data = windowed.map((doc) => applySelect(doc, args.select));
    return { data, count };
  },
});

export const write = convexMutation({
  args: {
    table: v.string(),
    action: v.union(v.literal("insert"), v.literal("update"), v.literal("delete"), v.literal("upsert")),
    payload: v.optional(v.any()),
    filters: v.optional(v.array(filterSchema)),
    onConflict: v.optional(v.array(v.string())),
    select: v.optional(v.array(v.string())),
  },
  handler: async ({ db }, args) => {
    const nowIso = new Date().toISOString();
    const filters = args.filters ?? [];
    const onConflict = args.onConflict ?? [];
    const select = args.select;
    const resultDocs: AnyDoc[] = [];

    if (args.action === "insert") {
      const rows = Array.isArray(args.payload) ? args.payload : [args.payload];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const payload = applyInsertDefaults(args.table, { ...(row as Record<string, unknown>) }, nowIso);
        await db.insert(args.table, payload);
        resultDocs.push(payload);
      }
    } else if (args.action === "update") {
      const { docs, pushdown } = await collectDocs(db, args.table, filters);
      const filtered = pushdown ? docs : applyFilters(docs, filters, []);
      for (const doc of filtered) {
        if (!doc._id) continue;
        const patch = applyUpdateDefaults({ ...(args.payload as Record<string, unknown>) }, nowIso);
        await db.patch(doc._id as any, patch);
        resultDocs.push({ ...doc, ...patch });
      }
    } else if (args.action === "delete") {
      const { docs, pushdown } = await collectDocs(db, args.table, filters);
      const filtered = pushdown ? docs : applyFilters(docs, filters, []);
      for (const doc of filtered) {
        if (!doc._id) continue;
        await db.delete(doc._id as any);
        resultDocs.push(doc);
      }
    } else if (args.action === "upsert") {
      const rows = Array.isArray(args.payload) ? args.payload : [args.payload];
      const index = new Map<string, Record<string, unknown>>();
      const cleanedRows = rows.filter((row) => row && typeof row === "object") as Array<Record<string, unknown>>;
      if (onConflict.length > 0) {
        let existingDocs: Array<Record<string, unknown>> = [];
        if (cleanedRows.length === 1) {
          const row = cleanedRows[0];
          const conflictFilters = onConflict.map((field) => ({
            field,
            op: "eq",
            value: row[field],
          }));
          const { docs, pushdown } = await collectDocs(db, args.table, conflictFilters);
          existingDocs = pushdown ? docs : applyFilters(docs, conflictFilters, []);
        } else {
          const constantFilters: Array<{ field: string; op: string; value: unknown }> = [];
          for (const field of onConflict) {
            const values = new Set(cleanedRows.map((row) => row[field]).filter((value) => value !== undefined));
            if (values.size === 1) {
              constantFilters.push({ field, op: "eq", value: values.values().next().value });
            }
          }
          if (constantFilters.length > 0) {
            const { docs, pushdown } = await collectDocs(db, args.table, constantFilters);
            existingDocs = pushdown ? docs : applyFilters(docs, constantFilters, []);
          } else {
            existingDocs = (await db.query(args.table).collect()) as Array<Record<string, unknown>>;
          }
        }
        for (const doc of existingDocs) {
          const key = onConflict.map((field) => JSON.stringify(doc[field])).join("|");
          index.set(key, doc);
        }
      }
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const payload = { ...(row as Record<string, unknown>) };
        ensureId(payload);
        const key = onConflict.length
          ? onConflict.map((field) => JSON.stringify(payload[field])).join("|")
          : "";
        const existing = onConflict.length ? index.get(key) : undefined;
        if (existing && existing._id) {
          const patch = applyUpdateDefaults(payload, nowIso);
          await db.patch(existing._id as any, patch);
          resultDocs.push({ ...existing, ...patch });
        } else {
          const inserted = applyInsertDefaults(args.table, payload, nowIso);
          await db.insert(args.table, inserted);
          resultDocs.push(inserted);
        }
      }
    }

    const data = resultDocs.map((doc) => applySelect(normalizeDoc(doc), select));
    return { data, count: data.length };
  },
});
