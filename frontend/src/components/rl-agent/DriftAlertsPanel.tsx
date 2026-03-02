"use client";

import { useEffect, useState } from "react";
import {
  listDriftAlerts,
  resolveOpenDriftAlerts,
  type DriftAlert,
  updateDriftAlert,
} from "../../services/rl_governance";

const AGENT_ID = "gold-rl-agent";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DriftAlertsPanel() {
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDriftAlerts(AGENT_ID);
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drift alerts.");
    } finally {
      setLoading(false);
    }
  };

  const setAlertStatus = async (alertId: string, status: "acknowledged" | "resolved") => {
    setBusy(true);
    setError(null);
    try {
      await updateDriftAlert(AGENT_ID, alertId, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update drift alert.");
    } finally {
      setBusy(false);
    }
  };

  const clearOpenAlerts = async () => {
    setBusy(true);
    setError(null);
    try {
      await resolveOpenDriftAlerts(AGENT_ID, {
        before: new Date().toISOString(),
        action_taken: "manual_clear_from_command_center",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear open drift alerts.");
    } finally {
      setBusy(false);
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
              <th>Controls</th>
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
                <td>
                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setAlertStatus(alert.id, "acknowledged")}
                      disabled={busy || alert.status !== "open"}
                    >
                      Ack
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setAlertStatus(alert.id, "resolved")}
                      disabled={busy || alert.status === "resolved"}
                    >
                      Resolve
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="action-row">
        <button type="button" className="secondary" onClick={load} disabled={busy}>
          Refresh Alerts
        </button>
        <button type="button" className="secondary" onClick={clearOpenAlerts} disabled={busy}>
          Resolve Open Alerts
        </button>
      </div>
    </section>
  );
}
