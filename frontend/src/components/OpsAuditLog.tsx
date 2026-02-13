"use client";

import { useEffect, useState } from "react";
import { fetchOpsAudit, type OpsAuditEvent } from "../services/ops";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OpsAuditLog() {
  const [events, setEvents] = useState<OpsAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const payload = await fetchOpsAudit();
        if (mounted) {
          setEvents(payload.data ?? []);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load audit log.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="table-card">
      <h3>Ops Audit Log</h3>
      <p>Every operator action is captured with metadata and timestamps.</p>
      {loading ? (
        <div className="empty">Loading audit log…</div>
      ) : error ? (
        <div className="empty">{error}</div>
      ) : events.length === 0 ? (
        <div className="empty">No audit events recorded.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Resource ID</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
                  <td>{event.resource_type}</td>
                  <td className="mono">{event.resource_id ?? "—"}</td>
                  <td>{Object.keys(event.metadata ?? {}).length} fields</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
