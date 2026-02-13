import { convex } from "../client";
import { assertNoError } from "./base";

export type TelegramPostInsert = {
  source_id: string;
  external_id: string;
  content: string;
  content_hash: string;
  duplicate_of_id?: string | null;
  dedup_status?: "canonical" | "duplicate";
  published_at: string | null;
  edited_at?: string | null;
  status?: "active" | "edited" | "removed";
};

export async function findTelegramPostByExternalId(sourceId: string, externalId: string) {
  const result = await convex
    .from("telegram_posts")
    .select("*")
    .eq("source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();
  return result.data;
}

export async function findTelegramPostByContentHash(sourceId: string, contentHash: string) {
  const result = await convex
    .from("telegram_posts")
    .select("*")
    .eq("source_id", sourceId)
    .eq("content_hash", contentHash)
    .eq("dedup_status", "canonical")
    .maybeSingle();
  return result.data;
}

export async function insertTelegramPost(payload: TelegramPostInsert) {
  const result = await convex.from("telegram_posts").insert(payload).select("*").single();
  return assertNoError(result, "insert telegram post");
}

export async function updateTelegramPost(id: string, payload: Partial<TelegramPostInsert>) {
  const result = await convex.from("telegram_posts").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update telegram post");
}

export async function getTelegramPostById(id: string) {
  const result = await convex.from("telegram_posts").select("*").eq("id", id).single();
  return assertNoError(result, "get telegram post");
}

export async function listTelegramPosts(filters: {
  sourceId?: string;
  status?: string;
  includeDuplicates?: boolean;
  query?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = convex
    .from("telegram_posts")
    .select("*", { count: "exact" })
    .order("published_at", { ascending: false });
  if (filters.sourceId) {
    query.eq("source_id", filters.sourceId);
  }
  if (filters.status) {
    query.eq("status", filters.status);
  }
  if (!filters.includeDuplicates) {
    query.eq("dedup_status", "canonical");
  }
  if (filters.start) {
    query.gte("published_at", filters.start);
  }
  if (filters.end) {
    query.lte("published_at", filters.end);
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    query.ilike("content", like);
  }
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);

  const result = await query;
  const data = assertNoError(result, "list telegram posts");
  return { data, total: result.count ?? data.length };
}
