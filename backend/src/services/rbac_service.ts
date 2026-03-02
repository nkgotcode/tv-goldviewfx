import { convex } from "../db/client";
import { logWarn } from "../services/logger";

export type OpsRole = "operator" | "analyst";

function normalizeRole(role?: string | null): OpsRole | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === "operator" || normalized === "analyst") {
    return normalized;
  }
  return null;
}

export async function resolveRole(actor?: string | null, headerRole?: string | null): Promise<OpsRole> {
  if (process.env.API_TOKEN && process.env.API_TOKEN.trim().length > 0) {
    return "operator";
  }
  const override = normalizeRole(headerRole);
  if (override) {
    return override;
  }
  if (!actor) {
    return "operator";
  }
  try {
    const result = await convex
      .from("role_assignments")
      .select("role")
      .eq("actor", actor)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const role = normalizeRole(result.data?.role ?? null);
    return role ?? "operator";
  } catch (error) {
    logWarn("Failed to resolve role assignment, defaulting to operator", {
      actor,
      error: String(error),
    });
    return "operator";
  }
}
