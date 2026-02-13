import { convex } from "../client";
import { assertNoError } from "./base";

export type NewsSourceInsert = {
  name: string;
  identifier: string;
  category?: string | null;
  enabled?: boolean;
};

export async function upsertNewsSource(payload: NewsSourceInsert) {
  const result = await convex
    .from("news_sources")
    .upsert(
      {
        name: payload.name,
        identifier: payload.identifier,
        category: payload.category ?? null,
        enabled: payload.enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "identifier" },
    )
    .select("*")
    .single();

  return assertNoError(result, "upsert news source");
}

export async function listNewsSources() {
  const result = await convex.from("news_sources").select("*").order("name", { ascending: true });
  return assertNoError(result, "list news sources");
}

export async function getNewsSourceByIdentifier(identifier: string) {
  const result = await convex.from("news_sources").select("*").eq("identifier", identifier).maybeSingle();
  return result.data;
}
