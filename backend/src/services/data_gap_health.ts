import { listOpenDataGapEvents } from "../db/repositories/data_gap_events";
import type { TradingPair } from "../types/rl";

export type DataGapHealthParams = {
  pair?: TradingPair;
  sourceType?: string;
  limit?: number;
};

type DataGapEventRow = {
  pair: TradingPair;
  source_type: string;
  status: "open" | "healing" | "resolved";
  detected_at: string;
  last_seen_at?: string | null;
};

type GapSummary = {
  open: number;
  healing: number;
  last_detected_at: string | null;
  last_seen_at: string | null;
  oldest_open_at: string | null;
};

type PairGapSummary = GapSummary & {
  pair: TradingPair;
};

type SourceGapSummary = GapSummary & {
  source_type: string;
};

function updateLatest(current: string | null, candidate: string | null | undefined) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function updateEarliest(current: string | null, candidate: string | null | undefined) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

export function summarizeDataGapEvents(events: DataGapEventRow[]) {
  const totals: GapSummary = {
    open: 0,
    healing: 0,
    last_detected_at: null,
    last_seen_at: null,
    oldest_open_at: null,
  };
  const byPair = new Map<TradingPair, PairGapSummary>();
  const bySource = new Map<string, SourceGapSummary>();

  for (const event of events) {
    const bucket = event.status === "healing" ? "healing" : "open";
    totals[bucket] += 1;
    totals.last_detected_at = updateLatest(totals.last_detected_at, event.detected_at);
    totals.last_seen_at = updateLatest(totals.last_seen_at, event.last_seen_at ?? event.detected_at);
    totals.oldest_open_at = updateEarliest(totals.oldest_open_at, event.detected_at);

    const pair = event.pair as TradingPair;
    const pairSummary = byPair.get(pair) ?? {
      pair,
      open: 0,
      healing: 0,
      last_detected_at: null,
      last_seen_at: null,
      oldest_open_at: null,
    };
    pairSummary[bucket] += 1;
    pairSummary.last_detected_at = updateLatest(pairSummary.last_detected_at, event.detected_at);
    pairSummary.last_seen_at = updateLatest(pairSummary.last_seen_at, event.last_seen_at ?? event.detected_at);
    pairSummary.oldest_open_at = updateEarliest(pairSummary.oldest_open_at, event.detected_at);
    byPair.set(pair, pairSummary);

    const sourceType = event.source_type;
    const sourceSummary = bySource.get(sourceType) ?? {
      source_type: sourceType,
      open: 0,
      healing: 0,
      last_detected_at: null,
      last_seen_at: null,
      oldest_open_at: null,
    };
    sourceSummary[bucket] += 1;
    sourceSummary.last_detected_at = updateLatest(sourceSummary.last_detected_at, event.detected_at);
    sourceSummary.last_seen_at = updateLatest(sourceSummary.last_seen_at, event.last_seen_at ?? event.detected_at);
    sourceSummary.oldest_open_at = updateEarliest(sourceSummary.oldest_open_at, event.detected_at);
    bySource.set(sourceType, sourceSummary);
  }

  return {
    totals,
    by_pair: Array.from(byPair.values()).sort((a, b) => a.pair.localeCompare(b.pair)),
    by_source: Array.from(bySource.values()).sort((a, b) => a.source_type.localeCompare(b.source_type)),
    open_events: events,
  };
}

export async function getDataGapHealth(params: DataGapHealthParams = {}) {
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 100;
  const events = await listOpenDataGapEvents({
    pair: params.pair,
    source_type: params.sourceType,
    limit,
  });

  return {
    generated_at: new Date().toISOString(),
    ...summarizeDataGapEvents(events as DataGapEventRow[]),
  };
}
