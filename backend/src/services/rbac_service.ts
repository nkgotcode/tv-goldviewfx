import { supabase } from "../db/client";

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
  const override = normalizeRole(headerRole);
  if (override) {
    return override;
  }
  if (!actor) {
    return "operator";
  }
  const result = await supabase
    .from("role_assignments")
    .select("role")
    .eq("actor", actor)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const role = normalizeRole(result.data?.role ?? null);
  return role ?? "operator";
}
