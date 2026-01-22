import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { loadEnv, type Env } from "../../config/env";
import { buildContent, extractFallbackDescription, extractIdeaImages, parseIdeaTimeline } from "./parser";

export type IdeaPageResult = {
  content: string | null;
  publishedAt: string | null;
  updates: { label: string | null; time: string | null; text: string }[];
  imageUrls: string[];
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchProfileHtml(): Promise<string> {
  const env = loadEnv();
  if (env.TRADINGVIEW_USE_HTML) {
    if (!env.TRADINGVIEW_HTML_PATH) {
      throw new Error("TRADINGVIEW_HTML_PATH is required when TRADINGVIEW_USE_HTML is enabled");
    }
    return Bun.file(env.TRADINGVIEW_HTML_PATH).text();
  }
  if (env.TRADINGVIEW_USE_BROWSER || env.TRADINGVIEW_COOKIES_PATH) {
    return fetchProfileHtmlWithBrowser(env);
  }
  if (!env.TRADINGVIEW_PROFILE_URL) {
    if (env.TRADINGVIEW_HTML_PATH) {
      return Bun.file(env.TRADINGVIEW_HTML_PATH).text();
    }
    throw new Error("TRADINGVIEW_PROFILE_URL or TRADINGVIEW_HTML_PATH is required");
  }
  const response = await fetchWithTimeout(env.TRADINGVIEW_PROFILE_URL, env.TRADINGVIEW_HTTP_TIMEOUT_MS, {
    headers: DEFAULT_HEADERS,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

type StorageState = {
  cookies: Array<Record<string, unknown>>;
  origins?: Array<Record<string, unknown>>;
};

function isStorageState(value: unknown): value is StorageState {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as StorageState).cookies),
  );
}

async function loadCookiesFile(path: string): Promise<{
  storageState?: StorageState;
  cookies?: Array<Record<string, unknown>>;
}> {
  if (!path) {
    return {};
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (isStorageState(parsed)) {
    return { storageState: parsed };
  }
  if (Array.isArray(parsed)) {
    return { cookies: parsed as Array<Record<string, unknown>> };
  }
  throw new Error("Invalid TradingView cookies file. Expected storageState or cookies array.");
}

async function fetchProfileHtmlWithBrowser(env: Env): Promise<string> {
  if (!env.TRADINGVIEW_PROFILE_URL) {
    throw new Error("TRADINGVIEW_PROFILE_URL is required for browser-based sync");
  }

  const { storageState, cookies } = await loadCookiesFile(env.TRADINGVIEW_COOKIES_PATH ?? "");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: DEFAULT_HEADERS["User-Agent"],
      storageState: storageState,
    });
    if (cookies?.length) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(env.TRADINGVIEW_PROFILE_URL, {
      waitUntil: "networkidle",
      timeout: env.TRADINGVIEW_BROWSER_TIMEOUT_MS,
    });

    try {
      await page.waitForSelector("article", { timeout: 10000 });
    } catch {
      // Continue even if the selector isn't found to return the raw HTML.
    }

    for (let i = 0; i < env.TRADINGVIEW_SCROLL_PAGES; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(env.TRADINGVIEW_SCROLL_DELAY_MS);
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function fetchIdeaContent(
  url: string,
  includeUpdates: boolean,
  delayMs: number,
  timeoutMs: number,
): Promise<IdeaPageResult> {
  if (delayMs > 0) {
    await Bun.sleep(delayMs);
  }

  let html = "";
  try {
    const response = await fetchWithTimeout(url, timeoutMs, {
      headers: DEFAULT_HEADERS,
    });
    if (!response.ok) {
      return { content: null, publishedAt: null, updates: [], imageUrls: [] };
    }
    html = await response.text();
  } catch {
    return { content: null, publishedAt: null, updates: [], imageUrls: [] };
  }
  const entries = parseIdeaTimeline(html);
  const content = buildContent(entries, includeUpdates);
  const publishedAt = entries[0]?.time ?? null;
  const updates = entries.slice(1);
  const imageUrls = extractIdeaImages(html);

  if (content) {
    return { content, publishedAt, updates, imageUrls };
  }

  return {
    content: extractFallbackDescription(html),
    publishedAt,
    updates,
    imageUrls,
  };
}

export async function mapWithConcurrency<T, R>(
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
