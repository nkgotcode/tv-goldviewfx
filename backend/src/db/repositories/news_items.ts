import { supabase } from "../client";
import { assertNoError } from "./base";

export type NewsItemInsert = {
  source_id: string | null;
  external_id?: string | null;
  title: string;
  url?: string | null;
  summary?: string | null;
  content?: string | null;
  content_hash?: string | null;
  published_at?: string | null;
  dedup_status?: "canonical" | "duplicate";
};

export async function findNewsByHash(contentHash: string) {
  const result = await supabase
    .from("news_items")
    .select("*")
    .eq("content_hash", contentHash)
    .eq("dedup_status", "canonical")
    .maybeSingle();
  return result.data;
}

export async function findNewsByExternalId(sourceId: string, externalId: string) {
  const result = await supabase
    .from("news_items")
    .select("*")
    .eq("source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();
  return result.data;
}

export async function insertNewsItem(payload: NewsItemInsert) {
  const result = await supabase
    .from("news_items")
    .insert({
      source_id: payload.source_id,
      external_id: payload.external_id ?? null,
      title: payload.title,
      url: payload.url ?? null,
      summary: payload.summary ?? null,
      content: payload.content ?? null,
      content_hash: payload.content_hash ?? null,
      published_at: payload.published_at ?? null,
      dedup_status: payload.dedup_status ?? "canonical",
    })
    .select("*")
    .single();
  return assertNoError(result, "insert news item");
}

export async function listNewsItems(filters?: {
  sourceId?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = supabase
    .from("news_items")
    .select("*", { count: "exact" })
    .order("published_at", { ascending: false });
  if (filters?.sourceId) {
    query.eq("source_id", filters.sourceId);
  }
  if (filters?.start) {
    query.gte("published_at", filters.start);
  }
  if (filters?.end) {
    query.lte("published_at", filters.end);
  }
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);

  const result = await query;
  const data = assertNoError(result, "list news items");
  return { data, total: result.count ?? data.length };
}
