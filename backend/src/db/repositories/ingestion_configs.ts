import { supabase } from "../client";
import { assertNoError } from "./base";

export type IngestionConfigInsert = {
  source_type: string;
  source_id?: string | null;
  feed?: string | null;
  enabled?: boolean;
  refresh_interval_seconds?: number | null;
  backfill_max_days?: number | null;
  rate_limit_per_minute?: number | null;
  backoff_base_seconds?: number | null;
  backoff_max_seconds?: number | null;
  config?: Record<string, unknown>;
};

export async function upsertIngestionConfig(payload: IngestionConfigInsert) {
  const result = await supabase
    .from("ingestion_configs")
    .upsert(
      {
        source_type: payload.source_type,
        source_id: payload.source_id ?? null,
        feed: payload.feed ?? null,
        enabled: payload.enabled ?? true,
        refresh_interval_seconds: payload.refresh_interval_seconds ?? null,
        backfill_max_days: payload.backfill_max_days ?? null,
        rate_limit_per_minute: payload.rate_limit_per_minute ?? null,
        backoff_base_seconds: payload.backoff_base_seconds ?? null,
        backoff_max_seconds: payload.backoff_max_seconds ?? null,
        config: payload.config ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_type,source_id,feed" },
    )
    .select("*")
    .single();

  return assertNoError(result, "upsert ingestion config");
}

export async function listIngestionConfigs(filters?: {
  sourceType?: string;
  sourceId?: string | null;
  feed?: string | null;
}) {
  const query = supabase.from("ingestion_configs").select("*").order("updated_at", { ascending: false });
  if (filters?.sourceType) {
    query.eq("source_type", filters.sourceType);
  }
  if (filters?.sourceId !== undefined) {
    if (filters.sourceId === null) {
      query.is("source_id", null);
    } else {
      query.eq("source_id", filters.sourceId);
    }
  }
  if (filters?.feed !== undefined) {
    if (filters.feed === null) {
      query.is("feed", null);
    } else {
      query.eq("feed", filters.feed);
    }
  }
  const result = await query;
  return assertNoError(result, "list ingestion configs");
}

export async function getIngestionConfig(sourceType: string, sourceId?: string | null, feed?: string | null) {
  const query = supabase
    .from("ingestion_configs")
    .select("*")
    .eq("source_type", sourceType);

  if (sourceId === undefined || sourceId === null) {
    query.is("source_id", null);
  } else {
    query.eq("source_id", sourceId);
  }

  if (feed === undefined || feed === null) {
    query.is("feed", null);
  } else {
    query.eq("feed", feed);
  }

  const result = await query.maybeSingle();
  return result.data;
}
