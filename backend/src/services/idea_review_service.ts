import { updateIdeaReview } from "../db/repositories/idea_reviews";
import { insertIdeaNote } from "../db/repositories/idea_notes";

export async function setIdeaReviewStatus(params: {
  ideaId: string;
  reviewStatus: "new" | "triaged" | "approved" | "rejected";
  reviewer?: string | null;
}) {
  return updateIdeaReview(params.ideaId, {
    review_status: params.reviewStatus,
    reviewed_by: params.reviewer ?? null,
    reviewed_at: new Date().toISOString(),
  });
}

export async function addIdeaNote(params: { ideaId: string; note: string; author?: string | null }) {
  return insertIdeaNote({ idea_id: params.ideaId, note: params.note, author: params.author ?? null });
}
