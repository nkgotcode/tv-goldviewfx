"use client";

import { useEffect, useState } from "react";
import { fetchAgentConfig, fetchSourcePolicies, type AgentConfig, type SourcePolicy } from "../services/ops";

function formatList(items: string[] | undefined) {
  if (!items || items.length === 0) return "—";
  return items.join(", ");
}

export default function ControlSummaryPanel() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [policies, setPolicies] = useState<SourcePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [configPayload, policyPayload] = await Promise.all([fetchAgentConfig(), fetchSourcePolicies()]);
        if (mounted) {
          setConfig(configPayload);
          setPolicies(policyPayload.data ?? []);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load control snapshot.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="empty">Loading control snapshot…</div>;
  }

  if (error) {
    return <div className="empty">{error}</div>;
  }

  if (!config) {
    return <div className="empty">Control snapshot unavailable.</div>;
  }

  const activePolicies = policies.filter((policy) => policy.enabled).length;
  const policyCount = policies.length;

  return (
    <section className="table-card">
      <h3>Policy Snapshot</h3>
      <p>Current execution posture, risk gates, and source policy coverage.</p>
      <div className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Agent</span>
          <strong>{config.enabled ? "Enabled" : "Paused"}</strong>
          <div className="inline-muted">{config.mode.toUpperCase()} mode</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Kill Switch</span>
          <strong>{config.kill_switch ? "Armed" : "Standby"}</strong>
          <div className="inline-muted">Guardrails active</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Min Confidence</span>
          <strong>{(config.min_confidence_score ?? 0).toFixed(2)}</strong>
          <div className="inline-muted">Signal threshold</div>
        </div>
        <div className="summary-card" data-tone="olive">
          <span>Source Policies</span>
          <strong>{activePolicies}</strong>
          <div className="inline-muted">{policyCount} total policies</div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel">
          <h5>Allowed instruments</h5>
          <div className="inline-muted">{formatList(config.allowed_instruments)}</div>
        </div>
        <div className="panel">
          <h5>Promotion gate</h5>
          <div className="inline-muted">
            {config.promotion_required ? "Required" : "Disabled"} · Min trades {config.promotion_min_trades ?? 0}
          </div>
        </div>
        <div className="panel">
          <h5>Risk limits</h5>
          <div className="inline-muted">
            Max size {config.max_position_size} · Daily loss {config.daily_loss_limit}
          </div>
        </div>
      </div>
      <div>
        <h5>Policy Matrix</h5>
        {policies.length === 0 ? (
          <div className="inline-muted">No source policies configured.</div>
        ) : (
          <div className="table-scroll">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Enabled</th>
                  <th>Min Conf</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>{`${policy.source_type}:${policy.source_id ?? "global"}`}</td>
                    <td>{policy.enabled ? "yes" : "no"}</td>
                    <td>{policy.min_confidence_score ?? "—"}</td>
                    <td className="clamp-2">{policy.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
