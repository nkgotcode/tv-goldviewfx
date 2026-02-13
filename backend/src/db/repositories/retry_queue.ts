import { convex } from "../client";
import { assertNoError } from "./base";

export type RetryQueueInsert = {
  job_type: string;
  payload: Record<string, unknown>;
  status?: "pending" | "processing" | "succeeded" | "failed";
  attempts?: number;
  max_attempts?: number;
  next_attempt_at?: string;
  dedupe_key?: string | null;
  last_error?: string | null;
};

export async function insertRetryQueueItem(payload: RetryQueueInsert) {
  const result = await convex
    .from("retry_queue")
    .insert({
      job_type: payload.job_type,
      payload: payload.payload,
      status: payload.status ?? "pending",
      attempts: payload.attempts ?? 0,
      max_attempts: payload.max_attempts ?? 5,
      next_attempt_at: payload.next_attempt_at ?? new Date().toISOString(),
      dedupe_key: payload.dedupe_key ?? null,
      last_error: payload.last_error ?? null,
    })
    .select("*")
    .single();
  return assertNoError(result, "insert retry queue item");
}

export async function findPendingRetryByKey(jobType: string, dedupeKey: string) {
  const result = await convex
    .from("retry_queue")
    .select("*")
    .eq("job_type", jobType)
    .eq("dedupe_key", dedupeKey)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (result.error) {
    throw new Error(`find pending retry: ${result.error.message}`);
  }
  return result.data;
}

export async function listDueRetryQueueItems(limit = 20) {
  const now = new Date().toISOString();
  const result = await convex
    .from("retry_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  return assertNoError(result, "list due retry queue items");
}

export async function listRetryQueueItems(limit = 50) {
  const result = await convex
    .from("retry_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list retry queue items");
}

export async function updateRetryQueueItem(id: string, payload: Partial<RetryQueueInsert>) {
  const result = await convex
    .from("retry_queue")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update retry queue item");
}
