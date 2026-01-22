import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { getAgentConfig, updateAgentConfig } from "../../db/repositories/agent_config";
import { listSourcePolicies, upsertSourcePolicy } from "../../db/repositories/source_policies";
import { auditRlEvent } from "../../services/rl_audit";

const killSwitchSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
});

const promotionGateSchema = z.object({
  promotion_required: z.boolean().optional(),
  promotion_min_trades: z.number().int().nonnegative().optional(),
  promotion_min_win_rate: z.number().nonnegative().optional(),
  promotion_min_net_pnl: z.number().optional(),
  promotion_max_drawdown: z.number().nonnegative().optional(),
});

const sourcePolicySchema = z.object({
  source_id: z.string().uuid().nullable().optional(),
  source_type: z.string(),
  enabled: z.boolean().optional(),
  min_confidence_score: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const rlGovernanceRoutes = new Hono();

rlGovernanceRoutes.use("*", withOpsIdentity);

rlGovernanceRoutes.get("/:agentId/kill-switch", async (c) => {
  const config = await getAgentConfig();
  return c.json({
    enabled: config.kill_switch,
    reason: config.kill_switch_reason ?? null,
  });
});

rlGovernanceRoutes.post(
  "/:agentId/kill-switch",
  requireOperatorRole,
  validateJson(killSwitchSchema),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof killSwitchSchema>;
    const updated = await updateAgentConfig({
      kill_switch: payload.enabled,
      kill_switch_reason: payload.enabled ? payload.reason ?? null : null,
    });
    auditRlEvent("kill_switch.update", {
      agent_id: c.req.param("agentId"),
      enabled: payload.enabled,
      reason: payload.reason ?? null,
      actor: c.get("opsActor") ?? "system",
    });
    return c.json({
      enabled: updated.kill_switch,
      reason: updated.kill_switch_reason ?? null,
    });
  },
);

rlGovernanceRoutes.get("/:agentId/promotion-gates", async (c) => {
  const config = await getAgentConfig();
  return c.json({
    promotion_required: config.promotion_required,
    promotion_min_trades: config.promotion_min_trades,
    promotion_min_win_rate: config.promotion_min_win_rate,
    promotion_min_net_pnl: config.promotion_min_net_pnl,
    promotion_max_drawdown: config.promotion_max_drawdown,
  });
});

rlGovernanceRoutes.patch(
  "/:agentId/promotion-gates",
  requireOperatorRole,
  validateJson(promotionGateSchema),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof promotionGateSchema>;
    const updated = await updateAgentConfig(payload);
    auditRlEvent("promotion_gates.update", {
      agent_id: c.req.param("agentId"),
      actor: c.get("opsActor") ?? "system",
      payload,
    });
    return c.json({
      promotion_required: updated.promotion_required,
      promotion_min_trades: updated.promotion_min_trades,
      promotion_min_win_rate: updated.promotion_min_win_rate,
      promotion_min_net_pnl: updated.promotion_min_net_pnl,
      promotion_max_drawdown: updated.promotion_max_drawdown,
    });
  },
);

rlGovernanceRoutes.get("/:agentId/source-policies", async (c) => {
  const policies = await listSourcePolicies();
  return c.json(policies);
});

rlGovernanceRoutes.patch(
  "/:agentId/source-policies",
  requireOperatorRole,
  validateJson(z.array(sourcePolicySchema)),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof sourcePolicySchema>[];
    const updated = await Promise.all(
      payload.map((policy) =>
        upsertSourcePolicy({
          source_id: policy.source_id ?? null,
          source_type: policy.source_type,
          enabled: policy.enabled,
          min_confidence_score: policy.min_confidence_score ?? null,
          notes: policy.notes ?? null,
        }),
      ),
    );
    auditRlEvent("source_policies.update", {
      agent_id: c.req.param("agentId"),
      actor: c.get("opsActor") ?? "system",
      count: updated.length,
    });
    return c.json(updated);
  },
);
