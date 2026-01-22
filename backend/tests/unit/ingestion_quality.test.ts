import { test, expect } from "bun:test";
import { computeIdeaQuality, aggregateQuality } from "../../src/services/ingestion_quality";

test("computeIdeaQuality returns coverage and confidence", () => {
  const quality = computeIdeaQuality({
    title: "Idea",
    url: "https://example.com",
    author: "author",
    publishedAt: "2025-01-01T00:00:00Z",
    content: "content",
  });
  expect(quality.missing_fields_count).toBe(0);
  expect(quality.coverage_pct).toBe(100);
  expect(quality.parse_confidence).toBe(1);
});

test("aggregateQuality averages metrics", () => {
  const agg = aggregateQuality([
    { coverage_pct: 100, missing_fields_count: 0, parse_confidence: 1 },
    { coverage_pct: 60, missing_fields_count: 2, parse_confidence: 0.6 },
  ]);
  expect(agg.coverage_pct).toBeGreaterThan(70);
  expect(agg.missing_fields_count).toBe(2);
});
