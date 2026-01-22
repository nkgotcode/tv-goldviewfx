"use client";

import { useEffect, useState } from "react";
import { listDriftAlerts, type DriftAlert } from "../../services/rl_governance";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DriftAlertsPanel() {
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDriftAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drift alerts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="table-card">
      <h3>Drift Alerts</h3>
      <p>Track detected model drift events and fallback actions.</p>
      {error ? <div className="empty">{error}</div> : null}
      {loading ? (
        <div className="empty">Loading drift alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="empty">No drift alerts recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Metric</th>
              <th>Baseline</th>
              <th>Current</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>{formatTimestamp(alert.detected_at)}</td>
                <td>{alert.metric}</td>
                <td>{alert.baseline_value ?? "—"}</td>
                <td>{alert.current_value ?? "—"}</td>
                <td>{alert.status}</td>
                <td>{alert.action_taken ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="action-row">
        <button type="button" className="secondary" onClick={load}>
          Refresh Alerts
        </button>
      </div>
    </section>
  );
}
