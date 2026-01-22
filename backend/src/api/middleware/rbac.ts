import type { Context, Next } from "hono";
import { resolveRole } from "../../services/rbac_service";

function getActor(c: Context) {
  return (
    c.req.header("x-actor") ??
    c.req.header("x-user") ??
    c.req.header("x-ops-actor") ??
    "system"
  );
}

export async function withOpsIdentity(c: Context, next: Next) {
  const actor = getActor(c);
  const role = await resolveRole(actor, c.req.header("x-ops-role"));
  c.set("opsActor", actor);
  c.set("opsRole", role);
  return next();
}

export async function requireOperatorRole(c: Context, next: Next) {
  const actor = getActor(c);
  const role = await resolveRole(actor, c.req.header("x-ops-role"));
  c.set("opsActor", actor);
  c.set("opsRole", role);
  if (role !== "operator") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
}
