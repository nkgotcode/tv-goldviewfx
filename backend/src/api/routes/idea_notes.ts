import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { listIdeaNotes, insertIdeaNote } from "../../db/repositories/idea_notes";
import { withOpsIdentity, requireOperatorRole } from "../middleware/rbac";
import { recordOpsAudit } from "../../services/ops_audit";

const noteSchema = z.object({
  note: z.string().min(1),
  author: z.string().optional(),
});

export const ideaNotesRoutes = new Hono();

ideaNotesRoutes.use("*", withOpsIdentity);

ideaNotesRoutes.get("/:ideaId", async (c) => {
  const ideaId = c.req.param("ideaId");
  const notes = await listIdeaNotes(ideaId);
  return c.json({ data: notes });
});

ideaNotesRoutes.post("/:ideaId", requireOperatorRole, validateJson(noteSchema), async (c) => {
  const ideaId = c.req.param("ideaId");
  const payload = c.get("validatedBody") as z.infer<typeof noteSchema>;
  const note = await insertIdeaNote({
    idea_id: ideaId,
    note: payload.note,
    author: payload.author ?? (c.get("opsActor") as string | undefined),
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "idea.note.add",
    resource_type: "idea",
    resource_id: ideaId,
    metadata: payload,
  });
  return c.json(note, 201);
});
