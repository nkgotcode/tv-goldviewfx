import { convex } from "../client";
import { assertNoError } from "./base";

export type DataGapEventStatus = "open" | "healing" | "resolved";

export type DataGapEventInsert = {
  pair: string;
  source_type: string;
  interval?: string | null;
  gap_start: string;
  gap_end: string;
  expected_interval_seconds?: number | null;
  gap_seconds: number;
  missing_points?: number | null;
  status?: DataGapEventStatus;
  details?: Record<string, unknown>;
};

export async function getDataGapEventByKey(params: {
  pair: DataGapEventInsert["pair"];
  source_type: string;
  interval?: string | null;
  gap_start: string;
  gap_end: string;
}) {
  const query = convex
    .from("data_gap_events")
    .select("*")
    .eq("pair", params.pair)
    .eq("source_type", params.source_type)
    .eq("gap_start", params.gap_start)
    .eq("gap_end", params.gap_end);
  if (params.interval) {
    query.eq("interval", params.interval);
  } else {
    query.is("interval", null);
  }
  const result = await query.maybeSingle();
  return assertNoError(result, "get data gap event");
}

export async function upsertDataGapEvent(payload: DataGapEventInsert) {
  const now = new Date().toISOString();
  const existing = await getDataGapEventByKey({
    pair: payload.pair,
    source_type: payload.source_type,
    interval: payload.interval ?? null,
    gap_start: payload.gap_start,
    gap_end: payload.gap_end,
  });
  const status: DataGapEventStatus = payload.status ?? "open";

  if (!existing) {
    const result = await convex
      .from("data_gap_events")
      .insert({
        pair: payload.pair,
        source_type: payload.source_type,
        interval: payload.interval ?? null,
        gap_start: payload.gap_start,
        gap_end: payload.gap_end,
        expected_interval_seconds: payload.expected_interval_seconds ?? null,
        gap_seconds: payload.gap_seconds,
        missing_points: payload.missing_points ?? null,
        status,
        detected_at: now,
        last_seen_at: now,
        resolved_at: status === "resolved" ? now : null,
        details: payload.details ?? {},
      })
      .select("*")
      .single();
    return { event: assertNoError(result, "insert data gap event"), created: true };
  }

  const result = await convex
    .from("data_gap_events")
    .update({
      expected_interval_seconds: payload.expected_interval_seconds ?? existing.expected_interval_seconds,
      gap_seconds: payload.gap_seconds,
      missing_points: payload.missing_points ?? existing.missing_points,
      status,
      last_seen_at: now,
      resolved_at: status === "resolved" ? now : null,
      details: payload.details ?? existing.details ?? {},
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  return { event: assertNoError(result, "update data gap event"), created: false };
}

export async function listOpenDataGapEvents(params?: {
  pair?: DataGapEventInsert["pair"];
  source_type?: string;
  limit?: number;
}) {
  const query = convex
    .from("data_gap_events")
    .select("*")
    .in("status", ["open", "healing"])
    .order("detected_at", { ascending: false });
  if (params?.pair) {
    query.eq("pair", params.pair);
  }
  if (params?.source_type) {
    query.eq("source_type", params.source_type);
  }
  if (typeof params?.limit === "number" && params.limit > 0) {
    query.limit(params.limit);
  }
  const result = await query;
  return assertNoError(result, "list data gap events");
}

export async function resolveDataGapEvent(id: string) {
  const result = await convex
    .from("data_gap_events")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "resolve data gap event");
}

export async function recordGapHealAttempt(id: string) {
  const current = await convex.from("data_gap_events").select("heal_attempts").eq("id", id).single();
  const currentRow = assertNoError(current, "load data gap heal attempts");
  const healAttempts = (currentRow.heal_attempts ?? 0) + 1;
  const result = await convex
    .from("data_gap_events")
    .update({
      status: "healing",
      heal_attempts: healAttempts,
      last_heal_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "record data gap heal attempt");
}
