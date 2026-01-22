import { load } from "cheerio";

export type RawNewsItem = {
  externalId: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  content: string | null;
  publishedAt: string | null;
};

function normalize(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim();
}

export function parseRssFeed(xml: string): RawNewsItem[] {
  const $ = load(xml, { xmlMode: true });
  const items: RawNewsItem[] = [];
  const nodes = $("item");
  if (nodes.length === 0) {
    $("entry").each((_, entry) => {
      const node = $(entry);
      const title = normalize(node.find("title").text()) ?? "";
      const url = normalize(node.find("link").attr("href") ?? node.find("link").text());
      const guid = normalize(node.find("id").text()) ?? normalize(node.find("guid").text());
      const summary = normalize(node.find("summary").text()) ?? normalize(node.find("description").text());
      const content = normalize(node.find("content").text());
      const published = normalize(node.find("updated").text()) ?? normalize(node.find("published").text());
      if (!title) return;
      items.push({
        externalId: guid,
        title,
        url,
        summary,
        content,
        publishedAt: published,
      });
    });
    return items;
  }

  nodes.each((_, item) => {
    const node = $(item);
    const title = normalize(node.find("title").text()) ?? "";
    const url = normalize(node.find("link").text());
    const guid = normalize(node.find("guid").text());
    const summary = normalize(node.find("description").text());
    const content = normalize(node.find("content\:encoded").text()) ?? summary;
    const published = normalize(node.find("pubDate").text());
    if (!title) return;
    items.push({
      externalId: guid,
      title,
      url,
      summary,
      content,
      publishedAt: published,
    });
  });

  return items;
}

export function parseJsonFeed(payload: unknown): RawNewsItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = normalize(String(record.title ?? ""));
      if (!title) return null;
      return {
        externalId: normalize(record.id ? String(record.id) : null),
        title,
        url: normalize(record.url ? String(record.url) : null),
        summary: normalize(record.summary ? String(record.summary) : null),
        content: normalize(record.content ? String(record.content) : null),
        publishedAt: normalize(record.published_at ? String(record.published_at) : null),
      };
    })
    .filter((item): item is RawNewsItem => Boolean(item));
}
