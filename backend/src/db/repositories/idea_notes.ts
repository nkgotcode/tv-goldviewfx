import { convex } from "../client";
import { assertNoError } from "./base";

export type IdeaNoteInsert = {
  idea_id: string;
  author?: string | null;
  note: string;
};

export async function insertIdeaNote(payload: IdeaNoteInsert) {
  const result = await convex
    .from("idea_notes")
    .insert({
      idea_id: payload.idea_id,
      author: payload.author ?? null,
      note: payload.note,
    })
    .select("*")
    .single();
  return assertNoError(result, "insert idea note");
}

export async function listIdeaNotes(ideaId: string) {
  const result = await convex
    .from("idea_notes")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return assertNoError(result, "list idea notes");
}
