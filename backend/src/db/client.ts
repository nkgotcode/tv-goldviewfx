import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { loadEnv } from "../config/env";

type FilterOp = "eq" | "in" | "gte" | "lte" | "ilike" | "is";

type Filter = {
  field: string;
  op: FilterOp;
  value: unknown;
};

type Order = {
  field: string;
  direction: "asc" | "desc";
};

type QueryRequest = {
  table: string;
  select?: string[];
  filters: Filter[];
  orFilters?: Filter[];
  order?: Order;
  range?: { from: number; to: number };
  limit?: number;
  includeCount?: boolean;
};

type WriteRequest = {
  table: string;
  action: "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters?: Filter[];
  onConflict?: string[];
  select?: string[];
};

export type DbResponse<T> = {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
};

const env = loadEnv();
let client: ConvexHttpClient<typeof anyApi> | null = null;

function getConvexClient() {
  if (!env.CONVEX_URL) {
    throw new Error("CONVEX_URL is required for Convex-backed operations.");
  }
  if (!client) {
    client = new ConvexHttpClient(env.CONVEX_URL);
  }
  return client;
}

export const convexClient = {
  query: (...args: Parameters<ConvexHttpClient<typeof anyApi>["query"]>) => getConvexClient().query(...args),
  mutation: (...args: Parameters<ConvexHttpClient<typeof anyApi>["mutation"]>) => getConvexClient().mutation(...args),
  action: (...args: Parameters<ConvexHttpClient<typeof anyApi>["action"]>) => getConvexClient().action(...args),
};

function parseSelect(select?: string) {
  if (!select || select.trim() === "*" || select.trim() === "") {
    return undefined;
  }
  const fields = select
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
  const cleaned = fields.filter((field) => !field.includes("(") && !field.includes("!"));
  return cleaned.length ? cleaned : undefined;
}

function parseOrFilters(expression: string) {
  const parts = expression
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const filters: Filter[] = [];
  for (const part of parts) {
    const [field, op, ...rest] = part.split(".");
    if (!field || !op) continue;
    const value = rest.join("."); // allow dots inside pattern
    if (op !== "ilike" && op !== "eq") continue;
    filters.push({ field, op, value });
  }
  return filters;
}

class SelectBuilder<T> implements PromiseLike<DbResponse<T[]>> {
  private readonly table: string;
  private readonly filters: Filter[] = [];
  private readonly orFilters: Filter[] = [];
  private orderBy?: Order;
  private rangeBy?: { from: number; to: number };
  private limitBy?: number;
  private selectFields?: string[];
  private includeCount = false;

  constructor(table: string) {
    this.table = table;
  }

  select(select?: string, options?: { count?: "exact"; head?: boolean }) {
    this.selectFields = parseSelect(select);
    if (options?.count === "exact") {
      this.includeCount = true;
    }
    if (options?.head) {
      this.limitBy = 0;
    }
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ field, op: "in", value: values });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }

  ilike(field: string, value: string) {
    this.filters.push({ field, op: "ilike", value });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, op: "is", value });
    return this;
  }

  or(expression: string) {
    this.orFilters.push(...parseOrFilters(expression));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = { field, direction: options?.ascending === false ? "desc" : "asc" };
    return this;
  }

  range(from: number, to: number) {
    this.rangeBy = { from, to };
    return this;
  }

  limit(count: number) {
    this.limitBy = count;
    return this;
  }

  async single() {
    return this.resolveSingle(false);
  }

  async maybeSingle() {
    return this.resolveSingle(true);
  }

  async resolveSingle(allowEmpty: boolean) {
    const response = await this.execute();
    if (response.error) {
      return response;
    }
    const rows = response.data ?? [];
    const row = rows[0] ?? null;
    if (!row && !allowEmpty) {
      return { ...response, data: null, error: { message: "No rows returned" } };
    }
    return { ...response, data: row };
  }

  async execute(): Promise<DbResponse<T[]>> {
    const request: QueryRequest = {
      table: this.table,
      select: this.selectFields,
      filters: this.filters,
      order: this.orderBy,
      range: this.rangeBy,
      limit: this.limitBy,
      includeCount: this.includeCount,
    };
    if (this.orFilters.length > 0) {
      request.orFilters = this.orFilters;
    }
    try {
      const response = await getConvexClient().query(anyApi.data.query, request);
      return { data: response.data ?? null, error: null, count: response.count ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Query failed";
      return { data: null, error: { message } };
    }
  }

  then<TResult1 = DbResponse<T[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResponse<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class WriteBuilder<T> implements PromiseLike<DbResponse<T[]>> {
  private readonly table: string;
  private readonly action: WriteRequest["action"];
  private readonly payload?: unknown;
  private readonly filters: Filter[] = [];
  private readonly onConflict?: string[];
  private selectFields?: string[];

  constructor(table: string, action: WriteRequest["action"], payload?: unknown, onConflict?: string[]) {
    this.table = table;
    this.action = action;
    this.payload = payload;
    this.onConflict = onConflict;
  }

  select(select?: string) {
    this.selectFields = parseSelect(select);
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ field, op: "in", value: values });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }

  ilike(field: string, value: string) {
    this.filters.push({ field, op: "ilike", value });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, op: "is", value });
    return this;
  }

  async single() {
    return this.resolveSingle(false);
  }

  async maybeSingle() {
    return this.resolveSingle(true);
  }

  async resolveSingle(allowEmpty: boolean) {
    const response = await this.execute();
    if (response.error) {
      return response;
    }
    const rows = response.data ?? [];
    const row = rows[0] ?? null;
    if (!row && !allowEmpty) {
      return { ...response, data: null, error: { message: "No rows returned" } };
    }
    return { ...response, data: row };
  }

  async execute(): Promise<DbResponse<T[]>> {
    const request: WriteRequest = {
      table: this.table,
      action: this.action,
      payload: this.payload,
      filters: this.filters,
      onConflict: this.onConflict,
      select: this.selectFields,
    };
    try {
      const response = await getConvexClient().mutation(anyApi.data.write, request);
      return { data: response.data ?? null, error: null, count: response.count ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Write failed";
      return { data: null, error: { message } };
    }
  }

  then<TResult1 = DbResponse<T[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResponse<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class ConvexDb {
  from<T = Record<string, unknown>>(table: string) {
    return {
      select: (select?: string, options?: { count?: "exact"; head?: boolean }) =>
        new SelectBuilder<T>(table).select(select, options),
      insert: (payload: unknown) => new WriteBuilder<T>(table, "insert", payload),
      update: (payload: unknown) => new WriteBuilder<T>(table, "update", payload),
      delete: () => new WriteBuilder<T>(table, "delete"),
      upsert: (payload: unknown, options?: { onConflict?: string }) =>
        new WriteBuilder<T>(table, "upsert", payload, options?.onConflict?.split(",").map((f) => f.trim())),
    };
  }
}

export const convex = new ConvexDb();
