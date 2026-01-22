export function normalizeListPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: T[] }).data)) {
    return (payload as { data?: T[] }).data ?? [];
  }
  return [];
}
