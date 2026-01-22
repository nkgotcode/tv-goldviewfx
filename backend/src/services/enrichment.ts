import { getIdeasByIds } from "../db/repositories/ideas";
import { findEnrichmentByIdeaId, insertEnrichment } from "../db/repositories/enrichments";
import { insertSignal } from "../db/repositories/signals";
import { insertEnrichmentRevision } from "../db/repositories/enrichment_runs";
import { buildSignalPayload, calculateSignalConfidence } from "./signal_builder";
import { loadEnv } from "../config/env";
import { logWarn } from "./logger";

export type EnrichmentResult = {
  processed: number;
  created: number;
  skipped: number;
};

const DEFAULT_MODEL = "baseline-sentiment-v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "google/gemini-3-flash-preview";
const CONTENT_LIMIT = 4000;

type SentimentLabel = "positive" | "neutral" | "negative";

type SentimentResult = {
  label: SentimentLabel;
  score: number;
  model: string;
};

function clampScore(score: number) {
  if (Number.isNaN(score)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, score));
}

function normalizeLabel(label: string): SentimentLabel {
  const normalized = label.toLowerCase().trim();
  if (normalized === "positive" || normalized === "negative" || normalized === "neutral") {
    return normalized;
  }
  return "neutral";
}

function buildIdeaText(title: string, content: string | null) {
  const payload = [title, content ?? ""].filter(Boolean).join("\n\n");
  return payload.length > CONTENT_LIMIT ? payload.slice(0, CONTENT_LIMIT) : payload;
}

async function fetchSentiment(
  apiKey: string,
  model: string,
  title: string,
  content: string | null,
  baseUrl?: string,
  openRouterReferer?: string,
  openRouterTitle?: string,
): Promise<SentimentResult> {
  const ideaText = buildIdeaText(title, content);
  const base = (baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const endpoint = `${base}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (openRouterReferer) {
    headers["HTTP-Referer"] = openRouterReferer;
  }
  if (openRouterTitle) {
    headers["X-Title"] = openRouterTitle;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment classifier for trading ideas. Respond with JSON: " +
            '{"label":"positive|neutral|negative","score":number}. ' +
            "Score must be between -1 and 1, where -1 is very bearish and 1 is very bullish.",
        },
        {
          role: "user",
          content: `Title:\n${title}\n\nContent:\n${ideaText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("OpenAI response missing content");
  }

  let parsed: { label?: string; score?: number } | null = null;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    throw new Error("OpenAI response was not valid JSON");
  }

  return {
    label: normalizeLabel(parsed.label ?? "neutral"),
    score: clampScore(parsed.score ?? 0),
    model,
  };
}

function fallbackSentiment(): SentimentResult {
  return { label: "neutral", score: 0, model: DEFAULT_MODEL };
}

export async function runEnrichment(ideaIds: string[], runId?: string): Promise<EnrichmentResult> {
  const ideas = await getIdeasByIds(ideaIds);
  const env = loadEnv();
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const baseUrl = env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL;
  const openRouterReferer = env.OPENROUTER_REFERER;
  const openRouterTitle = env.OPENROUTER_TITLE;
  const useOpenAi = Boolean(apiKey);
  if (!useOpenAi) {
    logWarn("OPENAI_API_KEY missing; using baseline sentiment", { model: DEFAULT_MODEL });
  }
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const idea of ideas) {
    processed += 1;
    const existing = await findEnrichmentByIdeaId(idea.id);
    if (existing) {
      skipped += 1;
      continue;
    }

    let sentiment = fallbackSentiment();
    if (useOpenAi && apiKey) {
      try {
        sentiment = await fetchSentiment(
          apiKey,
          model,
          idea.title,
          idea.content,
          baseUrl,
          openRouterReferer,
          openRouterTitle,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn("Sentiment analysis failed; using baseline", { message, model });
      }
    }

    const enrichmentPayload = {
      idea_id: idea.id,
      sentiment_label: sentiment.label,
      sentiment_score: sentiment.score,
      similarity_vector: null,
      model_name: sentiment.model,
    };

    const enrichment = await insertEnrichment(enrichmentPayload);
    if (runId) {
      await insertEnrichmentRevision({
        enrichment_id: enrichment.id,
        idea_id: idea.id,
        run_id: runId,
        previous_payload: null,
        next_payload: enrichmentPayload,
        diff_summary: { created: true, sentiment: enrichmentPayload.sentiment_label },
      });
    }
    const signalPayload = buildSignalPayload(
      { id: idea.id, title: idea.title, content: idea.content },
      enrichmentPayload,
    );

    await insertSignal({
      source_type: "tradingview",
      idea_id: idea.id,
      enrichment_id: enrichment.id,
      payload_summary: signalPayload.summary,
      confidence_score: calculateSignalConfidence(enrichmentPayload),
    });

    created += 1;
  }

  return { processed, created, skipped };
}
