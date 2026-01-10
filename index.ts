import { load } from "cheerio";
import { sql } from "bun";

type ExtractedArticle = {
  ideaId: string | null;
  url: string;
  title: string;
  content: string | null;
  publishedAt: string | null;
  updates?: TimelineEntry[];
  author: string | null;
  authorUrl: string | null;
  symbol: string | null;
  symbolUrl: string | null;
  symbolTitle: string | null;
  imageUrl: string | null;
  commentCount: number | null;
  boostCount: number | null;
};

type ArticleRow = {
  idea_id: string | null;
  url: string;
  title: string;
  content: string | null;
  author: string | null;
  author_url: string | null;
  symbol: string | null;
  symbol_url: string | null;
  symbol_title: string | null;
  image_url: string | null;
  published_at: string | null;
  comment_count: number | null;
  boost_count: number | null;
  source: "tradingview";
  scraped_at: string;
};

type UpdateRow = {
  idea_url: string;
  update_index: number;
  update_time: string;
  label: string | null;
  content: string;
  source: "tradingview";
  scraped_at: string;
};

const DEFAULT_HTML_PATH = "tradingview.html";
const BASE_URL = "https://www.tradingview.com";
const DEFAULT_CONCURRENCY = 3;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const $ = load(`<div>${withBreaks}</div>`);
  const text = $("div").text();
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toAbsoluteUrl(href: string | undefined | null): string | null {
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

function parseCount(label: string | null | undefined): number | null {
  if (!label) {
    return null;
  }
  const match = label.match(/(\d[\d,]*)/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1].replace(/,/g, ""), 10);
}

function extractIdeaId(url: string): string | null {
  const match = url.match(/\/chart\/[^/]+\/([^/]+)/);
  if (!match) {
    return null;
  }
  const [ideaId] = match[1].split("-");
  return ideaId || null;
}

function extractSymbol(symbolUrl: string | null, symbolTitle: string | null): string | null {
  if (symbolTitle && symbolTitle.includes(":")) {
    const parts = symbolTitle.split(":");
    return parts[parts.length - 1] || null;
  }
  if (symbolUrl) {
    const match = symbolUrl.match(/\/symbols\/([^/]+)\/?$/);
    return match ? match[1] : null;
  }
  return null;
}

function parseDateToIso(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function extractArticles(html: string): ExtractedArticle[] {
  const $ = load(html);
  const articles: ExtractedArticle[] = [];

  $("article").each((_, article) => {
    const root = $(article);
    const titleAnchor = root
      .find('a[data-qa-id="ui-lib-card-link-title"]')
      .first();
    if (!titleAnchor.length) {
      return;
    }

    const url = toAbsoluteUrl(titleAnchor.attr("href"));
    const title = normalizeWhitespace(titleAnchor.text());
    if (!url || !title) {
      return;
    }

    const contentAnchor = root
      .find('a[data-qa-id="ui-lib-card-link-paragraph"]')
      .first();
    const contentRaw = normalizeWhitespace(contentAnchor.text());

    const authorAnchor = root
      .find('a[data-qa-id="ui-lib-card-link-author"]')
      .first();
    const authorRaw = normalizeWhitespace(authorAnchor.text());
    const author = authorRaw ? authorRaw.replace(/^by\s+/i, "") : null;
    const authorUrl = toAbsoluteUrl(authorAnchor.attr("href"));

    const timeElement = root.find("time[datetime]").first();
    const publishedAt = parseDateToIso(timeElement.attr("datetime") ?? null);

    const symbolAnchor = root
      .find('a[data-qa-id="ui-lib-card-preview-link-icon"]')
      .first();
    const symbolUrl = toAbsoluteUrl(symbolAnchor.attr("href"));
    const symbolTitle = normalizeWhitespace(symbolAnchor.attr("title") ?? "");
    const symbol = extractSymbol(symbolUrl, symbolTitle || null);

    const imageUrl = toAbsoluteUrl(
      root
        .find('a[data-qa-id="ui-lib-card-link-image"] img')
        .first()
        .attr("src"),
    );

    const commentLabel = root
      .find('a[data-qa-id="ui-lib-card-comment-button"]')
      .attr("aria-label");
    const commentCount = parseCount(commentLabel);

    const boostLabel = root
      .find('[aria-label$="boosts"]')
      .first()
      .attr("aria-label");
    const boostCount = parseCount(boostLabel);

    articles.push({
      ideaId: extractIdeaId(url),
      url,
      title,
      content: contentRaw || null,
      author,
      authorUrl,
      symbol,
      symbolUrl,
      symbolTitle: symbolTitle || null,
      imageUrl,
      commentCount,
      boostCount,
      publishedAt,
    });
  });

  const deduped = new Map<string, ExtractedArticle>();
  for (const article of articles) {
    deduped.set(article.url, article);
  }

  return [...deduped.values()];
}

type TimelineEntry = {
  label: string | null;
  time: string | null;
  text: string;
};

type IdeaPageResult = {
  content: string | null;
  publishedAt: string | null;
  updates: TimelineEntry[];
};

function buildContent(entries: TimelineEntry[], includeUpdates: boolean): string | null {
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

function parseIdeaPage(html: string): { entries: TimelineEntry[] } {
  const $ = load(html);
  const container = $('[data-qa-id="publication-container"]').first();
  if (!container.length) {
    return { entries: [] };
  }

  const description = container.find('[class*="description-"]').first();
  if (!description.length) {
    return { entries: [] };
  }

  const entries: TimelineEntry[] = [];
  description.find('[class*="timelineItem-"]').each((_, item) => {
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

  return { entries };
}

function extractFallbackDescription(html: string): string | null {
  const $ = load(html);
  const description = $('meta[name="description"]').attr("content");
  return description ? normalizeWhitespace(description) : null;
}

async function fetchIdeaContent(
  url: string,
  includeUpdates: boolean,
  delayMs: number,
): Promise<IdeaPageResult> {
  if (delayMs > 0) {
    await Bun.sleep(delayMs);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    console.warn(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    return { content: null, publishedAt: null };
  }

  const html = await response.text();
  const parsed = parseIdeaPage(html);
  const content = buildContent(parsed.entries, includeUpdates);
  const publishedAt = parsed.entries[0]?.time ?? null;
  const updates = parsed.entries.slice(1);

  if (content) {
    return { content, publishedAt, updates };
  }

  return {
    content: extractFallbackDescription(html),
    publishedAt,
    updates,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = new Array(Math.max(1, concurrency)).fill(null).map(async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function enrichWithFullContent(
  articles: ExtractedArticle[],
  includeUpdates: boolean,
  concurrency: number,
  delayMs: number,
): Promise<ExtractedArticle[]> {
  return mapWithConcurrency(articles, concurrency, async (article, index) => {
    try {
      const result = await fetchIdeaContent(article.url, includeUpdates, delayMs);
      if (result.content) {
        article.content = result.content;
      }
      if (result.publishedAt) {
        article.publishedAt = result.publishedAt;
      }
      if (result.updates.length > 0) {
        article.updates = result.updates;
      }
      if ((index + 1) % 5 === 0) {
        console.log(`Fetched ${index + 1}/${articles.length} idea pages`);
      }
    } catch (error) {
      console.warn(`Failed to parse ${article.url}: ${String(error)}`);
    }
    return article;
  });
}

function buildRows(articles: ExtractedArticle[], scrapedAt: string): ArticleRow[] {
  return articles.map((article) => ({
    idea_id: article.ideaId,
    url: article.url,
    title: article.title,
    content: article.content,
    author: article.author,
    author_url: article.authorUrl,
    symbol: article.symbol,
    symbol_url: article.symbolUrl,
    symbol_title: article.symbolTitle,
    image_url: article.imageUrl,
    published_at: article.publishedAt,
    comment_count: article.commentCount,
    boost_count: article.boostCount,
    source: "tradingview",
    scraped_at: scrapedAt,
  }));
}

function buildUpdateRows(articles: ExtractedArticle[], scrapedAt: string): UpdateRow[] {
  const updates: UpdateRow[] = [];
  for (const article of articles) {
    if (!article.updates || article.updates.length === 0) {
      continue;
    }
    article.updates.forEach((update, index) => {
      if (!update.time || !update.text) {
        return;
      }
      updates.push({
        idea_url: article.url,
        update_index: index + 1,
        update_time: update.time,
        label: update.label,
        content: update.text,
        source: "tradingview",
        scraped_at: scrapedAt,
      });
    });
  }
  return updates;
}

function readArgValue(flag: string): string | null {
  const index = Bun.argv.indexOf(flag);
  if (index === -1 || index + 1 >= Bun.argv.length) {
    return null;
  }
  return Bun.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag);
}

async function main() {
  const htmlPath =
    readArgValue("--html") ??
    process.env.TRADINGVIEW_HTML_PATH ??
    DEFAULT_HTML_PATH;
  const tableName = readArgValue("--table") ?? process.env.TV_TABLE ?? "tradingview_ideas";
  const dryRun = hasFlag("--dry-run") || process.env.DRY_RUN === "1";
  const writeJson = hasFlag("--json") || process.env.OUTPUT_JSON === "1";
  const fetchFull = hasFlag("--fetch-full") || process.env.FETCH_FULL === "1";
  const includeUpdates = hasFlag("--include-updates") || process.env.INCLUDE_UPDATES === "1";
  const storeUpdates =
    hasFlag("--store-updates") ||
    process.env.STORE_UPDATES === "1" ||
    includeUpdates;
  const concurrencyRaw =
    readArgValue("--concurrency") ?? process.env.FETCH_CONCURRENCY ?? null;
  const delayRaw = readArgValue("--delay-ms") ?? process.env.FETCH_DELAY_MS ?? null;
  const concurrency = concurrencyRaw ? Number.parseInt(concurrencyRaw, 10) : DEFAULT_CONCURRENCY;
  const delayMs = delayRaw ? Number.parseInt(delayRaw, 10) : 0;

  const html = await Bun.file(htmlPath).text();
  const articles = extractArticles(html);

  if (articles.length === 0) {
    console.warn("No articles found. Check the HTML source or selectors.");
    return;
  }

  if (fetchFull) {
    if (Number.isNaN(concurrency) || concurrency < 1) {
      throw new Error("Invalid concurrency value.");
    }
    if (Number.isNaN(delayMs) || delayMs < 0) {
      throw new Error("Invalid delay value.");
    }
    await enrichWithFullContent(articles, includeUpdates, concurrency, delayMs);
  }

  const scrapedAt = new Date().toISOString();
  const rows = buildRows(articles, scrapedAt);
  const updateRows =
    storeUpdates && fetchFull ? buildUpdateRows(articles, scrapedAt) : [];

  if (writeJson) {
    await Bun.write("articles.json", JSON.stringify(rows, null, 2));
  }

  if (dryRun) {
    console.log(`Extracted ${rows.length} articles (dry run).`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to insert into Postgres.");
  }

  await sql`
    INSERT INTO ${sql(tableName)} ${sql(rows)}
    ON CONFLICT (url) DO UPDATE SET
      idea_id = EXCLUDED.idea_id,
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      author = EXCLUDED.author,
      author_url = EXCLUDED.author_url,
      symbol = EXCLUDED.symbol,
      symbol_url = EXCLUDED.symbol_url,
      symbol_title = EXCLUDED.symbol_title,
      image_url = EXCLUDED.image_url,
      published_at = EXCLUDED.published_at,
      comment_count = EXCLUDED.comment_count,
      boost_count = EXCLUDED.boost_count,
      source = EXCLUDED.source,
      scraped_at = EXCLUDED.scraped_at
  `;

  if (updateRows.length > 0) {
    await sql`
      INSERT INTO ${sql("tradingview_idea_updates")} ${sql(updateRows)}
      ON CONFLICT (idea_url, update_time) DO UPDATE SET
        update_index = EXCLUDED.update_index,
        label = EXCLUDED.label,
        content = EXCLUDED.content,
        source = EXCLUDED.source,
        scraped_at = EXCLUDED.scraped_at
    `;
  }

  console.log(`Upserted ${rows.length} articles into ${tableName}.`);
}

await main();
