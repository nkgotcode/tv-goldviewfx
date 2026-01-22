import { runEnrichment } from "../services/enrichment";
import { createEnrichmentRun, completeEnrichmentRun } from "../db/repositories/enrichment_runs";

export async function runEnrichmentJob() {
  const raw = process.env.ENRICHMENT_IDEAS ?? "";
  const ideaIds = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (ideaIds.length === 0) {
    return { processed: 0, created: 0, skipped: 0 };
  }
  const run = await createEnrichmentRun({ trigger: "schedule" });
  try {
    const result = await runEnrichment(ideaIds, run.id);
    await completeEnrichmentRun(run.id, {
      status: "succeeded",
      processedCount: result.processed,
      errorCount: 0,
    });
    return result;
  } catch (error) {
    await completeEnrichmentRun(run.id, {
      status: "failed",
      processedCount: 0,
      errorCount: 1,
      errorSummary: error instanceof Error ? error.message : "unknown_error",
    });
    throw error;
  }
}
