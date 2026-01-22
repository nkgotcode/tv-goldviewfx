import { supabase } from "../db/client";
import { getSourcePolicy } from "../db/repositories/source_policies";

export type SourcePolicyDecision = {
  allowed: boolean;
  reason: string | null;
  source_id: string | null;
  source_type: string;
};

export async function resolveSignalSource(signalId: string) {
  const result = await supabase
    .from("signals")
    .select(
      "id, source_type, confidence_score, idea_id, telegram_post_id, news_item_id, ideas(source_id), telegram_posts(source_id), news_items(source_id)",
    )
    .eq("id", signalId)
    .maybeSingle();
  const data = result.data;
  if (!data) {
    return null;
  }
  const sourceType = data.source_type;
  const sourceId =
    sourceType === "tradingview"
      ? (data.ideas as { source_id?: string } | null)?.source_id ?? null
      : sourceType === "telegram"
        ? (data.telegram_posts as { source_id?: string } | null)?.source_id ?? null
        : sourceType === "news"
          ? (data.news_items as { source_id?: string } | null)?.source_id ?? null
          : null;

  return {
    sourceType,
    sourceId,
    confidenceScore: data.confidence_score ?? 0,
  };
}

export async function evaluateSourcePolicy(params: {
  signalId: string;
  minConfidenceScore?: number | null;
  allowedSourceIds?: string[] | null;
}): Promise<SourcePolicyDecision> {
  const resolved = await resolveSignalSource(params.signalId);
  if (!resolved) {
    return { allowed: false, reason: "signal_missing", source_id: null, source_type: "unknown" };
  }
  const minConfidence = params.minConfidenceScore ?? 0;
  if (resolved.confidenceScore < minConfidence) {
    return {
      allowed: false,
      reason: "min_confidence",
      source_id: resolved.sourceId,
      source_type: resolved.sourceType,
    };
  }
  if (params.allowedSourceIds && params.allowedSourceIds.length > 0) {
    if (!resolved.sourceId || !params.allowedSourceIds.includes(resolved.sourceId)) {
      return {
        allowed: false,
        reason: "source_not_allowed",
        source_id: resolved.sourceId,
        source_type: resolved.sourceType,
      };
    }
  }
  const policy = await getSourcePolicy(resolved.sourceType, resolved.sourceId);
  if (policy && policy.enabled === false) {
    return { allowed: false, reason: "source_disabled", source_id: resolved.sourceId, source_type: resolved.sourceType };
  }
  if (policy?.min_confidence_score !== null && policy?.min_confidence_score !== undefined) {
    if (resolved.confidenceScore < policy.min_confidence_score) {
      return {
        allowed: false,
        reason: "source_min_confidence",
        source_id: resolved.sourceId,
        source_type: resolved.sourceType,
      };
    }
  }
  return { allowed: true, reason: null, source_id: resolved.sourceId, source_type: resolved.sourceType };
}
