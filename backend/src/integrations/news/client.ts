import { readFile } from "node:fs/promises";
import { parseJsonFeed, parseRssFeed, type RawNewsItem } from "./parser";

async function fetchTextFromSource(identifier: string): Promise<{ text: string; contentType?: string }> {
  if (identifier.startsWith("http://") || identifier.startsWith("https://")) {
    const response = await fetch(identifier);
    const text = await response.text();
    return { text, contentType: response.headers.get("content-type") ?? undefined };
  }
  const text = await readFile(identifier, "utf8");
  return { text, contentType: identifier.endsWith(".json") ? "application/json" : undefined };
}

export async function fetchNewsFeed(identifier: string): Promise<RawNewsItem[]> {
  const { text, contentType } = await fetchTextFromSource(identifier);
  if (contentType?.includes("json") || identifier.endsWith(".json")) {
    try {
      const payload = JSON.parse(text) as unknown;
      return parseJsonFeed(payload);
    } catch {
      return [];
    }
  }
  return parseRssFeed(text);
}
