"use client";

import { useEffect, useState } from "react";
import {
  fetchKillSwitch,
  fetchPromotionGates,
  listSourcePolicies,
  updateKillSwitch,
  updatePromotionGates,
  updateSourcePolicies,
  type KillSwitchState,
  type PromotionGateConfig,
  type SourcePolicy,
} from "../../services/rl_governance";

export default function GovernancePanel({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [killSwitch, setKillSwitch] = useState<KillSwitchState>({ enabled: false, reason: "" });
  const [promotion, setPromotion] = useState<PromotionGateConfig>({});
  const [policies, setPolicies] = useState<SourcePolicy[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [kill, gates, policyList] = await Promise.all([
        fetchKillSwitch(),
        fetchPromotionGates(),
        listSourcePolicies(),
      ]);
      setKillSwitch(kill);
      setPromotion(gates);
      setPolicies(policyList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load governance settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleKillSwitchSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateKillSwitch("gold-rl-agent", {
        enabled: killSwitch.enabled,
        reason: killSwitch.enabled ? killSwitch.reason ?? "" : null,
      });
      await onRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update kill switch.");
    } finally {
      setSaving(false);
    }
  };

  const handlePromotionSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePromotionGates("gold-rl-agent", promotion);
      await onRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update promotion gates.");
    } finally {
      setSaving(false);
    }
  };

  const handlePolicyChange = (index: number, field: keyof SourcePolicy, value: string | number | boolean | null) => {
    setPolicies((prev) =>
      prev.map((policy, idx) => (idx === index ? { ...policy, [field]: value } : policy)),
    );
  };

  const handleAddPolicy = () => {
    setPolicies((prev) => [
      ...prev,
      { source_type: "", enabled: true, min_confidence_score: 0, notes: "" },
    ]);
  };

  const handlePoliciesSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const cleaned = policies.filter((policy) => policy.source_type && policy.source_type.trim().length > 0);
      await updateSourcePolicies("gold-rl-agent", cleaned);
      await onRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update source policies.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="table-card">
      <h3>Governance Controls</h3>
      <p>Manage kill switches, promotion gates, and per-source approval rules.</p>

      {error ? <div className="empty">{error}</div> : null}

      <div className="form-grid">
        <label className="toggle-row">
          <span>Kill Switch Enabled</span>
          <input
            type="checkbox"
            checked={killSwitch.enabled}
            onChange={(event) =>
              setKillSwitch((prev) => ({ ...prev, enabled: event.target.checked }))
            }
          />
        </label>
        <label>
          Kill Switch Reason
          <input
            type="text"
            value={killSwitch.reason ?? ""}
            onChange={(event) => setKillSwitch((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Optional reason"
          />
        </label>
      </div>
      <div className="action-row">
        <button type="button" onClick={handleKillSwitchSave} disabled={saving}>
          Save Kill Switch
        </button>
      </div>

      <div className="form-grid">
        <label className="toggle-row">
          <span>Promotion Gate Required</span>
          <input
            type="checkbox"
            checked={Boolean(promotion.promotion_required)}
            onChange={(event) =>
              setPromotion((prev) => ({ ...prev, promotion_required: event.target.checked }))
            }
          />
        </label>
        <label>
          Min Trades
          <input
            type="number"
            value={promotion.promotion_min_trades ?? 0}
            onChange={(event) =>
              setPromotion((prev) => ({ ...prev, promotion_min_trades: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          Min Win Rate
          <input
            type="number"
            step="0.01"
            value={promotion.promotion_min_win_rate ?? 0}
            onChange={(event) =>
              setPromotion((prev) => ({ ...prev, promotion_min_win_rate: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          Min Net PnL
          <input
            type="number"
            step="0.01"
            value={promotion.promotion_min_net_pnl ?? 0}
            onChange={(event) =>
              setPromotion((prev) => ({ ...prev, promotion_min_net_pnl: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          Max Drawdown
          <input
            type="number"
            step="0.01"
            value={promotion.promotion_max_drawdown ?? 0}
            onChange={(event) =>
              setPromotion((prev) => ({ ...prev, promotion_max_drawdown: Number(event.target.value) }))
            }
          />
        </label>
      </div>
      <div className="action-row">
        <button type="button" onClick={handlePromotionSave} disabled={saving}>
          Save Promotion Gates
        </button>
      </div>

      <div>
        <h4>Source Policies</h4>
        <div className="form-grid">
          {policies.map((policy, index) => (
            <div key={`${policy.id ?? "new"}-${index}`} className="form-grid">
              <label>
                Source Type
                <input
                  type="text"
                  value={policy.source_type}
                  onChange={(event) => handlePolicyChange(index, "source_type", event.target.value)}
                />
              </label>
              <label>
                Source ID (optional)
                <input
                  type="text"
                  value={policy.source_id ?? ""}
                  onChange={(event) => handlePolicyChange(index, "source_id", event.target.value || null)}
                />
              </label>
              <label>
                Min Confidence
                <input
                  type="number"
                  step="0.01"
                  value={policy.min_confidence_score ?? 0}
                  onChange={(event) =>
                    handlePolicyChange(index, "min_confidence_score", Number(event.target.value))
                  }
                />
              </label>
              <label className="toggle-row">
                <span>Enabled</span>
                <input
                  type="checkbox"
                  checked={policy.enabled ?? true}
                  onChange={(event) => handlePolicyChange(index, "enabled", event.target.checked)}
                />
              </label>
              <label>
                Notes
                <input
                  type="text"
                  value={policy.notes ?? ""}
                  onChange={(event) => handlePolicyChange(index, "notes", event.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
        <div className="action-row">
          <button type="button" className="secondary" onClick={handleAddPolicy} disabled={saving}>
            Add Policy
          </button>
          <button type="button" onClick={handlePoliciesSave} disabled={saving}>
            Save Policies
          </button>
        </div>
      </div>
    </section>
  );
}
