import { supabase } from "../client";
import { assertNoError } from "./base";

export async function createRevision(ideaId: string, content: string, contentHash: string) {
  const result = await supabase
    .from("idea_revisions")
    .upsert({ idea_id: ideaId, content, content_hash: contentHash }, { onConflict: "idea_id,content_hash", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (result.error) {
    throw new Error(`create idea revision: ${result.error.message}`);
  }
  return result.data ?? null;
}
