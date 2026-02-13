import { convex } from "../client";
import { assertNoError } from "./base";

export type IdeaMediaInsert = {
  idea_id: string;
  media_url: string;
  media_type?: string | null;
  ocr_status?: string;
  ocr_text?: string | null;
  ocr_confidence?: number | null;
  ocr_provider?: string | null;
};

export async function insertIdeaMedia(payload: IdeaMediaInsert) {
  const result = await convex
    .from("idea_media")
    .upsert(
      {
        idea_id: payload.idea_id,
        media_url: payload.media_url,
        media_type: payload.media_type ?? "image",
        ocr_status: payload.ocr_status ?? "pending",
        ocr_text: payload.ocr_text ?? null,
        ocr_confidence: payload.ocr_confidence ?? null,
        ocr_provider: payload.ocr_provider ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idea_id,media_url" },
    )
    .select("*")
    .single();
  return assertNoError(result, "insert idea media");
}

export async function listIdeaMedia(ideaId: string) {
  const result = await convex
    .from("idea_media")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return assertNoError(result, "list idea media");
}

export async function listPendingIdeaMedia(limit = 25) {
  const result = await convex
    .from("idea_media")
    .select("*")
    .eq("ocr_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  return assertNoError(result, "list pending idea media");
}

export async function updateIdeaMedia(id: string, payload: Partial<IdeaMediaInsert> & { ocr_status?: string }) {
  const result = await convex
    .from("idea_media")
    .update({
      media_url: payload.media_url,
      media_type: payload.media_type,
      ocr_status: payload.ocr_status,
      ocr_text: payload.ocr_text ?? null,
      ocr_confidence: payload.ocr_confidence ?? null,
      ocr_provider: payload.ocr_provider ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update idea media");
}
