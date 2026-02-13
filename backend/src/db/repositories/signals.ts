import { convex } from "../client";
import { assertNoError } from "./base";

export type SignalInsert = {
  source_type: "tradingview" | "telegram" | "news";
  idea_id: string | null;
  telegram_post_id?: string | null;
  news_item_id?: string | null;
  enrichment_id: string | null;
  payload_summary: string | null;
  confidence_score: number;
};

export async function insertSignal(payload: SignalInsert) {
  const result = await convex.from("signals").insert(payload).select("*").single();
  return assertNoError(result, "insert signal");
}

export async function listSignals(filters?: {
  sourceType?: string;
  minConfidence?: number;
  query?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = convex
    .from("signals")
    .select("*", { count: "exact" })
    .order("generated_at", { ascending: false });
  if (filters?.sourceType) {
    query.eq("source_type", filters.sourceType);
  }
  if (filters?.minConfidence !== undefined) {
    query.gte("confidence_score", filters.minConfidence);
  }
  if (filters?.start) {
    query.gte("generated_at", filters.start);
  }
  if (filters?.end) {
    query.lte("generated_at", filters.end);
  }
  if (filters?.query) {
    const like = `%${filters.query}%`;
    query.ilike("payload_summary", like);
  }
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);

  const result = await query;
  const data = assertNoError(result, "list signals");
  return { data, total: result.count ?? data.length };
}

export async function listRecentSignals(limit = 10) {
  const result = await convex
    .from("signals")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list recent signals");
}
