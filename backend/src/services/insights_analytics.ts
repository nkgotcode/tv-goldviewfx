import { supabase } from "../db/client";

export type SourceEfficacy = {
  source_type: string;
  source_id: string | null;
  source_name: string;
  item_count: number;
  signal_count: number;
  trade_count: number;
  win_rate: number;
  conversion_to_signal: number;
  conversion_to_trade: number;
};

export type SentimentPnlCorrelation = {
  generated_at: string;
  correlation: number;
  by_sentiment: Array<{ label: string; avg_pnl: number; trade_count: number }>;
};

export async function getSourceEfficacy(): Promise<{ generated_at: string; sources: SourceEfficacy[] }> {
  const [ideasResult, postsResult, newsResult, signalsResult, tradesResult, sourcesResult, newsSourcesResult] =
    await Promise.all([
      supabase.from("ideas").select("id, source_id"),
      supabase.from("telegram_posts").select("id, source_id"),
      supabase.from("news_items").select("id, source_id"),
      supabase.from("signals").select("id, source_type, idea_id, telegram_post_id, news_item_id"),
      supabase.from("trades").select("id, signal_id, status, pnl"),
      supabase.from("sources").select("id, type, identifier, display_name"),
      supabase.from("news_sources").select("id, name, identifier"),
    ]);

  const ideas = ideasResult.data ?? [];
  const posts = postsResult.data ?? [];
  const newsItems = newsResult.data ?? [];
  const signals = signalsResult.data ?? [];
  const trades = tradesResult.data ?? [];
  const sources = sourcesResult.data ?? [];
  const newsSources = newsSourcesResult.data ?? [];

  const ideaSourceMap = new Map<string, string>();
  for (const idea of ideas) {
    if (idea.source_id) ideaSourceMap.set(idea.id, idea.source_id);
  }
  const postSourceMap = new Map<string, string>();
  for (const post of posts) {
    if (post.source_id) postSourceMap.set(post.id, post.source_id);
  }
  const newsSourceMap = new Map<string, string>();
  for (const item of newsItems) {
    if (item.source_id) newsSourceMap.set(item.id, item.source_id);
  }

  const sourceNameMap = new Map<string, string>();
  for (const source of sources) {
    sourceNameMap.set(source.id, source.display_name ?? source.identifier ?? source.id);
  }
  const newsNameMap = new Map<string, string>();
  for (const source of newsSources) {
    newsNameMap.set(source.id, source.name ?? source.identifier ?? source.id);
  }

  const tradeBySignal = new Map<string, { count: number; wins: number }>();
  for (const trade of trades) {
    if (!trade.signal_id || trade.status !== "filled") continue;
    const current = tradeBySignal.get(trade.signal_id) ?? { count: 0, wins: 0 };
    current.count += 1;
    if ((trade.pnl ?? 0) > 0) {
      current.wins += 1;
    }
    tradeBySignal.set(trade.signal_id, current);
  }

  type InternalEfficacy = SourceEfficacy & { wins: number };
  const groups = new Map<string, InternalEfficacy>();

  const registerGroup = (
    key: string,
    payload: Omit<SourceEfficacy, "signal_count" | "trade_count" | "win_rate" | "conversion_to_signal" | "conversion_to_trade">,
  ) => {
    if (!groups.has(key)) {
      groups.set(key, {
        ...payload,
        signal_count: 0,
        trade_count: 0,
        win_rate: 0,
        conversion_to_signal: 0,
        conversion_to_trade: 0,
        wins: 0,
      });
    }
  };

  for (const source of sources) {
    if (source.type === "tradingview") {
      registerGroup(`tradingview:${source.id}`, {
        source_type: "tradingview",
        source_id: source.id,
        source_name: source.display_name ?? source.identifier ?? source.id,
        item_count: ideas.filter((idea) => idea.source_id === source.id).length,
      });
    }
    if (source.type === "telegram") {
      registerGroup(`telegram:${source.id}`, {
        source_type: "telegram",
        source_id: source.id,
        source_name: source.display_name ?? source.identifier ?? source.id,
        item_count: posts.filter((post) => post.source_id === source.id).length,
      });
    }
  }

  for (const newsSource of newsSources) {
    registerGroup(`news:${newsSource.id}`, {
      source_type: "news",
      source_id: newsSource.id,
      source_name: newsSource.name ?? newsSource.identifier ?? newsSource.id,
      item_count: newsItems.filter((item) => item.source_id === newsSource.id).length,
    });
  }

  for (const signal of signals) {
    let sourceId: string | null = null;
    let sourceType = signal.source_type ?? "unknown";
    if (signal.source_type === "tradingview" && signal.idea_id) {
      sourceId = ideaSourceMap.get(signal.idea_id) ?? null;
    } else if (signal.source_type === "telegram" && signal.telegram_post_id) {
      sourceId = postSourceMap.get(signal.telegram_post_id) ?? null;
    } else if (signal.source_type === "news" && signal.news_item_id) {
      sourceId = newsSourceMap.get(signal.news_item_id) ?? null;
    }
    const key = `${sourceType}:${sourceId ?? "unknown"}`;
    const fallbackName = sourceType === "news" ? newsNameMap.get(sourceId ?? "") : sourceNameMap.get(sourceId ?? "");
    registerGroup(key, {
      source_type: sourceType,
      source_id: sourceId,
      source_name: fallbackName ?? `${sourceType}-${sourceId ?? "unknown"}`,
      item_count: 0,
    });
    const group = groups.get(key);
    if (!group) continue;
    group.signal_count += 1;
    const tradeStats = signal.id ? tradeBySignal.get(signal.id) : null;
    if (tradeStats) {
      group.trade_count += tradeStats.count;
      group.wins += tradeStats.wins;
    }
  }

  for (const group of groups.values()) {
    group.conversion_to_signal = group.item_count > 0 ? group.signal_count / group.item_count : 0;
    group.conversion_to_trade = group.signal_count > 0 ? group.trade_count / group.signal_count : 0;
    group.win_rate = group.trade_count ? Number((group.wins / group.trade_count).toFixed(4)) : 0;
    group.conversion_to_signal = Number(group.conversion_to_signal.toFixed(4));
    group.conversion_to_trade = Number(group.conversion_to_trade.toFixed(4));
  }

  return { generated_at: new Date().toISOString(), sources: [...groups.values()].map(({ wins, ...rest }) => rest) };
}

export async function getSentimentPnlCorrelation(): Promise<SentimentPnlCorrelation> {
  const [signalsResult, tradesResult, enrichmentsResult] = await Promise.all([
    supabase.from("signals").select("id, idea_id"),
    supabase.from("trades").select("id, signal_id, pnl, status"),
    supabase.from("enrichments").select("idea_id, sentiment_label, sentiment_score"),
  ]);

  const signals = signalsResult.data ?? [];
  const trades = tradesResult.data ?? [];
  const enrichments = enrichmentsResult.data ?? [];

  const signalMap = new Map<string, string | null>();
  for (const signal of signals) {
    signalMap.set(signal.id, signal.idea_id ?? null);
  }
  const enrichmentMap = new Map<string, { label: string; score: number }>();
  for (const enrichment of enrichments) {
    enrichmentMap.set(enrichment.idea_id, {
      label: enrichment.sentiment_label,
      score: enrichment.sentiment_score,
    });
  }

  const pairs: Array<{ score: number; pnl: number }> = [];
  const sentimentBuckets = new Map<string, { total: number; count: number }>();

  for (const trade of trades) {
    if (trade.status !== "filled" || !trade.signal_id) continue;
    const ideaId = signalMap.get(trade.signal_id);
    if (!ideaId) continue;
    const enrichment = enrichmentMap.get(ideaId);
    if (!enrichment) continue;
    const pnl = trade.pnl ?? 0;
    pairs.push({ score: enrichment.score, pnl });
    const bucket = sentimentBuckets.get(enrichment.label) ?? { total: 0, count: 0 };
    bucket.total += pnl;
    bucket.count += 1;
    sentimentBuckets.set(enrichment.label, bucket);
  }

  const correlation = computeCorrelation(pairs);
  const by_sentiment = [...sentimentBuckets.entries()].map(([label, bucket]) => ({
    label,
    avg_pnl: bucket.count ? Number((bucket.total / bucket.count).toFixed(4)) : 0,
    trade_count: bucket.count,
  }));

  return { generated_at: new Date().toISOString(), correlation, by_sentiment };
}

export async function getTopicTrends(period?: string) {
  const query = supabase.from("topic_clusters").select("*").order("window_start", { ascending: false }).limit(20);
  if (period) {
    query.eq("period", period);
  }
  const result = await query;
  return result.data ?? [];
}

function computeCorrelation(pairs: Array<{ score: number; pnl: number }>) {
  if (pairs.length < 2) return 0;
  const meanScore = pairs.reduce((acc, pair) => acc + pair.score, 0) / pairs.length;
  const meanPnl = pairs.reduce((acc, pair) => acc + pair.pnl, 0) / pairs.length;
  let numerator = 0;
  let scoreDenom = 0;
  let pnlDenom = 0;
  for (const pair of pairs) {
    const scoreDiff = pair.score - meanScore;
    const pnlDiff = pair.pnl - meanPnl;
    numerator += scoreDiff * pnlDiff;
    scoreDenom += scoreDiff * scoreDiff;
    pnlDenom += pnlDiff * pnlDiff;
  }
  const denom = Math.sqrt(scoreDenom * pnlDenom);
  if (!denom) return 0;
  return Number((numerator / denom).toFixed(4));
}
