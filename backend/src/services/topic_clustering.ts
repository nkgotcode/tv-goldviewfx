import { convex } from "../db/client";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "over",
  "your",
  "you",
  "our",
  "are",
  "was",
  "were",
  "will",
  "its",
  "not",
  "but",
  "about",
  "from",
  "have",
  "has",
  "had",
  "between",
  "above",
  "below",
  "while",
  "week",
  "gold",
]);

function extractKeywords(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token));
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

export async function runTopicClustering(period: "weekly" | "monthly") {
  const now = new Date();
  const days = period === "weekly" ? 7 : 30;
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const ideasResult = await convex
    .from("ideas")
    .select("id, title, content, published_at, ingested_at")
    .gte("published_at", windowStart.toISOString())
    .order("published_at", { ascending: false })
    .limit(200);

  const ideas = ideasResult.data ?? [];
  const combinedText = ideas.map((idea) => `${idea.title} ${idea.content ?? ""}`).join(" ");
  const keywords = extractKeywords(combinedText).slice(0, 8);
  const label = keywords.length ? keywords.slice(0, 2).join(" / ") : "General";

  const clusterResult = await convex
    .from("topic_clusters")
    .insert({
      period,
      window_start: windowStart.toISOString(),
      window_end: now.toISOString(),
      label,
      keywords,
      idea_count: ideas.length,
    })
    .select("*")
    .single();

  const cluster = clusterResult.data;
  if (cluster) {
    const topicRows = ideas.map((idea) => ({
      idea_id: idea.id,
      cluster_id: cluster.id,
      score: 1,
    }));
    if (topicRows.length) {
      await convex.from("idea_topics").upsert(topicRows, { onConflict: "idea_id,cluster_id" });
    }
  }

  return { period, cluster: clusterResult.data, keywords, idea_count: ideas.length };
}
