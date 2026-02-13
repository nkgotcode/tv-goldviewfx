import { convex } from "../db/client";
import type { InferenceRequest } from "../types/rl";

type NewsSignal = NonNullable<InferenceRequest["news"]>[number];
type OcrSignal = NonNullable<InferenceRequest["ocr"]>[number];

export async function loadFeatureInputs(params: {
  start: string;
  end: string;
  includeNews?: boolean;
  includeOcr?: boolean;
  limit?: number;
}) {
  const includeNews = params.includeNews ?? false;
  const includeOcr = params.includeOcr ?? false;
  const limit = params.limit ?? 20;

  const [newsResult, ocrResult] = await Promise.all([
    includeNews
      ? convex
          .from("signals")
          .select("id, source_type, confidence_score, generated_at, payload_summary")
          .eq("source_type", "news")
          .gte("generated_at", params.start)
          .lte("generated_at", params.end)
          .order("generated_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
    includeOcr
      ? convex
          .from("idea_media")
          .select("id, ocr_text, ocr_confidence, updated_at")
          .eq("ocr_status", "processed")
          .gte("updated_at", params.start)
          .lte("updated_at", params.end)
          .order("updated_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
  ]);

  const news: NewsSignal[] = (newsResult.data ?? []).map((row: any) => ({
    source: row.source_type ?? "news",
    timestamp: row.generated_at ?? params.end,
    score: Number(row.confidence_score ?? 0),
    confidence: row.confidence_score ?? 0,
    metadata: {
      signalId: row.id,
      summary: row.payload_summary ?? null,
    },
  }));

  const ocr: OcrSignal[] = (ocrResult.data ?? []).map((row: any) => ({
    source: "ocr_text",
    timestamp: row.updated_at ?? params.end,
    score: Number(row.ocr_confidence ?? 0),
    confidence: row.ocr_confidence ?? null,
    metadata: {
      text: row.ocr_text ?? "",
      mediaId: row.id,
    },
  }));

  return { news, ocr };
}
