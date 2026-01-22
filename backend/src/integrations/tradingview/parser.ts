import { load } from "cheerio";

const BASE_URL = "https://www.tradingview.com";

export type TimelineEntry = {
  label: string | null;
  time: string | null;
  text: string;
};

export type ExtractedIdea = {
  externalId: string | null;
  url: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  imageUrls?: string[];
};

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const $ = load(`<div>${withBreaks}</div>`);
  const text = $("div").text();
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toAbsoluteUrl(href: string | undefined | null): string | null {
  if (!href) {
    return null;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("/")) {
    return `${BASE_URL}${href}`;
  }
  return null;
}

export function parseDateToIso(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function extractIdeaId(url: string): string | null {
  const match = url.match(/\/chart\/[^/]+\/([^/]+)/);
  if (!match) {
    return null;
  }
  const [ideaId] = match[1].split("-");
  return ideaId || null;
}

export function extractIdeasFromProfile(html: string): ExtractedIdea[] {
  const $ = load(html);
  const ideas: ExtractedIdea[] = [];

  $("article").each((_, article) => {
    const root = $(article);
    const titleAnchor = root.find('a[data-qa-id="ui-lib-card-link-title"]').first();
    if (!titleAnchor.length) {
      return;
    }

    const url = toAbsoluteUrl(titleAnchor.attr("href"));
    const title = normalizeWhitespace(titleAnchor.text());
    if (!url || !title) {
      return;
    }

    const contentAnchor = root.find('a[data-qa-id="ui-lib-card-link-paragraph"]').first();
    const excerptRaw = normalizeWhitespace(contentAnchor.text());

    const authorAnchor = root.find('a[data-qa-id="ui-lib-card-link-author"]').first();
    const authorRaw = normalizeWhitespace(authorAnchor.text());
    const author = authorRaw ? authorRaw.replace(/^by\s+/i, "") : null;
    const authorUrl = toAbsoluteUrl(authorAnchor.attr("href"));

    const timeElement = root.find("time[datetime]").first();
    const publishedAt = parseDateToIso(timeElement.attr("datetime") ?? null);

    ideas.push({
      externalId: extractIdeaId(url),
      url,
      title,
      excerpt: excerptRaw || null,
      author,
      authorUrl,
      publishedAt,
    });
  });

  const deduped = new Map<string, ExtractedIdea>();
  for (const idea of ideas) {
    deduped.set(idea.url, idea);
  }

  return [...deduped.values()];
}

export function parseIdeaTimeline(html: string): TimelineEntry[] {
  const $ = load(html);
  const container = $('[data-qa-id="publication-container"]').first();
  if (!container.length) {
    return [];
  }

  const description = container.find('[class*="description-"]').first();
  if (!description.length) {
    return [];
  }

  const entries: TimelineEntry[] = [];
  const timelineItems = description.find('[class*="timelineItem-"]');
  if (timelineItems.length) {
    timelineItems.each((_, item) => {
      const node = $(item);
      const timeRaw = node.find("time[datetime]").first().attr("datetime") ?? null;
      const time = parseDateToIso(timeRaw);
      const labelRaw = node.find('[class*="label-"]').first().text();
      const label = normalizeWhitespace(labelRaw);
      const update = node.find('[class*="update-"]').first();
      if (!update.length) {
        return;
      }
      const ast = update.find('span[class*="ast-"]').first();
      const htmlContent = ast.length ? ast.html() : update.html();
      if (!htmlContent) {
        return;
      }
      const text = htmlToText(htmlContent);
      if (!text) {
        return;
      }
      entries.push({
        label: label || null,
        time,
        text,
      });
    });
  } else {
    const update = description.find('[class*="update-"]').first();
    if (!update.length) {
      return [];
    }
    const ast = update.find('span[class*="ast-"]').first();
    const htmlContent = ast.length ? ast.html() : update.html();
    if (!htmlContent) {
      return [];
    }
    const text = htmlToText(htmlContent);
    if (!text) {
      return [];
    }
    const headerTimeRaw = container.find("time[datetime]").first().attr("datetime") ?? null;
    entries.push({
      label: null,
      time: parseDateToIso(headerTimeRaw),
      text,
    });
  }

  return entries;
}

export function extractFallbackDescription(html: string): string | null {
  const $ = load(html);
  const description = $('meta[name="description"]').attr("content");
  return description ? normalizeWhitespace(description) : null;
}

export function extractIdeaImages(html: string): string[] {
  const $ = load(html);
  const images = new Set<string>();
  $("img").each((_, img) => {
    const src = $(img).attr("src") ?? $(img).attr("data-src");
    const normalized = toAbsoluteUrl(src);
    if (normalized) {
      images.add(normalized);
    }
  });
  return [...images.values()];
}

export function buildContent(entries: TimelineEntry[], includeUpdates: boolean): string | null {
  if (entries.length === 0) {
    return null;
  }
  if (!includeUpdates) {
    return entries[0].text;
  }
  const blocks = entries.map((entry, index) => {
    const headerParts: string[] = [];
    headerParts.push(index === 0 ? "Original post" : "Update");
    if (entry.time) {
      headerParts.push(entry.time);
    }
    if (entry.label) {
      headerParts.push(entry.label);
    }
    return `${headerParts.join(" - ")}\n${entry.text}`;
  });
  return blocks.join("\n\n---\n\n");
}
