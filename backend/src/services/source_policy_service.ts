import { convex } from "../db/client";
import { getSourcePolicy } from "../db/repositories/source_policies";

export type SourcePolicyDecision = {
  allowed: boolean;
  reason: string | null;
  source_id: string | null;
  source_type: string;
};

export async function resolveSignalSource(signalId: string) {
  const signalResult = await convex
    .from("signals")
    .select("id, source_type, confidence_score, idea_id, telegram_post_id, news_item_id")
    .eq("id", signalId)
    .maybeSingle();
  const signal = signalResult.data;
  if (!signal) {
    return null;
  }
  const sourceType = signal.source_type;
  let sourceId: string | null = null;
  if (sourceType === "tradingview" && signal.idea_id) {
    const ideaResult = await convex.from("ideas").select("source_id").eq("id", signal.idea_id).maybeSingle();
    sourceId = ideaResult.data?.source_id ?? null;
  } else if (sourceType === "telegram" && signal.telegram_post_id) {
    const postResult = await convex
      .from("telegram_posts")
      .select("source_id")
      .eq("id", signal.telegram_post_id)
      .maybeSingle();
    sourceId = postResult.data?.source_id ?? null;
  } else if (sourceType === "news" && signal.news_item_id) {
    const newsResult = await convex.from("news_items").select("source_id").eq("id", signal.news_item_id).maybeSingle();
    sourceId = newsResult.data?.source_id ?? null;
  }

  return {
    sourceType,
    sourceId,
    confidenceScore: signal.confidence_score ?? 0,
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
