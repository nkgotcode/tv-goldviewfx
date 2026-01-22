import { listSourcePolicies } from "../db/repositories/source_policies";

export type AuxSignal = {
  source: string;
  score: number;
  confidence?: number | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function applySourceGates(params: {
  signals: AuxSignal[];
  label: string;
  minConfidenceScore?: number | null;
  allowedSourceIds?: string[] | null;
}) {
  const policies = await listSourcePolicies();
  const policyByType = new Map<string, { enabled?: boolean | null; min_confidence_score?: number | null }>();
  const policyById = new Map<string, { enabled?: boolean | null; min_confidence_score?: number | null }>();
  for (const policy of policies) {
    if (!policy.source_type) continue;
    if (policy.source_id) {
      policyById.set(policy.source_id, {
        enabled: policy.enabled,
        min_confidence_score: policy.min_confidence_score ?? null,
      });
      continue;
    }
    if (!policyByType.has(policy.source_type)) {
      policyByType.set(policy.source_type, {
        enabled: policy.enabled,
        min_confidence_score: policy.min_confidence_score ?? null,
      });
    }
  }

  const allowed: AuxSignal[] = [];
  const warnings: string[] = [];

  for (const signal of params.signals) {
    const confidence = signal.confidence ?? 0;
    if (params.minConfidenceScore !== undefined && params.minConfidenceScore !== null) {
      if (confidence < params.minConfidenceScore) {
        warnings.push(`${params.label}:min_confidence`);
        continue;
      }
    }

    if (params.allowedSourceIds && params.allowedSourceIds.length > 0) {
      const sourceKey = signal.sourceId ?? signal.source;
      if (!params.allowedSourceIds.includes(sourceKey)) {
        warnings.push(`${params.label}:source_not_allowed`);
        continue;
      }
    }

    const policy = (signal.sourceId ? policyById.get(signal.sourceId) : null) ?? policyByType.get(signal.source);
    if (policy?.enabled === false) {
      warnings.push(`${params.label}:source_disabled`);
      continue;
    }
    if (policy?.min_confidence_score !== null && policy?.min_confidence_score !== undefined) {
      if (confidence < policy.min_confidence_score) {
        warnings.push(`${params.label}:source_min_confidence`);
        continue;
      }
    }
    allowed.push(signal);
  }

  return { allowed, warnings };
}
