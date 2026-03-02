import { randomUUID } from "node:crypto";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
  updateRlOpsRowById,
} from "../timescale/rl_ops";

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

export type DataGapEventRow = {
  id: string;
  pair: string;
  source_type: string;
  interval: string | null;
  gap_start: string;
  gap_end: string;
  expected_interval_seconds: number | null;
  gap_seconds: number;
  missing_points: number | null;
  status: DataGapEventStatus;
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  heal_attempts: number;
  last_heal_at: string | null;
  details: Record<string, unknown>;
};

export async function getDataGapEventByKey(params: {
  pair: DataGapEventInsert["pair"];
  source_type: string;
  interval?: string | null;
  gap_start: string;
  gap_end: string;
}) {
  requireRlOpsTimescaleEnabled("getDataGapEventByKey");
  const rows = await listRlOpsRows<DataGapEventRow>("data_gap_events", {
    filters: [
      { field: "pair", value: params.pair },
      { field: "source_type", value: params.source_type },
      { field: "gap_start", value: params.gap_start },
      { field: "gap_end", value: params.gap_end },
      { field: "interval", op: "is", value: params.interval ?? null },
    ],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function upsertDataGapEvent(payload: DataGapEventInsert) {
  requireRlOpsTimescaleEnabled("upsertDataGapEvent");
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
    const row = await insertRlOpsRow<DataGapEventRow>("data_gap_events", {
      id: randomUUID(),
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
      heal_attempts: 0,
      last_heal_at: null,
      details: payload.details ?? {},
    });
    return { event: row, created: true };
  }

  const row = await updateRlOpsRowById<DataGapEventRow>(
    "data_gap_events",
    existing.id,
    {
      expected_interval_seconds: payload.expected_interval_seconds ?? existing.expected_interval_seconds,
      gap_seconds: payload.gap_seconds,
      missing_points: payload.missing_points ?? existing.missing_points,
      status,
      last_seen_at: now,
      resolved_at: status === "resolved" ? now : null,
      details: payload.details ?? existing.details ?? {},
    },
    { touchUpdatedAt: false },
  );
  return { event: row, created: false };
}

export async function listOpenDataGapEvents(params?: {
  pair?: DataGapEventInsert["pair"];
  source_type?: string;
  interval?: string | null;
  limit?: number;
}) {
  requireRlOpsTimescaleEnabled("listOpenDataGapEvents");
  const filters = [{ field: "status", op: "in", value: ["open", "healing"] }] as Array<{
    field: string;
    op?: "eq" | "in" | "gte" | "lte" | "is";
    value: unknown;
  }>;
  if (params?.pair) {
    filters.push({ field: "pair", value: params.pair });
  }
  if (params?.source_type) {
    filters.push({ field: "source_type", value: params.source_type });
  }
  if (params && Object.prototype.hasOwnProperty.call(params, "interval")) {
    filters.push({ field: "interval", op: "is", value: params.interval ?? null });
  }
  return listRlOpsRows<DataGapEventRow>("data_gap_events", {
    filters,
    orderBy: "detected_at",
    direction: "desc",
    limit: params?.limit,
  });
}

export async function resolveDataGapEvent(id: string) {
  requireRlOpsTimescaleEnabled("resolveDataGapEvent");
  return updateRlOpsRowById<DataGapEventRow>(
    "data_gap_events",
    id,
    { status: "resolved", resolved_at: new Date().toISOString() },
    { touchUpdatedAt: false },
  );
}

export async function recordGapHealAttempt(id: string) {
  requireRlOpsTimescaleEnabled("recordGapHealAttempt");
  const current = await getRlOpsRowById<DataGapEventRow>("data_gap_events", id);
  if (!current) {
    throw new Error("load data gap heal attempts: missing data");
  }
  const healAttempts = (current.heal_attempts ?? 0) + 1;
  return updateRlOpsRowById<DataGapEventRow>(
    "data_gap_events",
    id,
    {
      status: "healing",
      heal_attempts: healAttempts,
      last_heal_at: new Date().toISOString(),
    },
    { touchUpdatedAt: false },
  );
}
