import type { EnrichmentInsert } from "../db/repositories/enrichments";

type IdeaSummary = {
  id: string;
  title: string;
  content: string | null;
};

export function buildSignalPayload(idea: IdeaSummary, enrichment: EnrichmentInsert) {
  const snippet = idea.content ? idea.content.slice(0, 140) : "";
  return {
    summary: `${idea.title} | sentiment: ${enrichment.sentiment_label}`,
    snippet,
  };
}

export function calculateSignalConfidence(enrichment: EnrichmentInsert) {
  const score = Math.abs(enrichment.sentiment_score ?? 0);
  return clampConfidence(score);
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}
