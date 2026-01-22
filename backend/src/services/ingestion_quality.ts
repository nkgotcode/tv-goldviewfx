export type IdeaQuality = {
  coverage_pct: number;
  missing_fields_count: number;
  parse_confidence: number;
};

const REQUIRED_FIELDS = ["title", "url", "author", "publishedAt", "content"] as const;

export function computeIdeaQuality(idea: {
  title?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}): IdeaQuality {
  let missing = 0;
  if (!idea.title) missing += 1;
  if (!idea.url) missing += 1;
  if (!idea.author) missing += 1;
  if (!idea.publishedAt) missing += 1;
  if (!idea.content) missing += 1;
  const coverage = (REQUIRED_FIELDS.length - missing) / REQUIRED_FIELDS.length;
  return {
    coverage_pct: Math.round(coverage * 10000) / 100,
    missing_fields_count: missing,
    parse_confidence: Math.round(coverage * 100) / 100,
  };
}

export function aggregateQuality(qualities: IdeaQuality[]) {
  if (qualities.length === 0) {
    return { coverage_pct: 0, missing_fields_count: 0, parse_confidence: 0 };
  }
  const totals = qualities.reduce(
    (acc, item) => {
      acc.coverage += item.coverage_pct;
      acc.missing += item.missing_fields_count;
      acc.confidence += item.parse_confidence;
      return acc;
    },
    { coverage: 0, missing: 0, confidence: 0 },
  );

  return {
    coverage_pct: Math.round((totals.coverage / qualities.length) * 100) / 100,
    missing_fields_count: totals.missing,
    parse_confidence: Math.round((totals.confidence / qualities.length) * 100) / 100,
  };
}
