import { supabase } from "../client";
import { assertNoError } from "./base";

export type IdeaInsert = {
  source_id: string;
  external_id: string | null;
  url: string;
  title: string;
  author_handle: string | null;
  content: string | null;
  content_hash: string;
  published_at: string | null;
  dedup_status?: "canonical" | "duplicate";
  duplicate_of_id?: string | null;
};

export async function findIdeaByExternalId(sourceId: string, externalId: string) {
  const result = await supabase
    .from("ideas")
    .select("*")
    .eq("source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();
  return result.data;
}

export async function findIdeaByContentHash(sourceId: string, contentHash: string) {
  const result = await supabase
    .from("ideas")
    .select("*")
    .eq("source_id", sourceId)
    .eq("content_hash", contentHash)
    .eq("dedup_status", "canonical")
    .maybeSingle();
  return result.data;
}

export async function insertIdea(payload: IdeaInsert) {
  const result = await supabase.from("ideas").insert(payload).select("*").single();
  return assertNoError(result, "insert idea");
}

export async function updateIdea(id: string, payload: Partial<IdeaInsert>) {
  const result = await supabase.from("ideas").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update idea");
}

export async function listIdeas(filters: {
  includeDuplicates?: boolean;
  sourceId?: string;
  sentiment?: string;
  query?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}) {
  const includeDuplicates = filters.includeDuplicates ?? false;
  const select = filters.sentiment
    ? "*, enrichments!inner(sentiment_label, sentiment_score)"
    : "*, enrichments(sentiment_label, sentiment_score)";
  const query = supabase
    .from("ideas")
    .select(select, { count: "exact" })
    .order("published_at", { ascending: false });
  if (!includeDuplicates) {
    query.eq("dedup_status", "canonical");
  }
  if (filters.sourceId) {
    query.eq("source_id", filters.sourceId);
  }
  if (filters.start) {
    query.gte("published_at", filters.start);
  }
  if (filters.end) {
    query.lte("published_at", filters.end);
  }
  if (filters.sentiment) {
    query.eq("enrichments.sentiment_label", filters.sentiment);
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    query.or(`title.ilike.${like},content.ilike.${like}`);
  }
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);

  const result = await query;
  const data = assertNoError(result, "list ideas");
  return { data, total: result.count ?? data.length };
}

export async function getIdeasByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const result = await supabase.from("ideas").select("*").in("id", ids);
  return assertNoError(result, "get ideas by ids");
}
