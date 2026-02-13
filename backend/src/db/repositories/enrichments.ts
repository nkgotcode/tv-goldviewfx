import { convex } from "../client";
import { assertNoError } from "./base";

export type EnrichmentInsert = {
  idea_id: string;
  sentiment_label: "positive" | "neutral" | "negative";
  sentiment_score: number;
  similarity_vector: number[] | null;
  model_name: string;
};

export async function findEnrichmentByIdeaId(ideaId: string) {
  const result = await convex.from("enrichments").select("*").eq("idea_id", ideaId).maybeSingle();
  return result.data;
}

export async function insertEnrichment(payload: EnrichmentInsert) {
  const result = await convex.from("enrichments").insert(payload).select("*").single();
  return assertNoError(result, "insert enrichment");
}
