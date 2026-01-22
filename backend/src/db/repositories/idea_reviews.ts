import { supabase } from "../client";
import { assertNoError } from "./base";

export type IdeaReviewUpdate = {
  review_status?: "new" | "triaged" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export async function updateIdeaReview(ideaId: string, payload: IdeaReviewUpdate) {
  const result = await supabase
    .from("ideas")
    .update({
      review_status: payload.review_status,
      reviewed_by: payload.reviewed_by ?? null,
      reviewed_at: payload.reviewed_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId)
    .select("*")
    .single();

  return assertNoError(result, "update idea review");
}
