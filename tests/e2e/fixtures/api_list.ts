import { z } from "zod";

export function readListResponse<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as T[];
    }
  }
  return [];
}

export function parseListResponse<T>(schema: z.ZodType<T>, payload: unknown): T[] {
  const list = readListResponse<T>(payload);
  return list.map((item) => schema.parse(item));
}

export function parseSingleResponse<T>(schema: z.ZodType<T>, payload: unknown): T {
  return schema.parse(payload);
}
