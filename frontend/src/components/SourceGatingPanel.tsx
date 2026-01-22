"use client";

import { useEffect, useState } from "react";
import { fetchSourcePolicies, updateSourcePolicy, type SourcePolicy } from "../services/ops";

export default function SourceGatingPanel() {
  const [policies, setPolicies] = useState<SourcePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceType, setSourceType] = useState("tradingview");
  const [sourceId, setSourceId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [minConfidence, setMinConfidence] = useState("0");
  const [notes, setNotes] = useState("");

  const loadPolicies = async () => {
    const payload = await fetchSourcePolicies();
    setPolicies(payload.data ?? []);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await loadPolicies();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    await updateSourcePolicy({
      source_type: sourceType,
      source_id: sourceId || null,
      enabled,
      min_confidence_score: Number(minConfidence) || 0,
      notes: notes || null,
    });
    await loadPolicies();
  };

  if (loading) {
    return <div className="empty">Loading source gating…</div>;
  }

  return (
    <section className="table-card">
      <h3>Source Gating</h3>
      <p>Approve, pause, and constrain trade eligibility by signal source.</p>
      <div className="control-grid">
        <div className="control-row">
          <label htmlFor="policy-source-type">Source Type</label>
          <select id="policy-source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="tradingview">TradingView</option>
            <option value="telegram">Telegram</option>
            <option value="news">News</option>
          </select>
        </div>
        <div className="control-row">
          <label htmlFor="policy-source-id">Source ID</label>
          <input
            id="policy-source-id"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            placeholder="UUID (optional)"
          />
        </div>
        <div className="control-row checkbox-row">
          <label>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Enabled
          </label>
        </div>
        <div className="control-row">
          <label htmlFor="policy-min-confidence">Min Confidence</label>
          <input
            id="policy-min-confidence"
            value={minConfidence}
            onChange={(event) => setMinConfidence(event.target.value)}
          />
        </div>
        <div className="control-row">
          <label htmlFor="policy-notes">Notes</label>
          <input id="policy-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>
      <div className="control-actions">
        <button type="button" className="primary" onClick={handleSave}>Save Policy</button>
      </div>

      {policies.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Enabled</th>
              <th>Min Confidence</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>{`${policy.source_type}:${policy.source_id ?? "global"}`}</td>
                <td>{policy.enabled ? "yes" : "no"}</td>
                <td>{policy.min_confidence_score ?? "N/A"}</td>
                <td>{policy.notes ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="inline-muted">No source policies configured.</div>
      )}
    </section>
  );
}
