import type { InferenceRequest } from "../types/rl";
import { logWarn } from "../services/logger";

type NewsSignal = NonNullable<InferenceRequest["news"]>[number];
type OcrSignal = NonNullable<InferenceRequest["ocr"]>[number];
let warnedAuxFallbackDisabled = false;

export async function loadFeatureInputs(params: {
  start: string;
  end: string;
  includeNews?: boolean;
  includeOcr?: boolean;
  limit?: number;
}) {
  const includeNews = params.includeNews ?? false;
  const includeOcr = params.includeOcr ?? false;
  const _limit = params.limit ?? 20;
  void _limit;

  if ((includeNews || includeOcr) && !warnedAuxFallbackDisabled) {
    warnedAuxFallbackDisabled = true;
    logWarn("RL auxiliary Convex fallback disabled in Timescale-only mode", {
      includeNews,
      includeOcr,
    });
  }

  const news: NewsSignal[] = [];
  const ocr: OcrSignal[] = [];

  void params.start;
  void params.end;

  return { news, ocr };
}
