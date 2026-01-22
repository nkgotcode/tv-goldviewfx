import { createHash } from "crypto";

export function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeContent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
