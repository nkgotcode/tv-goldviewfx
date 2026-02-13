import { convex } from "../client";
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
  const result = await convex
    .from("ideas")
    .select("*")
    .eq("source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();
  return result.data;
}

export async function findIdeaByContentHash(sourceId: string, contentHash: string) {
  const result = await convex
    .from("ideas")
    .select("*")
    .eq("source_id", sourceId)
    .eq("content_hash", contentHash)
    .eq("dedup_status", "canonical")
    .maybeSingle();
  return result.data;
}

export async function insertIdea(payload: IdeaInsert) {
  const result = await convex.from("ideas").insert(payload).select("*").single();
  return assertNoError(result, "insert idea");
}

export async function updateIdea(id: string, payload: Partial<IdeaInsert>) {
  const result = await convex.from("ideas").update(payload).eq("id", id).select("*").single();
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
  const searchTerm = filters.query?.trim();
  const hasSearch = Boolean(searchTerm);
  const hasSearchBounds = Boolean(filters.sourceId || filters.start || filters.end);
  if (hasSearch && !hasSearchBounds) {
    throw new Error("Search query requires a source_id or date range to avoid full scans.");
  }

  const includeDuplicates = filters.includeDuplicates ?? false;
  const query = convex
    .from("ideas")
    .select("*", { count: "exact" })
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
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  const matchesQuery = (idea: { title?: string | null; content?: string | null }) => {
    if (!searchTerm) return true;
    const haystack = `${idea.title ?? ""} ${idea.content ?? ""}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  };

  if (hasSearch) {
    const SEARCH_OVERSCAN = 5;
    const MAX_SEARCH_WINDOW = 500;
    const requiredWindow = page * pageSize * SEARCH_OVERSCAN;
    if (requiredWindow > MAX_SEARCH_WINDOW) {
      throw new Error("Search window too large; narrow your query or date range.");
    }
    query.range(0, Math.max(0, requiredWindow - 1));
  } else if (!filters.sentiment) {
    query.range(from, to);
  }

  const result = await query;
  const data = assertNoError(result, "list ideas");
  let filtered = data;
  if (hasSearch) {
    filtered = filtered.filter(matchesQuery);
  }

  if (!filters.sentiment) {
    const paged = hasSearch ? filtered.slice(from, to + 1) : filtered;
    const ideaIds = paged.map((idea) => idea.id);
    const enrichmentsResult = ideaIds.length
      ? await convex
          .from("enrichments")
          .select("idea_id, sentiment_label, sentiment_score")
          .in("idea_id", ideaIds)
      : { data: [] };
    const enrichments = enrichmentsResult.data ?? [];
    const enrichmentMap = new Map<string, { sentiment_label: string; sentiment_score: number }>();
    for (const enrichment of enrichments) {
      enrichmentMap.set(enrichment.idea_id, {
        sentiment_label: enrichment.sentiment_label,
        sentiment_score: enrichment.sentiment_score,
      });
    }
    const withEnrichments = paged.map((idea) => ({
      ...idea,
      enrichments: enrichmentMap.has(idea.id) ? [enrichmentMap.get(idea.id)] : [],
    }));
    const total = hasSearch ? filtered.length : result.count ?? data.length;
    return { data: withEnrichments, total };
  }

  const enrichmentsResult = await convex
    .from("enrichments")
    .select("idea_id, sentiment_label, sentiment_score")
    .eq("sentiment_label", filters.sentiment);
  const enrichments = enrichmentsResult.data ?? [];
  const enrichmentMap = new Map<string, { sentiment_label: string; sentiment_score: number }>();
  for (const enrichment of enrichments) {
    enrichmentMap.set(enrichment.idea_id, {
      sentiment_label: enrichment.sentiment_label,
      sentiment_score: enrichment.sentiment_score,
    });
  }
  const filteredIdeas = filtered.filter((idea) => enrichmentMap.has(idea.id));
  const paged = filteredIdeas.slice(from, to + 1);
  const withEnrichments = paged.map((idea) => ({
    ...idea,
    enrichments: enrichmentMap.has(idea.id) ? [enrichmentMap.get(idea.id)] : [],
  }));
  return { data: withEnrichments, total: filteredIdeas.length };
}

export async function getIdeasByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const result = await convex.from("ideas").select("*").in("id", ids);
  return assertNoError(result, "get ideas by ids");
}
